import { app, BrowserWindow, ipcMain, Notification, shell, powerMonitor } from 'electron'
import { join } from 'path'
import { appendFileSync } from 'fs'
import {
  connectDrive,
  disconnectDrive,
  getDriveSpace,
  isDriveConnected,
  ensureWebClient,
  renameDrive
} from './webdav-manager'
import {
  loadServers,
  saveServer,
  deleteServer,
  clearAllServers,
  isFirstLaunch,
  markLaunched,
  resetSecurityCache
} from './store'
import { createTray } from './tray'
import { setupAutoUpdater, checkForUpdates, installUpdate, replayUpdateState } from './updater'

function getIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'icon.ico')
  }
  return join(__dirname, '../../resources/icon.ico')
}

// F2: Track intentionally disconnected servers (via UI) to avoid auto-reconnect
const intentionalDisconnects = new Set<string>()
let lastReconnectAttempt = 0

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
      win.webContents.send('webdav:statusChanged', id, status)
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
    mainWindow.webContents.send('webdav:statusChanged', serverId, status)
  } else {
    pendingStatusChanges.push([serverId, status])
  }
}

// Window IPC handlers
ipcMain.on('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
})
ipcMain.on('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
})

// Notification IPC handler
ipcMain.on('notify', (_e, { title, body }: { title: string; body: string }) => {
  new Notification({ title, body }).show()
})

// WebDAV IPC handlers
ipcMain.handle('webdav:connect', async (_e, opts) => {
  // F2: Remove from intentional disconnects on manual connect
  const servers = loadServers()
  const server = servers.find((s) => s.driveLetter === opts.driveLetter)
  if (server) intentionalDisconnects.delete(server.id)
  await connectDrive({ ...opts, iconPath: getIconPath() })
})

ipcMain.handle('webdav:disconnect', async (_e, driveLetter: string) => {
  // F2: Mark as intentionally disconnected to prevent auto-reconnect
  const servers = loadServers()
  const server = servers.find((s) => s.driveLetter === driveLetter)
  if (server) intentionalDisconnects.add(server.id)
  await disconnectDrive(driveLetter)
})

ipcMain.handle('webdav:space', async (_e, driveLetter: string) => {
  return getDriveSpace(driveLetter)
})

ipcMain.handle('webdav:isConnected', async (_e, driveLetter: string) => {
  return isDriveConnected(driveLetter)
})

ipcMain.on('webdav:openExplorer', (_e, driveLetter: string) => {
  const target = driveLetter + '\\'
  const logPath = join(app.getPath('userData'), 'debug.log')
  appendFileSync(logPath, `[${new Date().toISOString()}] openExplorer: ${target}\n`)
  shell.openPath(target).then((err) => {
    appendFileSync(logPath, `[${new Date().toISOString()}] result: ${err || 'OK'}\n`)
  })
})

ipcMain.handle('webdav:rename', async (_e, driveLetter: string, name: string) => {
  await renameDrive(driveLetter, name)
})

// Store IPC handlers
ipcMain.handle('store:loadAll', async () => {
  return loadServers()
})

ipcMain.handle('store:save', async (_e, config) => {
  saveServer(config)
})

ipcMain.handle('store:delete', async (_e, id: string) => {
  deleteServer(id)
})

ipcMain.handle('store:clearAll', async () => {
  clearAllServers()
  resetSecurityCache()
})

// Updater IPC handlers
ipcMain.handle('updater:check', () => {
  checkForUpdates()
})

ipcMain.handle('updater:install', () => {
  installUpdate()
})

// App IPC handlers
ipcMain.handle('app:getAutoStart', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('app:setAutoStart', (_e, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
})

// F2: Auto-reconnect servers that dropped unexpectedly (with 30s cooldown)
async function reconnectServers(): Promise<void> {
  const now = Date.now()
  if (now - lastReconnectAttempt < 30_000) return
  lastReconnectAttempt = now

  const servers = loadServers()
  const toReconnect = servers.filter(
    (s) => s.autoConnect && !intentionalDisconnects.has(s.id) && !isDriveConnected(s.driveLetter)
  )

  if (toReconnect.length === 0) return

  await ensureWebClient()
  await Promise.all(
    toReconnect.map((server) =>
      connectDrive(
        {
          url: server.url,
          driveLetter: server.driveLetter,
          username: server.username,
          password: server.password,
          driveName: server.driveName,
          iconPath: getIconPath()
        },
        { skipWebClientCheck: true }
      )
        .then(() => sendStatus(server.id, 'connected'))
        .catch(() => {
          // Silent fail, will retry on next cycle
        })
    )
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
      (s) => s.autoConnect && !isDriveConnected(s.driveLetter)
    )

    if (autoConnectServers.length > 0) {
      // Start WebClient service once for all drives
      await ensureWebClient()

      // Connect all drives in parallel (skip individual WebClient checks)
      await Promise.all(
        autoConnectServers.map((server) =>
          connectDrive(
            {
              url: server.url,
              driveLetter: server.driveLetter,
              username: server.username,
              password: server.password,
              driveName: server.driveName,
              iconPath: getIconPath()
            },
            { skipWebClientCheck: true }
          )
            .then(() => sendStatus(server.id, 'connected'))
            .catch(() => {
              // Silent fail on auto-connect, user can connect manually
            })
        )
      )
    }
  })
}

app.on('window-all-closed', () => {
  // No-op: app stays alive in tray
})
