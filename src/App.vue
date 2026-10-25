<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { BookOpen, ChevronDown, Home, Layers, LayoutGrid, MapPinned, RefreshCw, Sparkles, SquarePen, Swords, Trophy, UserRound, Users } from 'lucide-vue-next'
import { app, isRegistered, refreshApp } from '$lib/appStore'
import { asset } from '$lib/appUrl'
import { initMatomo, trackPageView } from '$lib/matomo'
import GoogleTranslateLangBar from './components/GoogleTranslateLangBar.vue'
import FlashLeaderboardModal from './components/FlashLeaderboardModal.vue'
import {
  fixGoogleTranslateScrollLayout,
  installGoogleTranslateFloatUiSuppression,
  scheduleApplyBrowserTranslateLanguage,
  scheduleTranslateRefresh,
  suppressGoogleTranslateFloatingUI,
} from '$lib/googleTranslateBrowser'

const route = useRoute()
const router = useRouter()

const games = [
  { to: '/', label: 'Accueil', detail: 'Catalogue des quiz', icon: Home },
  { to: '/geopinpoint', label: 'GeoPinpoint', detail: 'Quiz sur carte muette', icon: MapPinned },
  { to: '/flashcards', label: 'Flashcards', detail: 'Quatre réponses, puis le verso', icon: Layers },
]
const nav = computed(() => [
  { to: '/geopinpoint', label: 'Jouer', icon: MapPinned },
  { to: '/themes', label: 'Thèmes', icon: LayoutGrid },
  { to: '/geobattle', label: 'Geobattle', icon: Swords },
  { to: '/histoire', label: 'Histoire', icon: BookOpen },
  { to: '/contribute', label: 'Contribuer', icon: SquarePen },
  { to: '/communaute', label: 'Communauté', icon: Users, count: app.pendingModerationCount },
])
const mobileNav = computed(() => [nav.value[0]!, nav.value[1]!, nav.value[2]!, nav.value[3]!, { to: '/compte', label: 'Compte', icon: UserRound }])
const catalog = computed(() => route.meta.catalog === true)
const flashGame = computed(() => route.meta.game === 'flash')
const shellClass = computed(() => catalog.value ? 'catalog' : flashGame.value ? 'flash' : 'geopinpoint')
const currentGame = computed(() => games.find(game => game.to !== '/' && (route.path === game.to || route.path.startsWith(`${game.to}/`))) ?? games[1]!)
const gameMenuOpen = ref(false)
const flashLeaderboardOpen = ref(false)
const gameMenuRoot = ref<HTMLElement>()

const immersive = computed(() => Boolean(route.meta.immersive))
const flowing = computed(() => Boolean(route.meta.flowing))
const registered = computed(() => isRegistered())
const pseudo = computed(() => (registered.value ? app.player?.pseudo ?? '' : 'Invité'))
const xp = computed(() => flashGame.value ? app.player?.flashXpTotal ?? 0 : app.player?.xpTotal ?? 0)
const initials = computed(() => (registered.value ? pseudo.value.slice(0, 2).toUpperCase() : '?'))

/** Lien actif aussi pour les sous-routes (`/geobattle/:id` active « Geobattle »). */
function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

watch([immersive, flowing, catalog], ([fullScreen, scrollable, showcase]) => document.documentElement.classList.toggle('gp-quiz-viewport-lock', fullScreen && !scrollable && !showcase), { immediate: true })
watch(() => route.fullPath, () => { gameMenuOpen.value = false; flashLeaderboardOpen.value = false })

let stopFloatUi: (() => void) | null = null
const resetTimers: number[] = []
let navDebounce: number | null = null

onMounted(() => {
  window.__gpAppReady = true
  const pending = window.__gpPendingGoogleTranslateBoot
  if (typeof pending === 'function') pending()
  scheduleApplyBrowserTranslateLanguage()
  scheduleTranslateRefresh()
  stopFloatUi = installGoogleTranslateFloatUiSuppression()
  const runLayoutReset = () => {
    fixGoogleTranslateScrollLayout()
    suppressGoogleTranslateFloatingUI()
  }
  runLayoutReset()
  for (const ms of [50, 200, 600, 1200, 2500]) resetTimers.push(window.setTimeout(runLayoutReset, ms))
  window.addEventListener('load', () => {
    scheduleApplyBrowserTranslateLanguage()
    runLayoutReset()
  }, { once: true })

  if (import.meta.env.PROD) {
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
  }
  initMatomo()
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeydown)
})

let firstNav = true
router.afterEach(() => {
  if (firstNav) {
    firstNav = false
  } else {
    trackPageView()
  }
  if (navDebounce) clearTimeout(navDebounce)
  navDebounce = window.setTimeout(() => {
    navDebounce = null
    scheduleTranslateRefresh()
    fixGoogleTranslateScrollLayout()
  }, 180)
})

function onPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && !gameMenuRoot.value?.contains(event.target)) gameMenuOpen.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') gameMenuOpen.value = false
}

