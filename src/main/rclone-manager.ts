import { spawn, execFile, execFileSync, ChildProcess } from 'child_process'
import { join } from 'path'
import { readFileSync } from 'fs'
import { app } from 'electron'
import http from 'http'
import type { ConnectOptions, DriveSpace } from '../shared/types'
import { getRclonePath, isMountReady, IS_WIN, IS_MAC } from './platform'

// ---------------------------------------------------------------------------
// Orphaned rclone cleanup (survives app restart)
// ---------------------------------------------------------------------------

/**
 * Kill any rclone processes left over from a previous app session and remove
 * stale WinFsp network connections. Must be called BEFORE auto-connect.
 */
export function killOrphanedRclone(): void {
  if (!IS_WIN) return

  const rcloneBin = getRclonePath()

  // Kill rclone.exe processes spawned from our install path
  try {
    const out = execFileSync('powershell.exe', [
      '-WindowStyle', 'Hidden', '-NoProfile', '-Command',
      `Get-Process rclone -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${rcloneBin.replace(/\\/g, '\\\\')}' } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }`
    ], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
    if (out.trim()) console.warn('[rclone] orphan cleanup:', out.trim())
  } catch {
    // No rclone processes running — expected
  }

  // Remove stale WinFsp network connections (from --network-mode mounts)
  try {
    const netUse = execFileSync('net', ['use'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 })
    for (const line of netUse.split('\n')) {
      const match = line.match(/^\s*\S*\s+([A-Z]:)\s+\\\\server\\/i)
      if (match) {
        try {
          execFileSync('net', ['use', match[1], '/delete', '/yes'], { windowsHide: true, timeout: 5_000 })
        } catch {
          // May already be gone
        }
      }
    }
  } catch {
    // net use may fail if no connections
  }
}

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
  proc: ChildProcess | null // null for macOS native mounts
  rcPort: number
  mountPoint: string // Actual mount point (may differ from configured on macOS)
  remoteSpec: string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const mounts = new Map<string, MountEntry>()
let nextRcPort = RC_PORT_BASE

// Map configured mount point → actual mount point (macOS native mounts)
const mountPointMap = new Map<string, string>()

// ---------------------------------------------------------------------------
// Public: mount point resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a configured mount point to its actual path.
 * On macOS with native WebDAV mounts, the actual path may differ from configured.
 */
export function resolveMount(mountPoint: string): string {
  return mountPointMap.get(mountPoint) || mountPoint
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLogDir(): string {
  return app.getPath('userData')
}

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

function allocatePort(): number {
  return nextRcPort++
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// macOS native WebDAV mount via osascript
// ---------------------------------------------------------------------------

/**
 * Escape a string for use inside AppleScript double-quoted strings.
 */
function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Mount a WebDAV share using macOS native mount via osascript.
 * Returns the POSIX path of the actual mount point.
 */
function mountNativeWebDav(url: string, username: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = [
      `set vol to mount volume "${escapeAppleScript(url)}" as user name "${escapeAppleScript(username)}" with password "${escapeAppleScript(password)}"`,
      'return POSIX path of vol'
    ].join('\n')

    // Use stdin to avoid credentials in ps output
    const proc = spawn('osascript', [], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error('Timeout: le montage WebDAV natif a pris trop de temps (30s).'))
    }, MOUNT_TIMEOUT_MS)

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(stderr.trim() || `osascript exited with code ${code}`))
      } else {
        const mountPath = stdout.trim().replace(/\/+$/, '')
        if (!mountPath) {
          reject(new Error('mount volume returned empty path'))
        } else {
          resolve(mountPath)
        }
      }
    })

    proc.stdin.write(script)
    proc.stdin.end()
  })
}

/**
 * Unmount a macOS native mount via diskutil.
 */
