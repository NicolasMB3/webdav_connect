# CMC Drive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a premium Windows desktop app (Electron + React) that mounts a WebDAV NAS as a Windows drive letter, with system tray, auto-reconnect, encrypted credential storage, and a professional NSIS installer.

**Architecture:** Electron app with Vite bundling. Main process handles WebDAV mounting via `net use` (using `execFile` to prevent shell injection), credential encryption via `safeStorage`, system tray, and auto-start. Renderer process is a React SPA with dark theme UI inspired by RaiDrive.

**Tech Stack:** Electron 33+, React 18, Vite (via electron-vite), electron-store, electron-builder (NSIS), CSS custom properties for theming.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/App.css`

**Step 1: Initialize project with electron-vite**

```bash
cd /Users/nicolasbaar/Desktop/connecter-nas
npm init -y
```

**Step 2: Install core dependencies**

```bash
npm install --save-dev electron electron-vite vite @vitejs/plugin-react typescript
npm install --save-dev @types/node @types/react @types/react-dom
npm install react react-dom
npm install electron-store
```

**Step 3: Create electron.vite.config.ts**

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
```

**Step 4: Create tsconfig files**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "outDir": "./out",
    "rootDir": ".",
    "strict": true,
    "target": "ESNext",
    "skipLibCheck": true
  },
  "include": [
    "src/main/**/*",
    "src/preload/**/*",
    "electron.vite.config.ts"
  ]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "outDir": "./out",
    "rootDir": ".",
    "strict": true,
    "target": "ESNext",
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/renderer/src/*"]
    }
  },
  "include": ["src/renderer/src/**/*"]
}
```

**Step 5: Create minimal main process**

`src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 480,
    height: 400,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
```

**Step 6: Create preload script**

`src/preload/index.ts`:
```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform
})
```

**Step 7: Create renderer entry**

`src/renderer/index.html`:
```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>CMC Drive</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/main.tsx"></script>
</body>
</html>
```

`src/renderer/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/renderer/src/App.tsx`:
```tsx
function App(): JSX.Element {
  return <div className="app">CMC Drive</div>
}
export default App
```

`src/renderer/src/App.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; }
.app { background: #1e1e2e; color: #fff; height: 100vh; }
```

**Step 8: Add scripts to package.json**

Ensure `package.json` has:
```json
{
  "name": "cmc-drive",
  "version": "1.0.0",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview"
  }
}
```

**Step 9: Run dev to verify scaffold works**

```bash
npm run dev
```

Expected: Electron window opens with dark background showing "CMC Drive".

**Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Electron + React + Vite project"
```

---

### Task 2: Custom Titlebar & Window Chrome

**Files:**
- Create: `src/renderer/src/components/Titlebar.tsx`
- Create: `src/renderer/src/components/Titlebar.css`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Step 1: Add IPC handlers for window controls in main process**

Add to `src/main/index.ts`:
```ts
import { app, BrowserWindow, ipcMain } from 'electron'

// After createWindow:
ipcMain.on('window:minimize', () => mainWindow.minimize())
ipcMain.on('window:close', () => mainWindow.hide())
```

Note: `close` hides (for system tray later), does not quit.

**Step 2: Expose window controls in preload**

Update `src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close')
})
```

**Step 3: Create Titlebar component**

`src/renderer/src/components/Titlebar.tsx`:
```tsx
import './Titlebar.css'

interface TitlebarProps {
  onSettingsClick: () => void
}

export default function Titlebar({ onSettingsClick }: TitlebarProps): JSX.Element {
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
```

**Step 4: Style the titlebar**

`src/renderer/src/components/Titlebar.css`:
```css
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  background: #16162a;
  padding: 0 8px 0 12px;
  -webkit-app-region: drag;
  user-select: none;
}

.titlebar-drag {
  flex: 1;
  display: flex;
  align-items: center;
}

.titlebar-logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.titlebar-title {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
  letter-spacing: 0.5px;
}

.titlebar-controls {
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}

.titlebar-btn:hover {
  background: rgba(255,255,255,0.08);
  color: #fff;
}

.titlebar-btn-close:hover {
  background: #e81123;
  color: #fff;
}
```

**Step 5: Update App.tsx**

