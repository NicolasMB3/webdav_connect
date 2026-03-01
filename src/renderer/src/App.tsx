import React, { useState, useEffect, useCallback } from 'react'
import Titlebar from './components/Titlebar'
import DriveCard, { DriveStatus } from './components/DriveCard'
import LoginDialog from './components/LoginDialog'
import Settings from './components/Settings'

const DEFAULT_URL = 'https://stockage.cmc-06.fr:5006/backup'
const DEFAULT_DRIVE = 'V:'

function App(): React.JSX.Element {
  const [view, setView] = useState<'main' | 'settings'>('main')
  const [status, setStatus] = useState<DriveStatus>('disconnected')
  const [showLogin, setShowLogin] = useState(false)
  const [driveLetter, setDriveLetter] = useState(DEFAULT_DRIVE)
  const [usedBytes, setUsedBytes] = useState<number | null>(null)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshSpace = useCallback(async (drive: string) => {
    try {
      const space = await window.api.webdav.getSpace(drive)
      if (space) {
        setUsedBytes(space.usedBytes)
        setTotalBytes(space.totalBytes)
      }
    } catch {
      // Non-critical: space info unavailable
    }
  }, [])

  // On mount: load saved config
  useEffect(() => {
    window.api.store.load().then(saved => {
      if (saved) {
        setDriveLetter(saved.driveLetter)
      }
    })
  }, [])

  // On mount: check if drive is already connected
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const connected = await window.api.webdav.isConnected(driveLetter)
        if (!cancelled && connected) {
          setStatus('connected')
          refreshSpace(driveLetter)
        }
      } catch {
        // Ignore check failures
      }
    })()
    return () => { cancelled = true }
  }, [driveLetter, refreshSpace])

  // Listen for status changes from main process (e.g. auto-connect)
  useEffect(() => {
    window.api.onStatusChanged((newStatus) => {
      if (newStatus === 'connected') {
        setStatus('connected')
        refreshSpace(driveLetter)
      }
    })
  }, [driveLetter, refreshSpace])

  // Periodic space refresh every 30s when connected
  useEffect(() => {
    if (status !== 'connected') return
    const interval = setInterval(() => refreshSpace(driveLetter), 30_000)
    return () => clearInterval(interval)
  }, [status, driveLetter, refreshSpace])

  const handleConnect = async (data: {
    url: string
    driveLetter: string
    username: string
    password: string
    remember: boolean
    autoConnect: boolean
  }) => {
    setShowLogin(false)
    setError(null)
    setStatus('connecting')
    setDriveLetter(data.driveLetter)

    try {
      await window.api.webdav.connect({
        url: data.url,
        driveLetter: data.driveLetter,
        username: data.username,
        password: data.password
      })
      setStatus('connected')
      refreshSpace(data.driveLetter)
      window.api.notify('CMC Drive', `NAS connecte sur ${data.driveLetter}`)

      if (data.remember) {
        await window.api.store.save({
          url: data.url,
          driveLetter: data.driveLetter,
          username: data.username,
          password: data.password,
          autoConnect: data.autoConnect
        })
      }
    } catch (err) {
      setStatus('disconnected')
      setError(err instanceof Error ? err.message : 'Echec de la connexion')
    }
  }

  const handleDisconnect = async () => {
    setStatus('disconnecting')
    setError(null)

    try {
      await window.api.webdav.disconnect(driveLetter)
      setStatus('disconnected')
      window.api.notify('CMC Drive', 'NAS deconnecte')
      setUsedBytes(null)
      setTotalBytes(null)
    } catch (err) {
      setStatus('connected')
      setError(err instanceof Error ? err.message : 'Echec de la deconnexion')
    }
  }

  const statusText =
    status === 'connected'
      ? '\u25CF Connecte'
      : status === 'connecting'
        ? '\u25CC Connexion...'
        : '\u25CB Deconnecte'

  return (
    <div className="app">
      <Titlebar onSettingsClick={() => setView('settings')} />
      <div className="app-content">
        {view === 'settings' ? (
          <Settings onBack={() => setView('main')} />
        ) : (
          <>
            <DriveCard
              name="NAS CMC-06"
              url="stockage.cmc-06.fr:5006/backup"
              driveLetter={driveLetter}
              status={status}
              usedBytes={usedBytes}
              totalBytes={totalBytes}
              onConnect={() => setShowLogin(true)}
              onDisconnect={handleDisconnect}
              onOpenExplorer={() => window.api.webdav.openExplorer(driveLetter)}
            />
            {error && (
              <div className="app-error">
                <span>{error}</span>
                <button onClick={() => setError(null)}>{'\u00D7'}</button>
              </div>
            )}
          </>
        )}
      </div>
      {showLogin && (
        <LoginDialog
          defaultUrl={DEFAULT_URL}
          defaultDriveLetter={driveLetter}
          onSubmit={handleConnect}
          onCancel={() => setShowLogin(false)}
        />
      )}
      <div className="app-footer">
        <span className="footer-status">{statusText}</span>
        <span className="footer-version">v1.0.0</span>
      </div>
    </div>
  )
}
export default App
