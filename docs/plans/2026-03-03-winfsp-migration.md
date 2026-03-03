# WinFsp Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `net use` + registry hacks with rclone mount + WinFsp so drives appear as local disks and Office works without any workarounds.

**Architecture:** Electron spawns rclone as a child_process per server. rclone mount uses WinFsp to present WebDAV as a local fixed disk. Lifecycle managed via rclone's RC HTTP API (mount/unmount/listmounts). WinFsp MSI bundled in NSIS installer.

**Tech Stack:** Electron, TypeScript, rclone (CLI), WinFsp (kernel driver), child_process, HTTP fetch (RC API)

---

### Task 1: Create rclone-manager.ts — the new connection engine

**Files:**
- Create: `src/main/rclone-manager.ts`

This replaces `webdav-manager.ts`. It manages rclone child processes and communicates via RC API.

**Step 1: Create `src/main/rclone-manager.ts`**

```typescript
import { execFile, ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'

export interface ConnectOptions {
  url: string
  driveLetter: string
  username: string
  password: string
  driveName?: string
}

export interface DriveSpace {
  usedBytes: number
  totalBytes: number
}

// Track running rclone processes: serverId -> { process, rcPort }
const mounts = new Map<string, { proc: ChildProcess; rcPort: number; driveLetter: string }>()

// Base port for RC API, each mount gets its own port
const BASE_RC_PORT = 5572

function getRclonePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'rclone.exe')
  }
  // Dev mode: expect rclone.exe in project resources/
  return join(__dirname, '../../resources/rclone.exe')
}

function findAvailablePort(): number {
  const usedPorts = new Set([...mounts.values()].map((m) => m.rcPort))
  let port = BASE_RC_PORT
  while (usedPorts.has(port)) port++
  return port
}

// Obscure password for rclone (rclone requires this encoding)
function obscurePassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      getRclonePath(),
      ['obscure', password],
      { encoding: 'utf8', windowsHide: true },
      (err, stdout) => {
        if (err) reject(new Error('Failed to obscure password: ' + err.message))
        else resolve(stdout.trim())
      }
    )
  })
}

// Call rclone RC API
async function rcCall(port: number, endpoint: string, body?: object): Promise<unknown> {
  const url = `http://localhost:${port}/${endpoint}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
    signal: AbortSignal.timeout(5000)
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`RC API error: ${response.status} ${text}`)
  }
  return response.json()
}

export async function connectDrive(
  serverId: string,
  opts: ConnectOptions,
  onExit?: (code: number | null) => void
): Promise<void> {
  // Kill existing mount for this server if any
  await disconnectDrive(serverId)

  const rclonePath = getRclonePath()
  if (!existsSync(rclonePath)) {
    throw new Error('rclone.exe introuvable. Veuillez réinstaller CMC Drive.')
  }

  const obscuredPass = await obscurePassword(opts.password)
  const rcPort = findAvailablePort()
  const logFile = join(app.getPath('userData'), `rclone-${serverId}.log`)

  const remote = `:webdav,url="${opts.url}",user="${opts.username}",pass="${obscuredPass}":`

  const args = [
    'mount',
    remote,
    opts.driveLetter,
    '--vfs-cache-mode', 'full',
    '--vfs-cache-max-size', '10G',
    '--vfs-cache-max-age', '1h',
    '--vfs-write-back', '5s',
    '--dir-cache-time', '5m',
    '--attr-timeout', '1s',
    '--vfs-case-insensitive',
    '--volname', opts.driveName || 'WebDAV',
    '--rc',
    '--rc-addr', `localhost:${rcPort}`,
    '--rc-no-auth',
    '--log-file', logFile,
    '--log-level', 'INFO'
  ]

  const proc = spawn(rclonePath, args, {
    windowsHide: true,
    stdio: 'ignore',
    detached: false
  })

  mounts.set(serverId, { proc, rcPort, driveLetter: opts.driveLetter })

  proc.on('error', (err) => {
    mounts.delete(serverId)
    onExit?.(-1)
    throw new Error('Impossible de lancer rclone: ' + err.message)
  })

  proc.on('exit', (code) => {
    mounts.delete(serverId)
    onExit?.(code)
  })

  // Wait for mount to become available (poll drive letter)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const result = await rcCall(rcPort, 'mount/listmounts')
      const mountList = (result as { mountPoints?: unknown[] }).mountPoints
      if (mountList && mountList.length > 0) return
    } catch {
      // RC not ready yet, keep polling
    }
  }
  // Timeout — kill process and throw
  proc.kill()
  mounts.delete(serverId)
  throw new Error('Délai de connexion dépassé (15s). Vérifiez que le serveur est accessible.')
}

