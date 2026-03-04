import type { ServerConfig, ConnectOptions, DriveSpace } from '@shared/types'

declare global {
  declare const __APP_VERSION__: string

  interface Window {
    api: {
      platform: string
      minimizeWindow: () => void
      closeWindow: () => void
      webdav: {
        connect: (opts: ConnectOptions) => Promise<void>
        disconnect: (driveLetter: string) => Promise<void>
        getSpace: (driveLetter: string) => Promise<DriveSpace | null>
        isConnected: (driveLetter: string) => Promise<boolean>
        openExplorer: (driveLetter: string) => void
        rename: (driveLetter: string, name: string) => Promise<void>
      }
      store: {
        loadAll: () => Promise<ServerConfig[]>
        save: (config: ServerConfig) => Promise<void>
        delete: (id: string) => Promise<void>
        clearAll: () => Promise<void>
      }
      app: {
        getAutoStart: () => Promise<boolean>
        setAutoStart: (enabled: boolean) => Promise<void>
      }
      updater: {
        check: () => Promise<void>
        install: () => Promise<void>
        onUpdateAvailable: (cb: (version: string) => void) => () => void
        onUpdateDownloaded: (cb: (version: string) => void) => () => void
        onUpToDate: (cb: () => void) => () => void
        onError: (cb: (message: string) => void) => () => void
      }
      notify: (title: string, body: string) => void
      onStatusChanged: (callback: (serverId: string, status: string) => void) => () => void
    }
  }
}
