# Contribuer à CMC Drive

Merci de votre intérêt pour CMC Drive ! Voici comment contribuer.

## Setup

```bash
git clone https://github.com/NicolasMB3/webdav_connect.git
cd webdav_connect
npm install
npm run dev
```

## Code style

Le projet utilise **ESLint** et **Prettier** pour maintenir un style cohérent.

```bash
npm run lint        # Vérifier les erreurs
npm run lint:fix    # Corriger automatiquement
npm run format      # Formater le code
npm run format:check # Vérifier le formatage
```

Avant de soumettre un PR, assurez-vous que :

1. `npm run build` passe sans erreur
2. `npm run lint` ne retourne aucune erreur
3. `npm run format:check` passe

## Conventions

- **TypeScript strict** — Pas de `any`, pas de `@ts-ignore`
- **Types partagés** — Les types utilisés dans plusieurs couches sont dans `src/shared/types.ts`
- **Canaux IPC** — Toujours utiliser les constantes de `src/shared/ipc-channels.ts`, jamais de string literals
- **CSS** — Utiliser les variables CSS définies dans `:root` de `App.css`
- **Commits** — Messages clairs en anglais, préfixés (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`)

## Pull Requests

1. Forkez le repo et créez une branche depuis `main`
2. Faites vos modifications
3. Vérifiez le build et le lint
4. Ouvrez un PR avec une description claire des changements

## Issues

Pour signaler un bug ou proposer une fonctionnalité, ouvrez une [issue](https://github.com/NicolasMB3/webdav_connect/issues) avec :

- **Bug** : étapes de reproduction, comportement attendu vs observé
- **Feature** : description du besoin et cas d'usage
