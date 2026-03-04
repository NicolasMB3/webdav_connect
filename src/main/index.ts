import { app, BrowserWindow, ipcMain, Notification, shell, powerMonitor } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { execFile as execFileCb } from 'child_process'
import { connectDrive, disconnectByDriveLetter, getDriveSpace, killAll } from './rclone-manager'
import {
  loadServers,
  saveServer,
  deleteServer,
  clearAllServers,
  isFirstLaunch,
  markLaunched,
  ServerConfig
} from './store'
import { createTray } from './tray'
import { setupAutoUpdater, checkForUpdates, installUpdate, replayUpdateState } from './updater'
import {
  IPC_WINDOW_MINIMIZE,
  IPC_WINDOW_CLOSE,
  IPC_WEBDAV_CONNECT,
  IPC_WEBDAV_DISCONNECT,
  IPC_WEBDAV_SPACE,
  IPC_WEBDAV_IS_CONNECTED,
  IPC_WEBDAV_OPEN_EXPLORER,
  IPC_WEBDAV_RENAME,
  IPC_WEBDAV_STATUS_CHANGED,
  IPC_STORE_LOAD_ALL,
  IPC_STORE_SAVE,
  IPC_STORE_DELETE,
  IPC_STORE_CLEAR_ALL,
  IPC_APP_GET_AUTO_START,
  IPC_APP_SET_AUTO_START,
  IPC_UPDATER_CHECK,
  IPC_UPDATER_INSTALL,
  IPC_NOTIFY
} from '../shared/ipc-channels'

function getIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'icon.ico')
  }
  return join(__dirname, '../../resources/icon.ico')
}

const RECONNECT_COOLDOWN_MS = 30_000

// F2: Track intentionally disconnected servers (via UI) to avoid auto-reconnect
const intentionalDisconnects = new Set<string>()
const lastReconnectAttempts = new Map<string, number>()

// Lazy window creation — window is not created until user interacts
let mainWindow: BrowserWindow | null = null
const pendingStatusChanges: Array<[string, string]> = []

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 600,
    frame: false,
    resizable: false,
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Hide on close instead of quitting (tray keeps running)
  win.on('close', (e) => {
    e.preventDefault()
    win.hide()
  })

  // Flush queued status changes + replay update state once the renderer is ready
  win.webContents.on('did-finish-load', () => {
    for (const [id, status] of pendingStatusChanges) {
      win.webContents.send(IPC_WEBDAV_STATUS_CHANGED, id, status)
    }
    pendingStatusChanges.length = 0
    replayUpdateState(win)
  })

  return win
}

function getOrCreateWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
  }
  return mainWindow
}

function sendStatus(serverId: string, status: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_WEBDAV_STATUS_CHANGED, serverId, status)
  } else {
    pendingStatusChanges.push([serverId, status])
  }
}

async function connectServer(server: ServerConfig): Promise<void> {
  await connectDrive(
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
  sendStatus(server.id, 'connected')
}

// Window IPC handlers
ipcMain.on(IPC_WINDOW_MINIMIZE, () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
})
ipcMain.on(IPC_WINDOW_CLOSE, () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
})

// Notification IPC handler
ipcMain.on(IPC_NOTIFY, (_e, { title, body }: { title: string; body: string }) => {
  new Notification({ title, body }).show()
})

// WebDAV IPC handlers
ipcMain.handle(
  IPC_WEBDAV_CONNECT,
  async (
    _e,
    opts: {
      url: string
      driveLetter: string
      username: string
      password: string
      driveName?: string
    }
  ) => {
    const servers = loadServers()
    const server = servers.find((s) => s.driveLetter === opts.driveLetter)
    const serverId = server?.id || Date.now().toString()
    if (server) intentionalDisconnects.delete(serverId)

    await connectDrive(serverId, opts, (code) => {
      if (code !== null && code !== 0) {
        sendStatus(serverId, 'disconnected')
      }
    })
  }
)

ipcMain.handle(IPC_WEBDAV_DISCONNECT, async (_e, driveLetter: string) => {
  const servers = loadServers()
  const server = servers.find((s) => s.driveLetter === driveLetter)
  if (server) intentionalDisconnects.add(server.id)
  await disconnectByDriveLetter(driveLetter)
})

ipcMain.handle(IPC_WEBDAV_SPACE, async (_e, driveLetter: string) => {
  return getDriveSpace(driveLetter)
})

