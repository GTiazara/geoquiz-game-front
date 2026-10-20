import { reactive } from 'vue'
import { api, errorMessage } from './api'
import type { PlayerRow, Theme, ThemeStat } from './types'
import type { StoryAdventure } from './historyAdventures'

/** Réponse de `GET /api/bootstrap` (ex-données du layout SvelteKit `page.data`). */
export type BootstrapData = {
  deviceId: string
  isAdmin: boolean
  player: PlayerRow | null
  themes: Theme[]
  themeStats: Record<string, ThemeStat>
  pendingModerationCount: number
  communityMinNetVotes: number
  communityEditProposalRemoveMinNetDown: number
  initialQuizThemeId: string
  aiEnrichConfigured: boolean
  forceDescriptionEnrichment: boolean
  historyAdventures: StoryAdventure[]
}

type AppState = BootstrapData & {
  ready: boolean
  loading: boolean
  error: string
  /** Incrémenté à chaque rafraîchissement réussi (permet de recharger des vues dépendantes). */
  generation: number
}

/**
 * État global de l’application. Équivalent de `page.data` côté SvelteKit :
 * lire `app.player`, `app.themes`… ; appeler `refreshApp()` à la place de `invalidateAll()`.
 */
export const app = reactive<AppState>({
  ready: false,
  loading: false,
  error: '',
  generation: 0,
  deviceId: '',
  isAdmin: false,
  player: null,
  themes: [],
  themeStats: {},
  pendingModerationCount: 0,
  communityMinNetVotes: 2,
  communityEditProposalRemoveMinNetDown: 0,
  initialQuizThemeId: '',
  aiEnrichConfigured: false,
  forceDescriptionEnrichment: false,
  historyAdventures: [],
})

let inflight: Promise<void> | null = null

/** Recharge les données globales (joueur, thèmes, stats…). `theme` : thème demandé via `?theme=`. */
export function refreshApp(opts: { theme?: string | null } = {}): Promise<void> {
  if (inflight) return inflight
  app.loading = true
  inflight = (async () => {
    try {
      const data = await api<BootstrapData>('/bootstrap', { query: { theme: opts.theme ?? undefined } })
      Object.assign(app, data)
      app.error = ''
      app.generation++
    } catch (e) {
      app.error = errorMessage(e, 'Impossible de charger l’application.')
    } finally {
      app.ready = true
      app.loading = false
      inflight = null
    }
  })()
  return inflight
}

/** Alias explicite pour les ports depuis SvelteKit. */
export const invalidateAll = refreshApp

export function isRegistered(): boolean {
  return Boolean(app.player && app.player.isGuest !== true && app.player.pseudo)
}
