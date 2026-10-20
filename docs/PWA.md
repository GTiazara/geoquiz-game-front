# PWA et identité (GeoPinpoint)

## Logo et favicon

- **Maître** : `static/icons/logo.png` (icône app) ; `static/icons/logo.svg` pointe dessus pour compatibilité.
- **Raster** (PWA / favicon) : générés par Sharp à partir du PNG (ou du SVG si pas de PNG) :
  - `static/pwa-192x192.png`, `static/pwa-512x512.png`
  - `static/apple-touch-icon.png` (180×180)
  - `static/favicon-32x32.png`

Après modification du SVG :

```bash
npm run icons
```

Le script `prebuild` régénère ces fichiers avant chaque `npm run build`.

## Installation (PWA)

- Config : `vite.config.ts` (`@vite-pwa/sveltekit`, `registerType: 'autoUpdate'`, manifest + `generateSW`).
- Enregistrement du service worker : `src/routes/+layout.svelte` (`virtual:pwa-register`).
- Lien manifest : `virtual:pwa-info` dans le même layout.
- **HTTPS** requis en production pour l’invite « Installer l’application » (sauf `localhost`).

En local : `npm run build && npm run preview`, ouvre `https://localhost:4173` si tu testes avec TLS ; sinon le SW fonctionne souvent déjà en HTTP sur `localhost`.

## Déploiement

Choisis un adapter SvelteKit adapté à ta plateforme (`adapter-static`, `adapter-node`, `adapter-vercel`, etc.).  
`adapter-auto` ne détecte pas toujours l’environnement : configure explicitement l’adapter pour la prod afin que les fichiers statiques et le `sw.js` soient bien servis.
