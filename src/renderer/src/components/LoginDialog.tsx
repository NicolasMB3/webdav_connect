import React, { useState } from 'react'
import './LoginDialog.css'

interface LoginDialogProps {
  defaultUrl: string
  defaultDriveLetter: string
  onSubmit: (data: { url: string; driveLetter: string; username: string; password: string; remember: boolean; autoConnect: boolean }) => void
  onCancel: () => void
}

const DRIVE_LETTERS = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => l + ':')

export default function LoginDialog({ defaultUrl, defaultDriveLetter, onSubmit, onCancel }: LoginDialogProps): React.JSX.Element {
  const [url, setUrl] = useState(defaultUrl)
  const [driveLetter, setDriveLetter] = useState(defaultDriveLetter)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [autoConnect, setAutoConnect] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ url, driveLetter, username, password, remember, autoConnect })
  }

  return (
    <div className="login-overlay">
      <div className="login-dialog">
        <div className="login-header">
          <h2>Connexion WebDAV</h2>
          <button className="login-close" onClick={onCancel}>{'\u00D7'}</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Adresse du serveur</label>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://serveur:port/chemin" />
          </div>

          <div className="login-field">
            <label>Lettre de lecteur</label>
            <select value={driveLetter} onChange={e => setDriveLetter(e.target.value)}>
              {DRIVE_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="login-field">
            <label>Identifiant</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          </div>

          <div className="login-field">
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <div className="login-checkboxes">
            <label className="login-checkbox">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span>Memoriser les identifiants</span>
            </label>
            <label className="login-checkbox">
              <input type="checkbox" checked={autoConnect} onChange={e => setAutoConnect(e.target.checked)} />
              <span>Connexion automatique au demarrage</span>
            </label>
          </div>

          <div className="login-actions">
            <button type="button" className="login-btn login-btn--cancel" onClick={onCancel}>Annuler</button>
            <button type="submit" className="login-btn login-btn--connect" disabled={!username || !password}>Connecter</button>
          </div>
        </form>
      </div>
    </div>
  )
}
