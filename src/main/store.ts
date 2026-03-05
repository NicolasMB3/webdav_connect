import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { ServerConfig } from '../shared/types'

export type { ServerConfig }

const store = new Store({ name: 'cmc-drive-config' })

// Migration from old single-connection format
function migrateIfNeeded(): void {
  if (store.has('connection') && !store.has('servers')) {
    const old = store.get('connection') as
      | {
          url: string
          driveLetter?: string
          mountPoint?: string
          username: string
          password: string
          autoConnect: boolean
          driveName: string
        }
      | undefined
    if (old) {
      store.set('servers', [
        {
          id: Date.now().toString(),
          url: old.url,
          mountPoint: old.mountPoint || old.driveLetter || 'V:',
          username: old.username,
          password: old.password, // already encrypted
          autoConnect: old.autoConnect ?? false,
          driveName: old.driveName || 'NAS CMC-06'
        }
      ])
      store.delete('connection')
    }
  }

  // v2 migration: rename driveLetter → mountPoint in each server entry
  const servers = store.get('servers', []) as Record<string, unknown>[]
  let migrated = false
  for (const s of servers) {
    if ('driveLetter' in s && !('mountPoint' in s)) {
      s.mountPoint = s.driveLetter
      delete s.driveLetter
      migrated = true
    }
  }
  if (migrated) {
    store.set('servers', servers)
  }
}

export function loadServers(): ServerConfig[] {
  migrateIfNeeded()
  const servers = store.get('servers', []) as ServerConfig[]
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
  let encrypted: string
  try {
    encrypted = safeStorage.encryptString(config.password).toString('base64')
  } catch {
    console.warn('[store] safeStorage.encryptString failed — storing empty password')
    encrypted = ''
  }
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