onBeforeUnmount(() => {
  stopFloatUi?.()
  for (const id of resetTimers) clearTimeout(id)
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <a class="skip-link" href="#main-content">Aller au contenu</a>

  <aside v-if="!catalog && !flashGame" class="sidebar" aria-label="Navigation principale">
    <RouterLink to="/" class="brand">
      <img :src="asset('icons/logo.png')" alt="" />
      <span>Geo<span class="brand-accent">Pinpoint</span></span>
    </RouterLink>
    <p class="brand-tagline">Le quiz géographique sur carte muette</p>

    <div class="nav-section">Jouer</div>
    <nav>
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="nav-link"
        :class="{ active: isActive(item.to) }"
      >
        <component :is="item.icon" :size="18" aria-hidden="true" />
        <span>{{ item.label }}</span>
        <span v-if="item.count" class="nav-count" :title="`${item.count} élément(s) à modérer`">{{ item.count }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar-bottom">
      <RouterLink :to="registered ? '/compte' : '/onboard'" class="player-card">
        <span class="avatar">{{ initials }}</span>
        <span style="min-width: 0">
          <strong>{{ pseudo }}</strong>
          <small class="muted">{{ registered ? 'Mon compte' : 'Choisir un pseudo' }}</small>
        </span>
      </RouterLink>
      <div class="sidebar-links">
        <RouterLink to="/a-propos">À propos</RouterLink>
        <RouterLink to="/privacy">Confidentialité</RouterLink>
      </div>
    </div>
  </aside>

  <div class="app-content" :class="shellClass">
    <header v-if="!catalog" class="topbar">
      <div class="topbar-left">
        <div ref="gameMenuRoot" class="game-menu">
          <RouterLink to="/" class="game-home-link" aria-label="Retour à l’accueil">
            <component :is="currentGame.icon" :size="16" aria-hidden="true" />
            <span>{{ currentGame.label }}</span>
          </RouterLink>
          <button type="button" class="game-menu-button" aria-label="Changer de jeu" title="Changer de jeu" :aria-expanded="gameMenuOpen" aria-haspopup="menu" @click="gameMenuOpen = !gameMenuOpen">
            <ChevronDown :size="14" aria-hidden="true" />
          </button>
          <div v-if="gameMenuOpen" class="game-menu-panel surface" role="menu">
            <RouterLink v-for="game in games" :key="game.to" :to="game.to" role="menuitem" :class="{ current: game.to === '/' ? false : currentGame.to === game.to }" @click="gameMenuOpen = false">
              <component :is="game.icon" :size="16" aria-hidden="true" />
              <span><strong>{{ game.label }}</strong><small>{{ game.detail }}</small></span>
            </RouterLink>
          </div>
        </div>
        <div class="breadcrumb">
          <span aria-hidden="true">/</span>
          <strong>{{ route.meta.title }}</strong>
        </div>
        <GoogleTranslateLangBar compact />
      </div>
      <div class="topbar-right">
        <button v-if="flashGame" type="button" class="icon-button flash-ranking-button" aria-label="Ouvrir le classement Flashcards" title="Classement Flashcards" @click="flashLeaderboardOpen = true"><Trophy :size="18" /></button>
        <span class="xp-pill" title="Expérience cumulée"><Sparkles :size="14" aria-hidden="true" /> {{ xp.toLocaleString('fr-FR') }} XP</span>
        <RouterLink v-if="!registered" to="/onboard?mode=login" class="btn btn-primary btn-sm">Se connecter</RouterLink>
        <RouterLink v-else to="/compte" class="avatar" :title="pseudo" :aria-label="`Compte de ${pseudo}`">{{ initials }}</RouterLink>
      </div>
    </header>

    <main id="main-content" :class="catalog ? 'page-catalog' : immersive ? { 'page-immersive': true, 'page-flowing': flowing } : 'page'">
      <div v-if="!app.ready" class="loading"><span class="spinner" /> Chargement…</div>
      <div v-else-if="app.error && !app.themes.length" class="empty">
        <div class="empty-icon"><RefreshCw :size="26" /></div>
        <h2>Serveur indisponible</h2>
        <p>{{ app.error }}</p>
        <div class="actions"><button class="btn btn-primary" type="button" @click="refreshApp()">Réessayer</button></div>
      </div>
      <RouterView v-else v-slot="{ Component }">
        <component :is="Component" :key="route.name === 'geobattle-room' ? route.fullPath : undefined" />
      </RouterView>
    </main>

    <footer v-if="!catalog && !immersive" class="page-footer">
      <span>© GeoPinpoint</span>
      <RouterLink to="/a-propos">À propos</RouterLink>
      <RouterLink to="/privacy">Confidentialité</RouterLink>
    </footer>
  </div>

  <FlashLeaderboardModal v-if="flashGame" v-model:open="flashLeaderboardOpen" />

  <nav v-if="!catalog && !flashGame" class="mobile-nav" aria-label="Navigation mobile">
    <RouterLink v-for="item in mobileNav" :key="item.to" :to="item.to" :class="{ active: isActive(item.to) }">
      <component :is="item.icon" :size="20" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
