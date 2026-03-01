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
      }) => Promise<void>
      disconnect: (driveLetter: string) => Promise<void>
      getSpace: (driveLetter: string) => Promise<{ usedBytes: number; totalBytes: number } | null>
      isConnected: (driveLetter: string) => Promise<boolean>
      openExplorer: (driveLetter: string) => void
    }
  }
}
