<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BookOpen, ChevronDown, ChevronUp, Info, Trophy } from 'lucide-vue-next'
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
const stepPanelOpen = ref(true)
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
  lastInBuffer.value = false; lastInsideAnswerArea.value = undefined; xpErr.value = ''; stepPanelOpen.value = true
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
  <section class="map-stage history-stage" aria-label="À la trace de l’histoire">
    <GeoMap v-model:guess="challengeGuess" :interactive="!challengeShowResult && !validateBusy" :answer="challengeAnswer" :answer-area="challengeAnswerArea" :show-result="challengeShowResult" :show-basemap-selector="challengeShowResult" :allow-overlay-translation="true" :tolerance-m="challengeToleranceM" :borders="true" :story-enabled="true" :story-layer-with-result="true" :story-reveal-on-resolve="true" :story-resolved-step-ids="resolvedStepIds" :story-steps="activeAdventure?.steps ?? []" :story-active-step-index="activeAdventure ? stepIndex : -1" />
    <div class="map-overlay story-toolbar"><div class="hud-card actions toolbar-card">
      <button type="button" class="btn btn-secondary btn-sm" :disabled="validateBusy" :aria-expanded="adventureBrowserOpen" @click="adventureBrowserOpen = true"><BookOpen :size="16" /> Choix de l’histoire</button>
      <button v-if="activeAdventure" type="button" class="icon-button sm" aria-label="Intro de l’aventure" @click="introPopupOpen = true"><Info :size="17" /></button>
      <button type="button" class="btn btn-ghost btn-sm" @click="openHistoryLeaderboard"><Trophy :size="16" /> Classements</button>
      <GoogleTranslateLangBar embedded compact />
    </div></div>
    <div v-if="!activeAdventure && !adventureBrowserOpen" class="map-overlay story-empty"><div class="hud-card panel stack-sm">
      <span class="eyebrow">À la trace de l’histoire</span><h2>Choisis une aventure</h2>
      <p class="muted">{{ historyAdventures.length ? 'Sélectionne un parcours pour commencer à explorer la carte.' : 'Aucune aventure disponible pour le moment.' }}</p>
      <button v-if="historyAdventures.length" type="button" class="btn btn-primary" @click="adventureBrowserOpen = true">Voir les aventures</button>
    </div></div>
    <div v-if="activeStep && activeAdventure" class="map-overlay chapter-overlay">
      <article class="hud-card chapter-card">
        <button type="button" class="chapter-heading" :aria-expanded="stepPanelOpen" aria-controls="story-step-content" @click="stepPanelOpen = !stepPanelOpen">
          <img :src="asset('mascot/mascot.jpg')" alt="Le pingouin explorateur" class="mascot" />
          <span class="chapter-title"><small class="eyebrow">Étape {{ stepIndex + 1 }} / {{ activeAdventure.steps.length }}</small><strong>{{ activeStep.title }}</strong><small>{{ activeStep.year }} · {{ activeAdventure.title }}</small></span>
          <ChevronDown v-if="stepPanelOpen" :size="19" /><ChevronUp v-else :size="19" />
        </button>
        <progress :value="stepIndex + (currentStepChallengeDone ? 1 : 0)" :max="activeAdventure.steps.length" aria-label="Progression de l’aventure" />
        <div v-if="stepPanelOpen" id="story-step-content" class="chapter-body stack-sm">
          <p v-if="activeStep.narration.trim()" class="text-pre narration">{{ activeStep.narration }}</p>
          <div class="challenge-prompt"><span class="eyebrow">Défi géo</span><p>{{ activeStep.miniChallenge.question }}</p><small>{{ challengeAnswerArea ? 'Clique dans la zone attendue sur la carte.' : `Clique sur la carte pour placer ta réponse (~${formatToleranceRadiusKm(challengeToleranceM)} km).` }}</small></div>
          <button v-if="!challengeShowResult" type="button" class="btn btn-ghost btn-sm" @click="stepPanelOpen = false">Revenir à la carte</button>
        </div>
        <div class="chapter-footer stack-sm">
          <div v-if="challengeShowResult" class="notice" role="status"><strong>+{{ lastXp.toLocaleString('fr-FR') }} XP</strong><span v-if="lastInsideAnswerArea"> · dans la zone</span><span v-else-if="lastInBuffer"> · dans la tolérance</span><p>Écart {{ distanceLabel }}</p><p v-if="isFinished">Bravo, tu as terminé cette aventure !</p></div>
          <small v-else>{{ challengeGuess ? 'Réponse placée sur la carte.' : 'Place ta réponse sur la carte.' }}</small>
          <p v-if="!challengeGuessInZone && !challengeShowResult" class="field-error">Place ton point dans la zone attendue avant de valider.</p>
          <p class="subtle">{{ adventureXp.toLocaleString('fr-FR') }} XP (aventure) · {{ historyXpTotal.toLocaleString('fr-FR') }} XP (histoire)</p>
          <p v-if="xpErr" class="alert" role="alert">{{ xpErr }}</p>
          <div class="chapter-actions"><button type="button" class="btn btn-secondary btn-sm" :disabled="validateBusy" @click="restartAdventure">Rejouer</button><button type="button" class="btn btn-primary btn-sm" :disabled="!challengeGuess || challengeShowResult || !challengeGuessInZone || validateBusy" @click="validateChallenge">{{ validateBusy ? 'Enregistrement…' : challengeShowResult ? 'Validé' : 'Valider le défi' }}</button><button type="button" class="btn btn-secondary btn-sm" :disabled="isFinished || !currentStepChallengeDone || validateBusy" @click="nextStep">{{ isFinished ? 'Terminé' : 'Étape suivante' }}</button></div>
        </div>
      </article>
    </div>
  </section>
  <Teleport to="body"><div v-if="introPopupOpen && activeAdventure" class="modal-backdrop" @click.self="introPopupOpen = false"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="adventure-intro-title" tabindex="-1"><header class="modal-header"><h2 id="adventure-intro-title">{{ activeAdventure.title }}</h2><button type="button" class="btn btn-ghost btn-sm" @click="introPopupOpen = false">Fermer</button></header><div class="modal-body stack-sm"><HistoryAdventureCover :cover-image-url="activeAdventure.coverImageUrl" :emoji="activeAdventure.emoji" :title="activeAdventure.title" class="intro-cover" /><span class="eyebrow">Intro de l’aventure</span><p class="subtle">{{ activeAdventure.period }} · {{ activeAdventure.steps.length }} étapes</p><p class="text-pre">{{ activeAdventure.description }}</p></div></section></div></Teleport>
  <HistoryAdventureBrowserModal v-model:open="adventureBrowserOpen" :adventures="historyAdventures" :selected-id="adventureId" :on-select-adventure="pickAdventure" />
  <LeaderboardModal v-model:open="historyBoardOpen" v-model:theme-id="historyBoardThemeId" :themes="app.themes" :history-adventures="historyAdventures" />
