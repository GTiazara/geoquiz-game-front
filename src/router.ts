import { createRouter, createWebHashHistory, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { app, isRegistered, refreshApp } from './lib/appStore'
import { ROUTER_MODE } from './lib/appUrl'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    /** Page carte plein écran (pas de marge, pas de défilement). */
    immersive?: boolean
    /** Réservée aux joueurs inscrits ; valeur = cible de redirection. */
    registered?: 'next' | 'plain'
  }
}

/* Lien entrant `#googtrans(fr|en)` (format Google Translate) : incompatible avec le routage par hash. */
if (ROUTER_MODE === 'hash' && window.location.hash.startsWith('#googtrans')) {
  history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}#/`)
}

const safeNext = (raw: unknown): string | null => {
  const s = typeof raw === 'string' ? raw : ''
  return s.startsWith('/') && !s.startsWith('//') ? s : null
}

export const router = createRouter({
  history: ROUTER_MODE === 'hash' ? createWebHashHistory(import.meta.env.BASE_URL) : createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/', name: 'play', component: () => import('./views/HomeView.vue'), meta: { title: 'Jouer', immersive: true } },
    { path: '/themes', name: 'themes', component: () => import('./views/ThemesView.vue'), meta: { title: 'Thèmes' } },
    { path: '/geobattle', name: 'geobattle', component: () => import('./views/GeoBattleView.vue'), meta: { title: 'Geobattle' } },
    { path: '/geobattle/:id', name: 'geobattle-room', component: () => import('./views/GeoBattleRoomView.vue'), meta: { title: 'Duel', immersive: true } },
    { path: '/histoire', name: 'histoire', component: () => import('./views/HistoireView.vue'), meta: { title: 'Aventures historiques', immersive: true } },
    { path: '/contribute', name: 'contribute', component: () => import('./views/ContributeView.vue'), meta: { title: 'Contribuer', registered: 'next' } },
    { path: '/communaute', name: 'communaute', component: () => import('./views/CommunauteView.vue'), meta: { title: 'Communauté' } },
    { path: '/compte', name: 'compte', component: () => import('./views/CompteView.vue'), meta: { title: 'Mon compte', registered: 'plain' } },
    { path: '/onboard', name: 'onboard', component: () => import('./views/OnboardView.vue'), meta: { title: 'Choisir un pseudo' } },
    { path: '/a-propos', name: 'a-propos', component: () => import('./views/AProposView.vue'), meta: { title: 'À propos' } },
    { path: '/privacy', name: 'privacy', component: () => import('./views/PrivacyView.vue'), meta: { title: 'Confidentialité' } },
    { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { title: 'Administration' } },
    { path: '/admin/histoire', name: 'admin-histoire', component: () => import('./views/AdminHistoireView.vue'), meta: { title: 'Administration · Aventures' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Page introuvable' } },
  ],
})

router.beforeEach(async (to: RouteLocationNormalized) => {
  if (to.path.startsWith('/googtrans')) return { path: '/', replace: true }
  if (!app.ready) await refreshApp({ theme: typeof to.query.theme === 'string' ? to.query.theme : null })
  if (app.error) return true
  if (to.meta.registered && !isRegistered()) {
    return to.meta.registered === 'next' ? { path: '/onboard', query: { next: to.fullPath } } : { path: '/onboard' }
  }
  if (to.name === 'onboard' && isRegistered()) return safeNext(to.query.next) ?? '/'
  return true
})

router.afterEach((to) => {
  document.title = to.name === 'play' ? 'GeoPinpoint — quiz géographique' : `${to.meta.title} · GeoPinpoint`
})
