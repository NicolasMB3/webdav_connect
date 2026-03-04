import React, { useState, useEffect, useRef } from 'react'
import './Settings.css'

interface SettingsProps {
  onBack: () => void
}

export default function Settings({ onBack }: SettingsProps): React.JSX.Element {
  const [autoStart, setAutoStart] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'upToDate' | 'available' | 'downloaded' | 'error'
  >('idle')
  const [confirmClear, setConfirmClear] = useState(false)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api.app.getAutoStart().then(setAutoStart)
    const unsub1 = window.api.updater.onUpToDate(() => setUpdateStatus('upToDate'))
    const unsub2 = window.api.updater.onUpdateAvailable(() => setUpdateStatus('available'))
    const unsub3 = window.api.updater.onUpdateDownloaded(() => setUpdateStatus('downloaded'))
    const unsub4 = window.api.updater.onError(() => setUpdateStatus('error'))
    return () => {
      unsub1()
      unsub2()
      unsub3()
      unsub4()
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  const handleAutoStartChange = async (checked: boolean): Promise<void> => {
    setAutoStart(checked)
    await window.api.app.setAutoStart(checked)
  }

  const handleClearCredentials = async (): Promise<void> => {
    if (confirmClear) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirmClear(false)
      await window.api.store.clearAll()
    } else {
      setConfirmClear(true)
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000)
    }
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <button className="settings-back" onClick={onBack}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2>Paramètres</h2>
      </div>

      <div className="settings-section">
        <h3>Démarrage</h3>
        <label className="settings-toggle">
          <span>Lancer CMC Drive au démarrage de Windows</span>
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => handleAutoStartChange(e.target.checked)}
          />
        </label>
      </div>

      <div className="settings-section">
        <h3>Sécurité</h3>
        <button
          className={`settings-danger-btn${confirmClear ? ' settings-danger-btn--confirm' : ''}`}
          onClick={handleClearCredentials}
        >
          {confirmClear ? 'Confirmer la suppression' : 'Supprimer les identifiants sauvegardés'}
        </button>
      </div>

      <div className="settings-section">
        <h3>Mises à jour</h3>
        <button
          className="settings-update-btn"
          disabled={updateStatus === 'checking' || updateStatus === 'available'}
          onClick={() => {
            if (updateStatus === 'downloaded') {
              window.api.updater.install()
            } else {
              setUpdateStatus('checking')
              window.api.updater.check()
            }
          }}
        >
          {updateStatus === 'checking'
            ? 'Vérification...'
            : updateStatus === 'available'
              ? 'Téléchargement en cours...'
              : updateStatus === 'downloaded'
                ? 'Mise à jour prête — Redémarrer'
                : updateStatus === 'upToDate'
                  ? 'Vous êtes à jour ✓'
                  : updateStatus === 'error'
                    ? 'Erreur — Réessayer'
                    : 'Vérifier les mises à jour'}
        </button>
      </div>

      <div className="settings-section">
        <h3>À propos</h3>
        <div className="settings-about">
          <p>
            <strong>CMC Drive</strong> v{__APP_VERSION__}
          </p>
          <p className="settings-about-desc">Client WebDAV pour NAS CMC-06</p>
        </div>
      </div>
    </div>
  )
}