```tsx
import Titlebar from './components/Titlebar'

function App(): JSX.Element {
  return (
    <div className="app">
      <Titlebar onSettingsClick={() => {}} />
      <div className="app-content">
        {/* Drive card will go here */}
      </div>
    </div>
  )
}
export default App
```

**Step 6: Add global types**

Create `src/renderer/src/types/global.d.ts`:
```ts
interface Window {
  api: {
    platform: string
    minimizeWindow: () => void
    closeWindow: () => void
  }
}
```

**Step 7: Run dev, verify titlebar renders**

```bash
npm run dev
```

Expected: Frameless window with dark custom titlebar, drag area, minimize/close buttons.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: custom frameless titlebar with window controls"
```

---

### Task 3: Drive Card UI

**Files:**
- Create: `src/renderer/src/components/DriveCard.tsx`
- Create: `src/renderer/src/components/DriveCard.css`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

**Step 1: Create DriveCard component**

`src/renderer/src/components/DriveCard.tsx`:
```tsx
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
}

function formatSize(bytes: number): string {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(2) + ' TB'
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB'
  return (bytes / 1e3).toFixed(2) + ' KB'
}

export default function DriveCard(props: DriveCardProps): JSX.Element {
  const { name, url, driveLetter, status, usedBytes, totalBytes, onConnect, onDisconnect, onOpenExplorer } = props
  const isConnected = status === 'connected'
  const isBusy = status === 'connecting' || status === 'disconnecting'
  const percent = (usedBytes !== null && totalBytes !== null && totalBytes > 0)
    ? Math.round((usedBytes / totalBytes) * 100)
    : null

  return (
    <div className={`drive-card ${isConnected ? 'drive-card--connected' : ''}`}>
      <div className="drive-card-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4a9eff" strokeWidth="1.5">
          <rect x="2" y="2" width="20" height="20" rx="3" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <circle cx="17" cy="6" r="1" fill="#4a9eff" />
          <circle cx="17" cy="15" r="1" fill="#4a9eff" />
        </svg>
      </div>

      <div className="drive-card-info">
        <div className="drive-card-header">
          <span className="drive-card-name">{name}</span>
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
              <div
                className="drive-card-bar-fill"
                style={{ width: `${percent}%` }}
              />
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
            <button className="drive-action-btn" onClick={onOpenExplorer} title="Ouvrir dans l'Explorateur">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </button>
            <button className="drive-action-btn drive-action-btn--stop" onClick={onDisconnect} disabled={isBusy} title="Deconnecter">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          </>
        ) : (
          <button className="drive-action-btn drive-action-btn--play" onClick={onConnect} disabled={isBusy} title="Connecter">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Style the drive card**

`src/renderer/src/components/DriveCard.css`:
```css
.drive-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: #2a2a3e;
  border-radius: 10px;
  border: 1px solid #3a3a52;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.drive-card--connected {
  border-color: #4a9eff33;
  box-shadow: 0 0 0 1px #4a9eff11;
}

.drive-card-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e1e2e;
  border-radius: 10px;
}

.drive-card-info {
  flex: 1;
  min-width: 0;
}

.drive-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.drive-card-name {
  font-size: 14px;
  font-weight: 600;
  color: #e8e8f0;
}

.drive-card-letter {
  font-size: 13px;
  color: #888;
}

.drive-card-status {
  font-size: 10px;
  margin-left: 4px;
}

.drive-card-status--connected { color: #4ade80; }
.drive-card-status--disconnected { color: #888; }
.drive-card-status--connecting,
.drive-card-status--disconnecting { color: #f59e0b; animation: pulse 1s infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.drive-card-url {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.drive-card-space {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drive-card-bar {
  width: 100%;
  height: 6px;
  background: #1e1e2e;
  border-radius: 3px;
  overflow: hidden;
}

.drive-card-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4a9eff, #6bb5ff);
  border-radius: 3px;
  transition: width 0.5s ease;
}

.drive-card-space-text {
  font-size: 11px;
  color: #777;
}

.drive-card-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.drive-action-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e1e2e;
  border: 1px solid #3a3a52;
  border-radius: 8px;
  color: #aaa;
  cursor: pointer;
  transition: all 0.15s;
}

.drive-action-btn:hover {
  background: #333350;
  color: #fff;
  border-color: #4a9eff55;
}

.drive-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.drive-action-btn--play:hover {
  color: #4ade80;
  border-color: #4ade8055;
}

.drive-action-btn--stop:hover {
  color: #f87171;
  border-color: #f8717155;
}
```

**Step 3: Update App.tsx and App.css**

`src/renderer/src/App.tsx`:
```tsx
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
```

`src/renderer/src/App.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Segoe UI', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.app {
  background: #1e1e2e;
  color: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
}

.app-content {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
}

.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  background: #16162a;
  font-size: 11px;
  color: #555;
}

.footer-status {
  color: #888;
}
```

**Step 4: Verify UI renders**

```bash
npm run dev
```

Expected: Dark window with RaiDrive-like drive card showing NAS CMC-06.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: drive card UI with status indicator and space bar"
```

---

### Task 4: Login Dialog

**Files:**
- Create: `src/renderer/src/components/LoginDialog.tsx`
- Create: `src/renderer/src/components/LoginDialog.css`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Create LoginDialog component**

`src/renderer/src/components/LoginDialog.tsx`:
```tsx
import { useState } from 'react'
import './LoginDialog.css'

interface LoginDialogProps {
  defaultUrl: string
  defaultDriveLetter: string
  onSubmit: (data: { url: string; driveLetter: string; username: string; password: string; remember: boolean; autoConnect: boolean }) => void
  onCancel: () => void
}

const DRIVE_LETTERS = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => l + ':')

export default function LoginDialog({ defaultUrl, defaultDriveLetter, onSubmit, onCancel }: LoginDialogProps): JSX.Element {
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
          <button className="login-close" onClick={onCancel}>\u00D7</button>
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
```

**Step 2: Style the login dialog**

`src/renderer/src/components/LoginDialog.css`:
```css
.login-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.login-dialog {
  background: #2a2a3e;
  border: 1px solid #3a3a52;
  border-radius: 12px;
  width: 380px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}

.login-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.login-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #e8e8f0;
}

.login-close {
  background: none;
  border: none;
  color: #666;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.login-close:hover { color: #fff; }

.login-field {
  margin-bottom: 14px;
}

.login-field label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 6px;
  font-weight: 500;
}

.login-field input,
.login-field select {
  width: 100%;
  padding: 10px 12px;
  background: #1e1e2e;
  border: 1px solid #3a3a52;
  border-radius: 8px;
  color: #e8e8f0;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.login-field input:focus,
.login-field select:focus {
  border-color: #4a9eff;
}

.login-field select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.login-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.login-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: #aaa;
}

.login-checkbox input[type="checkbox"] {
  accent-color: #4a9eff;
  width: 14px;
  height: 14px;
}

.login-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.login-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  font-family: inherit;
  transition: all 0.15s;
}

