import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'

const INITIAL_CHECK_DELAY_MS = 5_000
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000

let getWindowFn: (() => BrowserWindow | null) | null = null

// Queued update state — persists until a window is ready to receive it
let pendingState: { channel: string; args: unknown[] } | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = getWindowFn?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  } else {
    // Window doesn't exist yet — queue the latest state
    pendingState = { channel, args }
  }
}

/**
 * Replay the last queued update state to a newly opened window.
 * Called from createWindow()'s did-finish-load event.
 */
export function replayUpdateState(win: BrowserWindow): void {
  if (pendingState && !win.isDestroyed()) {
    win.webContents.send(pendingState.channel, ...pendingState.args)
    pendingState = null
  }
}

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  getWindowFn = getWindow
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {})

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('updater:updateAvailable', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('updater:upToDate')
  })

  autoUpdater.on('download-progress', () => {})

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('updater:updateDownloaded', info.version)
  })

  autoUpdater.on('error', (err) => {
    sendToRenderer('updater:error', err.message)
  })

  const safeCheck = (): void => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }

  // Initial check after delay, then periodically
  setTimeout(safeCheck, INITIAL_CHECK_DELAY_MS)
  setInterval(safeCheck, UPDATE_CHECK_INTERVAL_MS)
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdatesAndNotify()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