function unmountNative(mountPoint: string): Promise<void> {
  return new Promise((resolve) => {
    execFile('diskutil', ['unmount', mountPoint], { timeout: 10_000 }, (err) => {
      if (err) {
        // Try force unmount
        execFile('diskutil', ['unmount', 'force', mountPoint], { timeout: 10_000 }, () => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect a drive. On macOS uses native WebDAV mount, on Windows uses rclone.
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

  if (IS_MAC) {
    return connectDriveMac(serverId, opts)
  }

  return connectDriveWindows(serverId, opts, onExit)
}

/**
 * macOS: mount WebDAV natively via osascript (no FUSE/NFS/rclone needed).
 */
async function connectDriveMac(serverId: string, opts: ConnectOptions): Promise<void> {
  // Prevent Finder from creating .DS_Store files on network volumes
  try {
    execFileSync('defaults', [
      'write',
      'com.apple.desktopservices',
      'DSDontWriteNetworkStores',
      '-bool',
      'true'
    ])
  } catch {
    // Non-critical — continue even if this fails
  }

  const actualMount = await mountNativeWebDav(opts.url, opts.username, opts.password)

  mounts.set(serverId, {
    proc: null,
    rcPort: 0,
    mountPoint: actualMount,
    remoteSpec: ''
  })

  // Track mapping if actual mount point differs from configured
  if (actualMount !== opts.mountPoint) {
    mountPointMap.set(opts.mountPoint, actualMount)
  }
}

/**
 * Windows: mount via rclone with WinFsp FUSE.
 */
async function connectDriveWindows(
  serverId: string,
  opts: ConnectOptions,
  onExit?: (code: number | null) => void
): Promise<void> {
  const obscured = await obscurePassword(opts.password)

  const rcPort = allocatePort()
  const logPath = join(getLogDir(), `rclone-${serverId}.log`)
  const baseName = opts.driveName || DEFAULT_VOLNAME
  const volname = IS_WIN ? `${baseName} (${opts.mountPoint})` : baseName

  const remoteSpec = `:webdav,url="${opts.url}",user="${opts.username}",pass="${obscured}":`

  const args = [
    'mount',
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
    '--volname',
    volname,
    '--timeout',
    '60s',
    '--contimeout',
    '30s',
    '--retries',
    '5',
    '--low-level-retries',
    '10',
    '--no-check-certificate',
    '--vfs-read-chunk-size',
    '64M',
    '--rc',
    '--rc-addr',
    `127.0.0.1:${rcPort}`,
    '--rc-no-auth',
    '--log-file',
    logPath,
    '--log-level',
    'INFO',
    '--vfs-case-insensitive'
  ]

  const proc = spawn(getRclonePath(), args, {
    windowsHide: true,
    stdio: 'ignore'
  })

  const entry: MountEntry = { proc, rcPort, mountPoint: opts.mountPoint, remoteSpec }
  mounts.set(serverId, entry)

  proc.on('exit', (code) => {
    mounts.delete(serverId)
    onExit?.(code)
  })

  // Poll filesystem until the mount point appears
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
    try {
      proc.kill()
    } catch {
      // already dead
    }
    mounts.delete(serverId)

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
 */
async function disconnectDrive(serverId: string): Promise<void> {
  const entry = mounts.get(serverId)
  if (!entry) return

  if (!entry.proc) {
    // macOS native mount — unmount via diskutil
    await unmountNative(entry.mountPoint)
    // Clean up mount point mapping
    for (const [key, val] of mountPointMap) {
      if (val === entry.mountPoint) {
        mountPointMap.delete(key)
        break
      }
    }
    mounts.delete(serverId)
    return
  }

  // rclone-based mount (Windows) — clean unmount via RC API, then kill
  try {
    await rcPost(entry.rcPort, 'mount/unmount', { mountPoint: entry.mountPoint })
  } catch {
    // RC API may not track the mount (e.g. legacy --network-mode)
  }

  try {
    await rcPost(entry.rcPort, 'core/quit')
  } catch {
    // RC API may already be down
  }

  await sleep(1_000)

  try {
    if (!entry.proc.killed) {
      entry.proc.kill()
    }
  } catch {
    // Already dead
  }

  // Clean up any residual WinFsp network connection (legacy --network-mode mounts)
  if (IS_WIN) {
    try {
      execFileSync('net', ['use', entry.mountPoint, '/delete', '/yes'], {
        windowsHide: true,
        timeout: 5_000
      })
    } catch {
      // No stale connection — expected for non-network-mode mounts
    }
  }

  mounts.delete(serverId)
}

/**
 * Find a mount by its mount point and disconnect it.
 */
export async function disconnectByMountPoint(mountPoint: string): Promise<void> {
  const resolved = resolveMount(mountPoint)
  for (const [serverId, entry] of mounts) {
    if (entry.mountPoint.toUpperCase() === resolved.toUpperCase()) {
      await disconnectDrive(serverId)
      return
    }
  }
}

/**
 * Get disk space for a mount point.
 */
export async function getDriveSpace(mountPoint: string): Promise<DriveSpace | null> {
  const resolved = resolveMount(mountPoint)

  // Find the mount entry to use RC API (Windows/rclone only)
  for (const entry of mounts.values()) {
    if (entry.mountPoint.toUpperCase() === resolved.toUpperCase()) {
      // Only try RC API for rclone-based mounts
      if (entry.proc && entry.rcPort) {
        try {
          const result = await rcPost<{
            total?: number
            used?: number
            free?: number
          }>(entry.rcPort, 'operations/about', { fs: entry.remoteSpec })

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
      }
      break
    }
  }

  // Fallback: OS-specific disk space query
  if (IS_WIN) {
    try {
      const letter = resolved.replace(':', '')
      const result = await runPowershell(
        `Get-PSDrive ${letter} | Select-Object Used,Free | ConvertTo-Json`
      )
      const data = JSON.parse(result.trim())
      if (data.Used != null && data.Free != null) {
        const totalBytes = data.Used + data.Free
        const MAX_REALISTIC_BYTES = 500 * 1024 ** 4 // 500 TB
        if (totalBytes > MAX_REALISTIC_BYTES) {
          // WinFsp returns unrealistic size when WebDAV has no quota info
          return null
        }
        return { usedBytes: data.Used, totalBytes }
      }
      return null
    } catch {
      return null
    }
  }

  if (IS_MAC) {
    try {
      return await runDf(resolved)
    } catch {
      return null
    }
  }

  return null
}

/**
 * Kill all mount processes / unmount all native mounts (for app quit).
 */
export function killAll(): void {
  for (const entry of mounts.values()) {
    if (entry.proc) {
      try {
        if (!entry.proc.killed) {
          entry.proc.kill()
        }
      } catch {
        // Already dead
      }
    } else if (IS_MAC) {
      // macOS native mount — unmount synchronously
      try {
        execFileSync('diskutil', ['unmount', entry.mountPoint], { timeout: 5_000 })
      } catch {
        // Already unmounted
      }
    }
  }
  mounts.clear()
  mountPointMap.clear()
}
