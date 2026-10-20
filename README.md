# GeoPinpoint — frontend

Quiz géographique sur carte muette (sans toponymes) : placez la réponse sur la carte, gagnez de l’XP, affrontez vos amis en **Geobattle**, suivez des **aventures historiques** et enrichissez les thèmes avec la communauté.

Stack : **Vue 3** (`<script setup>`), **Vite**, **TypeScript strict**, **Vue Router**, **Tailwind CSS v4**, **Leaflet**, `lucide-vue-next`, PWA (`vite-plugin-pwa`).
Le backend Node.js/Express est dans le dépôt séparé [`geoquiz-game-back`](https://github.com/GTiazara/geoquiz-game-back).

## Démarrage local

```bash
# 1. Backend (port 3000) — voir son README
cd ../geoquiz-game-back && npm install && npm run dev

# 2. Frontend (port 5173)
cd ../geoquiz-game-front
npm install
cp .env.example .env   # optionnel
npm run dev
```

En développement, Vite proxifie `/api` vers `http://localhost:3000` (modifiable via `API_PROXY_TARGET`).

| Script | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | vérification des types (`vue-tsc`) puis build dans `dist/` |
| `npm run preview` | prévisualise le build |
| `npm test` | tests unitaires (Vitest + jsdom) |
| `npm run icons` | régénère les icônes PWA depuis `public/icons/logo.png` |

## Variables d’environnement (build)

| Variable | Défaut | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | URL de l’API. En production séparée : `https://api.example.com/api`. |
| `VITE_BASE_PATH` | `/` | Chemin de publication (ex. `/geoquiz-game-front/` sur GitHub Pages). |
| `VITE_ROUTER_MODE` | `history` | `hash` pour les hébergements statiques sans réécriture d’URL (GitHub Pages). |
| `VITE_MATOMO_URL` / `VITE_MATOMO_SITE_ID` | — | Mesure d’audience Matomo (désactivée si absentes). |
| `API_PROXY_TARGET` | `http://localhost:3000` | Cible du proxy `/api` en dev uniquement. |

## Déployer sur GitHub Pages

Le workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) se lance à chaque push sur `main` (ou manuellement) :

1. **Settings → Pages → Source : GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** : créer `VITE_API_BASE_URL` = URL HTTPS publique de l’API se terminant par `/api` (ex. `https://geopinpoint-api.example.com/api`). Optionnel : `VITE_MATOMO_URL`, `VITE_MATOMO_SITE_ID`.
3. Côté backend, autoriser l’origine Pages et fixer l’URL publique des liens de partage :
   ```env
   CORS_ORIGIN=https://gtiazara.github.io
   PUBLIC_APP_URL=https://gtiazara.github.io/geoquiz-game-front/#
   ```

Le build utilise le routage par hash (`/#/geobattle/abc`) : aucun `404.html` n’est nécessaire et les liens profonds fonctionnent.

### Domaine personnalise

Le domaine de ce projet est `geopinpoint2.skippylab.com`, declare dans `public/CNAME`.
Dans **Settings > Pages > Custom domain**, renseigner ce meme domaine et activer HTTPS.
Le workflow utilise alors `VITE_BASE_PATH=/` : les fichiers sont publies sous `/assets/`,
pas sous `/geoquiz-game-front/assets/`. Sans `CNAME`, le workflow utilise la variable Actions
`VITE_BASE_PATH` si elle existe, sinon le chemin fourni par GitHub Pages.

Apres un changement de domaine ou de chemin, relancer le workflow **Deploy frontend to GitHub Pages**.
Si le navigateur utilise encore une ancienne PWA, desinscrire son service worker et vider uniquement
son cache de fichiers, puis recharger. Ne pas effacer les cookies ni le stockage local : ils peuvent
encore identifier un ancien compte. Une erreur MIME `text/html` sur un fichier JavaScript accompagnee
d'un 404 indique une URL de ressource incorrecte, pas un probleme de compression du JavaScript.

## Autres hébergeurs

`dist/` est un site statique : Netlify, Vercel, Cloudflare Pages, nginx…
- Avec `VITE_ROUTER_MODE=history` (URL propres), configurer la réécriture de toutes les routes vers `index.html`.
- Si le front et l’API sont servis sur le même domaine (reverse proxy `/api` → backend), laisser `VITE_API_BASE_URL=/api`.

## Architecture

```
src/
  main.ts, App.vue        # point d’entrée, coquille (barre latérale, en-tête, navigation mobile)
  router.ts               # routes + gardes (inscription requise, onboarding)
  style.css               # design system (variables, boutons, cartes, modales…)
  views/                  # une vue par page
  components/             # carte Leaflet, modales, classement, partage…
  lib/
    api.ts                # client HTTP (X-Device-Id, X-Admin-Token, erreurs)
    appStore.ts           # état global issu de GET /api/bootstrap
    appUrl.ts             # liens de partage et assets compatibles base/hash
    …                     # logique métier partagée (score, polygones, thèmes, YouTube…)
public/                   # icônes, mascotte, PWA, .well-known
```

### Identité joueur

Pas de cookie (front et API peuvent être sur des domaines différents) : l’identifiant d’appareil est conservé dans `localStorage` et envoyé dans l’en-tête `X-Device-Id`. S’il est absent, le serveur en attribue un et le renvoie dans la réponse. L’administration utilise un jeton (`X-Admin-Token`) obtenu via `POST /api/admin/login` et conservé dans `sessionStorage`.

### Traduction

Le widget Google Translate (invisible) est piloté par `src/lib/googleTranslateBrowser.ts` et la barre de langues ; son initialisation est dans `index.html`.

Voir aussi [docs/PWA.md](docs/PWA.md).
