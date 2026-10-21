<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, Info, MapPin, RotateCcw, Trophy } from 'lucide-vue-next'
import GeoMap from '../components/GeoMap.vue'
import GoogleTranslateLangBar from '../components/GoogleTranslateLangBar.vue'
import HistoryAdventureBrowserModal from '../components/HistoryAdventureBrowserModal.vue'
import HistoryAdventureCover from '../components/HistoryAdventureCover.vue'
import LeaderboardModal from '../components/LeaderboardModal.vue'
import { api, errorMessage } from '$lib/api'
import { app, refreshApp } from '$lib/appStore'
import { asset } from '$lib/appUrl'
import type { StoryAdventure } from '$lib/historyAdventures'
import { historyXpThemeId, HISTORY_XP_GLOBAL_THEME_ID } from '$lib/historyXp'
import { formatToleranceRadiusKm } from '$lib/geo/score'
import { isPointInAnswerArea } from '$lib/geo/polygon'
import { fixGoogleTranslateScrollLayout, scheduleTranslateRefresh } from '$lib/googleTranslateBrowser'

const historyAdventures = ref<StoryAdventure[]>(app.historyAdventures)
const adventureId = ref<string | null>(null)
const adventureBrowserOpen = ref(false)
const introPopupOpen = ref(false)
const stepPanelOpen = ref(false)
const historyBoardOpen = ref(false)
const historyBoardThemeId = ref('')
const stepIndex = ref(0)
const challengeGuess = ref<{ lat: number; lng: number } | null>(null)
const challengeShowResult = ref(false)
const challengeDoneByStep = ref<Record<string, boolean>>({})
const validateBusy = ref(false)
const lastXp = ref(0)
const lastDistM = ref(0)
const lastInBuffer = ref(false)
const lastInsideAnswerArea = ref<boolean>()
const xpErr = ref('')
const activeAdventure = computed(() => historyAdventures.value.find(a => a.id === adventureId.value) ?? null)
const activeStep = computed(() => activeAdventure.value?.steps[stepIndex.value] ?? null)
const challengeAnswer = computed(() => activeStep.value ? { lat: activeStep.value.challengeLat ?? activeStep.value.lat, lng: activeStep.value.challengeLng ?? activeStep.value.lng } : null)
const challengeAnswerArea = computed(() => activeStep.value?.challengeAnswerArea ?? null)
const challengeToleranceM = computed(() => Math.max(10_000, Math.round(activeStep.value?.miniChallenge.toleranceM ?? 250_000)))
const challengeGuessInZone = computed(() => !challengeGuess.value || !challengeAnswerArea.value || isPointInAnswerArea(challengeGuess.value.lat, challengeGuess.value.lng, challengeAnswerArea.value))
const resolvedStepIds = computed(() => Object.keys(challengeDoneByStep.value).filter(id => challengeDoneByStep.value[id]))
const currentStepChallengeDone = computed(() => Boolean(activeStep.value && challengeDoneByStep.value[activeStep.value.id]))
const isFinished = computed(() => stepIndex.value >= (activeAdventure.value?.steps.length ?? 1) - 1)
const adventureXp = computed(() => Math.round(app.player?.xpByTheme?.[historyXpThemeId(adventureId.value ?? '')] ?? 0))
const historyXpTotal = computed(() => Math.round(app.player?.xpByTheme?.[HISTORY_XP_GLOBAL_THEME_ID] ?? 0))
const distanceLabel = computed(() => lastDistM.value >= 1000 ? `${(lastDistM.value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : `${lastDistM.value.toLocaleString('fr-FR')} m`)
function resetChallenge() {
  challengeGuess.value = null; challengeShowResult.value = false; lastXp.value = 0; lastDistM.value = 0
  lastInBuffer.value = false; lastInsideAnswerArea.value = undefined; xpErr.value = ''; stepPanelOpen.value = false
}
watch(() => `${adventureId.value}/${activeStep.value?.id ?? ''}`, resetChallenge)
watch(() => app.historyAdventures, value => { historyAdventures.value = value })
watch(historyAdventures, value => {
  if (adventureId.value && !value.some(a => a.id === adventureId.value)) { adventureId.value = null; stepIndex.value = 0 }
  if (!adventureId.value && value.length && !pickerShown) openInitialPicker()
})
watch([stepPanelOpen, introPopupOpen, adventureBrowserOpen, activeStep], () => scheduleTranslateRefresh(), { flush: 'post' })
function pickAdventure(id: string) {
  adventureId.value = id; stepIndex.value = 0; introPopupOpen.value = false; pickerShown = true; resetChallenge()
}
function restartAdventure() { stepIndex.value = 0; challengeDoneByStep.value = {}; resetChallenge() }
function nextStep() { if (!validateBusy.value && currentStepChallengeDone.value && !isFinished.value) stepIndex.value++ }
/** Enregistre une tentative de défi histoire et marque l’étape comme terminée après succès. */
async function validateChallenge() {
  const step = activeStep.value; const adventure = activeAdventure.value; const guess = challengeGuess.value
  if (!step || !adventure || !guess || challengeShowResult.value || validateBusy.value || !challengeGuessInZone.value) return
  validateBusy.value = true; xpErr.value = ''
  try {
    const result = await api<{ xp?: number; distanceM?: number; inBuffer?: boolean; insideAnswerArea?: boolean }>('/player/history-xp', { method: 'POST', body: { adventureId: adventure.id, stepId: step.id, guessLat: guess.lat, guessLng: guess.lng } })
    challengeDoneByStep.value = { ...challengeDoneByStep.value, [step.id]: true }
    if (adventureId.value === adventure.id && activeStep.value?.id === step.id) {
      lastXp.value = Math.round(result.xp ?? 0); lastDistM.value = Math.round(result.distanceM ?? 0)
      lastInBuffer.value = result.inBuffer === true; lastInsideAnswerArea.value = result.insideAnswerArea
      challengeShowResult.value = true; stepPanelOpen.value = true
    }
    await refreshApp()
  } catch (err) { xpErr.value = errorMessage(err, 'Enregistrement XP impossible') }
  finally { validateBusy.value = false }
}
function openHistoryLeaderboard() {
  historyBoardThemeId.value = adventureId.value ? historyXpThemeId(adventureId.value) : HISTORY_XP_GLOBAL_THEME_ID
  historyBoardOpen.value = true
}
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  introPopupOpen.value = false; stepPanelOpen.value = false; adventureBrowserOpen.value = false; historyBoardOpen.value = false
}
let pickerShown = false
let mounted = true
const controller = new AbortController()
const layoutTimers: number[] = []
function openInitialPicker() {
  if (pickerShown || adventureId.value || !historyAdventures.value.length) return
  adventureBrowserOpen.value = true; pickerShown = true
}
onMounted(async () => {
  openInitialPicker(); document.addEventListener('keydown', onKey)
  fixGoogleTranslateScrollLayout()
  layoutTimers.push(...[100, 400, 1000].map(ms => window.setTimeout(fixGoogleTranslateScrollLayout, ms)))
  try {
    const result = await api<{ adventures: StoryAdventure[] }>('/history-adventures', { signal: controller.signal })
    if (mounted && Array.isArray(result.adventures)) historyAdventures.value = result.adventures
  } catch { /* Les aventures du bootstrap restent disponibles hors réseau. */ }
  if (mounted) openInitialPicker()
})
onBeforeUnmount(() => { mounted = false; controller.abort(); document.removeEventListener('keydown', onKey); layoutTimers.forEach(clearTimeout) })
</script>

<template>
  <section class="history-stage" aria-label="À la trace de l’histoire">
    <header class="story-toolbar">
      <div class="story-brand">
        <img :src="asset('mascot/mascot.jpg')" alt="" class="mascot" />
        <div><h1>À la trace de l’histoire</h1><p v-if="activeAdventure">{{ activeAdventure.title }} · {{ activeAdventure.period }}</p></div>
      </div>
      <div class="actions toolbar-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="validateBusy" :aria-expanded="adventureBrowserOpen" @click="adventureBrowserOpen = true"><BookOpen :size="16" /> Choisir une aventure</button>
        <button v-if="activeAdventure" type="button" class="icon-button sm" title="Introduction de l’aventure" aria-label="Intro de l’aventure" @click="introPopupOpen = true"><Info :size="17" /></button>
        <button type="button" class="icon-button sm" title="Classements histoire" aria-label="Classements histoire" @click="openHistoryLeaderboard"><Trophy :size="17" /></button>
        <GoogleTranslateLangBar embedded compact />
      </div>
    </header>
    <div v-if="!activeAdventure && !adventureBrowserOpen" class="story-empty stack-sm">
      <h2>Choisis une aventure</h2>
      <p class="muted">{{ historyAdventures.length ? 'Sélectionne un parcours pour commencer à explorer la carte.' : 'Aucune aventure disponible pour le moment.' }}</p>
      <button v-if="historyAdventures.length" type="button" class="btn btn-primary" @click="adventureBrowserOpen = true"><BookOpen :size="16" /> Voir les aventures</button>
    </div>
    <article v-if="activeStep && activeAdventure" class="chapter-card">
      <div class="chapter-heading">
        <div class="chapter-title"><span class="eyebrow">Étape {{ stepIndex + 1 }} / {{ activeAdventure.steps.length }} · {{ activeStep.year }}</span><h2>{{ activeStep.title }}</h2></div>
        <button v-if="activeStep.narration.trim()" type="button" class="btn btn-ghost btn-sm" :aria-expanded="stepPanelOpen" aria-controls="story-step-content" @click="stepPanelOpen = !stepPanelOpen"><BookOpen :size="15" /> Le récit <ChevronUp v-if="stepPanelOpen" :size="16" /><ChevronDown v-else :size="16" /></button>
      </div>
      <progress :value="stepIndex + (currentStepChallengeDone ? 1 : 0)" :max="activeAdventure.steps.length" aria-label="Progression de l’aventure" />
      <p v-if="stepPanelOpen && activeStep.narration.trim()" id="story-step-content" class="text-pre narration">{{ activeStep.narration }}</p>
      <div class="challenge-prompt"><p>{{ activeStep.miniChallenge.question }}</p><small>{{ challengeAnswerArea ? 'Zone à localiser sur la carte' : `Tolérance : ~${formatToleranceRadiusKm(challengeToleranceM)} km` }}</small></div>
    </article>
    <div class="story-map">
      <GeoMap v-model:guess="challengeGuess" :interactive="!!activeStep && !challengeShowResult && !validateBusy" :answer="challengeAnswer" :answer-area="challengeAnswerArea" :show-result="challengeShowResult" :show-basemap-selector="challengeShowResult" :allow-overlay-translation="true" :tolerance-m="challengeToleranceM" :borders="true" :story-enabled="true" :story-layer-with-result="true" :story-reveal-on-resolve="true" :story-resolved-step-ids="resolvedStepIds" :story-steps="activeAdventure?.steps ?? []" :story-active-step-index="activeAdventure ? stepIndex : -1" />
    </div>
    <footer v-if="activeStep && activeAdventure" class="chapter-footer">
      <div class="chapter-status">
        <div v-if="challengeShowResult" class="challenge-result" role="status"><strong>+{{ lastXp.toLocaleString('fr-FR') }} XP</strong><span v-if="lastInsideAnswerArea">Dans la zone</span><span v-else-if="lastInBuffer">Dans la tolérance</span><span>Écart {{ distanceLabel }}</span><p v-if="isFinished">Aventure terminée !</p></div>
        <p v-else class="guess-status"><MapPin :size="17" />{{ challengeGuess ? 'Réponse placée sur la carte.' : 'Place ta réponse sur la carte.' }}</p>
        <p class="subtle">{{ adventureXp.toLocaleString('fr-FR') }} XP aventure · {{ historyXpTotal.toLocaleString('fr-FR') }} XP histoire</p>
      </div>
      <div class="chapter-actions">
        <button type="button" class="icon-button" title="Rejouer l’aventure" aria-label="Rejouer l’aventure" :disabled="validateBusy" @click="restartAdventure"><RotateCcw :size="17" /></button>
        <button v-if="!challengeShowResult" type="button" class="btn btn-primary" :disabled="!challengeGuess || !challengeGuessInZone || validateBusy" @click="validateChallenge"><span v-if="validateBusy" class="spinner" /><Check v-else :size="17" />{{ validateBusy ? 'Enregistrement…' : 'Valider le défi' }}</button>
        <button v-else-if="isFinished" type="button" class="btn btn-primary" @click="adventureBrowserOpen = true"><BookOpen :size="17" /> Autre aventure</button>
        <button v-else type="button" class="btn btn-primary" :disabled="!currentStepChallengeDone || validateBusy" @click="nextStep">Étape suivante <ArrowRight :size="17" /></button>
      </div>
      <p v-if="!challengeGuessInZone && !challengeShowResult" class="field-error chapter-feedback">Place ton point dans la zone attendue avant de valider.</p>
      <p v-if="xpErr" class="alert chapter-feedback" role="alert">{{ xpErr }}</p>
    </footer>
  </section>
  <Teleport to="body"><div v-if="introPopupOpen && activeAdventure" class="modal-backdrop" @click.self="introPopupOpen = false"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="adventure-intro-title" tabindex="-1"><header class="modal-header"><h2 id="adventure-intro-title">{{ activeAdventure.title }}</h2><button type="button" class="btn btn-ghost btn-sm" @click="introPopupOpen = false">Fermer</button></header><div class="modal-body stack-sm"><HistoryAdventureCover :cover-image-url="activeAdventure.coverImageUrl" :emoji="activeAdventure.emoji" :title="activeAdventure.title" class="intro-cover" /><span class="eyebrow">Intro de l’aventure</span><p class="subtle">{{ activeAdventure.period }} · {{ activeAdventure.steps.length }} étapes</p><p class="text-pre">{{ activeAdventure.description }}</p></div></section></div></Teleport>
  <HistoryAdventureBrowserModal v-model:open="adventureBrowserOpen" :adventures="historyAdventures" :selected-id="adventureId" :on-select-adventure="pickAdventure" />
  <LeaderboardModal v-model:open="historyBoardOpen" v-model:theme-id="historyBoardThemeId" :themes="app.themes" :history-adventures="historyAdventures" />
</template>

<style scoped>
.history-stage { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 1320px; margin: 0 auto; padding: 14px 24px 24px; min-width: 0; }
.story-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.story-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.story-brand h1 { font-size: 18px; line-height: 1.4; overflow-wrap: anywhere; }
.story-brand p { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.mascot { height: 42px; width: 42px; flex: none; object-fit: cover; border-radius: 8px; }
.toolbar-actions { gap: 6px; }
.story-empty { padding: 18px 0; justify-items: start; }
.chapter-card { display: grid; gap: 10px; min-width: 0; }
.chapter-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.chapter-heading .btn { flex-shrink: 0; }
.chapter-title { display: grid; gap: 4px; min-width: 0; }
.chapter-title .eyebrow { margin: 0; font-size: 11px; }
.chapter-title h2 { font-size: 19px; line-height: 1.4; overflow-wrap: anywhere; }
.chapter-card progress { display: block; width: 100%; height: 4px; accent-color: var(--primary); border: 0; }
.narration { font-size: 14px; line-height: 1.65; color: var(--muted); }
.challenge-prompt { padding-left: 12px; border-left: 3px solid var(--accent); }
.challenge-prompt p { font-weight: 650; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
.challenge-prompt small { display: block; margin-top: 4px; color: var(--muted); }
.story-map { position: relative; height: clamp(360px, 57dvh, 720px); flex: none; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; isolation: isolate; }
.story-map :deep(.geo-map) { height: 100%; }
.chapter-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; padding: 0 0 14px; border-bottom: 1px solid var(--border); }
.chapter-status { display: grid; gap: 5px; min-width: 0; }
.guess-status { display: flex; align-items: center; gap: 7px; font-size: 14px; }
.guess-status svg { color: var(--primary); flex: none; }
.challenge-result { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; font-size: 13px; }
.challenge-result strong { color: var(--primary-strong); font-size: 22px; }
.challenge-result p { width: 100%; font-weight: 650; }
.chapter-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.chapter-feedback { width: 100%; }
.intro-cover { width: 100%; height: 180px; border-radius: 8px; }
@media (max-width: 767px) {
  .history-stage { padding: 12px 12px calc(var(--mobile-nav-h) + 20px + env(safe-area-inset-bottom)); gap: 12px; }
  .story-brand h1 { font-size: 16px; }
  .story-brand p { font-size: 11px; }
  .toolbar-actions { margin-left: auto; flex-wrap: wrap; }
  .chapter-title h2 { font-size: 17px; }
  .chapter-heading { align-items: flex-start; }
  .challenge-prompt p { font-size: 14px; }
  .story-map { height: clamp(260px, calc(100dvh - 540px), 520px); }
  .chapter-footer { align-items: flex-start; }
  .chapter-actions { flex-wrap: wrap; }
  .mascot { width: 36px; height: 36px; }
}
</style>
