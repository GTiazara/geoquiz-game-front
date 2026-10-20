<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, ChevronDown, ChevronUp, Flame, Globe2, HelpCircle, Layers, MapPin, Newspaper, Plus, Swords, Trophy, UserRound, X } from 'lucide-vue-next'
import { api, errorMessage } from '$lib/api'
import { app, refreshApp } from '$lib/appStore'
import { appUrl, asset } from '$lib/appUrl'
import { ACTU_THEME_ID, DEFAULT_QUIZ_THEME_ID, MIX_THEME_ID, resolvedDefaultQuizThemeId } from '$lib/themes'
import type { Theme } from '$lib/types'
import { formatToleranceRadiusKm } from '$lib/geo/score'
import { fixGoogleTranslateScrollLayout, lockQuizViewportScroll, scheduleTranslateRefresh } from '$lib/googleTranslateBrowser'
import { useGameQuiz } from '../composables/gameQuiz'
import GeoMap from '../components/GeoMap.vue'
import GameQuestionDetails from '../components/GameQuestionDetails.vue'
import GoogleTranslateLangBar from '../components/GoogleTranslateLangBar.vue'
import LeaderboardModal from '../components/LeaderboardModal.vue'
import ThemeBrowserModal from '../components/ThemeBrowserModal.vue'
import ThemeCreateModal from '../components/ThemeCreateModal.vue'
import ShareGeoBattleLink from '../components/ShareGeoBattleLink.vue'

const route = useRoute()
const router = useRouter()
const defaultThemeId = computed(() => resolvedDefaultQuizThemeId(app.themes))
const quizThemePick = ref<string>()
const activeThemeId = computed(() => quizThemePick.value ?? app.initialQuizThemeId ?? defaultThemeId.value)
const mixTheme: Theme = { id: MIX_THEME_ID, emoji: '🎲', name: 'Mixte', description: 'Tous les thèmes mélangés', createdAt: '' }
const activeTheme = computed(() => activeThemeId.value === MIX_THEME_ID ? mixTheme : app.themes.find(t => t.id === activeThemeId.value))
const themeXp = computed(() => Math.round(activeThemeId.value === MIX_THEME_ID ? app.player?.xpTotal ?? 0 : app.player?.xpByTheme?.[activeThemeId.value] ?? 0))
const isGuest = computed(() => app.player?.isGuest === true)
const { current, guess, showResult, loading, validating, error, lastXp, xpSaved, lastDist, inBuffer, lastInsideAnswerArea, streak, deckPosition, deckSize, nextQuestion, validateGuess, updateQuestion, reload } = useGameQuiz(activeThemeId)
const headingTheme = computed(() => activeThemeId.value === MIX_THEME_ID && current.value ? app.themes.find(t => t.id === current.value?.themeId) ?? activeTheme.value : activeTheme.value)
const quizThemeShareUrl = computed(() => appUrl(router.resolve({ path: '/', query: { ...route.query, theme: activeThemeId.value === defaultThemeId.value ? undefined : activeThemeId.value } }).fullPath))
const boardOpen = ref(false)
const boardThemeId = ref('')
const themeModal = ref(false)
const themeDirectoryOpen = ref(false)
const borders = ref(true)
const questionPanelOpen = ref(false)
const helpMenuOpen = ref(false)
const helpMenuRoot = ref<HTMLElement>()
const questionDialog = ref<HTMLElement>()
const questionTrigger = ref<HTMLButtonElement>()
const actionRoot = ref<HTMLElement>()
const actionHeight = ref(110)
let actionObserver: ResizeObserver | undefined
watch(actionRoot, element => {
  actionObserver?.disconnect()
  if (element) actionObserver?.observe(element)
}, { flush: 'post' })
const shareThemeCompact = ref(false)
const historyHintOpen = ref(false)
const dailyMapFabBusy = ref(false)
const latestMapFabBusy = ref(false)
const shortcutError = ref('')
const dailyGeobattleThemeId = computed(() => activeThemeId.value === MIX_THEME_ID ? current.value?.themeId ?? '' : activeThemeId.value)
const actuThemePresent = computed(() => app.themes.some(t => t.id === ACTU_THEME_ID))
const correctionPopup = computed(() => showResult.value && current.value ? {
  questionId: current.value.id,
  mediaEditable: !isGuest.value,
  title: current.value.text,
  imgUrl: current.value.imgUrl,
  youtubeUrl: current.value.youtubeUrl,
  description: current.value.description,
  ...(current.value.approved && !isGuest.value ? {
    contentProposalEditable: true,
    proposalBaseline: { text: current.value.text, lat: current.value.lat, lng: current.value.lng, description: current.value.description },
  } : {}),
} : null)
const streakTitle = computed(() => `Réponses consécutives dans la zone exacte (cercle de tolérance ou polygone pays). Une manche hors zone remet la série à 0.${streak.value.brokenPrev != null ? ` Série cassée après ${streak.value.brokenPrev}.` : ''}${streak.value.best > 0 ? ` Record : ${streak.value.best}.` : ''}`)

