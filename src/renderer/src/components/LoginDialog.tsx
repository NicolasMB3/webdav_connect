import React, { useState } from 'react'
import './LoginDialog.css'

interface LoginDialogProps {
  server?: ServerConfig
  defaultUrl: string
  defaultDriveLetter: string
  defaultDriveName: string
  usedDriveLetters: string[]
  onSubmit: (data: {
    id?: string
    url: string
    driveLetter: string
    username: string
    password: string
    remember: boolean
    autoConnect: boolean
    driveName: string
  }) => void
  onCancel: () => void
}

const ALL_DRIVE_LETTERS = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => l + ':')

export default function LoginDialog({
  server,
  defaultUrl,
  defaultDriveLetter,
  defaultDriveName,
  usedDriveLetters,
  onSubmit,
  onCancel
}: LoginDialogProps): React.JSX.Element {
  const isEdit = !!server
  // When editing, the server's own letter is available; exclude all others
  const ownLetter = server?.driveLetter
  const availableLetters = ALL_DRIVE_LETTERS.filter(
    (l) => l === ownLetter || !usedDriveLetters.includes(l)
  )
  const fallbackLetter = availableLetters.includes(defaultDriveLetter)
    ? defaultDriveLetter
    : availableLetters[0] || defaultDriveLetter

  const [url, setUrl] = useState(server?.url ?? defaultUrl)
  const [driveLetter, setDriveLetter] = useState(server?.driveLetter ?? fallbackLetter)
  const [driveName, setDriveName] = useState(server?.driveName ?? defaultDriveName)
  const [username, setUsername] = useState(server?.username ?? '')
  const [password, setPassword] = useState(server?.password ?? '')
  const [remember, setRemember] = useState(true)
  const [autoConnect, setAutoConnect] = useState(server?.autoConnect ?? true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      id: server?.id,
      url,
      driveLetter,
      username,
      password,
      remember,
      autoConnect,
      driveName
    })
  }

  return (
    <div className="login-overlay">
      <div className="login-dialog">
        <div className="login-header">
          <h2>{isEdit ? 'Modifier le serveur' : 'Connexion WebDAV'}</h2>
          <button className="login-close" onClick={onCancel}>
            {'\u00D7'}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Adresse du serveur</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://serveur:port/chemin"
            />
          </div>

          <div className="login-field">
            <label>Nom du lecteur</label>
            <input
              type="text"
              value={driveName}
              onChange={(e) => setDriveName(e.target.value)}
              placeholder="NAS CMC-06"
            />
          </div>

          <div className="login-field">
            <label>Lettre de lecteur</label>
            <select value={driveLetter} onChange={(e) => setDriveLetter(e.target.value)}>
              {availableLetters.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="login-field">
            <label>Identifiant</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="login-field">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="login-checkboxes">
            <label className="login-checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Mémoriser les identifiants</span>
            </label>
            <label className="login-checkbox">
              <input
                type="checkbox"
                checked={autoConnect}
                onChange={(e) => setAutoConnect(e.target.checked)}
              />
              <span>Connexion automatique au démarrage</span>
            </label>
          </div>

          <div className="login-actions">
            <button type="button" className="login-btn login-btn--cancel" onClick={onCancel}>
              Annuler
            </button>
            <button
              type="submit"
              className="login-btn login-btn--connect"
              disabled={!username || !password}
            >
              {isEdit ? 'Enregistrer' : 'Connecter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
