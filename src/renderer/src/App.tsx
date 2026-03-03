import React, { useState, useEffect, useCallback } from 'react'
import Titlebar from './components/Titlebar'
import DriveCard, { DriveStatus } from './components/DriveCard'
import LoginDialog from './components/LoginDialog'
import Settings from './components/Settings'

const DEFAULT_URL = 'https://stockage.cmc-06.fr:5006/backup'
const DEFAULT_DRIVE = 'V:'
const DEFAULT_NAME = 'NAS CMC-06'

interface ServerState {
  config: ServerConfig
  status: DriveStatus
  usedBytes: number | null
  totalBytes: number | null
  error: string | null
}

function App(): React.JSX.Element {
  const [view, setView] = useState<'main' | 'settings'>('main')
  const [servers, setServers] = useState<ServerState[]>([])
  const [loginTarget, setLoginTarget] = useState<ServerConfig | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [updateReady, setUpdateReady] = useState<string | null>(null)

  const updateServer = useCallback((id: string, partial: Partial<ServerState>) => {
    setServers((prev) => prev.map((s) => (s.config.id === id ? { ...s, ...partial } : s)))
  }, [])

  const refreshSpace = useCallback(
    async (id: string, driveLetter: string) => {
      try {
        const space = await window.api.webdav.getSpace(driveLetter)
        if (space) {
          updateServer(id, { usedBytes: space.usedBytes, totalBytes: space.totalBytes })
        }
      } catch {
        // Non-critical
      }
    },
    [updateServer]
  )

  // On mount: load all saved servers and check connection status
  useEffect(() => {
    window.api.store.loadAll().then((configs) => {
      const states: ServerState[] = configs.map((config) => ({
        config,
        status: 'disconnected' as DriveStatus,
        usedBytes: null,
        totalBytes: null,
        error: null
      }))
      setServers(states)

      // Check which drives are already connected
      for (const config of configs) {
        window.api.webdav
          .isConnected(config.driveLetter)
          .then((connected) => {
            if (connected) {
              setServers((prev) =>
                prev.map((s) =>
                  s.config.id === config.id ? { ...s, status: 'connected' } : s
                )
              )
              window.api.webdav
                .getSpace(config.driveLetter)
                .then((space) => {
                  if (space) {
                    setServers((prev) =>
                      prev.map((s) =>
                        s.config.id === config.id
                          ? { ...s, usedBytes: space.usedBytes, totalBytes: space.totalBytes }
                          : s
                      )
                    )
                  }
                })
                .catch(() => {})
            }
          })
          .catch(() => {})
      }
    })
  }, [])

  // Listen for update events
  useEffect(() => {
    window.api.updater.onUpdateDownloaded((version) => {
      setUpdateReady(version)
    })
  }, [])

  // Listen for status changes from main process (e.g. auto-connect)
  useEffect(() => {
    window.api.onStatusChanged((serverId, newStatus) => {
      if (newStatus === 'connected') {
        setServers((prev) => {
          const server = prev.find((s) => s.config.id === serverId)
          if (server) {
            window.api.webdav
              .getSpace(server.config.driveLetter)
              .then((space) => {
                if (space) {
                  setServers((p) =>
                    p.map((s) =>
                      s.config.id === serverId
                        ? { ...s, usedBytes: space.usedBytes, totalBytes: space.totalBytes }
                        : s
                    )
                  )
                }
              })
              .catch(() => {})
          }
          return prev.map((s) =>
            s.config.id === serverId ? { ...s, status: 'connected' } : s
          )
        })
      }
    })
  }, [])

  // Periodic space refresh every 30s for all connected servers
  useEffect(() => {
    const interval = setInterval(() => {
      setServers((current) => {
        current
          .filter((s) => s.status === 'connected')
          .forEach((s) => {
            refreshSpace(s.config.id, s.config.driveLetter)
          })
        return current
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [refreshSpace])

  const handleConnect = async (data: {
    id?: string
    url: string
    driveLetter: string
    username: string
    password: string
    remember: boolean
    autoConnect: boolean
    driveName: string
  }): Promise<void> => {
    setShowLogin(false)

    const serverId = data.id || Date.now().toString()
    const config: ServerConfig = {
      id: serverId,
      url: data.url,
      driveLetter: data.driveLetter,
      username: data.username,
      password: data.password,
      autoConnect: data.autoConnect,
      driveName: data.driveName
    }

    // Add or update server in state
    setServers((prev) => {
      const exists = prev.find((s) => s.config.id === serverId)
      if (exists) {
        return prev.map((s) =>
          s.config.id === serverId
            ? { ...s, config, status: 'connecting' as DriveStatus, error: null }
            : s
        )
      }
      return [
        ...prev,
        {
          config,
          status: 'connecting' as DriveStatus,
          usedBytes: null,
          totalBytes: null,
          error: null
        }
      ]
    })

    try {
      await window.api.webdav.connect({
        url: data.url,
        driveLetter: data.driveLetter,
        username: data.username,
        password: data.password,
        driveName: data.driveName
      })
      updateServer(serverId, { status: 'connected', error: null })
      refreshSpace(serverId, data.driveLetter)
      window.api.notify('CMC Drive', `${data.driveName} connecté sur ${data.driveLetter}`)

      if (data.remember) {
        await window.api.store.save(config)
      }
    } catch (err) {
      updateServer(serverId, {
        status: 'disconnected',
        error: err instanceof Error ? err.message : 'Échec de la connexion'
      })
    }
  }

  const handleDisconnect = async (id: string): Promise<void> => {
    const server = servers.find((s) => s.config.id === id)
    if (!server) return

    updateServer(id, { status: 'disconnecting', error: null })

    try {
      await window.api.webdav.disconnect(server.config.driveLetter)
      updateServer(id, { status: 'disconnected', usedBytes: null, totalBytes: null })
      window.api.notify('CMC Drive', `${server.config.driveName} déconnecté`)
    } catch (err) {
      updateServer(id, {
        status: 'connected',
        error: err instanceof Error ? err.message : 'Échec de la déconnexion'
      })
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    const server = servers.find((s) => s.config.id === id)
    if (!server) return

    if (server.status === 'connected') {
      try {
        await window.api.webdav.disconnect(server.config.driveLetter)
      } catch {
        // Continue with deletion even if disconnect fails
      }
    }

    await window.api.store.delete(id)
    setServers((prev) => prev.filter((s) => s.config.id !== id))
  }

  const handleAdd = (): void => {
    setLoginTarget(null)
    setShowLogin(true)
  }

  const handleEdit = (id: string): void => {
    const server = servers.find((s) => s.config.id === id)
    if (server) {
      setLoginTarget(server.config)
      setShowLogin(true)
    }
  }

  const connectedCount = servers.filter((s) => s.status === 'connected').length

  return (
    <div className="app">
      <Titlebar onSettingsClick={() => setView('settings')} />
      {updateReady && (
        <div className="update-banner">
          <span>Mise à jour v{updateReady} prête</span>
          <button onClick={() => window.api.updater.install()}>Installer et redémarrer</button>
        </div>
      )}
      <div className="app-content">
        {view === 'settings' ? (
          <Settings onBack={() => setView('main')} />
        ) : (
          <>
            {servers.map((server) => (
              <React.Fragment key={server.config.id}>
                <DriveCard
                  name={server.config.driveName}
                  url={server.config.url}
                  driveLetter={server.config.driveLetter}
                  status={server.status}
                  usedBytes={server.usedBytes}
                  totalBytes={server.totalBytes}
                  onConnect={() => handleEdit(server.config.id)}
                  onDisconnect={() => handleDisconnect(server.config.id)}
                  onOpenExplorer={() =>
                    window.api.webdav.openExplorer(server.config.driveLetter)
                  }
                  onDelete={() => handleDelete(server.config.id)}
                  onRename={async (newName) => {
                    const updatedConfig = { ...server.config, driveName: newName }
                    updateServer(server.config.id, { config: updatedConfig })
                    if (server.status === 'connected') {
                      window.api.webdav
                        .rename(server.config.driveLetter, newName)
                        .catch(() => {})
                    }
                    await window.api.store.save(updatedConfig)
                  }}
                />
                {server.error && (
                  <div className="app-error">
                    <span>{server.error}</span>
                    <button onClick={() => updateServer(server.config.id, { error: null })}>
                      {'\u00D7'}
                    </button>
                  </div>
                )}
              </React.Fragment>
            ))}
            <button className="add-server-btn" onClick={handleAdd}>
              + Ajouter un serveur
            </button>
          </>
        )}
      </div>
      {showLogin && (
        <LoginDialog
          server={loginTarget ?? undefined}
          defaultUrl={DEFAULT_URL}
          defaultDriveLetter={DEFAULT_DRIVE}
          defaultDriveName={DEFAULT_NAME}
          usedDriveLetters={servers.map((s) => s.config.driveLetter)}
          onSubmit={handleConnect}
          onCancel={() => setShowLogin(false)}
        />
      )}
      <div className="app-footer">
        <span className="footer-status">
          {connectedCount} / {servers.length} connecté(s)
        </span>
        <span className="footer-version">v2.0.0</span>
      </div>
    </div>
  )
}
export default App