watch([() => route.query.theme, () => app.themes], () => {
  const raw = route.query.theme
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  quizThemePick.value = value === MIX_THEME_ID || app.themes.some(t => t.id === value) ? value : defaultThemeId.value
}, { immediate: true })

async function pickTheme(themeId: string) {
  if (validating.value) return
  quizThemePick.value = themeId
  await router.replace({ path: '/', query: { ...route.query, theme: themeId === defaultThemeId.value ? undefined : themeId } })
}
async function selectBrowserTheme(themeId: string) {
  await pickTheme(themeId)
  await refreshData()
}
function refreshData() { return refreshApp({ theme: activeThemeId.value }) }
function createTheme() {
  if (isGuest.value) void router.push('/onboard')
  else themeModal.value = true
}
function openLeaderboard() {
  const themes = app.themes.filter(t => t.id !== MIX_THEME_ID)
  const fallback = themes.some(t => t.id === DEFAULT_QUIZ_THEME_ID) ? DEFAULT_QUIZ_THEME_ID : themes[0]?.id ?? ''
  boardThemeId.value = activeThemeId.value === MIX_THEME_ID ? fallback : activeThemeId.value || fallback
  boardOpen.value = true
}
async function openBattle(latest = false) {
  if (latest ? !actuThemePresent.value || latestMapFabBusy.value : !dailyGeobattleThemeId.value || dailyMapFabBusy.value) return
  const busy = latest ? latestMapFabBusy : dailyMapFabBusy
  busy.value = true
  shortcutError.value = ''
  try {
    const result = await api<{ battleId?: string }>(latest ? '/geo-battle/create-latest' : `/geo-battle/daily/${encodeURIComponent(dailyGeobattleThemeId.value)}`, latest ? { method: 'POST', body: {} } : {})
    if (!result.battleId) throw new Error('Aucune Geobattle disponible pour ce thème.')
    await router.push(`/geobattle/${encodeURIComponent(result.battleId)}`)
  } catch (e) { shortcutError.value = errorMessage(e) }
  finally { busy.value = false }
}
function openHistoryFeature() {
  if (historyHintOpen.value) void router.push('/histoire')
  else historyHintOpen.value = true
}
function closeQuestion() {
  questionPanelOpen.value = false
  void nextTick(() => questionTrigger.value?.focus())
}
watch([() => current.value?.id, showResult], () => {
  questionPanelOpen.value = false
  if (current.value) void nextTick(scheduleTranslateRefresh)
})
watch(questionPanelOpen, async value => {
  await nextTick()
  if (value) questionDialog.value?.focus()
  scheduleTranslateRefresh()
})
function onPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && !helpMenuRoot.value?.contains(event.target)) helpMenuOpen.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    questionPanelOpen.value = false
    helpMenuOpen.value = false
    historyHintOpen.value = false
    boardOpen.value = false
    themeDirectoryOpen.value = false
    if (!validating.value) themeModal.value = false
    return
  }
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
  if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea, select, button, a, [role="dialog"]'))) return
  if (boardOpen.value || themeModal.value || themeDirectoryOpen.value || questionPanelOpen.value || historyHintOpen.value) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (showResult.value) void nextQuestion()
    else void validateGuess()
  }
}
function trapQuestionFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const elements = questionDialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]')
  if (!elements?.length) return
  const first = elements[0]!
  const last = elements[elements.length - 1]!
  if (event.shiftKey && (document.activeElement === first || document.activeElement === questionDialog.value)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
let unlock: (() => void) | undefined
let media: MediaQueryList | undefined
const fixTimers: number[] = []
function syncCompact() { shareThemeCompact.value = media?.matches ?? false }
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    actionObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) actionHeight.value = entry.target.getBoundingClientRect().height
    })
    if (actionRoot.value) actionObserver.observe(actionRoot.value)
  }
  unlock = lockQuizViewportScroll()
  fixGoogleTranslateScrollLayout()
  for (const ms of [100, 400, 1000]) fixTimers.push(window.setTimeout(fixGoogleTranslateScrollLayout, ms))
  media = window.matchMedia('(max-width: 639px)')
  syncCompact()
  media.addEventListener('change', syncCompact)
  window.addEventListener('pageshow', fixGoogleTranslateScrollLayout)
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  actionObserver?.disconnect()
  unlock?.()
  fixTimers.forEach(clearTimeout)
  media?.removeEventListener('change', syncCompact)
  window.removeEventListener('pageshow', fixGoogleTranslateScrollLayout)
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="map-stage quiz-stage" :style="{ '--game-action-clearance': `${actionHeight + 34}px` }">
    <header class="quiz-header" aria-label="Commandes du quiz">
      <div class="header-row">
        <div class="header-stats">
          <span class="badge warn" :title="`${themeXp} ${activeThemeId === MIX_THEME_ID ? 'XP total' : 'XP thème'}`">{{ themeXp.toLocaleString('fr-FR') }} XP<span class="desktop-label"> {{ activeThemeId === MIX_THEME_ID ? 'total' : 'thème' }}</span></span>
          <span class="badge neutral" :title="streakTitle"><Flame :size="13" /> {{ streak.current }}<span v-if="streak.best" class="desktop-label"> · max {{ streak.best }}</span></span>
          <details v-if="isGuest" class="guest-pill">
            <summary :title="`Mode visiteur · @${app.player?.pseudo ?? ''}`"><UserRound :size="13" /><span class="desktop-label">Visiteur</span><ChevronDown :size="12" /></summary>
            <div class="header-popover surface stack-sm">
              <strong>Mode visiteur · @{{ app.player?.pseudo ?? '…' }}</strong>
              <p>Ton pseudo et ta progression du <strong>jour UTC</strong> restent sur cet appareil. La session de la veille est supprimée à la première visite du nouveau jour. Le classement « Visiteurs (jour UTC) » réunit invités et XP du jour des comptes enregistrés.</p>
              <RouterLink to="/onboard" class="btn btn-primary btn-sm">Créer ton pseudo</RouterLink>
              <small>Gratuit, sans e-mail : garde l’XP durable, le classement « inscrits » et les contributions.</small>
            </div>
          </details>
        </div>
        <div class="header-modes" aria-label="Autres modes de jeu">
        <button type="button" class="icon-button sm" :disabled="!dailyGeobattleThemeId || dailyMapFabBusy" title="Geobattle du jour (UTC) pour ce thème" aria-label="Ouvrir la Geobattle du jour" @click="openBattle()"><span v-if="dailyMapFabBusy" class="spinner" /><Swords v-else :size="16" /></button>
        <button type="button" class="icon-button sm" :disabled="!actuThemePresent || latestMapFabBusy || dailyMapFabBusy" :title="actuThemePresent ? 'Geobattle : dernière question publiée du thème actualité' : 'Crée d’abord un thème d’id « actu » (actualité).'" aria-label="Geobattle sur la dernière question publiée du thème actualité" @click="openBattle(true)"><span v-if="latestMapFabBusy" class="spinner" /><Newspaper v-else :size="16" /></button>
        <button type="button" class="icon-button sm history-shortcut" title="À la trace de l’histoire" aria-label="Ouvrir À la trace de l’histoire" :aria-expanded="historyHintOpen" @click="openHistoryFeature"><img :src="asset('mascot/mascot.jpg')" alt="" /><span>NEW</span></button>
        <label class="borders-switch" title="Afficher ou masquer les frontières"><input v-model="borders" type="checkbox" aria-label="Afficher les frontières" /><Globe2 :size="16" /><span class="desktop-label">Frontières</span></label>
        </div>
        <div class="header-tools">
          <GoogleTranslateLangBar embedded compact />
          <button type="button" class="btn btn-secondary btn-sm" aria-label="Ouvrir le classement" @click="openLeaderboard"><Trophy :size="15" /><span class="desktop-label">Classement</span></button>
            <div ref="helpMenuRoot" class="help-root">
              <button type="button" class="icon-button sm" aria-label="Aide et retours" :aria-expanded="helpMenuOpen" @click="helpMenuOpen = !helpMenuOpen"><HelpCircle :size="17" /></button>
              <div v-if="helpMenuOpen" class="help-menu surface stack-sm">
                <RouterLink to="/a-propos" @click="helpMenuOpen = false">À propos</RouterLink>
                <RouterLink to="/communaute" @click="helpMenuOpen = false">Communauté</RouterLink>
                <a href="https://play.google.com/store/apps/details?id=com.skippylab.geopinpoint.twa" target="_blank" rel="noopener noreferrer">App mobile ↗</a>
                <a href="https://www.reddit.com/r/geopinpoint/" target="_blank" rel="noopener noreferrer">Aide et retours sur Reddit ↗</a>
                <small>Entrée / Espace : valider ou passer à la question suivante. Échap : fermer un panneau.</small>
              </div>
            </div>
        </div>
      </div>
      <div class="header-row theme-row">
        <div class="theme-strip" aria-label="Choisir un thème">
            <button type="button" class="theme-chip" :class="{ selected: activeThemeId === MIX_THEME_ID }" :aria-pressed="activeThemeId === MIX_THEME_ID" :disabled="validating" @click="pickTheme(MIX_THEME_ID)">🎲 Mixte</button>
            <button v-for="theme in app.themes" :key="theme.id" type="button" class="theme-chip" :class="{ selected: activeThemeId === theme.id }" :aria-pressed="activeThemeId === theme.id" :disabled="validating" @click="pickTheme(theme.id)">{{ theme.emoji }} {{ theme.name }}</button>
            <button type="button" class="theme-chip create-chip" :disabled="validating" @click="createTheme"><Plus :size="13" /> Créer</button>
          </div>
        <div class="theme-tools">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="validating" @click="themeDirectoryOpen = true"><Layers :size="14" /><span>Plus</span></button>
            <ShareGeoBattleLink :share-url="quizThemeShareUrl" :compact="shareThemeCompact" button-label="Partager" dialog-heading="Partager" dialog-title-id="quiz-theme-share-title" share-title="Thème — GeoPinpoint" share-text="Joue sur ce thème sur la carte !" button-aria-label="Partager (lien d’accueil)" url-field-aria-label="Lien" tone="cyan" density="sm" />
        </div>
      </div>
    </header>

    <div class="quiz-map-area">
    <GeoMap
      class="quiz-map"
      v-if="current"
      :key="String(borders)"
      v-model:guess="guess"
      :interactive="!showResult && !validating && !loading"
      :answer="{ lat: current.lat, lng: current.lng }"
      :show-result="showResult"
      :allow-overlay-translation="true"
      :show-basemap-selector="showResult"
      :tolerance-m="current.toleranceM"
      :answer-area="current.answerArea ?? null"
      :borders="borders"
      :correction-popup="correctionPopup"
      :on-correction-media-saved="updateQuestion"
      :on-community-edit-proposal-submitted="refreshData"
    />
    <div v-else class="map-placeholder" aria-hidden="true"><Globe2 :size="96" :stroke-width="1" /></div>

    <div v-if="current && !showResult" class="map-overlay question-anchor">
      <Transition name="hud" mode="out-in">
        <button :key="current.id" ref="questionTrigger" type="button" class="hud-card question-summary" :aria-expanded="questionPanelOpen" aria-controls="quiz-question-dialog" aria-label="Ouvrir l’énoncé de la question" @click="questionPanelOpen = true">
          <span class="question-meta"><span>{{ headingTheme?.emoji }} {{ headingTheme?.name }}</span><span class="badge neutral">{{ deckPosition }} / {{ deckSize }}</span></span>
          <span class="question-heading"><strong>{{ current.text }}</strong><img v-if="current.imgUrl?.trim()" :src="current.imgUrl.trim()" alt="" loading="lazy" /></span>
          <span class="question-meta"><span>{{ current.answerArea || current.hasAnswerArea ? 'Zone polygone' : `Tolérance ~${formatToleranceRadiusKm(current.toleranceM)} km` }}</span><span class="details-label">Détails <ChevronUp :size="14" /></span></span>
        </button>
      </Transition>
    </div>

    <div v-if="!current" class="map-overlay empty-overlay">
      <section class="hud-card panel stack-sm" aria-live="polite">
        <template v-if="loading"><div class="loading"><span class="spinner" /> Chargement des questions…</div></template>
        <template v-else-if="error"><p class="alert" role="alert">{{ error }}</p><button type="button" class="btn btn-primary" @click="reload">Réessayer</button></template>
        <template v-else><h2>{{ activeTheme?.emoji }} {{ activeTheme?.name }}</h2><p>{{ activeThemeId === MIX_THEME_ID ? 'Pas encore de question validée dans aucun thème.' : 'Pas encore de question validée pour ce thème.' }}</p><RouterLink to="/contribute" class="btn btn-primary">Ajoute-en une</RouterLink><small>La communauté votera pour valider.</small></template>
      </section>
    </div>

    <div v-if="shortcutError" class="map-overlay shortcut-error"><div class="alert" role="alert">{{ shortcutError }}<button type="button" class="btn btn-ghost btn-sm" aria-label="Fermer l’erreur" @click="shortcutError = ''"><X :size="14" /></button></div></div>

    <div v-if="current" ref="actionRoot" class="map-overlay quiz-action">
      <Transition name="hud" mode="out-in">
        <section :key="String(showResult)" class="hud-card action-card" aria-live="polite">
          <template v-if="showResult">
            <div class="between"><span class="eyebrow result-label">{{ inBuffer ? 'Bien joué !' : 'Résultat de la manche' }}</span><span class="badge neutral"><Flame :size="13" /> Série {{ streak.current }}</span></div>
            <div class="result-stats"><div><strong class="xp-gain">+{{ lastXp.toLocaleString('fr-FR') }}</strong><span>XP{{ validating ? ' · enregistrement…' : !xpSaved ? ' · non enregistrés' : ' gagnés' }}</span></div><div><strong>{{ lastDist.toLocaleString('fr-FR') }}</strong><span>mètres de la cible</span></div></div>
            <div class="badges result-badges"><span v-if="current.answerArea && lastInsideAnswerArea === false" class="badge danger">Hors zone — 0 XP</span><span v-else-if="inBuffer" class="badge success"><Check :size="12" /> Dans la zone bonus</span><span v-if="streak.brokenPrev != null" class="badge warn">Série cassée après {{ streak.brokenPrev }}</span></div>
          </template>
          <template v-else>
            <p class="guess-hint"><MapPin :size="18" /><span>{{ guess ? 'Ton repère est placé. Prêt à valider ?' : 'Place ton repère sur la carte.' }}</span></p>
            <small v-if="guess" class="coordinates">{{ guess.lat.toFixed(3) }}°, {{ (((guess.lng + 180) % 360 + 360) % 360 - 180).toFixed(3) }}°</small>
          </template>
          <p v-if="error" class="alert" role="alert">{{ showResult && !xpSaved ? 'XP non enregistrés : ' : '' }}{{ error }}</p>
          <button v-if="showResult" type="button" class="btn btn-primary btn-lg btn-block" :disabled="validating || loading" @click="nextQuestion">Question suivante <ArrowRight :size="18" /></button>
          <button v-else type="button" class="btn btn-primary btn-lg btn-block" :disabled="!guess || !current || loading || validating" @click="validateGuess"><span v-if="validating" class="spinner" /><Check v-else :size="19" />{{ validating ? 'Validation…' : 'Valider' }}<kbd class="enter-hint">↵</kbd></button>
        </section>
      </Transition>
    </div>

    <Transition name="hud">
      <div v-if="questionPanelOpen && current" class="question-backdrop" @click.self="closeQuestion">
        <section id="quiz-question-dialog" ref="questionDialog" class="hud-card question-dialog" role="dialog" aria-modal="true" aria-labelledby="question-panel-title" tabindex="-1" @keydown="trapQuestionFocus" @keydown.esc.stop="closeQuestion">
          <header class="between"><span id="question-panel-title" class="eyebrow">Question en cours</span><button type="button" class="icon-button sm" aria-label="Fermer le panneau question" @click="closeQuestion"><X :size="18" /></button></header>
          <GameQuestionDetails :key="current.id" v-model:borders="borders" :current="current" :active-theme="headingTheme ?? activeTheme" :show-theme-heading="activeThemeId === MIX_THEME_ID" :ai-enrich-configured="app.aiEnrichConfigured !== false" text-class="question-full-text" />
          <p v-if="current.answerArea || current.hasAnswerArea" class="notice">Zone polygone : un clic à l’intérieur donne l’XP maximum de la manche ; hors zone = 0 XP.</p>
          <button type="button" class="btn btn-primary btn-block" @click="closeQuestion">Revenir à la carte</button>
        </section>
      </div>
    </Transition>
    </div>

    <Teleport to="body">
      <div v-if="historyHintOpen" class="modal-backdrop" role="presentation" @click.self="historyHintOpen = false">
        <section class="modal sm" role="dialog" aria-modal="true" aria-labelledby="history-hint-title" @keydown.esc.stop="historyHintOpen = false">
          <header class="modal-header"><h2 id="history-hint-title">À la trace de l’histoire</h2><button type="button" class="icon-button sm" aria-label="Fermer" @click="historyHintOpen = false"><X :size="18" /></button></header>
          <div class="modal-body stack-sm"><img :src="asset('mascot/mascot.jpg')" alt="" class="history-mascot" /><p>Découvre des aventures guidées, étape par étape, avec suivi du parcours sur la carte.</p></div>
          <footer class="modal-footer"><button type="button" class="btn btn-secondary" @click="historyHintOpen = false">Fermer</button><RouterLink to="/histoire" class="btn btn-primary">Commencer <ArrowRight :size="16" /></RouterLink></footer>
        </section>
      </div>
    </Teleport>
    <ThemeCreateModal v-model:open="themeModal" :on-created="refreshData" />
    <ThemeBrowserModal v-model:open="themeDirectoryOpen" :themes="app.themes" :theme-stats="app.themeStats" :is-guest="isGuest" :on-select-theme="selectBrowserTheme" />
    <LeaderboardModal v-model:open="boardOpen" v-model:theme-id="boardThemeId" :themes="app.themes" :history-adventures="app.historyAdventures ?? []" />
  </div>
