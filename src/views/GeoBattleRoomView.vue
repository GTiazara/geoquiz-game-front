<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Check, Clock3, MapPin, RefreshCw, Swords, Trash2, Trophy, Users } from 'lucide-vue-next'
import { api, apiUrl, errorMessage } from '$lib/api'
import { app } from '$lib/appStore'
import { appUrl } from '$lib/appUrl'
import { formatToleranceRadiusKm } from '$lib/geo/score'
import { CUSTOM_GEO_BATTLE_THEME_ID } from '$lib/themes'
import type { GeoBattleLeaderboardRow, GeoBattleQuestionPublic, Question } from '$lib/types'
import GeoMap from '../components/GeoMap.vue'
import QuestionHeadingThumb from '../components/QuestionHeadingThumb.vue'
import ShareGeoBattleLink from '../components/ShareGeoBattleLink.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import GoogleTranslateLangBar from '../components/GoogleTranslateLangBar.vue'

type Point = { lat: number; lng: number }
type Answer = Point & { toleranceM: number }
type LimitedRoom = {
  phase: 'lobby' | 'round' | 'reveal' | 'finished'
  joined: { deviceId: string; pseudo: string }[]
  expected: number
  roundDeadlineAt: string | null
  validationSecLeft: number | null
  answerHidden: boolean
  readyForNextCount: number
  readyForNextIds: string[]
  myReadyForNext: boolean
}
type BattlePayload = {
  theme: { emoji: string; name: string } | null
  question: GeoBattleQuestionPublic | null
  questionIndex?: number
  totalQuestions?: number
  duelFinished?: boolean
  canDeleteDuel: boolean
  playLocked?: boolean
  myAttempt?: { guessLat: number; guessLng: number; distanceM: number; timeSec: number }
  answer?: Answer
  limited?: LimitedRoom
  unlimited?: { currentRound: number; awaitingAdvance: boolean; duelFinished: boolean }
}
const route = useRoute(), router = useRouter()
const battleId = String(route.params.id ?? '')
const path = `/geo-battle/${encodeURIComponent(battleId)}`
const shareUrl = appUrl(`/geobattle/${encodeURIComponent(battleId)}`)
const loading = ref(true)
const loadErr = ref('')
const actionErr = ref('')
const syncErr = ref('')
const themeLabel = ref<BattlePayload['theme']>(null)
const question = ref<GeoBattleQuestionPublic | null>(null)
const questionIndex = ref(0)
const totalQuestions = ref(1)
const duelFinished = ref(false)
const limited = ref<LimitedRoom | null>(null)
const unlimited = ref<BattlePayload['unlimited'] | null>(null)
const guess = ref<Point | null>(null)
const answer = ref<Answer | null>(null)
const playLocked = ref(false)
const lastDistanceM = ref<number | null>(null)
const leaderboard = ref<GeoBattleLeaderboardRow[]>([])
const canDeleteDuel = ref(false)
const submitBusy = ref(false)
const nextBusy = ref(false)
const deleteBusy = ref(false)
const deleteOpen = ref(false)
const borders = ref(true)
const panelOpen = ref(true)
const now = ref(Date.now())
const roundStartedAt = ref(Date.now())
const lockedTimeSec = ref(0)
const showResult = computed(() => !!answer.value && !!question.value)
const timeSec = computed(() => playLocked.value || showResult.value ? lockedTimeSec.value : Math.max(0, Math.floor((now.value - roundStartedAt.value) / 1000)))
const countdown = computed(() => {
  if (limited.value?.phase !== 'round') return null
  const end = limited.value.roundDeadlineAt ? Date.parse(limited.value.roundDeadlineAt) : NaN
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now.value) / 1000)) : limited.value.validationSecLeft
})
const interactive = computed(() => !!question.value && !duelFinished.value && !playLocked.value && !showResult.value && !submitBusy.value && (!limited.value || (limited.value.phase === 'round' && countdown.value !== 0)))
const canNext = computed(() => !duelFinished.value && (unlimited.value?.awaitingAdvance || limited.value?.phase === 'reveal'))
const nextLabel = computed(() => questionIndex.value + 1 >= totalQuestions.value ? (limited.value ? 'Voir le classement' : 'Terminer') : 'Question suivante')
const correctionPopup = computed(() => showResult.value && question.value ? {
  questionId: question.value.id,
  mediaEditable: app.player?.isGuest !== true && question.value.themeId !== CUSTOM_GEO_BATTLE_THEME_ID,
  title: question.value.text, imgUrl: question.value.imgUrl, youtubeUrl: question.value.youtubeUrl, description: question.value.description,
} : null)
const participantMarkers = computed(() => showResult.value ? leaderboard.value.map(row => ({
  label: `${row.pseudo}${row.isGuest ? ' · visiteur' : ''}`, lat: row.guessLat, lng: row.guessLng, isSelf: row.isCurrentPlayer === true,
})) : null)
function fmtTime(seconds: number) { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
function fmtDistance(distance: number) { return distance === 0 && question.value?.answerArea ? 'Dans la zone' : `${distance.toLocaleString('fr-FR')} m` }
const abort = new AbortController()
let disposed = false
let loadingRequest: Promise<void> | null = null
let reloadQueued = false
let lastRoundKey = ''
let timeoutFetchedFor = ''
let events: EventSource | null = null
let eventsDebounce: ReturnType<typeof setTimeout> | undefined
let tickTimer: ReturnType<typeof setInterval> | undefined
let backupTimer: ReturnType<typeof setInterval> | undefined
let leaderboardTimer: ReturnType<typeof setInterval> | undefined

async function refreshLeaderboard() {
  const roundKey = lastRoundKey
  const roundIndex = limited.value?.phase === 'reveal' ? questionIndex.value : undefined
  try {
    const result = await api<{ rows: GeoBattleLeaderboardRow[] }>(`${path}/leaderboard`, { query: { round: roundIndex }, signal: abort.signal })
    if (!disposed && roundKey === lastRoundKey) leaderboard.value = result.rows ?? []
  } catch { /* The room refresh will retry the ranking after a temporary network failure. */ }
}
function applyPayload(payload: BattlePayload) {
  const key = `${payload.questionIndex ?? 0}:${payload.question?.id ?? payload.limited?.phase ?? ''}`
  if (key !== lastRoundKey) {
    lastRoundKey = key
    guess.value = null; answer.value = null; lastDistanceM.value = null; playLocked.value = false
    lockedTimeSec.value = 0; roundStartedAt.value = Date.now(); timeoutFetchedFor = ''; leaderboard.value = []
  }
  themeLabel.value = payload.theme
  question.value = payload.question ?? null
  questionIndex.value = payload.questionIndex ?? questionIndex.value
  totalQuestions.value = payload.totalQuestions ?? totalQuestions.value
  limited.value = payload.limited ?? null
  unlimited.value = payload.unlimited ?? null
  duelFinished.value = payload.duelFinished === true || payload.unlimited?.duelFinished === true || payload.limited?.phase === 'finished'
  canDeleteDuel.value = payload.canDeleteDuel === true
  if (payload.answer && !answer.value && !payload.myAttempt) lockedTimeSec.value = timeSec.value
  playLocked.value = payload.playLocked === true
  answer.value = payload.answer ?? null
  if (payload.myAttempt) {
    guess.value = { lat: payload.myAttempt.guessLat, lng: payload.myAttempt.guessLng }
    lastDistanceM.value = payload.myAttempt.distanceM
    lockedTimeSec.value = payload.myAttempt.timeSec
  }
}
async function loadBattle(silent = false): Promise<void> {
  if (disposed) return
  if (loadingRequest) { reloadQueued = true; await loadingRequest; return }
  if (!silent) { loading.value = true; loadErr.value = '' }
  loadingRequest = (async () => {
    try {
      const payload = await api<BattlePayload>(path, { signal: abort.signal })
      if (disposed) return
      applyPayload(payload); syncErr.value = ''; loadErr.value = ''
      await refreshLeaderboard()
    } catch (e) {
      if (!disposed) {
        if (silent) syncErr.value = errorMessage(e, 'Connexion interrompue. Nouvelle tentative automatique…')
        else loadErr.value = errorMessage(e, 'Geobattle introuvable')
      }
    } finally { if (!disposed) loading.value = false }
  })()
  await loadingRequest
  loadingRequest = null
  if (reloadQueued && !disposed) { reloadQueued = false; await loadBattle(true) }
}
function openEvents() {
  if (disposed || events || duelFinished.value || typeof EventSource === 'undefined') return
  events = new EventSource(apiUrl(`${path}/events`))
  events.onmessage = event => {
    if (!event.data) return
    clearTimeout(eventsDebounce)
    eventsDebounce = setTimeout(() => { void loadBattle(true) }, 100)
  }
  events.onopen = () => { void loadBattle(true) }
  // EventSource reconnects automatically; the long poll also covers proxies and other server nodes.
}
watch(duelFinished, finished => {
  if (finished) { events?.close(); events = null; clearTimeout(eventsDebounce) }
  else openEvents()
})
watch(countdown, value => {
  if (value === 0 && limited.value?.phase === 'round' && timeoutFetchedFor !== lastRoundKey) {
    timeoutFetchedFor = lastRoundKey
    void loadBattle(true)
  }
})
onMounted(() => {
  void loadBattle().then(openEvents)
  tickTimer = setInterval(() => { now.value = Date.now() }, 250)
  backupTimer = setInterval(() => { if (!duelFinished.value) void loadBattle(true) }, 50_000)
  leaderboardTimer = setInterval(() => { if (showResult.value || duelFinished.value) void refreshLeaderboard() }, 90_000)
})
onBeforeUnmount(() => {
  disposed = true; abort.abort(); events?.close(); clearTimeout(eventsDebounce)
  clearInterval(tickTimer); clearInterval(backupTimer); clearInterval(leaderboardTimer)
})
async function submitRound() {
  if (!interactive.value || !guess.value || submitBusy.value) return
  submitBusy.value = true; actionErr.value = ''
  try {
    const result = await api<{ answer?: Answer; distanceM?: number; leaderboard?: GeoBattleLeaderboardRow[]; pendingReveal?: boolean }>(`${path}/score`, {
      method: 'POST', body: { ...guess.value, timeSec: limited.value ? Math.min(30, timeSec.value) : timeSec.value }, signal: abort.signal,
    })
    if (disposed) return
    lockedTimeSec.value = timeSec.value; playLocked.value = true
    lastDistanceM.value = result.distanceM ?? null
    if (result.answer) answer.value = result.answer
    if (result.leaderboard) leaderboard.value = result.leaderboard
    await loadBattle(true)
  } catch (e) { if (!disposed) actionErr.value = errorMessage(e, 'Enregistrement impossible') }
  finally { submitBusy.value = false }
}
async function nextRound() {
  if (nextBusy.value || !canNext.value || limited.value?.myReadyForNext) return
  nextBusy.value = true; actionErr.value = ''
  try { await api(`${path}/next-round`, { method: 'POST', signal: abort.signal }); await loadBattle(true) }
  catch (e) { if (!disposed) actionErr.value = errorMessage(e, 'Action impossible') }
  finally { nextBusy.value = false }
}
async function deleteBattle() {
  if (!canDeleteDuel.value || deleteBusy.value) return
  deleteBusy.value = true; actionErr.value = ''
  try {
    await api(path, { method: 'DELETE', signal: abort.signal })
    try {
      const recent: unknown = JSON.parse(localStorage.getItem('gp_geobattle_created') ?? '[]')
      if (Array.isArray(recent)) localStorage.setItem('gp_geobattle_created', JSON.stringify(recent.filter(row => (typeof row === 'string' ? row : row?.id) !== battleId)))
    } catch { /* storage unavailable */ }
    deleteOpen.value = false
    await router.push('/geobattle')
  } catch (e) { if (!disposed) actionErr.value = errorMessage(e, 'Suppression impossible'); deleteOpen.value = false }
  finally { deleteBusy.value = false }
}
function onMediaSaved(update: Question) {
  if (question.value?.id === update.id) question.value = { ...question.value, imgUrl: update.imgUrl, youtubeUrl: update.youtubeUrl, description: update.description }
}
</script>

<template>
  <section class="battle-room" aria-label="Partie Geobattle">
    <div v-if="question" class="battle-map"><GeoMap :key="`${question.id}-${borders}`" v-model:guess="guess" :interactive="interactive" :answer="answer" :show-result="showResult" :show-basemap-selector="showResult" :tolerance-m="answer?.toleranceM ?? question.toleranceM ?? 50000" :answer-area="question.answerArea ?? null" :borders="borders" :allow-overlay-translation="true" :result-fit-auto-bounds="false" :participant-guess-markers="participantMarkers" :correction-popup="correctionPopup" :on-correction-media-saved="onMediaSaved" /></div>
    <div class="room-top map-overlay">
      <header class="hud-card room-header"><div class="actions"><RouterLink to="/geobattle" class="icon-button sm" aria-label="Retour aux Geobattle"><ArrowLeft :size="17" /></RouterLink><div><span class="room-eyebrow">Geobattle</span><h1>{{ themeLabel ? `${themeLabel.emoji} ${themeLabel.name}` : 'Le duel géographique' }}</h1></div></div><div class="actions header-actions"><span v-if="question" class="badge">Manche {{ questionIndex + 1 }}/{{ totalQuestions }}</span><ShareGeoBattleLink :share-url="shareUrl" compact /><button type="button" class="icon-button sm" :aria-expanded="panelOpen" aria-controls="battle-ranking" aria-label="Afficher le classement" @click="panelOpen = !panelOpen"><Trophy :size="17" /></button><button v-if="canDeleteDuel" type="button" class="icon-button sm" :disabled="deleteBusy" aria-label="Supprimer cette Geobattle" @click="deleteOpen = true"><Trash2 :size="15" /></button></div></header>
      <div v-if="syncErr" class="notice warn sync-message" role="status">{{ syncErr }} <button type="button" class="btn btn-ghost btn-sm" @click="loadBattle(true)">Réessayer</button></div>
      <div v-if="actionErr" class="alert" role="alert">{{ actionErr }}</div>
    </div>
    <div v-if="loading && !question && !limited" class="room-center map-overlay"><div class="hud-card center-card loading"><span class="spinner" /><p>Chargement de la Geobattle…</p></div></div>
    <div v-else-if="loadErr" class="room-center map-overlay"><div class="hud-card center-card stack"><Swords :size="32" /><h2>Le duel est indisponible</h2><p class="alert" role="alert">{{ loadErr }}</p><button type="button" class="btn btn-primary" @click="loadBattle()"><RefreshCw :size="16" /> Réessayer</button><RouterLink to="/geobattle" class="btn btn-secondary">Retour aux Geobattle</RouterLink></div></div>
    <template v-else>
      <aside v-if="question" class="question-hud map-overlay"><div class="hud-card question-card"><div class="between"><span class="eyebrow">{{ duelFinished ? 'Duel terminé' : showResult ? 'La correction' : 'À toi de jouer' }}</span><span v-if="limited?.phase === 'round'" class="timer" :class="{ urgent: (countdown ?? 30) <= 10 }"><Clock3 :size="16" /> {{ countdown ?? 30 }} s</span><span v-else class="timer"><Clock3 :size="16" /> {{ fmtTime(timeSec) }}</span></div><div v-if="limited?.phase === 'round'" class="timer-track" role="progressbar" :aria-valuenow="countdown ?? 30" :aria-valuemin="0" :aria-valuemax="30" aria-label="Temps restant"><span :style="{ width: `${Math.min(100, (countdown ?? 30) / 30 * 100)}%` }" /></div><QuestionHeadingThumb :img-url="question.imgUrl" :youtube-url="showResult ? question.youtubeUrl : undefined"><template #heading><h2>{{ question.text }}</h2></template><template #meta><span class="subtle">Zone correcte : ~{{ formatToleranceRadiusKm(answer?.toleranceM ?? question.toleranceM) }} km</span></template></QuestionHeadingThumb><label class="border-toggle"><input v-model="borders" type="checkbox" /> Limites entre pays</label></div></aside>
      <div v-if="limited?.phase === 'lobby'" class="room-center map-overlay"><section class="hud-card center-card stack"><span class="lobby-icon"><Users :size="30" /></span><div><span class="eyebrow">Le rendez-vous est lancé</span><h2>En attendant les amis…</h2></div><p>La partie commencera quand les <strong>{{ limited.expected }} joueurs</strong> auront rejoint ce lien.</p><div class="lobby-progress"><span :style="{ width: `${limited.joined.length / limited.expected * 100}%` }" /></div><strong>{{ limited.joined.length }} / {{ limited.expected }} présents</strong><ul class="lobby-players"><li v-for="player in limited.joined" :key="player.deviceId"><span class="avatar">{{ player.pseudo.slice(0, 2) }}</span>{{ player.pseudo }}<Check :size="16" /></li><li v-if="!limited.joined.length" class="subtle">En attente du premier joueur…</li></ul><ShareGeoBattleLink :share-url="shareUrl" /><p class="subtle">30 secondes par manche · révélation commune</p></section></div>
      <div v-else-if="!question && duelFinished" class="room-center map-overlay"><section class="hud-card center-card stack"><Trophy class="trophy" :size="42" /><h2>Geobattle terminée</h2><p>Merci d’avoir joué ! Découvre le classement cumulé et prépare ta revanche.</p><button type="button" class="btn btn-secondary" @click="panelOpen = true">Voir le classement</button><RouterLink to="/geobattle" class="btn btn-primary">Créer un nouveau défi</RouterLink></section></div>
      <div v-else-if="!question && !loading" class="room-center map-overlay"><div class="hud-card center-card stack"><p>Question indisponible pour cette Geobattle.</p><button type="button" class="btn btn-primary" @click="loadBattle()">Réessayer</button></div></div>
      <aside id="battle-ranking" class="ranking-hud map-overlay" :class="{ 'is-open': panelOpen, 'has-question': !!question }"><section class="hud-card ranking-card"><div class="between"><h2><Trophy :size="18" /> Classement {{ duelFinished ? 'cumulé' : limited?.phase === 'reveal' ? 'de la manche' : '' }}</h2><button type="button" class="icon-button sm ranking-close" aria-label="Fermer le classement" @click="panelOpen = false">×</button></div><p class="subtle">Précision, puis temps. Dans une zone pays, le temps départage les bonnes réponses.</p><ol v-if="leaderboard.length" class="ranking-list notranslate" translate="no"><li v-for="row in leaderboard" :key="row.deviceId" :class="{ self: row.isCurrentPlayer }"><span class="rank">{{ row.rank }}</span><div class="player-name"><strong>{{ row.pseudo }}</strong><small>{{ row.isCurrentPlayer ? 'Toi' : row.isGuest ? 'Visiteur' : 'Joueur' }}</small></div><div class="player-score"><strong>{{ fmtDistance(row.distanceM) }}</strong><small>{{ fmtTime(row.timeSec) }}</small></div></li></ol><p v-else class="empty-ranking">{{ limited?.answerHidden ? 'Les réponses seront dévoilées à la fin de la manche.' : 'Sois le premier à valider une tentative.' }}</p><div v-if="limited?.joined.length" class="participants"><h3><Users :size="15" /> Participants · {{ limited.joined.length }}/{{ limited.expected }}</h3><ul><li v-for="player in limited.joined" :key="player.deviceId"><span class="presence-dot" />{{ player.pseudo }}</li></ul></div><button type="button" class="btn btn-ghost btn-sm" @click="refreshLeaderboard"><RefreshCw :size="13" /> Actualiser</button></section></aside>
      <footer v-if="question" class="round-footer map-overlay"><div class="hud-card footer-card"><div class="round-status"><template v-if="duelFinished"><span class="badge success"><Trophy :size="13" /> Geobattle terminée</span><p class="subtle">Ton parcours est enregistré sur cet appareil.</p></template><template v-else-if="showResult"><span class="badge"><Check :size="13" /> {{ lastDistanceM != null ? fmtDistance(lastDistanceM) : 'Manche terminée' }}</span><p v-if="limited?.phase === 'reveal'" class="subtle">Prêts : {{ limited.readyForNextCount }}/{{ limited.expected }}{{ limited.myReadyForNext ? ' · Merci, tu es prêt !' : '' }}</p><p v-else class="subtle">Une seule tentative par joueur et par manche.</p></template><template v-else-if="playLocked"><span class="badge warn"><Check :size="13" /> Proposition enregistrée</span><p class="subtle">Réponse cachée jusqu’à ce que tout le monde ait validé, ou après 30 s.</p></template><template v-else><span class="actions"><MapPin :size="17" /><strong>{{ guess ? 'Prêt à valider ?' : 'Place ton repère sur la carte' }}</strong></span><p class="subtle">{{ countdown === 0 ? 'Temps écoulé, préparation de la correction…' : guess ? 'Tu peux encore déplacer ton repère.' : 'Un clic suffit pour proposer un lieu.' }}</p></template></div><div class="actions footer-actions"><button v-if="!duelFinished && !showResult && !playLocked" type="button" class="btn btn-primary btn-lg" :disabled="!interactive || !guess || submitBusy" @click="submitRound">{{ submitBusy ? 'Enregistrement…' : 'Valider' }}<Check :size="17" /></button><button v-if="showResult && canNext" type="button" class="btn btn-primary" :disabled="nextBusy || limited?.myReadyForNext" @click="nextRound">{{ nextBusy ? 'Patiente…' : limited?.myReadyForNext ? 'En attente des autres…' : nextLabel }}</button><RouterLink v-if="duelFinished" to="/geobattle" class="btn btn-primary">Un autre défi</RouterLink><button type="button" class="btn btn-secondary mobile-ranking" @click="panelOpen = !panelOpen"><Trophy :size="16" /> Classement</button><GoogleTranslateLangBar embedded compact /></div></div></footer>
    </template>
    <ConfirmDialog v-model:open="deleteOpen" title="Supprimer cette Geobattle ?" :description="'Tu es sur le point de supprimer cette Geobattle définitivement.\n\nPlus personne ne pourra y jouer, même avec l’ancien lien. Toutes les tentatives et le classement seront effacés.\n\nChoisis « Annuler » si tu as un doute.'" confirm-label="Oui, supprimer" :busy="deleteBusy" :on-confirm="deleteBattle" />
  </section>
</template>

<style scoped>
.battle-room { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 1320px; margin: 0 auto; padding: 14px 24px 24px; min-width: 0; }
.map-overlay { position: static; pointer-events: auto; }
.hud-card { background: transparent; border: 0; border-radius: 0; box-shadow: none; }
.room-top { order: 0; display: grid; gap: 8px; }
.room-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 0 0 12px; border-bottom: 1px solid var(--border); }
.room-header h1 { font-size: 18px; line-height: 1.4; letter-spacing: 0; overflow-wrap: anywhere; }
.room-eyebrow { font-size: 11px; color: var(--muted); }
.header-actions { gap: 7px; }
.question-hud { order: 1; min-width: 0; }
.question-card { display: grid; gap: 9px; padding: 2px 0 4px; }
.question-card h2 { font-size: 19px; line-height: 1.4; overflow-wrap: anywhere; }
.question-card .eyebrow { margin: 0; }
.question-card :deep(.question-heading__image) { width: 72px; height: 56px; border-radius: 6px; }
.battle-map { order: 2; position: relative; height: clamp(360px, 57dvh, 720px); flex: none; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; isolation: isolate; }
.battle-map :deep(.geo-map) { height: 100%; }
.timer { display: flex; gap: 6px; align-items: center; font-variant-numeric: tabular-nums; font-weight: 750; color: var(--primary-strong); white-space: nowrap; }
.timer.urgent { color: var(--danger); }
.timer-track, .lobby-progress { height: 4px; background: var(--border); border-radius: 4px; overflow: hidden; }
.timer-track span, .lobby-progress span { display: block; height: 100%; background: var(--primary); transition: width .25s linear; }
.border-toggle { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.room-center { order: 1; display: grid; place-items: center; padding: 24px 0; }
.center-card { max-width: 440px; width: 100%; padding: 20px 0; text-align: center; justify-items: center; }
.center-card p { font-size: 14px; }
.lobby-icon { display: grid; place-items: center; background: var(--primary-soft); color: var(--primary-strong); border-radius: 8px; width: 60px; height: 60px; }
.lobby-progress { width: 100%; }
.lobby-players { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; width: 100%; text-align: left; }
.lobby-players li { display: flex; align-items: center; gap: 10px; }
.lobby-players li svg { margin-left: auto; color: var(--primary); }
.trophy { color: var(--accent); }
.round-footer { order: 3; }
.footer-card { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 4px 0 14px; border-bottom: 1px solid var(--border); }
.round-status { display: grid; gap: 5px; min-width: 0; }
.round-status .badge { justify-self: start; }
.round-status strong { font-size: 14px; }
.footer-actions { justify-content: end; flex-shrink: 0; }
.ranking-hud { order: 4; }
.ranking-hud:not(.is-open) { display: none; }
.ranking-card { display: grid; gap: 10px; padding: 8px 0; }
.ranking-card h2 { font-size: 15px; display: flex; gap: 7px; align-items: center; }
.ranking-card .subtle { font-size: 12px; }
.ranking-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ranking-list li { display: flex; gap: 12px; align-items: center; padding: 12px 10px; border-radius: 6px; border-bottom: 1px solid var(--border); font-size: 13px; }
.ranking-list li.self { background: var(--primary-soft); }
.rank { width: 26px; font-weight: 750; color: var(--muted); }
.player-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.player-score { text-align: right; font-variant-numeric: tabular-nums; }
.player-name small, .player-score small { display: block; font-size: 11px; }
.empty-ranking { padding: 10px 0; color: var(--muted); font-size: 13px; }
.participants { border-top: 1px solid var(--border); padding-top: 12px; }
.participants h3 { display: flex; gap: 6px; align-items: center; font-size: 12px; }
.participants ul { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; margin: 10px 0 0; }
.participants li { display: flex; gap: 5px; align-items: center; font-size: 12px; }
.presence-dot { height: 6px; width: 6px; background: var(--primary); border-radius: 50%; }
.round-footer .mobile-ranking { display: none; }
@media (max-width: 767px) {
  .battle-room { padding: 12px 12px calc(var(--mobile-nav-h) + 20px + env(safe-area-inset-bottom)); gap: 10px; }
  .room-header { gap: 8px; }
  .room-header h1 { font-size: 16px; }
  .room-header .actions { gap: 6px; }
  .header-actions { margin-left: auto; }
  .header-actions .badge { font-size: 11px; }
  .question-card h2 { font-size: 17px; }
  .battle-map { height: clamp(260px, calc(100dvh - 540px), 520px); }
  .footer-card { align-items: flex-start; flex-wrap: wrap; gap: 10px; }
  .footer-actions { margin-left: auto; flex-wrap: wrap; }
  .footer-actions .btn-lg { min-height: 42px; padding: 10px 16px; font-size: 13px; }
  .round-status .subtle { font-size: 12px; }
}
</style>