</template>

<style scoped>
.history-stage{height:100%;isolation:isolate}.story-toolbar{left:60px;right:16px;top:14px;display:flex;justify-content:flex-end;z-index:1100}.toolbar-card{padding:8px;gap:6px}.story-empty{inset:90px 20px 20px;display:grid;place-items:center}.story-empty>div{max-width:420px;text-align:center}.chapter-overlay{right:18px;bottom:18px;width:min(430px,calc(100% - 36px));z-index:1050}.chapter-card{overflow:hidden;max-height:calc(100dvh - var(--topbar-h) - 110px);overflow-y:auto}.chapter-heading{display:flex;align-items:center;gap:12px;padding:16px;width:100%;text-align:left;border:0;background:transparent;color:var(--ink)}.mascot{height:46px;width:46px;object-fit:contain;border-radius:12px;background:var(--primary-soft)}.chapter-title{display:grid;gap:3px;flex:1;min-width:0}.chapter-title .eyebrow{margin:0;font-size:10px}.chapter-title strong{font-size:17px;line-height:1.3}.chapter-title small:last-child{font-size:11px}.chapter-card progress{display:block;width:100%;height:4px;accent-color:var(--primary);border:0}.chapter-body{padding:16px}.narration{font-size:14px}.challenge-prompt{padding:13px;background:var(--accent-soft);border-radius:12px}.challenge-prompt .eyebrow{color:#92400e;margin-bottom:6px}.challenge-prompt p{font-weight:600;font-size:14px}.challenge-prompt small{display:block;margin-top:8px}.chapter-footer{padding:14px 16px;border-top:1px solid var(--border)}.chapter-actions{display:flex;gap:6px}.chapter-actions .btn{flex:1;padding-inline:8px;white-space:normal}.intro-cover{width:100%;height:180px;border-radius:12px}
@media(max-width:767px){.story-toolbar{top:8px;left:50px;right:8px}.toolbar-card{gap:3px;padding:5px;flex-wrap:wrap;justify-content:flex-end}.toolbar-card .btn{font-size:11px;padding:5px 7px}.chapter-overlay{right:0;left:0;bottom:0;width:100%}.chapter-card{border-radius:18px 18px 0 0;max-height:58dvh}.chapter-heading{padding:10px 14px}.chapter-title strong{font-size:15px}.chapter-body{padding:12px 14px}.chapter-footer{padding:10px 14px}.chapter-actions .btn{font-size:11px}.chapter-footer .subtle{font-size:11px}.mascot{width:38px;height:38px}}
</style>
