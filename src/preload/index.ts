import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  webdav: {
    connect: (opts: {
      url: string
      driveLetter: string
      username: string
      password: string
      driveName?: string
    }) => ipcRenderer.invoke('webdav:connect', opts),
    disconnect: (driveLetter: string) => ipcRenderer.invoke('webdav:disconnect', driveLetter),
    getSpace: (driveLetter: string) => ipcRenderer.invoke('webdav:space', driveLetter),
    isConnected: (driveLetter: string) => ipcRenderer.invoke('webdav:isConnected', driveLetter),
    openExplorer: (driveLetter: string) => ipcRenderer.send('webdav:openExplorer', driveLetter),
    rename: (driveLetter: string, name: string) =>
      ipcRenderer.invoke('webdav:rename', driveLetter, name)
  },
  store: {
    loadAll: () => ipcRenderer.invoke('store:loadAll'),
    save: (config: {
      id: string
      url: string
      driveLetter: string
      username: string
      password: string
      autoConnect: boolean
      driveName: string
    }) => ipcRenderer.invoke('store:save', config),
    delete: (id: string) => ipcRenderer.invoke('store:delete', id),
    clearAll: () => ipcRenderer.invoke('store:clearAll')
  },
  app: {
    getAutoStart: () => ipcRenderer.invoke('app:getAutoStart'),
    setAutoStart: (enabled: boolean) => ipcRenderer.invoke('app:setAutoStart', enabled)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onUpdateAvailable: (cb: (version: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, version: string): void => { cb(version) }
      ipcRenderer.on('updater:updateAvailable', handler)
      return () => { ipcRenderer.removeListener('updater:updateAvailable', handler) }
    },
    onUpdateDownloaded: (cb: (version: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, version: string): void => { cb(version) }
      ipcRenderer.on('updater:updateDownloaded', handler)
      return () => { ipcRenderer.removeListener('updater:updateDownloaded', handler) }
    },
    onUpToDate: (cb: () => void): (() => void) => {
      const handler = (): void => { cb() }
      ipcRenderer.on('updater:upToDate', handler)
      return () => { ipcRenderer.removeListener('updater:upToDate', handler) }
    },
    onError: (cb: (message: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, message: string): void => { cb(message) }
      ipcRenderer.on('updater:error', handler)
      return () => { ipcRenderer.removeListener('updater:error', handler) }
    }
  },
  notify: (title: string, body: string) => ipcRenderer.send('notify', { title, body }),
  onStatusChanged: (callback: (serverId: string, status: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, id: string, status: string): void => { callback(id, status) }
    ipcRenderer.on('webdav:statusChanged', handler)
    return () => { ipcRenderer.removeListener('webdav:statusChanged', handler) }
  }
})
