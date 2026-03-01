import { useState } from 'react'
import Titlebar from './components/Titlebar'
import DriveCard, { DriveStatus } from './components/DriveCard'
import LoginDialog from './components/LoginDialog'

function App(): JSX.Element {
  const [status, setStatus] = useState<DriveStatus>('disconnected')
  const [showLogin, setShowLogin] = useState(false)

  return (
    <div className="app">
      <Titlebar onSettingsClick={() => {}} />
      <div className="app-content">
        <DriveCard
          name="NAS CMC-06"
          url="stockage.cmc-06.fr:5006/backup"
          driveLetter="V:"
          status={status}
          usedBytes={null}
          totalBytes={null}
          onConnect={() => setShowLogin(true)}
          onDisconnect={() => setStatus('disconnected')}
          onOpenExplorer={() => {}}
        />
      </div>
      {showLogin && (
        <LoginDialog
          defaultUrl="https://stockage.cmc-06.fr:5006/backup"
          defaultDriveLetter="V:"
          onSubmit={(data) => {
            setShowLogin(false)
            setStatus('connecting')
            // Will wire to actual WebDAV connection in Task 6
          }}
          onCancel={() => setShowLogin(false)}
        />
      )}
      <div className="app-footer">
        <span className="footer-status">
          {status === 'connected' ? '\u25CF Connecte' : '\u25CB Deconnecte'}
        </span>
        <span className="footer-version">v1.0.0</span>
      </div>
    </div>
  )
}
export default App
