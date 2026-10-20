/** Mode de routage : `hash` (GitHub Pages) ou `history`. */
export const ROUTER_MODE: 'hash' | 'history' = import.meta.env.VITE_ROUTER_MODE === 'hash' ? 'hash' : 'history'

/**
 * URL publique absolue d’une route de l’app (liens de partage), compatible base GitHub Pages + routage hash.
 * Ex. `appUrl('/geobattle/abc')` → `https://user.github.io/geoquiz-game-front/#/geobattle/abc`.
 */
export function appUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`
  return ROUTER_MODE === 'hash' ? `${base}/#${p}` : `${base}${p}`
}

/** URL d’un fichier du dossier `public/` (tient compte de `VITE_BASE_PATH`). */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