export async function disconnectDrive(serverId: string): Promise<void> {
  const mount = mounts.get(serverId)
  if (!mount) return

  try {
    await rcCall(mount.rcPort, 'mount/unmount', { mountPoint: mount.driveLetter })
    // Give WinFsp a moment to clean up
    await new Promise((r) => setTimeout(r, 500))
    await rcCall(mount.rcPort, 'core/quit')
  } catch {
    // RC failed, force kill
    mount.proc.kill()
  }

  mounts.delete(serverId)
}

export async function disconnectByDriveLetter(driveLetter: string): Promise<void> {
  for (const [id, mount] of mounts.entries()) {
    if (mount.driveLetter === driveLetter) {
      await disconnectDrive(id)
      return
    }
  }
}

export function isDriveConnected(serverId: string): boolean {
  return mounts.has(serverId)
}

export async function isDriveConnectedAsync(serverId: string): Promise<boolean> {
  const mount = mounts.get(serverId)
  if (!mount) return false
  try {
    const result = await rcCall(mount.rcPort, 'mount/listmounts')
    const mountList = (result as { mountPoints?: unknown[] }).mountPoints
    return !!mountList && mountList.length > 0
  } catch {
    return false
  }
}

export async function getDriveSpace(driveLetter: string): Promise<DriveSpace | null> {
  // Use rclone about via RC for the mount that owns this drive letter
  for (const mount of mounts.values()) {
    if (mount.driveLetter === driveLetter) {
      try {
        const result = await rcCall(mount.rcPort, 'operations/about', { fs: mount.driveLetter + '\\' })
        const data = result as { total?: number; used?: number; free?: number }
        if (data.total != null && data.used != null) {
          return { usedBytes: data.used, totalBytes: data.total }
        }
      } catch {
        // Fallback: use PowerShell Get-PSDrive
      }
    }
  }

  // Fallback for drives not tracked (e.g. reconnected from previous session)
  try {
    const letter = driveLetter.replace(':', '')
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-WindowStyle', 'Hidden', '-NoProfile', '-Command',
          `Get-PSDrive ${letter} | Select-Object Used,Free | ConvertTo-Json`],
        { encoding: 'utf8', windowsHide: true },
        (err, stdout) => {
          if (err) { resolve(null); return }
          try {
            const data = JSON.parse(stdout.trim())
            if (data.Used != null && data.Free != null) {
              resolve({ usedBytes: data.Used, totalBytes: data.Used + data.Free })
            } else resolve(null)
          } catch { resolve(null) }
        }
      )
    })
  } catch {
    return null
  }
}

// Kill all rclone processes on app quit
export function killAll(): void {
  for (const [id, mount] of mounts.entries()) {
    try { mount.proc.kill() } catch { /* ignore */ }
    mounts.delete(id)
  }
}

