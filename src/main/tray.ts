import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { openExplorer, isDriveConnected } from './webdav-manager'

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow, driveLetter: string): Tray {
  const iconPath = join(__dirname, '../../resources/icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('CMC Drive')

  const updateMenu = (): void => {
    const connected = isDriveConnected(driveLetter)
    const contextMenu = Menu.buildFromTemplate([
      { label: 'CMC Drive', enabled: false },
      { type: 'separator' },
      {
        label: `Ouvrir le NAS (${driveLetter})`,
        enabled: connected,
        click: () => openExplorer(driveLetter)
      },
      { type: 'separator' },
      {
        label: 'Ouvrir CMC Drive',
        click: () => {
          mainWindow.show()
          mainWindow.focus()
        }
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          if (tray) tray.destroy()
          mainWindow.destroy()
          app.quit()
        }
      }
    ])
    tray!.setContextMenu(contextMenu)
  }

  updateMenu()
  setInterval(updateMenu, 10_000)

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}