.login-btn--cancel {
  background: transparent;
  border-color: #3a3a52;
  color: #999;
}

.login-btn--cancel:hover {
  background: #333350;
  color: #fff;
}

.login-btn--connect {
  background: #4a9eff;
  color: #fff;
}

.login-btn--connect:hover {
  background: #3a8eef;
}

.login-btn--connect:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

**Step 3: Wire LoginDialog in App.tsx**

Update App.tsx to show login dialog when `onConnect` is called:
```tsx
const [showLogin, setShowLogin] = useState(false)

// In the DriveCard:
onConnect={() => setShowLogin(true)}

// After DriveCard:
{showLogin && (
  <LoginDialog
    defaultUrl="https://stockage.cmc-06.fr:5006/backup"
    defaultDriveLetter="V:"
    onSubmit={(data) => {
      setShowLogin(false)
      setStatus('connecting')
      // Will wire to actual WebDAV connection later
    }}
    onCancel={() => setShowLogin(false)}
  />
)}
```

**Step 4: Verify login dialog**

```bash
npm run dev
```

Expected: Click play button on drive card -> login dialog appears with fields.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: login dialog with credential fields and options"
```

---

### Task 5: WebDAV Manager (Main Process)

**Files:**
- Create: `src/main/webdav-manager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/global.d.ts`

**Step 1: Create WebDAV manager module**

Uses `execFile` instead of `exec` to prevent shell injection.

`src/main/webdav-manager.ts`:
```ts
import { execFileSync, execFile } from 'child_process'

export interface ConnectOptions {
  url: string
  driveLetter: string
  username: string
  password: string
}