// Get the mount info for a server (used by tray, etc.)
export function getMountInfo(serverId: string): { rcPort: number; driveLetter: string } | null {
  const mount = mounts.get(serverId)
  return mount ? { rcPort: mount.rcPort, driveLetter: mount.driveLetter } : null
}
```

**Step 2: Verify file compiles**

Run: `cd /Users/nicolasbaar/Documents/Projets/webdav_connect && npx tsc --noEmit src/main/rclone-manager.ts`
(May need adjustments for import resolution — fix any type errors.)

**Step 3: Commit**

```bash
git add src/main/rclone-manager.ts
git commit -m "feat: add rclone-manager.ts — WinFsp-based drive mounting"
```

---

### Task 2: Update store.ts — remove security cache, keep encrypted credentials

**Files:**
- Modify: `src/main/store.ts`

Remove all security cache functions (`securityCacheKey`, `isUrlSecurityConfigured`, `markUrlSecurityConfigured`, `resetSecurityCache`). Keep server storage + encryption.

**Step 1: Edit `src/main/store.ts`**

Remove lines 99-121 (the entire security cache section). Remove the `resetSecurityCache` export.

The `clearAllServers` function should just delete servers, no longer call `resetSecurityCache`:
```typescript
export function clearAllServers(): void {
  store.delete('servers')
  // Also clean up any legacy security cache
  store.delete('securityCache')
}
```

**Step 2: Commit**

```bash
git add src/main/store.ts
git commit -m "refactor: remove security cache from store (no longer needed with WinFsp)"
```

---

### Task 3: Update index.ts — wire up rclone-manager instead of webdav-manager

**Files:**
- Modify: `src/main/index.ts`

Replace all imports and calls from `webdav-manager` to `rclone-manager`. The IPC interface stays the same so the renderer doesn't need changes.

**Step 1: Update imports**

Replace:
```typescript
import {
  connectDrive,
  disconnectDrive,
  getDriveSpace,
  isDriveConnected,
  ensureWebClient,
  renameDrive
} from './webdav-manager'
```

With:
```typescript
import {
  connectDrive,
  disconnectDrive,
  disconnectByDriveLetter,
  getDriveSpace,
  isDriveConnected,
  isDriveConnectedAsync,
  killAll
} from './rclone-manager'
```

**Step 2: Update IPC handlers**

`webdav:connect` handler — now passes serverId and an onExit callback:
```typescript
ipcMain.handle('webdav:connect', async (_e, opts) => {
  const servers = loadServers()
  const server = servers.find((s) => s.driveLetter === opts.driveLetter)
  const serverId = server?.id || Date.now().toString()
  if (server) intentionalDisconnects.delete(serverId)

  await connectDrive(serverId, opts, (code) => {
    if (code !== null && code !== 0) {
      // Unexpected exit — notify renderer
      sendStatus(serverId, 'disconnected')
    }
  })
})
```

`webdav:disconnect` handler — disconnect by serverId from the rclone mounts map:
```typescript
ipcMain.handle('webdav:disconnect', async (_e, driveLetter: string) => {
  const servers = loadServers()
  const server = servers.find((s) => s.driveLetter === driveLetter)
  if (server) intentionalDisconnects.add(server.id)
  await disconnectByDriveLetter(driveLetter)
})
```

`webdav:isConnected` handler — use filesystem check instead of net use:
```typescript
ipcMain.handle('webdav:isConnected', async (_e, driveLetter: string) => {
  const { existsSync } = require('fs')
  return existsSync(driveLetter + '\\')
})
```

`webdav:rename` handler — rclone's `--volname` sets the name at mount time. For runtime rename, use PowerShell `_LabelFromReg` (keep that helper):
```typescript
ipcMain.handle('webdav:rename', async (_e, driveLetter: string, name: string) => {
  // Set Explorer label via registry (same as before)
  const { execFile } = require('child_process')
  execFile('powershell.exe', [
    '-WindowStyle', 'Hidden', '-NoProfile', '-Command',
    `$mp = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\*" -Name '_LabelFromReg' -ErrorAction SilentlyContinue; ` +
    `$letter = '${driveLetter.replace(':', '')}'; ` +
    `$null = New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\##${driveLetter.replace(':', '')}#" -Name '_LabelFromReg' -Value '${name}' -Force -ErrorAction SilentlyContinue`
  ], { windowsHide: true }, () => {})
})
```

**Step 3: Update `reconnectServers()`**

Remove `ensureWebClient()` call. Use `connectDrive` from rclone-manager:
```typescript
async function reconnectServers(): Promise<void> {
  const now = Date.now()
  if (now - lastReconnectAttempt < 30_000) return
  lastReconnectAttempt = now

  const servers = loadServers()
  const { existsSync } = require('fs')
  const toReconnect = servers.filter(
    (s) => s.autoConnect && !intentionalDisconnects.has(s.id) && !existsSync(s.driveLetter + '\\')
  )

  if (toReconnect.length === 0) return

  await Promise.all(
    toReconnect.map((server) =>
      connectDrive(
        server.id,
        {
          url: server.url,
          driveLetter: server.driveLetter,
          username: server.username,
          password: server.password,
          driveName: server.driveName
        },
        (code) => {
          if (code !== null && code !== 0) {
            sendStatus(server.id, 'disconnected')
          }
        }
      )
        .then(() => sendStatus(server.id, 'connected'))
        .catch(() => {})
    )
  )
}
```

**Step 4: Update auto-connect on startup**

Same pattern — remove `ensureWebClient()`, use `connectDrive` from rclone-manager. Replace `isDriveConnected(s.driveLetter)` with `existsSync(s.driveLetter + '\\')`.

**Step 5: Add cleanup on app quit**

```typescript
app.on('before-quit', () => {
  killAll()
})
```

**Step 6: Remove `store:clearAll` dependency on resetSecurityCache**

```typescript
ipcMain.handle('store:clearAll', async () => {
  clearAllServers()
})
```

**Step 7: Commit**

```bash
git add src/main/index.ts
git commit -m "refactor: wire rclone-manager into main process IPC"
```

---

### Task 4: Update tray.ts — check drive status via filesystem instead of net use

**Files:**
- Modify: `src/main/tray.ts`

**Step 1: Update imports**

Replace:
```typescript
import { isDriveConnectedAsync, getDriveSpace } from './webdav-manager'
```
With:
```typescript
import { getDriveSpace } from './rclone-manager'
import { existsSync } from 'fs'
```

**Step 2: Replace `isDriveConnectedAsync` calls**

In `updateMenu()`, replace:
```typescript
connected: await isDriveConnectedAsync(s.driveLetter)
```
With:
```typescript
connected: existsSync(s.driveLetter + '\\')
```

**Step 3: Commit**

```bash
git add src/main/tray.ts
git commit -m "refactor: tray uses filesystem check instead of net use"
```

---

### Task 5: Delete webdav-manager.ts

**Files:**
- Delete: `src/main/webdav-manager.ts`

**Step 1: Delete the file**

```bash
git rm src/main/webdav-manager.ts
```

**Step 2: Verify no remaining imports**

Search all `.ts` files for `webdav-manager`. There should be zero references.

**Step 3: Commit**

```bash
git commit -m "chore: remove webdav-manager.ts (replaced by rclone-manager)"
```

---

### Task 6: Update package.json — bump version to 2.0.0

**Files:**
- Modify: `package.json`
- Modify: `src/renderer/src/App.tsx` (footer version)
- Modify: `src/renderer/src/components/Settings.tsx` (about version)

**Step 1: Bump versions**

In `package.json`: `"version": "2.0.0"`
In `App.tsx` line 328: `v2.0.0`
In `Settings.tsx` line 81: `v2.0.0`

**Step 2: Commit**

```bash
git add package.json src/renderer/src/App.tsx src/renderer/src/components/Settings.tsx
git commit -m "chore: bump version to 2.0.0"
```

---

### Task 7: Update electron-builder config — bundle rclone.exe and WinFsp MSI

**Files:**
- Modify: `package.json` (build config)
- Modify: `.github/workflows/build.yml`

rclone.exe must be placed in `resources/` before build. WinFsp MSI must be placed in `resources/`.

**Step 1: Add NSIS custom script for WinFsp**

Create `build/installer.nsh`:
```nsis
!macro customInit
  ; Check if WinFsp is installed
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\WinFsp" "InstallDir"
  StrCmp $0 "" 0 winfsp_ok
    ; WinFsp not found, install silently
    File /oname=$TEMP\winfsp.msi "${BUILD_RESOURCES_DIR}\winfsp.msi"
    ExecWait 'msiexec /i "$TEMP\winfsp.msi" /qn /norestart INSTALLLEVEL=1000' $1
    Delete "$TEMP\winfsp.msi"
    IntCmp $1 0 winfsp_ok
    IntCmp $1 3010 winfsp_ok
    MessageBox MB_OK|MB_ICONEXCLAMATION "L'installation de WinFsp a échoué (code: $1). CMC Drive nécessite WinFsp pour fonctionner."
    Abort
  winfsp_ok:
