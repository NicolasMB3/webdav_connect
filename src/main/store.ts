import Store from 'electron-store'
import { safeStorage } from 'electron'

const store = new Store({ name: 'cmc-drive-config' })

export interface ServerConfig {
  id: string
  url: string
  driveLetter: string
  username: string
  password: string
  autoConnect: boolean
  driveName: string
}

// Migration from old single-connection format
function migrateIfNeeded(): void {
  if (store.has('connection') && !store.has('servers')) {
    const old = store.get('connection') as {
      url: string
      driveLetter: string
      username: string
      password: string
      autoConnect: boolean
      driveName: string
    } | undefined
    if (old) {
      store.set('servers', [
        {
          id: Date.now().toString(),
          url: old.url,
          driveLetter: old.driveLetter,
          username: old.username,
          password: old.password, // already encrypted
          autoConnect: old.autoConnect ?? false,
          driveName: old.driveName || 'NAS CMC-06'
        }
      ])
      store.delete('connection')
    }
  }
}

export function loadServers(): ServerConfig[] {
  migrateIfNeeded()
  const servers = store.get('servers', []) as Array<{
    id: string
    url: string
    driveLetter: string
    username: string
    password: string
    autoConnect: boolean
    driveName: string
  }>
  return servers.map((s) => {
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(s.password, 'base64'))
      return { ...s, password: decrypted }
    } catch {
      return { ...s, password: '' }
    }
  })
}

export function saveServer(config: ServerConfig): void {
  migrateIfNeeded()
  const servers = store.get('servers', []) as ServerConfig[]
  const encrypted = safeStorage.encryptString(config.password).toString('base64')
  const entry = { ...config, password: encrypted }
  const idx = servers.findIndex((s) => s.id === config.id)
  if (idx >= 0) {
    servers[idx] = entry
  } else {
    servers.push(entry)
  }
  store.set('servers', servers)
}

export function deleteServer(id: string): void {
  const servers = store.get('servers', []) as ServerConfig[]
  store.set(
    'servers',
    servers.filter((s) => s.id !== id)
  )
}

export function clearAllServers(): void {
  store.delete('servers')
}

export function isFirstLaunch(): boolean {
  return !store.has('launched')
}

export function markLaunched(): void {
  store.set('launched', true)
}

// Security configuration cache per URL
// Registry settings are persistent — skip disableSecurityWarning on subsequent launches
function securityCacheKey(url: string): string {
  const parsed = new URL(url)
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  // v3: add BasicAuthSuppressWarning reset, remove OpenDocumentsReadWriteWhileBrowsing
  return `v3:${parsed.protocol}//${parsed.hostname}:${port}`
}

export function isUrlSecurityConfigured(url: string): boolean {
  const cache = store.get('securityCache', {}) as Record<string, boolean>
  return cache[securityCacheKey(url)] === true
}

export function markUrlSecurityConfigured(url: string): void {
  const cache = store.get('securityCache', {}) as Record<string, boolean>
  cache[securityCacheKey(url)] = true
  store.set('securityCache', cache)
}

export function resetSecurityCache(): void {
  store.delete('securityCache')
}
