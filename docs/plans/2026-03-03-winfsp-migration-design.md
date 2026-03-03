# CMC Drive v2.0 — Migration rclone + WinFsp

## Contexte

CMC Drive v1.7.x utilise `net use` (Windows WebClient) pour monter des partages WebDAV.
Ce mécanisme expose les lecteurs comme des **lecteurs réseau**, ce qui déclenche les restrictions
de zone de sécurité Windows et les blocages Office Basic Auth. La v1.7.x contient ~200 lignes
de hacks registre PowerShell pour contourner ces problèmes — fragiles et sources de régressions.

## Solution

Remplacer `net use` par **rclone mount + WinFsp**.

- **WinFsp** : driver kernel qui permet de créer des systèmes de fichiers en user-space (FUSE pour Windows)
- **rclone** : outil CLI qui monte un WebDAV distant comme lecteur local via WinFsp

Le lecteur apparaît comme un **disque fixe local** (`DRIVE_FIXED`), pas un lecteur réseau.
Office fait des `ReadFile`/`WriteFile` standards — aucune restriction de zone de sécurité.

## Architecture

```
Office/Explorer
    |
    v
Win32 File I/O (CreateFile, ReadFile, WriteFile)
    |
    v
WinFsp Kernel Driver (DRIVE_FIXED)
    |
    v
rclone mount (VFS + cache)
    |
    v
HTTP/HTTPS WebDAV
    |
    v
NAS (stockage.cmc-06.fr)
```

## Composants

### rclone (bundlé dans l'installeur)

- Binary `rclone.exe` déposé dans le dossier d'installation
- Piloté comme `child_process` depuis Electron main process
- Chaque serveur = un process rclone séparé avec son propre port RC

**Commande mount :**
```
rclone mount :webdav,url="{url}",user="{user}",pass="{obscuredPass}" {driveLetter}
  --vfs-cache-mode full
  --vfs-cache-max-size 10G
  --vfs-cache-max-age 1h
  --volname "{driveName}"
  --vfs-case-insensitive
  --rc --rc-addr localhost:{port} --rc-no-auth
  --log-file {userData}/rclone-{id}.log
  --log-level INFO
```

**API RC (HTTP localhost) :**
- `POST /mount/unmount` — déconnecter un lecteur
- `POST /mount/listmounts` — vérifier les mounts actifs
- `POST /core/quit` — arrêter le process rclone

**Mot de passe :** doit être obscurci via `rclone obscure` avant passage à la commande mount.
L'obscurcissement se fait en appelant `rclone obscure {password}` depuis Electron.

### WinFsp (installé par NSIS)

- MSI bundlé dans l'installeur NSIS (~1.5 Mo)
- Installation silencieuse : `msiexec /i winfsp.msi /qn /norestart INSTALLLEVEL=1000`
- Détection via registre : `HKLM\SOFTWARE\WOW6432Node\WinFsp\InstallDir`
- Pas de désinstallation automatique (partagé avec d'autres apps potentiellement)

### Installeur NSIS modifié

1. Vérifie si WinFsp est déjà installé (registre)
2. Si absent → installe silencieusement le MSI bundlé
3. Dépose `rclone.exe` dans le dossier d'installation

Taille estimée : ~25 Mo (vs ~5 Mo actuellement).

## Ce qui est supprimé

- `disableSecurityWarning()` (~200 lignes PowerShell)
- `ensureWebClient()` — WebClient service plus utilisé
- `urlToUncPath()`, `uncHostname()`, `splitDomain()`
- Tout le code `net use` (`runNetUse()`)
- Cache de sécurité (`securityCacheKey`, `isUrlSecurityConfigured`, `markUrlSecurityConfigured`, `resetSecurityCache`)
- Logique d'élévation UAC pour HKLM
- `INTERNET_SET_OPTION_CMD`

## Ce qui est conservé

- Store chiffré (`electron-store` + `safeStorage`) pour les credentials
- System tray avec status (adapté pour surveiller les process rclone)
- Auto-connect au démarrage
- Auto-reconnect après sleep/resume
- UI React (inchangée côté utilisateur)
- Auto-updater

## Gestion du cycle de vie

### Connexion
1. Electron appelle `rclone obscure {password}` pour obtenir le mot de passe obscurci
2. Electron spawne `rclone mount ...` comme child_process détaché
3. Electron surveille le process (événement `exit`, `error`)
4. Une fois le mount actif → status = `connected`

### Déconnexion
1. HTTP POST vers RC API : `/mount/unmount`
2. Attente de confirmation
3. Si timeout → `process.kill()` en fallback

### Crash / récupération
- WinFsp nettoie automatiquement la lettre de lecteur si rclone meurt
- Electron détecte le `exit` du child_process → notification + remount auto si `autoConnect`

### Vérification status (tray)
- HTTP POST `/mount/listmounts` toutes les 10s (remplace `isDriveConnected` via `net use`)

## Ports RC

Chaque serveur utilise un port RC unique :
- Serveur 0 → `localhost:5572`
- Serveur 1 → `localhost:5573`
- etc.

Base port : 5572 (port par défaut rclone RC).

## Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| rclone crash = perte de données en écriture | `--vfs-write-back 5s` (flush rapide) |
| WinFsp pas installé après mise à jour CMC Drive | Détection au lancement + message utilisateur |
| Port RC déjà utilisé | Scan de ports disponibles à partir de 5572 |
| rclone.exe bloqué par antivirus | Signature de l'installeur + documentation |