export interface DriveSpace {
  usedBytes: number
  totalBytes: number
}

function runPowershell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-WindowStyle', 'Hidden', '-NoProfile', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout)
    })
  })
}

function runNetUse(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('net', ['use', ...args], {
      encoding: 'utf8',
      windowsHide: true
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout)
    })
  })
}

export async function ensureWebClient(): Promise<void> {
  try {
    const result = await runPowershell('(Get-Service WebClient).Status')
    if (result.trim() !== 'Running') {
      await runPowershell('Start-Service WebClient')
    }
  } catch {
    // WebClient service might need admin elevation on first run
    try {
      execFileSync('powershell.exe', [
        '-WindowStyle', 'Hidden', '-NoProfile', '-Command',
        'Start-Process powershell -ArgumentList "-Command Start-Service WebClient" -Verb RunAs -Wait'
      ], { encoding: 'utf8', windowsHide: true })
    } catch {
      // If user declines UAC, we continue and let net use fail with a clear error
    }
  }
}

export async function connectDrive(opts: ConnectOptions): Promise<void> {
  await ensureWebClient()

  // Disconnect first if already mapped
  try {
    await runNetUse([opts.driveLetter, '/delete', '/yes'])
  } catch {
    // Not mapped, ignore
  }

  await runNetUse([
    opts.driveLetter,
    opts.url,
    `/user:${opts.username}`,
    opts.password,
    '/persistent:yes'
  ])

  // Rename in Explorer
  try {
    await runPowershell(
      `$s = New-Object -ComObject Shell.Application; $s.NameSpace('${opts.driveLetter}\\').Self.Name = 'NAS CMC-06'`
    )
  } catch {
    // Non-critical
  }
}

export async function disconnectDrive(driveLetter: string): Promise<void> {
  await runNetUse([driveLetter, '/delete', '/yes'])
}

export async function getDriveSpace(driveLetter: string): Promise<DriveSpace | null> {
  try {
    const letter = driveLetter.replace(':', '')
    const result = await runPowershell(
      `Get-PSDrive ${letter} | Select-Object Used,Free | ConvertTo-Json`
    )
    const data = JSON.parse(result.trim())
    if (data.Used != null && data.Free != null) {
      return {
        usedBytes: data.Used,
        totalBytes: data.Used + data.Free
      }
    }
    return null
  } catch {
    return null
  }
}

export function isDriveConnected(driveLetter: string): boolean {
  try {
    const result = execFileSync('net', ['use', driveLetter], {
      encoding: 'utf8',
      windowsHide: true
    })
    return result.includes('OK') || result.includes('Status')
  } catch {
    return false
  }
}

export function openExplorer(driveLetter: string): void {
  execFile('explorer.exe', [`${driveLetter}\\`], { windowsHide: true })
}
```

**Step 2: Register IPC handlers in main**

Add to `src/main/index.ts`:
```ts
import { connectDrive, disconnectDrive, getDriveSpace, isDriveConnected, openExplorer } from './webdav-manager'

// IPC handlers
ipcMain.handle('webdav:connect', async (_e, opts) => {
  await connectDrive(opts)
})

ipcMain.handle('webdav:disconnect', async (_e, driveLetter: string) => {
  await disconnectDrive(driveLetter)
})

ipcMain.handle('webdav:space', async (_e, driveLetter: string) => {
  return getDriveSpace(driveLetter)
})

ipcMain.handle('webdav:isConnected', async (_e, driveLetter: string) => {
  return isDriveConnected(driveLetter)
})

