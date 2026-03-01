import React, { useState, useEffect } from 'react'
import './Settings.css'

interface SettingsProps {
  onBack: () => void
}

export default function Settings({ onBack }: SettingsProps): React.JSX.Element {
  const [autoStart, setAutoStart] = useState(false)

  useEffect(() => {
    window.api.app.getAutoStart().then(setAutoStart)
  }, [])

  const handleAutoStartChange = async (checked: boolean): Promise<void> => {
    setAutoStart(checked)
    await window.api.app.setAutoStart(checked)
  }

  const handleClearCredentials = async (): Promise<void> => {
    await window.api.store.clear()
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <button className="settings-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2>Parametres</h2>
      </div>

      <div className="settings-section">
        <h3>Demarrage</h3>
        <label className="settings-toggle">
          <span>Lancer CMC Drive au demarrage de Windows</span>
          <input type="checkbox" checked={autoStart} onChange={e => handleAutoStartChange(e.target.checked)} />
        </label>
      </div>

      <div className="settings-section">
        <h3>Securite</h3>
        <button className="settings-danger-btn" onClick={handleClearCredentials}>
          Supprimer les identifiants sauvegardes
        </button>
      </div>

      <div className="settings-section">
        <h3>A propos</h3>
        <div className="settings-about">
          <p><strong>CMC Drive</strong> v1.0.0</p>
          <p className="settings-about-desc">Client WebDAV pour NAS CMC-06</p>
        </div>
      </div>
    </div>
  )
}
