import { spawn, execFile, ChildProcess } from 'child_process'
import { join } from 'path'
import { readFileSync } from 'fs'
import { app } from 'electron'
import http from 'http'
import type { ConnectOptions, DriveSpace } from '../shared/types'
import { getRclonePath, isMountReady, IS_WIN, IS_MAC } from './platform'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RC_PORT_BASE = 5572
const MOUNT_TIMEOUT_MS = 30_000
const MOUNT_POLL_INTERVAL_MS = 500
const DEFAULT_VOLNAME = 'CMC Drive'

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface MountEntry {
  proc: ChildProcess
  rcPort: number
  mountPoint: string
  remoteSpec: string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const mounts = new Map<string, MountEntry>()
let nextRcPort = RC_PORT_BASE

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLogDir(): string {
  return app.getPath('userData')
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
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout.trim())
      }
    )
  })
}

/**
 * Allocate the next RC port and bump the counter.
 */
function allocatePort(): number {
  return nextRcPort++
}

/**
 * Make an HTTP POST request to the rclone RC API.
 */
function rcPost<T = unknown>(
  port: number,
  endpoint: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: `/${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString()
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw) as T)
          } catch {
            reject(new Error(`RC ${endpoint}: invalid JSON — ${raw}`))
          }
        })
      }
    )
    req.on('error', (err) => reject(err))
    req.write(data)
    req.end()
  })
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
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout)
      }
    )
  })
}

/**
 * Run `df -k <mountPoint>` on macOS and parse the output.
 */
function runDf(mountPoint: string): Promise<{ usedBytes: number; totalBytes: number } | null> {
  return new Promise((resolve) => {
    execFile('df', ['-k', mountPoint], { encoding: 'utf8' }, (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }
      const lines = stdout.trim().split('\n')
      if (lines.length < 2) {
        resolve(null)
        return
      }
      const parts = lines[1].split(/\s+/)
      // df -k columns: Filesystem 1K-blocks Used Available Capacity ...
      const totalKB = parseInt(parts[1], 10)
      const usedKB = parseInt(parts[2], 10)
      if (isNaN(totalKB) || isNaN(usedKB)) {
        resolve(null)
        return
      }
      resolve({ usedBytes: usedKB * 1024, totalBytes: totalKB * 1024 })
    })
  })
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawn an rclone mount process for the given server, wait for the mount
 * to become available via the RC API (polling mount/listmounts every 500ms,
 * up to 30s).
 */
export async function connectDrive(
  serverId: string,
  opts: ConnectOptions,
  onExit?: (code: number | null) => void
): Promise<void> {
  // If already mounted, disconnect first
  if (mounts.has(serverId)) {
    await disconnectDrive(serverId)
  }

  // Obscure the password for rclone's on-the-fly remote syntax
  const obscured = await obscurePassword(opts.password)

  const rcPort = allocatePort()
  const logPath = join(getLogDir(), `rclone-${serverId}.log`)
  const volname = opts.driveName || DEFAULT_VOLNAME

  // On-the-fly remote: :webdav,url="...",user="...",pass="...": MOUNT_POINT
  const remoteSpec = `:webdav,url="${opts.url}",user="${opts.username}",pass="${obscured}":`

  // Use nfsmount on macOS (no FUSE dependency), regular mount on Windows
  const mountCmd = IS_MAC ? 'nfsmount' : 'mount'

  const args = [
    mountCmd,
    remoteSpec,
    opts.mountPoint,
    '--vfs-cache-mode',
    'full',
    '--vfs-cache-max-size',
    '10G',
    '--vfs-cache-max-age',
    '1h',
    '--vfs-write-back',
    '5s',
    '--dir-cache-time',
    '5m',
    '--attr-timeout',
    '1s',
    '--rc',
    '--rc-addr',
    `127.0.0.1:${rcPort}`,
    '--rc-no-auth',
    '--log-file',
    logPath,
    '--log-level',
    'INFO'
  ]

  // Windows-only flags (FUSE-based mount)
  if (IS_WIN) {
    args.push('--volname', volname)
    args.push('--vfs-case-insensitive')
    args.push('--network-mode')
  }

  const proc = spawn(getRclonePath(), args, {
    windowsHide: true,
    stdio: 'ignore'
  })

  // Store entry immediately so killAll can find it
  const entry: MountEntry = { proc, rcPort, mountPoint: opts.mountPoint, remoteSpec }
  mounts.set(serverId, entry)

  // Wire up exit handler
  proc.on('exit', (code) => {
    mounts.delete(serverId)
    onExit?.(code)
  })

  // Poll filesystem until the mount point appears (500ms intervals, 30s timeout)
  const deadline = Date.now() + MOUNT_TIMEOUT_MS
  let ready = false

  while (Date.now() < deadline) {
    await sleep(MOUNT_POLL_INTERVAL_MS)
    if (isMountReady(opts.mountPoint)) {
      ready = true
      break
    }
  }

  if (!ready) {
    // Cleanup the failed mount
    try {
      proc.kill()
    } catch {
      // already dead
    }
    mounts.delete(serverId)

    // Read last lines of rclone log for diagnostics
    let logTail = ''
    try {
      const logContent = readFileSync(logPath, 'utf8')
      const lines = logContent.split('\n').filter((l) => l.trim())
      logTail = lines.slice(-5).join('\n')
    } catch {
      // Log file may not exist
    }

    throw new Error(
      `Timeout: rclone mount for ${opts.mountPoint} did not become ready within ${MOUNT_TIMEOUT_MS / 1000}s.${logTail ? `\n\nDernières lignes du log:\n${logTail}` : ` Check ${logPath} for details.`}`
    )
  }
}

/**
 * Disconnect a mount by server ID.
 * Tries the RC API first (mount/unmount then core/quit), falls back to process.kill().
 */
async function disconnectDrive(serverId: string): Promise<void> {
  const entry = mounts.get(serverId)
  if (!entry) return

  // Try graceful unmount via RC API
  try {
    await rcPost(entry.rcPort, 'mount/unmount', { mountPoint: entry.mountPoint })
  } catch {
    // RC API may already be down
  }

  // Try graceful quit via RC API
  try {
    await rcPost(entry.rcPort, 'core/quit')
  } catch {
    // RC API may already be down
  }

  // Give the process a moment to exit gracefully
  await sleep(500)

  // Force kill if still alive
  try {
    if (!entry.proc.killed) {
      entry.proc.kill()
    }
  } catch {
    // Already dead
  }

  mounts.delete(serverId)
}

/**
 * Find a mount by its mount point and disconnect it.
 */
export async function disconnectByMountPoint(mountPoint: string): Promise<void> {
  for (const [serverId, entry] of mounts) {
    if (entry.mountPoint.toUpperCase() === mountPoint.toUpperCase()) {
      await disconnectDrive(serverId)
      return
    }
  }
}

/**
 * Get disk space for a mount point.
 * Tries the RC API `operations/about` first (using the mount's remote path),
 * then falls back to PowerShell `Get-PSDrive` (Win) or `df -k` (Mac).
 */
export async function getDriveSpace(mountPoint: string): Promise<DriveSpace | null> {
  // Find the mount entry by mount point to use RC API
  for (const entry of mounts.values()) {
    if (entry.mountPoint.toUpperCase() === mountPoint.toUpperCase()) {
      try {
        // operations/about with fs pointing to the remote (not the local WinFsp mount)
        const result = await rcPost<{
          total?: number
          used?: number
          free?: number
        }>(entry.rcPort, 'operations/about', { fs: entry.remoteSpec })

        // Safety threshold: if total > 500 TB, the server likely doesn't support quotas
        const MAX_REALISTIC_BYTES = 500 * 1024 ** 4 // 500 TB

        if (result.total != null && result.total > MAX_REALISTIC_BYTES) {
          return null
        }

        if (result.total != null && result.used != null) {
          return { usedBytes: result.used, totalBytes: result.total }
        }
        if (result.total != null && result.free != null) {
          return { usedBytes: result.total - result.free, totalBytes: result.total }
        }
      } catch {
        // RC API failed, fall through to OS fallback
      }
      break
    }
  }

  // Fallback: OS-specific disk space query
  if (IS_WIN) {
    try {
      const letter = mountPoint.replace(':', '')
      const result = await runPowershell(
        `Get-PSDrive ${letter} | Select-Object Used,Free | ConvertTo-Json`
      )
      const data = JSON.parse(result.trim())
      if (data.Used != null && data.Free != null) {
        return { usedBytes: data.Used, totalBytes: data.Used + data.Free }
      }
      return null
    } catch {
      return null
    }
  }

  if (IS_MAC) {
    try {
      return await runDf(mountPoint)
    } catch {
      return null
    }
  }

  return null
}

/**
 * Kill all rclone processes immediately (for app quit).
 */
export function killAll(): void {
  for (const entry of mounts.values()) {
    try {
      if (!entry.proc.killed) {
        entry.proc.kill()
      }
    } catch {
      // Already dead
    }
  }
  mounts.clear()
}