</template>

<style scoped>
.quiz-stage { isolation: isolate; display: flex; flex-direction: column; background: #dfe9f3; }

/* Bandeau compact au-dessus de la carte */
.quiz-header { position: relative; z-index: 700; display: grid; gap: 6px; padding: 7px 14px 8px; background: #fffffff7; border-bottom: 1px solid var(--border); box-shadow: 0 1px 2px #0f172a0d; }
.header-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.header-stats, .header-modes, .header-tools, .theme-tools { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.header-modes { padding-left: 10px; border-left: 1px solid var(--border); flex: 0 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; padding-block: 2px 5px; margin-block: -2px -5px; }
.header-modes::-webkit-scrollbar { display: none; }
.header-modes > * { flex-shrink: 0; }
.header-tools { margin-left: auto; }
.header-stats .badge { white-space: nowrap; }
.guest-pill { position: relative; }
.guest-pill summary { list-style: none; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 650; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; }
.guest-pill summary::-webkit-details-marker { display: none; }
.header-popover, .help-menu { position: absolute; top: calc(100% + 8px); z-index: 760; padding: 14px; width: 270px; box-shadow: var(--shadow-lg); font-size: 12px; }
.header-popover { left: 0; color: var(--text); }
.header-popover p { color: var(--muted); }
.help-root { position: relative; }
.help-menu { right: 0; width: 250px; font-size: 13px; }
.help-menu a:hover { color: var(--primary); }
.borders-switch { display: flex; align-items: center; gap: 5px; padding-inline: 4px; font-size: 12px; color: var(--muted); cursor: pointer; }
.history-shortcut { position: relative; }
.history-shortcut img { width: 22px; height: 22px; border-radius: 7px; object-fit: cover; }
.history-shortcut span { position: absolute; bottom: -5px; right: -5px; border-radius: 4px; font-size: 7px; font-weight: 750; background: var(--primary); color: white; padding: 0 3px; }
.theme-row { gap: 8px; }
.theme-strip { display: flex; flex: 1; min-width: 0; gap: 5px; overflow-x: auto; scrollbar-width: none; mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent); }
.theme-strip::-webkit-scrollbar { display: none; }
.theme-chip { display: inline-flex; align-items: center; flex-shrink: 0; gap: 4px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); padding: 4px 9px; font-size: 12px; font-weight: 600; color: #526174; white-space: nowrap; }
.theme-chip:hover { border-color: var(--primary-ring); }
.theme-chip.selected { color: var(--primary-strong); background: var(--primary-soft); border-color: #99d9d1; }
.create-chip { border-style: dashed; border-color: var(--border-strong); background: transparent; }
.theme-tools .btn { padding-block: 4px; }

/* Carte : seule la question (et la validation) y flottent */
.quiz-map-area { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.quiz-map { position: absolute; inset: 0; z-index: 0; }
.map-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: #8eaaa9; background: radial-gradient(ellipse at center, #eef7f4, #d9e7ee); }
.question-anchor { top: 12px; left: 50%; transform: translateX(-50%); width: min(520px, calc(100% - 120px)); }
.question-summary { width: 100%; padding: 10px 14px; display: grid; gap: 4px; text-align: left; color: var(--text); transition: border-color .2s, box-shadow .2s; }
.question-summary:hover { border-color: var(--primary); }
.question-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); }
.question-heading { display: flex; align-items: center; gap: 12px; }
.question-heading strong { font-size: 15px; line-height: 1.4; font-weight: 700; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.question-heading img { max-height: 48px; width: 56px; object-fit: contain; border-radius: 8px; flex-shrink: 0; }
.details-label { color: var(--primary-strong); display: inline-flex; gap: 4px; align-items: center; }
.shortcut-error { left: 12px; top: 12px; max-width: min(400px, calc(100% - 24px)); z-index: 720; }
.quiz-action { right: 16px; bottom: 26px; width: min(360px, calc(100% - 32px)); }
.action-card { padding: 14px; display: grid; gap: 10px; }
.guess-hint { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--muted); }
.guess-hint svg { color: var(--primary); }
.coordinates { padding-left: 27px; font-variant-numeric: tabular-nums; }
.enter-hint { margin-left: auto; border: 1px solid #ffffff65; border-radius: 5px; font-size: 13px; padding: 0 5px; }
.result-label { margin-bottom: 0; }
.result-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.result-stats > div { display: flex; flex-direction: column; gap: 1px; }
.result-stats > div + div { border-left: 1px solid var(--border); padding-left: 18px; }
.result-stats strong { font-size: 26px; line-height: 1.2; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
.result-stats .xp-gain { color: var(--primary-strong); }
.result-stats span { font-size: 11px; color: var(--muted); }
.result-badges:empty { display: none; }
.empty-overlay { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(440px, calc(100% - 32px)); text-align: center; }
.question-backdrop { position: absolute; inset: 0; z-index: 800; background: #0f172a40; backdrop-filter: blur(3px); display: flex; justify-content: center; align-items: flex-end; padding: 22px; }
.question-dialog { display: grid; gap: 20px; width: min(560px, 100%); padding: 22px; max-height: calc(100% - 40px); overflow-y: auto; background: white; }
.question-dialog .eyebrow { margin: 0; }
.question-dialog :deep(.question-full-text) { font-size: 19px; line-height: 1.5; font-weight: 700; color: var(--ink); }
.history-mascot { width: 80px; height: 80px; object-fit: cover; border-radius: 18px; }
.hud-enter-active, .hud-leave-active { transition: opacity .18s ease, transform .18s ease; }
.hud-enter-from, .hud-leave-to { opacity: 0; transform: translateY(12px); }
.question-anchor .hud-enter-from, .question-anchor .hud-leave-to { transform: translateY(-8px); }

@media (max-width: 1100px) {
  .borders-switch .desktop-label, .header-tools .desktop-label, .guest-pill .desktop-label { display: none; }
}
@media (max-width: 767px) {
  .quiz-stage { max-height: calc(100dvh - var(--topbar-h) - var(--mobile-nav-h) - env(safe-area-inset-bottom)); }
  .quiz-header { padding: 6px 8px 7px; gap: 6px; }
  .header-row { gap: 6px; }
  .header-stats, .header-modes, .header-tools, .theme-tools { gap: 4px; }
  .header-modes { padding-left: 6px; }
  .desktop-label, .borders-switch { display: none; }
  .header-stats .badge { padding: 3px 7px; font-size: 11px; }
  .guest-pill summary { padding: 3px 6px; }
  .header-modes .icon-button.sm, .header-tools .icon-button.sm { width: 30px; height: 30px; }
  .header-tools .btn-sm { padding: 5px 8px; }
  .header-popover { position: fixed; left: 8px; right: 8px; top: auto; width: auto; margin-top: 8px; }
  .help-menu { width: min(250px, calc(100vw - 24px)); }
  .theme-chip { padding: 4px 8px; font-size: 11px; }
  .theme-tools .btn { padding: 4px 7px; }
  .question-anchor { top: 8px; left: 52px; right: 8px; width: auto; transform: none; }
  .question-summary { padding: 8px 11px; gap: 3px; border-radius: 13px; }
  .question-heading strong { font-size: 13px; }
  .question-heading img { width: 38px; max-height: 40px; }
  .question-meta { font-size: 10px; }
  .quiz-action { left: 8px; right: 8px; bottom: 16px; width: auto; }
  .action-card { padding: 10px 12px; gap: 8px; border-radius: 16px; }
  .guess-hint { font-size: 12px; }
  .coordinates { display: none; }
  .result-stats strong { font-size: 22px; }
  .result-badges { gap: 4px; }
  .question-backdrop { padding: 0; }
  .question-dialog { width: 100%; max-height: 80%; border-radius: 20px 20px 0 0; padding: 18px 18px 24px; }
}
@media (max-width: 380px) {
  .header-modes { border-left: 0; padding-left: 0; }
  .header-stats .badge.neutral { display: none; }
}
@media (max-height: 650px) {
  .question-heading strong { -webkit-line-clamp: 1; }
  .action-card { gap: 7px; padding: 10px; }
}
</style>
