import { computed, inject, onBeforeUnmount, onMounted, provide, ref, watch, type InjectionKey } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError, errorMessage, setAdminToken } from '$lib/api'
import { refreshApp } from '$lib/appStore'
import { appUrl } from '$lib/appUrl'
import type { AdminPlayerRow, AdminQuestionRow, FlashCard, FlashDeck, FlashTheme, QuestionEditProposalRow, Theme } from '$lib/types'

export type AdminBattle = {
  id: string; themeId: string; themeName: string; questionId: string; questionText: string
  createdAt: string; creatorDeviceId: string; creatorName: string; isDaily: boolean
  isActuSystemCreated: boolean; isAdminCreated: boolean; isUserCreated: boolean; creatorIsGuest: boolean
}
export type AdminDashboard = {
  users: AdminPlayerRow[]; themes: Theme[]; questions: AdminQuestionRow[]; themeFilter?: string
  geoBattles: AdminBattle[]; pendingNewQuestions: AdminQuestionRow[]; pendingEditProposals: QuestionEditProposalRow[]
  defaultQuizThemeId: string
  communityMinNetVotes: number; communityEditProposalRemoveMinNetDown: number
  flashThemes: FlashTheme[]
  flashDecks: FlashDeck[]
  flashCards: FlashCard[]
}
type Confirmation = { description: string; action: () => Promise<unknown> }

/** Centralise l’état, l’authentification et les actions partagées des vues d’administration. */
export function createAdminDashboard() {
  const route = useRoute(), router = useRouter()
  const configured = ref(true), authed = ref(false), checking = ref(true), loading = ref(false), busy = ref(false)
  const error = ref(''), notice = ref('')
  const data = ref<AdminDashboard>({ users: [], themes: [], questions: [], geoBattles: [], pendingNewQuestions: [], pendingEditProposals: [], defaultQuizThemeId: '', communityMinNetVotes: 4, communityEditProposalRemoveMinNetDown: 5, flashThemes: [], flashDecks: [], flashCards: [] })
  const confirmation = ref<Confirmation | null>(null)
  const battleResult = ref<{ battleId: string; shareUrl: string } | null>(null)
  const themeFilter = computed(() => typeof route.query.theme === 'string' ? route.query.theme.trim() : '')
  const pendingCount = computed(() => data.value.pendingNewQuestions.length + data.value.pendingEditProposals.length)
  let requestVersion = 0
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  function flash(message: string) {
    notice.value = message
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { notice.value = '' }, 4500)
  }
  /** Ferme la session d’administration locale si l’API signale un jeton expiré. */
  function handleError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      setAdminToken(null); authed.value = false; confirmation.value = null
      requestVersion++
    }
    error.value = errorMessage(err)
  }
  /** Protège l’état du tableau de bord contre les réponses d’un chargement précédent. */
  async function load() {
    const version = ++requestVersion
    loading.value = true
    try {
      const result = await api<AdminDashboard>('/admin/dashboard', { query: { theme: themeFilter.value } })
      if (version === requestVersion && authed.value) data.value = { ...result, flashThemes: result.flashThemes ?? [], flashDecks: result.flashDecks ?? [], flashCards: result.flashCards ?? [] }
    } catch (err) { if (version === requestVersion) handleError(err) }
    finally { if (version === requestVersion || !authed.value) loading.value = false }
  }
  async function initialize() {
    checking.value = true; error.value = ''
    try {
      const status = await api<{ configured: boolean; authed: boolean }>('/admin/status')
      configured.value = status.configured; authed.value = status.authed
      if (!status.authed) setAdminToken(null)
      if (status.authed) await load()
    } catch (err) { handleError(err) }
    finally { checking.value = false }
  }
  async function login(secret: string) {
    if (busy.value) return
    busy.value = true; error.value = ''
    try {
      const result = await api<{ token: string }>('/admin/login', { method: 'POST', body: { secret } })
      setAdminToken(result.token); authed.value = true
      await load(); await refreshApp()
    } catch (err) { handleError(err) }
    finally { busy.value = false }
  }
  async function logout() {
    if (busy.value) return
    busy.value = true
    try { await api('/admin/logout', { method: 'POST' }) }
    catch (err) { handleError(err) }
    finally {
      setAdminToken(null); authed.value = false; confirmation.value = null; requestVersion++
      busy.value = false; loading.value = false
      await refreshApp().catch(handleError)
    }
  }
  /** Centralise les mutations admin et synchronise ensuite les données globales. */
  async function mutate<T = { ok: boolean }>(path: string, body?: unknown, message = 'Modification enregistrée.', rawBody?: string): Promise<T | undefined> {
    if (busy.value) return
    busy.value = true; error.value = ''
    try {
      const result = await api<T>(`/admin/${path}`, { method: 'POST', body, rawBody })
      await load()
      await refreshApp()
      flash(message)
      return result
    } catch (err) { handleError(err); return undefined }
    finally { busy.value = false }
  }
  function ask(description: string, action: () => Promise<unknown>) { confirmation.value = { description, action } }
  async function confirm() {
    const current = confirmation.value
    if (!current || busy.value) return
    await current.action()
    confirmation.value = null
  }
  async function filterTheme(theme: string) {
    await router.replace({ query: { ...route.query, theme: theme || undefined } })
  }
  async function createBattle(questionId: string) {
    battleResult.value = null
    const result = await mutate<{ battleId: string }>('geo-battles/create', { questionId }, 'Géobattle créé.')
    if (result) battleResult.value = { battleId: result.battleId, shareUrl: appUrl('/geobattle/' + result.battleId) }
  }
  watch(themeFilter, () => { if (authed.value) void load() })
  onMounted(initialize)
  onBeforeUnmount(() => { requestVersion++; clearTimeout(toastTimer) })
  const context = { configured, authed, checking, loading, busy, error, notice, data, themeFilter, pendingCount, confirmation, battleResult, initialize, login, logout, load, mutate, ask, confirm, filterTheme, createBattle }
  provide(adminKey, context)
  return context
}
type AdminContext = ReturnType<typeof createAdminDashboard>
const adminKey: InjectionKey<AdminContext> = Symbol('adminDashboard')
export function useAdminDashboard(): AdminContext {
  const context = inject(adminKey)
  if (!context) throw new Error('Administration indisponible')
  return context
}
