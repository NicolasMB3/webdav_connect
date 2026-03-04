import React, { useState, useRef, useEffect } from 'react'
import './DriveCard.css'

export type DriveStatus = 'connected' | 'disconnected' | 'connecting' | 'disconnecting'

interface DriveCardProps {
  name: string
  url: string
  driveLetter: string
  status: DriveStatus
  usedBytes: number | null
  totalBytes: number | null
  onConnect: () => void
  onDisconnect: () => void
  onOpenExplorer: () => void
  onDelete?: () => void
  onRename?: (newName: string) => void
}

function formatSize(bytes: number): string {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(2) + ' To'
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' Go'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' Mo'
  return (bytes / 1e3).toFixed(2) + ' Ko'
}

export default function DriveCard(props: DriveCardProps): React.JSX.Element {
  const {
    name,
    url,
    driveLetter,
    status,
    usedBytes,
    totalBytes,
    onConnect,
    onDisconnect,
    onOpenExplorer,
    onDelete,
    onRename
  } = props
  const isConnected = status === 'connected'
  const isBusy = status === 'connecting' || status === 'disconnecting'
  const percent =
    usedBytes !== null && totalBytes !== null && totalBytes > 0
      ? Math.round((usedBytes / totalBytes) * 100)
      : null

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  const startEditing = (): void => {
    setEditName(name)
    setEditing(true)
    requestAnimationFrame(() => {
      inputRef.current?.select()
    })
  }

  const commitRename = () => {
    setEditing(false)
    const trimmed = editName.trim()
    if (trimmed && trimmed !== name && onRename) {
      onRename(trimmed)
    }
  }

  return (
    <div className={`drive-card ${isConnected ? 'drive-card--connected' : ''}`}>
      <div className="drive-card-icon">
        <svg
          aria-hidden="true"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4a9eff"
          strokeWidth="1.5"
        >
          <rect x="2" y="2" width="20" height="20" rx="3" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <circle cx="17" cy="6" r="1" fill="#4a9eff" />
          <circle cx="17" cy="15" r="1" fill="#4a9eff" />
        </svg>
      </div>

      <div className="drive-card-info">
        <div className="drive-card-header">
          {editing ? (
            <input
              ref={inputRef}
              className="drive-card-name-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
          ) : (
            <>
              <span className="drive-card-name">{name}</span>
              {onRename && (
                <button className="drive-card-edit-btn" onClick={startEditing} title="Renommer">
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </button>
              )}
            </>
          )}
          <span className="drive-card-letter">({driveLetter})</span>
          <span className={`drive-card-status drive-card-status--${status}`}>
            {status === 'connected' && '\u25CF'}
            {status === 'disconnected' && '\u25CB'}
            {(status === 'connecting' || status === 'disconnecting') && '\u25CC'}
          </span>
        </div>
        <div className="drive-card-url">{url}</div>

        {isConnected && percent !== null ? (
          <div className="drive-card-space">
            <div className="drive-card-bar">
              <div className="drive-card-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="drive-card-space-text">
              {formatSize(totalBytes! - usedBytes!)} libres sur {formatSize(totalBytes!)}
            </span>
          </div>
        ) : isConnected ? (
          <div className="drive-card-space">
            <span className="drive-card-space-text">Espace inconnu</span>
          </div>
        ) : null}
      </div>

      <div className="drive-card-actions">
        {isConnected ? (
          <>
            <button
              className="drive-action-btn"
              onClick={onOpenExplorer}
              title="Ouvrir dans l'Explorateur"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </button>
            <button
              className="drive-action-btn drive-action-btn--stop"
              onClick={onDisconnect}
              disabled={isBusy}
              title="Déconnecter"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </>
        ) : (
          <button
            className="drive-action-btn drive-action-btn--play"
            onClick={onConnect}
            disabled={isBusy}
            title="Connecter"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </button>
        )}
        {onDelete && (
          <button
            className={`drive-action-btn drive-action-btn--delete${confirmDelete ? ' drive-action-btn--confirm' : ''}`}
            onClick={() => {
              if (confirmDelete) {
                if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
                setConfirmDelete(false)
                onDelete()
              } else {
                setConfirmDelete(true)
                confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000)
              }
            }}
            title={confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
          >
            {confirmDelete ? (
              <span className="drive-action-confirm-text">Confirmer</span>
            ) : (
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
