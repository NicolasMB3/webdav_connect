# CMC Drive

Client WebDAV pour Windows qui monte des lecteurs réseau via [rclone](https://rclone.org/), avec une interface moderne et une intégration système (tray, auto-start, notifications).

## Fonctionnalités

- **Montage WebDAV** — Monte des partages WebDAV comme lecteurs Windows (via rclone + WinFsp)
- **Multi-serveurs** — Gérez plusieurs serveurs simultanément
- **Connexion automatique** — Reconnexion au démarrage et après veille/hibernation
- **Tray system** — L'app reste active en arrière-plan avec un indicateur de statut coloré
- **Espace disque** — Affichage en temps réel de l'espace utilisé/disponible
- **Mises à jour automatiques** — Vérification et installation via electron-updater
- **Sécurité** — Mots de passe chiffrés via `safeStorage`, CSP activé

## Prérequis

- [Node.js](https://nodejs.org/) 18+
- [WinFsp](https://winfsp.dev/) (nécessaire pour le montage rclone)
- [rclone.exe](https://rclone.org/) dans le dossier `resources/`

## Installation

```bash
git clone https://github.com/NicolasMB3/webdav_connect.git
cd webdav_connect
npm install
```

## Développement

```bash
npm run dev       # Lancer en mode développement
npm run build     # Build de production
npm run lint      # Vérifier le code (ESLint)
npm run format    # Formater le code (Prettier)
npm run package   # Créer l'installateur Windows
```

## Architecture

```
src/
├── main/              # Process principal Electron (Node.js)
│   ├── index.ts       # Point d'entrée, IPC handlers
│   ├── rclone-manager.ts  # Gestion des montages rclone
│   ├── store.ts       # Persistance des configurations
│   ├── tray.ts        # Icône système + menu contextuel
│   └── updater.ts     # Auto-updater
├── preload/           # Bridge IPC (contextBridge)
│   └── index.ts
├── renderer/          # Interface React
│   ├── index.html
│   └── src/
│       ├── App.tsx / App.css
│       └── components/
│           ├── DriveCard.tsx    # Carte de lecteur
│           ├── LoginDialog.tsx  # Formulaire de connexion
│           ├── Settings.tsx     # Page paramètres
│           └── Titlebar.tsx     # Barre de titre custom
└── shared/            # Code partagé (types, constantes IPC)
    ├── types.ts
    └── ipc-channels.ts
```

## Stack technique

- **Electron** 40+ avec electron-vite
- **React** 19
- **TypeScript** strict
- **rclone** pour le montage WebDAV
- **ESLint** + **Prettier** pour la qualité du code

## Licence

[MIT](LICENSE)