ipcMain.handle(IPC_WEBDAV_IS_CONNECTED, async (_e, driveLetter: string) => {
  return existsSync(driveLetter + '\\')
})

ipcMain.on(IPC_WEBDAV_OPEN_EXPLORER, (_e, driveLetter: string) => {
  shell.openPath(driveLetter + '\\')
})

ipcMain.handle(IPC_WEBDAV_RENAME, async (_e, driveLetter: string, name: string) => {
  const letter = driveLetter.replace(/[^A-Za-z]/g, '')
  const safeName = name.replace(/'/g, "''").replace(/[`$]/g, '')
  execFileCb(
    'powershell.exe',
    [
      '-WindowStyle',
      'Hidden',
      '-NoProfile',
      '-Command',
      `Get-ChildItem "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2" | ForEach-Object { New-ItemProperty -Path $_.PSPath -Name '_LabelFromReg' -Value '${safeName}' -Force -ErrorAction SilentlyContinue } | Out-Null`
    ],
    { windowsHide: true },
    () => {}
  )
})

// Store IPC handlers
ipcMain.handle(IPC_STORE_LOAD_ALL, async () => {
  return loadServers()
})

ipcMain.handle(IPC_STORE_SAVE, async (_e, config: ServerConfig) => {
  saveServer(config)
})

ipcMain.handle(IPC_STORE_DELETE, async (_e, id: string) => {
  deleteServer(id)
  intentionalDisconnects.delete(id)
  lastReconnectAttempts.delete(id)
})

ipcMain.handle(IPC_STORE_CLEAR_ALL, async () => {
  clearAllServers()
})

// Updater IPC handlers
ipcMain.handle(IPC_UPDATER_CHECK, () => {
  checkForUpdates()
})

ipcMain.handle(IPC_UPDATER_INSTALL, () => {
  installUpdate()
})

// App IPC handlers
ipcMain.handle(IPC_APP_GET_AUTO_START, () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle(IPC_APP_SET_AUTO_START, (_e, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
})

// F2: Auto-reconnect servers that dropped unexpectedly (with cooldown)
async function reconnectServers(): Promise<void> {
  const now = Date.now()
  const servers = loadServers()
  const toReconnect = servers.filter((s) => {
    if (!s.autoConnect || intentionalDisconnects.has(s.id) || existsSync(s.driveLetter + '\\')) {
      return false
    }
    const lastAttempt = lastReconnectAttempts.get(s.id) ?? 0
    return now - lastAttempt >= RECONNECT_COOLDOWN_MS
  })

  if (toReconnect.length === 0) return

  await Promise.all(
    toReconnect.map((server) => {
      lastReconnectAttempts.set(server.id, now)
      return connectServer(server).catch((err) => {
        console.warn(`[main] reconnect failed for ${server.driveName}:`, err)
      })
    })
  )
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getOrCreateWindow()
    win.show()
    win.focus()
  })

  app.whenReady().then(async () => {
    // Fix Windows taskbar icon: associate our custom icon with this AppUserModelId
    app.setAppUserModelId('fr.cmc-06.cmc-drive')

    // Enable auto-start on first launch
    if (isFirstLaunch()) {
      app.setLoginItemSettings({ openAtLogin: true })
      markLaunched()
    }

    // Create tray with lazy window getter and disconnect callback (F2)
    createTray(getOrCreateWindow, () => loadServers(), {
      onDriveDisconnected: () => reconnectServers()
    })

    // F1: Setup auto-updater (checks after 5s, then every 4h)
    setupAutoUpdater(() => mainWindow)

    // F2: Reconnect drives after PC wakes from sleep/hibernate
    powerMonitor.on('resume', () => {
      setTimeout(reconnectServers, 3_000)
    })

    // Auto-connect on startup for all servers with autoConnect enabled
    const servers = loadServers()
    const autoConnectServers = servers.filter(
      (s) => s.autoConnect && !existsSync(s.driveLetter + '\\')
    )

    if (autoConnectServers.length > 0) {
      await Promise.all(
        autoConnectServers.map((server) =>
          connectServer(server).catch((err) => {
            console.warn(`[main] auto-connect failed for ${server.driveName}:`, err)
          })
        )
      )
    }
  })
}

app.on('before-quit', () => {
  killAll()
})

app.on('window-all-closed', () => {
  // No-op: app stays alive in tray
})
