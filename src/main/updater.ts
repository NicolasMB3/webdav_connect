import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'

let getWindowFn: (() => BrowserWindow | null) | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = getWindowFn?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  getWindowFn = getWindow
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version)
    sendToRenderer('updater:updateAvailable', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No update available.')
    sendToRenderer('updater:upToDate')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[updater] Download: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info.version)
    sendToRenderer('updater:updateDownloaded', info.version)
  })

  autoUpdater.on('error', (err) => {
    console.log('[updater] Error:', err.message)
    sendToRenderer('updater:error', err.message)
  })

  // Initial check after 5s, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5_000)
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1_000)
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdatesAndNotify()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
