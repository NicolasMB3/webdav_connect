import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import {
  connectDrive,
  disconnectDrive,
  getDriveSpace,
  isDriveConnected,
  openExplorer
} from './webdav-manager'
import { saveCredentials, loadCredentials, clearCredentials } from './store'
import { createTray } from './tray'

let mainWindow: BrowserWindow

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 400,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Hide on close instead of quitting (tray keeps running)
  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })

  return mainWindow
}

// Window IPC handlers (use module-scope mainWindow)
ipcMain.on('window:minimize', () => mainWindow.minimize())
ipcMain.on('window:close', () => mainWindow.hide())

// WebDAV IPC handlers
ipcMain.handle('webdav:connect', async (_e, opts) => {
  await connectDrive(opts)
})

ipcMain.handle('webdav:disconnect', async (_e, driveLetter: string) => {
  await disconnectDrive(driveLetter)
})

ipcMain.handle('webdav:space', async (_e, driveLetter: string) => {
  return getDriveSpace(driveLetter)
})

ipcMain.handle('webdav:isConnected', async (_e, driveLetter: string) => {
  return isDriveConnected(driveLetter)
})

ipcMain.on('webdav:openExplorer', (_e, driveLetter: string) => {
  openExplorer(driveLetter)
})

// Store IPC handlers
ipcMain.handle('store:save', async (_e, config) => {
  saveCredentials(config)
})

ipcMain.handle('store:load', async () => {
  return loadCredentials()
})

ipcMain.handle('store:clear', async () => {
  clearCredentials()
})

// Single instance lock
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    const win = createWindow()
    createTray(win, 'V:')
  })
}

app.on('window-all-closed', () => {
  // No-op: app stays alive in tray
})
