import { createRouter, createWebHashHistory, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { app, isRegistered, refreshApp } from './lib/appStore'
import { ROUTER_MODE } from './lib/appUrl'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    /** Page carte plein écran (pas de marge, pas de défilement). */
    immersive?: boolean
    flowing?: boolean
    /** Réservée aux joueurs inscrits ; valeur = cible de redirection. */
    registered?: 'next' | 'plain'
    /** Page vitrine, sans le chrome du jeu. */
    catalog?: boolean
    /** Jeu ouvert : le menu d’en-tête permet de changer de quiz. */
    game?: 'geopinpoint' | 'flash'
  }
}

/* Lien entrant `#googtrans(fr|en)` (format Google Translate) : incompatible avec le routage par hash. */
if (ROUTER_MODE === 'hash' && window.location.hash.startsWith('#googtrans')) {
  history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}#/`)
}

const safeNext = (raw: unknown): string | null => {
  const s = typeof raw === 'string' ? raw : ''
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') ? s : null
}

let legacyPasswordPrompted = false

export const router = createRouter({
  history: ROUTER_MODE === 'hash' ? createWebHashHistory(import.meta.env.BASE_URL) : createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/', name: 'hub', component: () => import('./views/QuizHubView.vue'), meta: { title: 'Accueil', catalog: true } },
    { path: '/geopinpoint', name: 'geopinpoint', component: () => import('./views/HomeView.vue'), meta: { title: 'GeoPinpoint', immersive: true, game: 'geopinpoint' } },
    { path: '/flashcards', name: 'flashcards', component: () => import('./views/FlashDecksView.vue'), meta: { title: 'Flashcards', game: 'flash' } },
    { path: '/flashcards/theme/:themeId', name: 'flashcard-theme', component: () => import('./views/FlashThemeDecksView.vue'), meta: { title: 'Flashcards', game: 'flash' } },
    { path: '/flashcards/battle/:battleId', name: 'flashcard-battle', component: () => import('./views/FlashcardPlayView.vue'), meta: { title: 'Duel flashcards', game: 'flash' } },
    { path: '/flashcards/:deckId', name: 'flashcard-play', component: () => import('./views/FlashcardPlayView.vue'), meta: { title: 'Flashcards', game: 'flash' } },
    { path: '/themes', name: 'themes', component: () => import('./views/ThemesView.vue'), meta: { title: 'Thèmes', game: 'geopinpoint' } },
    { path: '/geobattle', name: 'geobattle', component: () => import('./views/GeoBattleView.vue'), meta: { title: 'Geobattle', game: 'geopinpoint' } },
    { path: '/geobattle/:id', name: 'geobattle-room', component: () => import('./views/GeoBattleRoomView.vue'), meta: { title: 'Duel', immersive: true, flowing: true, game: 'geopinpoint' } },
    { path: '/histoire', name: 'histoire', component: () => import('./views/HistoireView.vue'), meta: { title: 'Aventures historiques', immersive: true, flowing: true, game: 'geopinpoint' } },
    { path: '/contribute', name: 'contribute', component: () => import('./views/ContributeView.vue'), meta: { title: 'Contribuer', registered: 'next', game: 'geopinpoint' } },
    { path: '/communaute', name: 'communaute', component: () => import('./views/CommunauteView.vue'), meta: { title: 'Communauté', game: 'geopinpoint' } },
    { path: '/compte', name: 'compte', component: () => import('./views/CompteView.vue'), meta: { title: 'Mon compte', registered: 'plain', game: 'geopinpoint' } },
    { path: '/onboard', name: 'onboard', component: () => import('./views/OnboardView.vue'), meta: { title: 'Connexion et inscription', game: 'geopinpoint' } },
    { path: '/a-propos', name: 'a-propos', component: () => import('./views/AProposView.vue'), meta: { title: 'À propos', game: 'geopinpoint' } },
    { path: '/privacy', name: 'privacy', component: () => import('./views/PrivacyView.vue'), meta: { title: 'Confidentialité', game: 'geopinpoint' } },
    { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { title: 'Administration', game: 'geopinpoint' } },
    { path: '/admin/histoire', name: 'admin-histoire', component: () => import('./views/AdminHistoireView.vue'), meta: { title: 'Administration · Aventures', game: 'geopinpoint' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Page introuvable' } },
  ],
})

router.beforeEach(async (to: RouteLocationNormalized) => {
  if (to.path.startsWith('/googtrans')) return { path: '/', replace: true }
  const themeQuery = Array.isArray(to.query.theme) ? to.query.theme[0] : to.query.theme
  // Les anciens liens `/?theme=` et `/geopoint` ouvrent le quiz carte sur /geopinpoint.
  if (to.path === '/geopoint' || to.path.startsWith('/geopoint/')) {
    return { path: `/geopinpoint${to.path.slice('/geopoint'.length)}`, query: to.query, hash: to.hash, replace: true }
  }
  if (to.path === '/' && typeof themeQuery === 'string' && themeQuery.trim()) {
    return { path: '/geopinpoint', query: to.query, replace: true }
  }
  if (!app.ready) await refreshApp({ theme: typeof to.query.theme === 'string' ? to.query.theme : null })
  if (app.error) return true
  if (isRegistered() && !app.accountAuthenticated && !legacyPasswordPrompted && !to.path.startsWith('/admin') && to.name !== 'privacy') {
    legacyPasswordPrompted = true
    if (to.name !== 'compte') {
      return { path: '/compte', query: { next: to.name === 'onboard' ? safeNext(to.query.next) ?? '/' : to.fullPath } }
    }
  }
  if (to.meta.registered && !isRegistered()) {
    return to.meta.registered === 'next' ? { path: '/onboard', query: { next: to.fullPath } } : { path: '/onboard' }
  }
  if (to.name === 'onboard' && isRegistered()) return safeNext(to.query.next) ?? '/'
  return true
})

router.afterEach((to) => {
  document.title = to.name === 'geopinpoint' ? 'GeoPinpoint — quiz géographique' : `${to.meta.title} · GeoPinpoint`
})
