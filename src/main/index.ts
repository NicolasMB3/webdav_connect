import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

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

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
