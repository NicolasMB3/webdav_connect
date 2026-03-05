import React, { useState } from 'react'
import type { ServerConfig } from '@shared/types'
import './LoginDialog.css'

const IS_MAC = window.api.platform === 'darwin'

interface LoginDialogProps {
  server?: ServerConfig
  defaultUrl: string
  defaultMountPoint: string
  defaultDriveName: string
  usedMountPoints: string[]
  onSubmit: (data: {
    id?: string
    url: string
    mountPoint: string
    username: string
    password: string
    remember: boolean
    autoConnect: boolean
    driveName: string
  }) => void
  onCancel: () => void
}

const ALL_DRIVE_LETTERS = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => l + ':')

function isValidUrl(value: string): boolean {
  return /^https?:\/\/.+/.test(value.trim())
}

function isValidMountPoint(value: string): boolean {
  if (IS_MAC) return value.trim().startsWith('/')
  return /^[A-Za-z]:$/.test(value.trim())
}

export default function LoginDialog({
  server,
  defaultUrl,
  defaultMountPoint,
  defaultDriveName,
  usedMountPoints,
  onSubmit,
  onCancel
}: LoginDialogProps): React.JSX.Element {
  const isEdit = !!server
  // When editing, the server's own mount point is available; exclude all others
  const ownMountPoint = server?.mountPoint
  const availableLetters = ALL_DRIVE_LETTERS.filter(
    (l) => l === ownMountPoint || !usedMountPoints.includes(l)
  )
  const fallbackMountPoint = IS_MAC
    ? defaultMountPoint
    : availableLetters.includes(defaultMountPoint)
      ? defaultMountPoint
      : availableLetters[0] || defaultMountPoint

  const [url, setUrl] = useState(server?.url ?? defaultUrl)
  const [mountPoint, setMountPoint] = useState(server?.mountPoint ?? fallbackMountPoint)
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
      mountPoint,
      username,
      password,
      remember,
      autoConnect,
      driveName
    })
  }

  return (
    <div className="login-overlay">
      <div
        className="login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
      >
        <div className="login-header">
          <h2 id="login-dialog-title">{isEdit ? 'Modifier le serveur' : 'Connexion WebDAV'}</h2>
          <button className="login-close" onClick={onCancel} aria-label="Fermer">
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
            {url.trim() && !isValidUrl(url) && (
              <span className="login-field-hint">L'URL doit commencer par http:// ou https://</span>
            )}
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
            <label>{IS_MAC ? 'Point de montage' : 'Lettre de lecteur'}</label>
            {IS_MAC ? (
              <>
                <input
                  type="text"
                  value={mountPoint}
                  onChange={(e) => setMountPoint(e.target.value)}
                  placeholder="/Volumes/NAS"
                />
                {mountPoint.trim() && !isValidMountPoint(mountPoint) && (
                  <span className="login-field-hint">
                    Le chemin doit commencer par /
                  </span>
                )}
              </>
            ) : (
              <select value={mountPoint} onChange={(e) => setMountPoint(e.target.value)}>
                {availableLetters.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
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
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
              disabled={!username || !password || !isValidUrl(url) || !isValidMountPoint(mountPoint)}
            >
              {isEdit ? 'Enregistrer' : 'Connecter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
