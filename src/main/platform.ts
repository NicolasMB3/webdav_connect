import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'

export const IS_WIN = process.platform === 'win32'
export const IS_MAC = process.platform === 'darwin'

export function getRclonePath(): string {
  const bin = IS_WIN ? 'rclone.exe' : 'rclone'
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', bin)
  }
  return join(__dirname, '../../resources', bin)
}

export function getIconPath(): string {
  const icon = IS_WIN ? 'icon.ico' : 'icon.icns'
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', icon)
  }
  return join(__dirname, '../../resources', icon)
}

export function isMountReady(mountPoint: string): boolean {
  return IS_WIN ? existsSync(mountPoint + '\\') : existsSync(mountPoint)
}

export function mountPathForOpen(mountPoint: string): string {
  return IS_WIN ? mountPoint + '\\' : mountPoint
}

export function defaultMountPoint(driveName: string): string {
  if (IS_WIN) return 'V:'
  const slug = driveName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `/Volumes/${slug || 'CMC-Drive'}`
}

