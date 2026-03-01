# CMC Drive — Design Document

## Overview

Application Windows de type RaiDrive, focalisee sur WebDAV, pour connecter un NAS CMC-06 comme lecteur reseau Windows. Interface premium theme sombre, system tray, installeur .exe, reconnexion automatique.

## Stack technique

- **Framework** : Electron (Chromium + Node.js)
- **UI** : React + CSS custom (theme sombre)
- **Packaging** : electron-builder → installeur NSIS .exe
- **WebDAV** : `net use` via `child_process` (commande Windows native)
- **Stockage config** : electron-store + Electron safeStorage (chiffrement)

## Architecture

```
CMC Drive (Electron)
├── Main Process (Node.js)
│   ├── WebDAV Manager (net use via child_process)
│   ├── Credentials Store (electron-store + safeStorage)
│   ├── System Tray (icone + menu contextuel)
│   ├── Auto-start (registre Windows)
│   └── Disk Space Monitor (wmic / PowerShell)
└── Renderer Process (React)
    ├── Fenetre principale (carte du drive)
    ├── Formulaire de connexion
    ├── Page Settings
    └── Page About
```

## Configuration cible

- **Serveur** : `https://stockage.cmc-06.fr:5006/backup`
- **Lettre par defaut** : `V:`
- **Nom affiche** : "NAS CMC-06"
- **Un seul drive** (pas multi-drive)

## Interface utilisateur

### Fenetre principale
- Theme sombre (fond #1e1e2e, cartes #2a2a3a)
- Header : Logo CMC Drive + boutons Settings / About / Fermer
- Carte du drive :
  - Icone NAS stylisee
  - Nom : "NAS CMC-06" + lettre (V:)
  - URL : stockage.cmc-06.fr
  - Barre de progression espace utilise/disponible
  - Indicateur statut : connecte (vert) / deconnecte (rouge) / en cours (orange)
  - Boutons : Connecter/Deconnecter, Ouvrir Explorer, Parametres

### Formulaire de connexion
- Champs : Identifiant, Mot de passe
- Case : "Memoriser les identifiants"
- Case : "Connexion automatique au demarrage"
- Selecteur lettre de lecteur
- URL serveur pre-remplie

### System Tray
- Icone dans la zone de notification
- Menu : Ouvrir NAS, Connecter/Deconnecter, Ouvrir CMC Drive, Quitter
- Double-clic → ouvre la fenetre
- Fermer fenetre → minimise en tray

## Comportement

1. Lancement : demarre en system tray
2. Premiere utilisation : affiche formulaire connexion
3. Connexion : active WebClient si necessaire → net use
4. Reconnexion auto : au demarrage Windows, reconnecte silencieusement
5. Fermer fenetre : minimise en tray
6. Deconnexion : net use /delete

## Securite

- Identifiants chiffres via Electron safeStorage
- Jamais stockes en clair

## Installeur

- electron-builder → .exe NSIS
- Icone personnalisee
- Raccourci bureau + menu demarrer
- Option demarrage auto Windows
- Desinstalleur propre
