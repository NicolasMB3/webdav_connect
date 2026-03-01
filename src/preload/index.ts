import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  webdav: {
    connect: (opts: { url: string; driveLetter: string; username: string; password: string }) =>
      ipcRenderer.invoke('webdav:connect', opts),
    disconnect: (driveLetter: string) => ipcRenderer.invoke('webdav:disconnect', driveLetter),
    getSpace: (driveLetter: string) => ipcRenderer.invoke('webdav:space', driveLetter),
    isConnected: (driveLetter: string) => ipcRenderer.invoke('webdav:isConnected', driveLetter),
    openExplorer: (driveLetter: string) => ipcRenderer.send('webdav:openExplorer', driveLetter)
  }
})