ipcMain.on('webdav:openExplorer', (_e, driveLetter: string) => {
  openExplorer(driveLetter)
})
```

**Step 3: Expose in preload**

Update `src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  webdav: {
    connect: (opts: { url: string; driveLetter: string; username: string; password: string }) =>
      ipcRenderer.invoke('webdav:connect', opts),
    disconnect: (driveLetter: string) => ipcRenderer.invoke('webdav:disconnect', driveLetter),
    getSpace: (driveLetter: string) => ipcRenderer.invoke('webdav:space', driveLetter),
    isConnected: (driveLetter: string) => ipcRenderer.invoke('webdav:isConnected', driveLetter),
    openExplorer: (driveLetter: string) => ipcRenderer.send('webdav:openExplorer', driveLetter)
  }
})
```

**Step 4: Update global types**

`src/renderer/src/types/global.d.ts`:
```ts
interface Window {
  api: {
    platform: string
    minimizeWindow: () => void
    closeWindow: () => void
    webdav: {
      connect: (opts: { url: string; driveLetter: string; username: string; password: string }) => Promise<void>
      disconnect: (driveLetter: string) => Promise<void>
      getSpace: (driveLetter: string) => Promise<{ usedBytes: number; totalBytes: number } | null>
      isConnected: (driveLetter: string) => Promise<boolean>
      openExplorer: (driveLetter: string) => void
    }
  }
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: WebDAV manager with execFile connect/disconnect/space"
```

---

### Task 6: Wire UI to WebDAV Manager

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

**Step 1: Connect login form to actual WebDAV commands**

Full updated `src/renderer/src/App.tsx`:
```tsx
import { useState, useEffect, useCallback } from 'react'
import Titlebar from './components/Titlebar'
import DriveCard, { DriveStatus } from './components/DriveCard'
import LoginDialog from './components/LoginDialog'

const DEFAULT_URL = 'https://stockage.cmc-06.fr:5006/backup'
const DEFAULT_DRIVE = 'V:'

function App(): JSX.Element {
  const [status, setStatus] = useState<DriveStatus>('disconnected')
  const [showLogin, setShowLogin] = useState(false)
  const [driveLetter, setDriveLetter] = useState(DEFAULT_DRIVE)
  const [usedBytes, setUsedBytes] = useState<number | null>(null)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshSpace = useCallback(async () => {
    const space = await window.api.webdav.getSpace(driveLetter)
    if (space) {
      setUsedBytes(space.usedBytes)
      setTotalBytes(space.totalBytes)
    }
  }, [driveLetter])

  // Check connection on mount
  useEffect(() => {
    window.api.webdav.isConnected(driveLetter).then(connected => {
      if (connected) {
        setStatus('connected')
        refreshSpace()
      }
    })
  }, [driveLetter, refreshSpace])

  // Refresh space periodically when connected
  useEffect(() => {
    if (status !== 'connected') return
    const interval = setInterval(refreshSpace, 30_000)
    return () => clearInterval(interval)
  }, [status, refreshSpace])

  const handleConnect = async (data: { url: string; driveLetter: string; username: string; password: string; remember: boolean; autoConnect: boolean }) => {
    setShowLogin(false)
    setError(null)
    setStatus('connecting')
    setDriveLetter(data.driveLetter)

    try {
      await window.api.webdav.connect({
        url: data.url,
        driveLetter: data.driveLetter,
        username: data.username,
        password: data.password
      })
      setStatus('connected')
      await refreshSpace()
    } catch (err: unknown) {
      setStatus('disconnected')
      setError(err instanceof Error ? err.message : 'Echec de la connexion')
    }
  }

  const handleDisconnect = async () => {
    setStatus('disconnecting')
    try {
      await window.api.webdav.disconnect(driveLetter)
      setStatus('disconnected')
      setUsedBytes(null)
      setTotalBytes(null)
    } catch {
      setStatus('connected')
    }
  }

  return (
    <div className="app">
      <Titlebar onSettingsClick={() => {}} />
      <div className="app-content">
        <DriveCard
          name="NAS CMC-06"
          url="stockage.cmc-06.fr:5006/backup"
          driveLetter={driveLetter}
          status={status}
          usedBytes={usedBytes}
          totalBytes={totalBytes}
          onConnect={() => setShowLogin(true)}
          onDisconnect={handleDisconnect}
          onOpenExplorer={() => window.api.webdav.openExplorer(driveLetter)}
        />

        {error && (
          <div className="app-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>\u00D7</button>
          </div>
        )}
      </div>

      <div className="app-footer">
        <span className="footer-status">
          {status === 'connected' ? '\u25CF Connecte' : status === 'connecting' ? '\u25CC Connexion...' : '\u25CB Deconnecte'}
        </span>
        <span className="footer-version">v1.0.0</span>
      </div>

      {showLogin && (
        <LoginDialog
          defaultUrl={DEFAULT_URL}
          defaultDriveLetter={driveLetter}
          onSubmit={handleConnect}
          onCancel={() => setShowLogin(false)}
        />
      )}
    </div>
  )
}
export default App
```

Add to `src/renderer/src/App.css`:
```css
.app-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 10px 14px;
  background: #3a1a1a;
  border: 1px solid #5a2a2a;
  border-radius: 8px;
  font-size: 12px;
  color: #f87171;
}

