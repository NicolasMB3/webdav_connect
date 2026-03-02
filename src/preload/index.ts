import { contextBridge, ipcRenderer } from 'electron'

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
    onUpdateAvailable: (cb: (version: string) => void) => {
      ipcRenderer.on('updater:updateAvailable', (_e, version) => cb(version))
    },
    onUpdateDownloaded: (cb: (version: string) => void) => {
      ipcRenderer.on('updater:updateDownloaded', (_e, version) => cb(version))
    },
    onUpToDate: (cb: () => void) => {
      ipcRenderer.on('updater:upToDate', () => cb())
    },
    onError: (cb: (message: string) => void) => {
      ipcRenderer.on('updater:error', (_e, message) => cb(message))
    }
  },
  notify: (title: string, body: string) => ipcRenderer.send('notify', { title, body }),
  onStatusChanged: (callback: (serverId: string, status: string) => void) => {
    ipcRenderer.on('webdav:statusChanged', (_e, id, status) => callback(id, status))
  }
})
