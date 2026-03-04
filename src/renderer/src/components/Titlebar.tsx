import React from 'react'
import logoImg from '../assets/logo.png'
import './Titlebar.css'

interface TitlebarProps {
  onSettingsClick: () => void
}

export default function Titlebar({ onSettingsClick }: TitlebarProps): React.JSX.Element {
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-logo">
          <img src={logoImg} alt="CMC Drive" width="20" height="20" />
          <span className="titlebar-title">CMC Drive</span>
        </div>
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={onSettingsClick}
          title="Paramètres"
          aria-label="Paramètres"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
        <button
          className="titlebar-btn"
          onClick={() => window.api.minimizeWindow()}
          title="Réduire"
          aria-label="Réduire"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={() => window.api.closeWindow()}
          title="Fermer"
          aria-label="Fermer"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