.app-error button {
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}
```

**Step 2: Verify full connect/disconnect flow**

```bash
npm run dev
```

Expected: Click play -> login dialog -> fill credentials -> connect -> card shows connected status.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire UI to WebDAV manager for connect/disconnect"
```

---

### Task 7: Credential Storage (Encrypted)

**Files:**
- Create: `src/main/store.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/types/global.d.ts`

**Step 1: Create credential store**

`src/main/store.ts`:
```ts
import Store from 'electron-store'
import { safeStorage } from 'electron'

const store = new Store({
  name: 'cmc-drive-config'
})

export interface SavedConfig {
  url: string
  driveLetter: string
  username: string
  password: string // encrypted base64
  autoConnect: boolean
}

export function saveCredentials(config: {
  url: string
  driveLetter: string
  username: string
  password: string
  autoConnect: boolean
}): void {
  const encrypted = safeStorage.encryptString(config.password).toString('base64')
  store.set('connection', {
    url: config.url,
    driveLetter: config.driveLetter,
    username: config.username,
    password: encrypted,
    autoConnect: config.autoConnect
  })
}

export function loadCredentials(): SavedConfig | null {
  const data = store.get('connection') as SavedConfig | undefined
  if (!data) return null

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(data.password, 'base64'))
    return { ...data, password: decrypted }
  } catch {
    return null
  }
}

export function clearCredentials(): void {
  store.delete('connection')
}

export function getAutoConnect(): boolean {
  const data = store.get('connection') as SavedConfig | undefined
  return data?.autoConnect ?? false
}
```

**Step 2: Register IPC handlers for store**

Add to `src/main/index.ts`:
```ts
import { saveCredentials, loadCredentials, clearCredentials } from './store'

ipcMain.handle('store:save', async (_e, config) => {
  saveCredentials(config)
})

ipcMain.handle('store:load', async () => {
  return loadCredentials()
})

ipcMain.handle('store:clear', async () => {
  clearCredentials()
})
```

**Step 3: Expose in preload**

Add to preload's `api` object:
```ts
store: {
  save: (config: { url: string; driveLetter: string; username: string; password: string; autoConnect: boolean }) =>
    ipcRenderer.invoke('store:save', config),
  load: () => ipcRenderer.invoke('store:load'),
  clear: () => ipcRenderer.invoke('store:clear')
}
```

**Step 4: Update global types**

Add to `Window.api` in `global.d.ts`:
```ts
store: {
  save: (config: { url: string; driveLetter: string; username: string; password: string; autoConnect: boolean }) => Promise<void>
  load: () => Promise<{ url: string; driveLetter: string; username: string; password: string; autoConnect: boolean } | null>
  clear: () => Promise<void>
}
```

**Step 5: Wire into App.tsx**

In `handleConnect`, after successful connection:
```ts
if (data.remember) {
  await window.api.store.save({
    url: data.url,
    driveLetter: data.driveLetter,
    username: data.username,
    password: data.password,
    autoConnect: data.autoConnect
  })
}
```

On mount, load saved credentials:
```ts
useEffect(() => {
  window.api.store.load().then(saved => {
    if (saved) {
      setDriveLetter(saved.driveLetter)
    }
  })
}, [])
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: encrypted credential storage with Electron safeStorage"
```

---

### Task 8: System Tray

**Files:**
- Create: `src/main/tray.ts`
- Modify: `src/main/index.ts`

**Step 1: Create tray module**

`src/main/tray.ts`:
```ts
import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { openExplorer, isDriveConnected } from './webdav-manager'

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow, driveLetter: string): Tray {
  const iconPath = join(__dirname, '../../resources/icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('CMC Drive')

  const updateMenu = (): void => {
    const connected = isDriveConnected(driveLetter)
    const contextMenu = Menu.buildFromTemplate([
      { label: 'CMC Drive', enabled: false },
      { type: 'separator' },
      {
        label: `Ouvrir le NAS (${driveLetter})`,
        enabled: connected,
        click: () => openExplorer(driveLetter)
      },
      { type: 'separator' },
      {
        label: 'Ouvrir CMC Drive',
        click: () => {
          mainWindow.show()
          mainWindow.focus()
        }
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          if (tray) tray.destroy()
          mainWindow.destroy()
          app.quit()
        }
      }
    ])
    tray!.setContextMenu(contextMenu)
  }

  updateMenu()

  // Refresh menu every 10 seconds to reflect connection state
  setInterval(updateMenu, 10_000)

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}
```

