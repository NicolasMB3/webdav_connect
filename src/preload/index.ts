import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { ConnectOptions, ServerConfig } from '../shared/types'
import {
  IPC_WINDOW_MINIMIZE,
  IPC_WINDOW_CLOSE,
  IPC_WEBDAV_CONNECT,
  IPC_WEBDAV_DISCONNECT,
  IPC_WEBDAV_SPACE,
  IPC_WEBDAV_IS_CONNECTED,
  IPC_WEBDAV_OPEN_EXPLORER,
  IPC_WEBDAV_RENAME,
  IPC_WEBDAV_STATUS_CHANGED,
  IPC_STORE_LOAD_ALL,
  IPC_STORE_SAVE,
  IPC_STORE_DELETE,
  IPC_STORE_CLEAR_ALL,
  IPC_APP_GET_AUTO_START,
  IPC_APP_SET_AUTO_START,
  IPC_UPDATER_CHECK,
  IPC_UPDATER_INSTALL,
  IPC_UPDATER_UPDATE_AVAILABLE,
  IPC_UPDATER_UPDATE_DOWNLOADED,
  IPC_UPDATER_UP_TO_DATE,
  IPC_UPDATER_ERROR,
  IPC_NOTIFY
} from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send(IPC_WINDOW_MINIMIZE),
  closeWindow: () => ipcRenderer.send(IPC_WINDOW_CLOSE),
  webdav: {
    connect: (opts: ConnectOptions) => ipcRenderer.invoke(IPC_WEBDAV_CONNECT, opts),
    disconnect: (mountPoint: string) => ipcRenderer.invoke(IPC_WEBDAV_DISCONNECT, mountPoint),
    getSpace: (mountPoint: string) => ipcRenderer.invoke(IPC_WEBDAV_SPACE, mountPoint),
    isConnected: (mountPoint: string) => ipcRenderer.invoke(IPC_WEBDAV_IS_CONNECTED, mountPoint),
    openExplorer: (mountPoint: string) => ipcRenderer.send(IPC_WEBDAV_OPEN_EXPLORER, mountPoint),
    rename: (mountPoint: string, name: string) =>
      ipcRenderer.invoke(IPC_WEBDAV_RENAME, mountPoint, name)
  },
  store: {
    loadAll: () => ipcRenderer.invoke(IPC_STORE_LOAD_ALL),
    save: (config: ServerConfig) => ipcRenderer.invoke(IPC_STORE_SAVE, config),
    delete: (id: string) => ipcRenderer.invoke(IPC_STORE_DELETE, id),
    clearAll: () => ipcRenderer.invoke(IPC_STORE_CLEAR_ALL)
  },
  app: {
    getAutoStart: () => ipcRenderer.invoke(IPC_APP_GET_AUTO_START),
    setAutoStart: (enabled: boolean) => ipcRenderer.invoke(IPC_APP_SET_AUTO_START, enabled)
  },
  updater: {
    check: () => ipcRenderer.invoke(IPC_UPDATER_CHECK),
    install: () => ipcRenderer.invoke(IPC_UPDATER_INSTALL),
    onUpdateAvailable: (cb: (version: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, version: string): void => {
        cb(version)
      }
      ipcRenderer.on(IPC_UPDATER_UPDATE_AVAILABLE, handler)
      return () => {
        ipcRenderer.removeListener(IPC_UPDATER_UPDATE_AVAILABLE, handler)
      }
    },
    onUpdateDownloaded: (cb: (version: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, version: string): void => {
        cb(version)
      }
      ipcRenderer.on(IPC_UPDATER_UPDATE_DOWNLOADED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_UPDATER_UPDATE_DOWNLOADED, handler)
      }
    },
    onUpToDate: (cb: () => void): (() => void) => {
      const handler = (): void => {
        cb()
      }
      ipcRenderer.on(IPC_UPDATER_UP_TO_DATE, handler)
      return () => {
        ipcRenderer.removeListener(IPC_UPDATER_UP_TO_DATE, handler)
      }
    },
    onError: (cb: (message: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, message: string): void => {
        cb(message)
      }
      ipcRenderer.on(IPC_UPDATER_ERROR, handler)
      return () => {
        ipcRenderer.removeListener(IPC_UPDATER_ERROR, handler)
      }
    }
  },
  notify: (title: string, body: string) => ipcRenderer.send(IPC_NOTIFY, { title, body }),
  onStatusChanged: (callback: (serverId: string, status: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, id: string, status: string): void => {
      callback(id, status)
    }
    ipcRenderer.on(IPC_WEBDAV_STATUS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_WEBDAV_STATUS_CHANGED, handler)
    }
  }
})
