import { Tray, Menu, nativeImage, BrowserWindow, app, shell, Notification } from 'electron'
import { join } from 'path'
import { getDriveSpace } from './rclone-manager'
import { existsSync } from 'fs'
import type { ServerConfig } from './store'

const ICON_SIZE = { width: 16, height: 16 }
const DOT_RADIUS = 3
const DOT_COLORS = {
  green: [76, 175, 80] as const,
  orange: [255, 152, 0] as const,
  red: [244, 67, 54] as const
}
const LOW_SPACE_THRESHOLD_BYTES = 5 * 1024 ** 3
const MENU_UPDATE_INTERVAL_MS = 10_000
const SPACE_CHECK_CYCLE_COUNT = 30

function getTrayIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'icon.png')
  }
  return join(__dirname, '../../resources/icon.png')
}

let tray: Tray | null = null

export interface TrayOptions {
  onDriveDisconnected?: (serverId: string) => void
}

// F4: Create a copy of the base icon with a colored status dot in the bottom-right corner
function createIconWithDot(
  baseIcon: Electron.NativeImage,
  color: [number, number, number]
): Electron.NativeImage {
  const { width, height } = baseIcon.getSize()
  const bitmap = Buffer.from(baseIcon.toBitmap()) // BGRA format

  const cx = width - 4
  const cy = height - 4

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= DOT_RADIUS * DOT_RADIUS) {
        const offset = (y * width + x) * 4
        bitmap[offset] = color[2] // B
        bitmap[offset + 1] = color[1] // G
        bitmap[offset + 2] = color[0] // R
        bitmap[offset + 3] = 255 // A
      }
    }
  }

  return nativeImage.createFromBitmap(bitmap, { width, height })
}

export function createTray(
  getWindow: () => BrowserWindow,
  getServers: () => ServerConfig[],
  options?: TrayOptions
): Tray {
  const iconPath = getTrayIconPath()
  let baseIcon: Electron.NativeImage
  try {
    baseIcon = nativeImage.createFromPath(iconPath).resize(ICON_SIZE)
  } catch {
    baseIcon = nativeImage.createEmpty()
  }

  // F4: Pre-generate colored icons once
  const greenIcon = createIconWithDot(baseIcon, [...DOT_COLORS.green])
  const orangeIcon = createIconWithDot(baseIcon, [...DOT_COLORS.orange])
  const redIcon = createIconWithDot(baseIcon, [...DOT_COLORS.red])

  tray = new Tray(baseIcon)
  tray.setToolTip('CMC Drive')

  // F2: Track previous connection states for disconnect detection
  const previousStates = new Map<string, boolean>()

  // F5: Track low-space notifications and check cycle counter
  const lowSpaceNotified = new Set<string>()
  let updateCycle = 0

  const updateMenu = async (): Promise<void> => {
    const servers = getServers()
    const results = servers.map((s) => ({
      server: s,
      connected: existsSync(s.driveLetter + '\\')
    }))

    // F2 + F3: Detect unexpected disconnections
    for (const { server, connected } of results) {
      const wasConnected = previousStates.get(server.id)
      if (wasConnected === true && !connected) {
        // F3: Native notification
        new Notification({
          title: 'CMC Drive',
          body: `${server.driveName} (${server.driveLetter}) déconnecté. Reconnexion...`
        }).show()
        // F2: Trigger reconnection callback
        options?.onDriveDisconnected?.(server.id)
      }
      previousStates.set(server.id, connected)
    }

    // F4: Update tray icon based on overall connection status
    const total = servers.length
    const connectedCount = results.filter((r) => r.connected).length
    if (total === 0) {
      tray!.setImage(baseIcon)
    } else if (connectedCount === total) {
      tray!.setImage(greenIcon)
    } else if (connectedCount > 0) {
      tray!.setImage(orangeIcon)
    } else {
      tray!.setImage(redIcon)
    }

    // F5: Check disk space every 5 minutes (SPACE_CHECK_CYCLE_COUNT × MENU_UPDATE_INTERVAL_MS)
    updateCycle++
    if (updateCycle % SPACE_CHECK_CYCLE_COUNT === 0) {
      for (const { server, connected } of results) {
        if (!connected) continue
        try {
          const space = await getDriveSpace(server.driveLetter)
          if (space) {
            const freeBytes = space.totalBytes - space.usedBytes
            if (freeBytes < LOW_SPACE_THRESHOLD_BYTES && !lowSpaceNotified.has(server.id)) {
              const freeGB = (freeBytes / 1024 ** 3).toFixed(1)
              new Notification({
                title: 'CMC Drive — Espace disque faible',
                body: `${server.driveName} (${server.driveLetter}) : ${freeGB} Go restants`
              }).show()
              lowSpaceNotified.add(server.id)
            } else if (freeBytes >= LOW_SPACE_THRESHOLD_BYTES && lowSpaceNotified.has(server.id)) {
              lowSpaceNotified.delete(server.id)
            }
          }
        } catch {
          // Non-critical: space check failed
        }
      }
    }

    const connectedEntries = results
      .filter((r) => r.connected)
      .map((r) => ({
        label: `Ouvrir ${r.server.driveName} (${r.server.driveLetter})`,
        click: (): void => {
          shell.openPath(r.server.driveLetter + '\\')
        }
      }))

    const contextMenu = Menu.buildFromTemplate([
      { label: 'CMC Drive', enabled: false },
      { type: 'separator' },
      ...connectedEntries,
      ...(connectedEntries.length > 0 ? [{ type: 'separator' as const }] : []),
      {
        label: 'Ouvrir CMC Drive',
        click: () => {
          const win = getWindow()
          win.show()
          win.focus()
        }
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          if (tray) tray.destroy()
          app.exit(0)
        }
      }
    ])
    tray!.setContextMenu(contextMenu)
  }

  updateMenu()
  setInterval(updateMenu, MENU_UPDATE_INTERVAL_MS)

  tray.on('double-click', () => {
    const win = getWindow()
    win.show()
    win.focus()
  })

  return tray
}
