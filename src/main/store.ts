import Store from 'electron-store'
import { safeStorage } from 'electron'

const store = new Store({ name: 'cmc-drive-config' })

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
