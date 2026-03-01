import React from 'react'
import './Titlebar.css'

interface TitlebarProps {
  onSettingsClick: () => void
}

export default function Titlebar({ onSettingsClick }: TitlebarProps): React.JSX.Element {
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4a9eff" strokeWidth="2">
            <path d="M22 12H2M22 12L18 8M22 12L18 16M2 12L6 8M2 12L6 16" />
            <circle cx="12" cy="12" r="3" fill="#4a9eff" stroke="none" />
          </svg>
          <span className="titlebar-title">CMC Drive</span>
        </div>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={onSettingsClick} title="Parametres">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </button>
        <button className="titlebar-btn" onClick={() => window.api.minimizeWindow()} title="Reduire">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button className="titlebar-btn titlebar-btn-close" onClick={() => window.api.closeWindow()} title="Fermer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
