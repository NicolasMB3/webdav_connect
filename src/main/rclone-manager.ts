import { spawn, execFile, ChildProcess } from 'child_process';
import { join } from 'path';
import { app } from 'electron';
import http from 'http';

// ---------------------------------------------------------------------------
// Interfaces (compatible with webdav-manager.ts)
// ---------------------------------------------------------------------------

export interface ConnectOptions {
  url: string;
  driveLetter: string;
  username: string;
  password: string;
  driveName?: string;
}

export interface DriveSpace {
  usedBytes: number;
  totalBytes: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface MountEntry {
  proc: ChildProcess;
  rcPort: number;
  driveLetter: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const mounts = new Map<string, MountEntry>();
let nextRcPort = 5572;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRclonePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'rclone.exe');
  }
  return join(__dirname, '../../resources/rclone.exe');
}

function getLogDir(): string {
  return app.getPath('userData');
}

/**
 * Call `rclone obscure <password>` to produce the obscured token
 * required by on-the-fly remote syntax.
 */
function obscurePassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      getRclonePath(),
      ['obscure', password],
      { encoding: 'utf8', windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout.trim());
      }
    );
  });
}

/**
 * Allocate the next RC port and bump the counter.
 */
function allocatePort(): number {
  return nextRcPort++;
}

/**
 * Make an HTTP POST request to the rclone RC API.
 */
