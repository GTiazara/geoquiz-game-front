/** Matomo optionnel : actif seulement si `VITE_MATOMO_URL` et `VITE_MATOMO_SITE_ID` sont définis. */
const BASE = (import.meta.env.VITE_MATOMO_URL || '').replace(/\/?$/, '/')
const SITE = import.meta.env.VITE_MATOMO_SITE_ID || ''
const enabled = Boolean(import.meta.env.VITE_MATOMO_URL && SITE)

export function initMatomo(): void {
  if (!enabled || window._paq) return
  const paq: unknown[][] = (window._paq = [])
  paq.push(['setTrackerUrl', `${BASE}matomo.php`], ['setSiteId', SITE], ['trackPageView'], ['enableLinkTracking'])
  const g = document.createElement('script')
  g.async = true
  g.src = `${BASE}matomo.js`
  document.head.appendChild(g)
}

export function trackPageView(): void {
  if (!enabled || !window._paq) return
  window._paq.push(['setCustomUrl', window.location.href], ['setDocumentTitle', document.title], ['trackPageView'])
}
