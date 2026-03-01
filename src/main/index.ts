import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import {
  connectDrive,
  disconnectDrive,
  getDriveSpace,
  isDriveConnected,
  openExplorer
} from './webdav-manager'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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

  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:close', () => mainWindow.hide())
}

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

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