**Step 2: Integrate tray in main process**

Update `src/main/index.ts`:
- Move mainWindow to module scope
- Call `createTray(mainWindow, 'V:')` after window creation
- On window close event, hide instead of quit
- Add single instance lock

```ts
import { createTray } from './tray'

let mainWindow: BrowserWindow

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({ /* ... existing config ... */ })
  // ... existing setup ...

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })

  return mainWindow
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    const win = createWindow()
    createTray(win, 'V:')
  })
}
```

**Step 3: Create a placeholder icon**

Create `resources/icon.png` — a 256x256 PNG icon. Generate a simple blue NAS icon programmatically or use a placeholder.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: system tray with context menu and double-click"
```

---

### Task 9: Auto-Connect on Startup

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Add auto-connect logic**

In `src/main/index.ts`, after app is ready and tray is created:
```ts
import { loadCredentials, getAutoConnect } from './store'
import { connectDrive, isDriveConnected } from './webdav-manager'

// Inside the app.whenReady() callback, after createTray:
if (getAutoConnect()) {
  const creds = loadCredentials()
  if (creds && !isDriveConnected(creds.driveLetter)) {
    connectDrive({
      url: creds.url,
      driveLetter: creds.driveLetter,
      username: creds.username,
      password: creds.password
    }).then(() => {
      win.webContents.send('webdav:statusChanged', 'connected')
    }).catch(() => {
      // Silent fail, user can connect manually
    })
  }
}
```

**Step 2: Listen for status changes in preload**

Add to preload's `api` object:
```ts
onStatusChanged: (callback: (status: string) => void) => {
  ipcRenderer.on('webdav:statusChanged', (_e, status) => callback(status))
}
```

**Step 3: Listen in App.tsx**

```ts
useEffect(() => {
  window.api.onStatusChanged((newStatus) => {
    if (newStatus === 'connected') {
      setStatus('connected')
      refreshSpace()
    }
  })
}, [refreshSpace])
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: auto-connect on app startup with saved credentials"
```

---

### Task 10: Settings Page

**Files:**
- Create: `src/renderer/src/components/Settings.tsx`
- Create: `src/renderer/src/components/Settings.css`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/types/global.d.ts`

**Step 1: Create Settings component**

`src/renderer/src/components/Settings.tsx`:
```tsx
import { useState, useEffect } from 'react'
import './Settings.css'

interface SettingsProps {
  onBack: () => void
}

export default function Settings({ onBack }: SettingsProps): JSX.Element {
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
```

**Step 2: Style settings**

`src/renderer/src/components/Settings.css`:
```css
.settings {
  padding: 0 20px 20px;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding-top: 4px;
}

.settings-header h2 {
  font-size: 15px;
  font-weight: 600;
  color: #e8e8f0;
}

.settings-back {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid #3a3a52;
  border-radius: 6px;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-back:hover {
  background: #333350;
  color: #fff;
}

.settings-section {
  margin-bottom: 20px;
}

.settings-section h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #666;
  margin-bottom: 10px;
}

.settings-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #2a2a3e;
  border-radius: 8px;
  font-size: 13px;
  color: #ccc;
  cursor: pointer;
}

.settings-toggle input[type="checkbox"] {
  accent-color: #4a9eff;
  width: 16px;
  height: 16px;
}

.settings-danger-btn {
  padding: 10px 16px;
  background: transparent;
  border: 1px solid #5a2a2a;
  border-radius: 8px;
  color: #f87171;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.settings-danger-btn:hover {
  background: #3a1a1a;
}

.settings-about {
  padding: 10px 14px;
  background: #2a2a3e;
  border-radius: 8px;
  font-size: 13px;
  color: #ccc;
}

.settings-about-desc {
  color: #666;
  font-size: 12px;
  margin-top: 4px;
}
```

**Step 3: Add auto-start IPC handlers**

