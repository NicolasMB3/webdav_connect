import { useState } from 'react'
import Titlebar from './components/Titlebar'
import DriveCard, { DriveStatus } from './components/DriveCard'

function App(): JSX.Element {
  const [status, setStatus] = useState<DriveStatus>('disconnected')

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
          onConnect={() => setStatus('connected')}
          onDisconnect={() => setStatus('disconnected')}
          onOpenExplorer={() => {}}
        />
      </div>
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
