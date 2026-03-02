interface ServerConfig {
  id: string
  url: string
  driveLetter: string
  username: string
  password: string
  autoConnect: boolean
  driveName: string
}

interface Window {
  api: {
    platform: string
    minimizeWindow: () => void
    closeWindow: () => void
    webdav: {
      connect: (opts: {
        url: string
        driveLetter: string
        username: string
        password: string
        driveName?: string
      }) => Promise<void>
      disconnect: (driveLetter: string) => Promise<void>
      getSpace: (driveLetter: string) => Promise<{ usedBytes: number; totalBytes: number } | null>
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
    notify: (title: string, body: string) => void
    onStatusChanged: (callback: (serverId: string, status: string) => void) => void
  }
}