In `src/main/index.ts`:
```ts
ipcMain.handle('app:getAutoStart', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('app:setAutoStart', (_e, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
})
```

In preload, add to `api`:
```ts
app: {
  getAutoStart: () => ipcRenderer.invoke('app:getAutoStart'),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('app:setAutoStart', enabled)
}
```

Update `global.d.ts` to add:
```ts
app: {
  getAutoStart: () => Promise<boolean>
  setAutoStart: (enabled: boolean) => Promise<void>
}
```

**Step 4: Wire settings page in App.tsx**

Add `view` state to App.tsx:
```tsx
const [view, setView] = useState<'main' | 'settings'>('main')

// In Titlebar: onSettingsClick={() => setView('settings')}
// In app-content: conditionally render Settings or DriveCard
{view === 'settings' ? (
  <Settings onBack={() => setView('main')} />
) : (
  <>
    <DriveCard ... />
    {error && ...}
  </>
)}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: settings page with auto-start and credential management"
```

---

### Task 11: Notifications

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/global.d.ts`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Add notification handler in main**

```ts
import { Notification } from 'electron'

ipcMain.on('notify', (_e, { title, body }: { title: string; body: string }) => {
  new Notification({ title, body }).show()
})
```

**Step 2: Expose in preload**

```ts
notify: (title: string, body: string) => ipcRenderer.send('notify', { title, body })
```

**Step 3: Update global types**

```ts
notify: (title: string, body: string) => void
```

**Step 4: Trigger notifications in App.tsx**

After successful connect:
```ts
window.api.notify('CMC Drive', `NAS connecte sur ${data.driveLetter}`)
```

After disconnect:
```ts
window.api.notify('CMC Drive', 'NAS deconnecte')
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: Windows notifications on connect/disconnect"
```

---

### Task 12: App Icon & Resources

**Files:**
- Create: `resources/icon.ico` (256x256 Windows icon)
- Create: `resources/icon.png` (256x256 PNG for tray)
- Create: `build/icon.ico` (for installer)

**Step 1: Generate app icon**

Create a professional blue NAS/drive icon for CMC Drive:
- 256x256 minimum
- Blue (#4a9eff) NAS/drive motif on transparent background
- Works at 16x16 (tray) and 256x256 (installer)

Use a tool like `sharp` or `png-to-ico` npm package to generate the .ico from .png.

**Step 2: Place icons in correct paths**

- `resources/icon.png` -> tray icon (runtime)
- `build/icon.ico` -> installer icon (electron-builder)

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: app icon for tray and installer"
```

---

### Task 13: electron-builder Configuration & Packaging

**Files:**
- Modify: `package.json`

**Step 1: Install electron-builder**

```bash
npm install --save-dev electron-builder
```

**Step 2: Add build configuration to package.json**

```json
{
  "build": {
    "appId": "fr.cmc-06.cmc-drive",
    "productName": "CMC Drive",
    "directories": {
      "output": "dist"
    },
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": true,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "CMC Drive",
      "installerIcon": "build/icon.ico",
      "uninstallerIcon": "build/icon.ico",
      "installerHeaderIcon": "build/icon.ico"
    },
    "files": [
      "out/**/*",
      "resources/**/*"
    ],
    "extraResources": [
      {
        "from": "resources/",
        "to": "resources/"
      }
    ]
  },
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-vite build && electron-builder --win"
  }
}
```

**Step 3: Build the installer**

```bash
npm run package
```

Expected: `dist/` folder contains `CMC Drive Setup 1.0.0.exe`.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: electron-builder NSIS installer configuration"
```

---

### Task 14: Final Polish & Testing

**Step 1: Add .gitignore**

Create `.gitignore`:
```
node_modules/
out/
dist/
*.log
```

**Step 2: Test full flow on Windows**

1. Install via the .exe installer
2. Launch CMC Drive
3. Verify system tray icon appears
4. Click tray -> "Ouvrir CMC Drive"
5. Click connect -> fill credentials -> verify NAS mounts
6. Verify drive appears in Explorer as "NAS CMC-06 (V:)"
7. Verify space bar shows used/free space
8. Close window -> verify stays in tray
9. Reboot -> verify auto-start -> verify auto-connect
10. Uninstall -> verify clean removal

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final polish and testing fixes"
```
