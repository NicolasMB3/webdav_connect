import { autoUpdater } from 'electron-updater'

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No update available.')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[updater] Download: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info.version)
  })

  autoUpdater.on('error', (err) => {
    console.log('[updater] Error:', err.message)
  })

  // Initial check after 5s, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5_000)
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1_000)
}