!macroend
```

**Step 2: Update `package.json` build config**

Add to `nsis` section:
```json
"include": "build/installer.nsh"
```

**Step 3: Update GitHub Actions to download rclone + WinFsp**

Update `.github/workflows/build.yml` to add steps before `npm run package`:
```yaml
      - name: Download rclone
        run: |
          Invoke-WebRequest -Uri "https://downloads.rclone.org/v1.69.3/rclone-v1.69.3-windows-amd64.zip" -OutFile rclone.zip
          Expand-Archive rclone.zip -DestinationPath rclone-tmp
          Copy-Item "rclone-tmp/rclone-v1.69.3-windows-amd64/rclone.exe" "resources/rclone.exe"
        shell: pwsh

      - name: Download WinFsp MSI
        run: |
          Invoke-WebRequest -Uri "https://github.com/winfsp/winfsp/releases/download/v2.1/winfsp-2.1.25156.msi" -OutFile "build/winfsp.msi"
        shell: pwsh
```

**Step 4: Commit**

```bash
git add build/installer.nsh package.json .github/workflows/build.yml
git commit -m "build: bundle rclone + WinFsp in installer"
```

---

### Task 8: Verify build compiles

**Step 1: Run TypeScript check**

Run: `cd /Users/nicolasbaar/Documents/Projets/webdav_connect && npx tsc --noEmit`

Fix any type errors.

**Step 2: Run Vite build**

Run: `npm run build`

Fix any build errors.

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve build errors after WinFsp migration"
```

---

### Task 9: Test on Windows (manual)

This task is manual — the user must test on a Windows machine.

**Checklist:**
- [ ] WinFsp is installed (check `HKLM\SOFTWARE\WOW6432Node\WinFsp`)
- [ ] rclone.exe is in resources/
- [ ] App starts without errors
- [ ] Can connect to WebDAV NAS — drive appears in Explorer as local disk
- [ ] Can open/save Office files without any security warning
- [ ] Tray icon shows correct status (green dot)
- [ ] Disconnect works cleanly
- [ ] Auto-reconnect after sleep works
- [ ] App quit kills all rclone processes