function rcPost<T = unknown>(port: number, endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: `/${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new Error(`RC ${endpoint}: invalid JSON — ${raw}`));
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

/**
 * Run a PowerShell command and return its stdout.
 */
function runPowershell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-WindowStyle', 'Hidden', '-NoProfile', '-Command', command],
      { encoding: 'utf8', windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      }
    );
  });
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawn an rclone mount process for the given server, wait for the mount
 * to become available via the RC API (polling mount/listmounts every 500ms,
 * up to 15s).
 */
export async function connectDrive(
  serverId: string,
  opts: ConnectOptions,
  onExit?: (code: number | null) => void
): Promise<void> {
  // If already mounted, disconnect first
  if (mounts.has(serverId)) {
    await disconnectDrive(serverId);
  }

  // Obscure the password for rclone's on-the-fly remote syntax
  const obscured = await obscurePassword(opts.password);

  const rcPort = allocatePort();
  const logPath = join(getLogDir(), `rclone-${serverId}.log`);
  const volname = opts.driveName || 'CMC Drive';

  // On-the-fly remote: :webdav,url="...",user="...",pass="...": DRIVE_LETTER
  const remoteSpec = `:webdav,url="${opts.url}",user="${opts.username}",pass="${obscured}":`;

  const args = [
    'mount',
    remoteSpec,
    opts.driveLetter,
    '--vfs-cache-mode', 'full',
    '--vfs-cache-max-size', '10G',
    '--vfs-cache-max-age', '1h',
    '--vfs-write-back', '5s',
    '--dir-cache-time', '5m',
    '--attr-timeout', '1s',
    '--vfs-case-insensitive',
    '--volname', volname,
    '--rc',
    '--rc-addr', `localhost:${rcPort}`,
    '--rc-no-auth',
    '--log-file', logPath,
    '--log-level', 'INFO'
  ];

  const proc = spawn(getRclonePath(), args, {
    windowsHide: true,
    stdio: 'ignore'
  });

  // Store entry immediately so killAll can find it
  const entry: MountEntry = { proc, rcPort, driveLetter: opts.driveLetter };
  mounts.set(serverId, entry);

  // Wire up exit handler
  proc.on('exit', (code) => {
    mounts.delete(serverId);
    onExit?.(code);
  });

  // Poll RC API until the mount appears (500ms intervals, 15s timeout)
  const deadline = Date.now() + 15_000;
  let ready = false;

  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const result = await rcPost<{ mountPoints?: Array<{ MountPoint: string }> }>(
        rcPort,
        'mount/listmounts'
      );
      if (result.mountPoints && result.mountPoints.length > 0) {
        ready = true;
        break;
      }
    } catch {
      // RC API not ready yet — keep polling
    }
  }

  if (!ready) {
    // Cleanup the failed mount
    try {
      proc.kill();
    } catch {
      // already dead
    }
    mounts.delete(serverId);
    throw new Error(
      `Timeout: rclone mount for ${opts.driveLetter} did not become ready within 15s. Check ${logPath} for details.`
    );
  }
}

/**
 * Disconnect a mount by server ID.
 * Tries the RC API first (mount/unmount then core/quit), falls back to process.kill().
 */
export async function disconnectDrive(serverId: string): Promise<void> {
  const entry = mounts.get(serverId);
  if (!entry) return;

  // Try graceful unmount via RC API
  try {
    await rcPost(entry.rcPort, 'mount/unmount', { mountPoint: entry.driveLetter });
  } catch {
    // RC API may already be down
  }

  // Try graceful quit via RC API
  try {
    await rcPost(entry.rcPort, 'core/quit');
  } catch {
    // RC API may already be down
  }

  // Give the process a moment to exit gracefully
  await sleep(500);

  // Force kill if still alive
  try {
    if (!entry.proc.killed) {
      entry.proc.kill();
    }
  } catch {
    // Already dead
  }

  mounts.delete(serverId);
}

/**
 * Find a mount by its drive letter and disconnect it.
 */
export async function disconnectByDriveLetter(driveLetter: string): Promise<void> {
  for (const [serverId, entry] of mounts) {
    if (entry.driveLetter.toUpperCase() === driveLetter.toUpperCase()) {
      await disconnectDrive(serverId);
      return;
    }
  }
}

/**
 * Synchronous check: is the server ID present in our mount map?
 */
export function isDriveConnected(serverId: string): boolean {
  return mounts.has(serverId);
}

/**
 * Asynchronous check: verify via the RC API that the mount is alive.
 */
export async function isDriveConnectedAsync(serverId: string): Promise<boolean> {
  const entry = mounts.get(serverId);
  if (!entry) return false;

  try {
    const result = await rcPost<{ mountPoints?: Array<{ MountPoint: string }> }>(
      entry.rcPort,
      'mount/listmounts'
    );
    return !!(result.mountPoints && result.mountPoints.length > 0);
  } catch {
    return false;
  }
}

/**
 * Get disk space for a drive letter.
 * Tries the RC API `operations/about` first (using the mount's remote path),
 * then falls back to PowerShell `Get-PSDrive`.
 */
export async function getDriveSpace(driveLetter: string): Promise<DriveSpace | null> {
  // Find the mount entry by drive letter to use RC API
  for (const entry of mounts.values()) {
    if (entry.driveLetter.toUpperCase() === driveLetter.toUpperCase()) {
      try {
        // operations/about with fs pointing to the mount's drive letter
        const result = await rcPost<{
          total?: number;
          used?: number;
          free?: number;
        }>(entry.rcPort, 'operations/about', { fs: `${entry.driveLetter}\\` });

        if (result.total != null && result.used != null) {
          return { usedBytes: result.used, totalBytes: result.total };
        }
        if (result.total != null && result.free != null) {
          return { usedBytes: result.total - result.free, totalBytes: result.total };
        }
      } catch {
        // RC API failed, fall through to PowerShell
      }
      break;
    }
  }

  // Fallback: PowerShell Get-PSDrive
  try {
    const letter = driveLetter.replace(':', '');
    const result = await runPowershell(
      `Get-PSDrive ${letter} | Select-Object Used,Free | ConvertTo-Json`
    );
    const data = JSON.parse(result.trim());
    if (data.Used != null && data.Free != null) {
      return { usedBytes: data.Used, totalBytes: data.Used + data.Free };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Kill all rclone processes immediately (for app quit).
 */
export function killAll(): void {
  for (const entry of mounts.values()) {
    try {
      if (!entry.proc.killed) {
        entry.proc.kill();
      }
    } catch {
      // Already dead
    }
  }
  mounts.clear();
}

/**
 * Get mount info for a server ID (RC port and drive letter).
 */
export function getMountInfo(serverId: string): { rcPort: number; driveLetter: string } | null {
  const entry = mounts.get(serverId);
  if (!entry) return null;
  return { rcPort: entry.rcPort, driveLetter: entry.driveLetter };
}
