<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, apiUrl, errorMessage } from '$lib/api'
import { app } from '$lib/appStore'
import { appUrl } from '$lib/appUrl'
import { extractYoutubeVideoId, toYoutubeEmbedUrl } from '$lib/youtube'
import type { FlashAnswerResult, FlashCardPlay, FlashPrompt } from '$lib/types'
import ShareGeoBattleLink from '../components/ShareGeoBattleLink.vue'

type BoardEntry = { pseudo: string; correct: number; total: number; finished: boolean }
type SyncPlayer = { pseudo: string; you: boolean; answered: boolean; correct?: boolean }
type SyncReveal = { correct: boolean; correctChoiceId: string; backText: string; yourChoiceId: string | null; xp: number; flashXpTotal: number; flashStreak: number; flashBest: number }
type SyncView = {
  phase: 'lobby' | 'answering' | 'reveal' | 'finished'
  cardIndex: number
  cardCount: number
  players: SyncPlayer[]
  youAreHost: boolean
  answeredCount: number
  readyCount: number
  youReady: boolean
  youAnswered: boolean
  roundDeadlineAt: string | null
  card: FlashCardPlay | null
  reveal: SyncReveal | null
}
type SyncPayload = { battle: { themeId: string; themeName: string; deckName: string; mode?: string }; cards: FlashCardPlay[]; leaderboard: BoardEntry[]; sync?: SyncView }

const route = useRoute()
const router = useRouter()
const deckId = computed(() => String(route.params.deckId ?? ''))
const battleId = computed(() => route.name === 'flashcard-battle' ? String(route.params.battleId ?? '') : '')
const battleMode = computed(() => Boolean(battleId.value))
const cards = ref<FlashCardPlay[]>([])
const sync = ref<SyncView | null>(null)
const now = ref(Date.now())
const themeId = ref('')
const themeName = ref('')
const deckName = ref('')
const index = ref(0)
const loading = ref(true)
const answering = ref(false)
const error = ref('')
const flipped = ref(false)
const pickedId = ref('')
const result = ref<FlashAnswerResult | null>(null)
const sessionCorrect = ref(0)
const flashXp = ref(app.player?.flashXpTotal ?? 0)
const flashStreak = ref(app.player?.flashStreak ?? 0)
const leaderboard = ref<BoardEntry[]>([])
const battleBusy = ref(false)
const deckShareUrl = computed(() => deckId.value ? appUrl(`/flashcards/${deckId.value}`) : '')
const battleShareUrl = computed(() => battleId.value ? appUrl(`/flashcards/battle/${battleId.value}`) : '')
const card = computed(() => sync.value?.card ?? cards.value[index.value] ?? null)
const finished = computed(() => sync.value ? sync.value.phase === 'finished' : !loading.value && !error.value && cards.value.length > 0 && index.value >= cards.value.length)
const secondsLeft = computed(() => {
  const deadline = sync.value?.roundDeadlineAt
  if (!deadline) return null
  const end = Date.parse(deadline)
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now.value) / 1000)) : null
})
let pollTimer: ReturnType<typeof setInterval> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
let events: EventSource | undefined
let loadVersion = 0

function stopSync() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
  events?.close()
  events = undefined
}

/** Applique l’état serveur. Le verso n’arrive qu’en révélation. */
function applySync(data: SyncPayload) {
  const previousPhase = sync.value?.phase
  const previousCard = sync.value?.card?.id
  sync.value = data.sync ?? null
  leaderboard.value = data.leaderboard
  themeId.value = data.battle.themeId
  themeName.value = data.battle.themeName
  deckName.value = data.battle.deckName
  const state = data.sync
  if (!state) return
  if (state.phase === 'reveal' && state.reveal) {
    if (previousPhase !== 'reveal' && state.reveal.correct) sessionCorrect.value += 1
    result.value = state.reveal
    pickedId.value = state.reveal.yourChoiceId || pickedId.value
    flashXp.value = state.reveal.flashXpTotal
    flashStreak.value = state.reveal.flashStreak
    flipped.value = true
  } else if (state.phase === 'answering' && (state.card?.id !== previousCard || previousPhase === 'reveal' || previousPhase === 'lobby')) {
    resetRound()
  }
}

async function refreshSync(id = battleId.value) {
  if (!id || id !== battleId.value || !sync.value) return
  try {
    const data = await api<SyncPayload>(`/flash/battles/${encodeURIComponent(id)}`)
    if (id === battleId.value && sync.value) applySync(data)
  } catch (err) {
    if (id === battleId.value && !sync.value) error.value = errorMessage(err)
  }
}

function watchSync(id: string) {
  stopSync()
  const pull = () => { void refreshSync(id) }
  pollTimer = setInterval(pull, 1500)
  if (typeof EventSource !== 'undefined') {
    events = new EventSource(apiUrl(`/flash/battles/${encodeURIComponent(id)}/events`))
    events.onmessage = pull
  }
}

/** Charge les cartes jouables. La solution n’est pas dans cette réponse. */
async function load() {
  const version = ++loadVersion
  stopSync()
  loading.value = true
  answering.value = false
  error.value = ''
  index.value = 0
  sessionCorrect.value = 0
  sync.value = null
  resetRound()
  leaderboard.value = []
  try {
    if (battleMode.value) {
      const data = await api<SyncPayload>(`/flash/battles/${encodeURIComponent(battleId.value)}`)
      if (version !== loadVersion) return
      if (data.sync) {
        cards.value = []
        applySync(data)
        watchSync(battleId.value)
      } else {
        cards.value = data.cards
        themeId.value = data.battle.themeId
        themeName.value = data.battle.themeName
        deckName.value = data.battle.deckName
        leaderboard.value = data.leaderboard
      }
    } else {
      const data = await api<{ cards: FlashCardPlay[]; themeId: string; themeName: string; deckName: string }>(`/flash/decks/${encodeURIComponent(deckId.value)}/cards`)
      if (version !== loadVersion) return
      cards.value = data.cards
      themeId.value = data.themeId
      themeName.value = data.themeName
      deckName.value = data.deckName
    }
  } catch (err) {
    if (version === loadVersion) error.value = errorMessage(err)
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

function resetRound() {
  flipped.value = false
  pickedId.value = ''
  result.value = null
}

function youtubeEmbed(prompt: FlashPrompt): string | null {
  if (prompt.kind !== 'video') return null
  const id = extractYoutubeVideoId(prompt.url)
  return id ? toYoutubeEmbedUrl(id) : null
}

/** Envoie le choix. En duel synchronisé, le verso attend que tout le monde ait répondu. */
async function choose(choiceId: string) {
  const current = card.value
  if (!current || answering.value || flipped.value) return
  if (sync.value && (sync.value.phase !== 'answering' || sync.value.youAnswered)) return
  const version = loadVersion
  answering.value = true
  error.value = ''
  pickedId.value = choiceId
  try {
    if (sync.value) {
      const data = await api<SyncPayload>(`/flash/battles/${encodeURIComponent(battleId.value)}/answer`, {
        method: 'POST',
        body: { cardId: current.id, choiceId },
      })
      if (version === loadVersion) applySync(data)
      return
    }
    const data = await api<FlashAnswerResult & { leaderboard?: BoardEntry[] }>(battleMode.value ? `/flash/battles/${encodeURIComponent(battleId.value)}/answer` : `/flash/decks/${encodeURIComponent(deckId.value)}/answer`, {
      method: 'POST',
      body: { cardId: current.id, choiceId },
    })
    if (version !== loadVersion) return
    result.value = data
    if (data.leaderboard) leaderboard.value = data.leaderboard
    if (data.correct) sessionCorrect.value += 1
    flashXp.value = data.flashXpTotal
    flashStreak.value = data.flashStreak
    flipped.value = true
  } catch (err) {
    if (version === loadVersion) {
      pickedId.value = ''
      error.value = errorMessage(err)
    }
  } finally {
    if (version === loadVersion) answering.value = false
  }
}

function backToTheme() {
  void router.push(themeId.value ? `/flashcards/theme/${encodeURIComponent(themeId.value)}` : '/flashcards')
}

/** Ouvre un duel sur ce paquet. `sync` bloque la carte suivante tant que tout le monde n’a pas répondu. */
async function createBattle(mode: 'async' | 'sync' = 'async') {
  if (!deckId.value || battleBusy.value) return
  battleBusy.value = true
  error.value = ''
  try {
    const created = await api<{ battleId: string }>('/flash/battles', { method: 'POST', body: { deckId: deckId.value, mode } })
    await router.push(`/flashcards/battle/${encodeURIComponent(created.battleId)}`)
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    battleBusy.value = false
  }
}

/** L’hôte ouvre la première carte quand au moins deux joueurs sont dans la salle. */
async function startSync() {
  if (!battleId.value || answering.value) return
  answering.value = true
  error.value = ''
  try {
    applySync(await api<SyncPayload>(`/flash/battles/${encodeURIComponent(battleId.value)}/start`, { method: 'POST', body: {} }))
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    answering.value = false
  }
}

/** Confirme que ce joueur a vu le résultat. La carte suivante attend les autres. */
async function readyNext() {
  if (!battleId.value || !sync.value || sync.value.phase !== 'reveal' || sync.value.youReady || answering.value) return
  answering.value = true
  error.value = ''
  try {
    applySync(await api<SyncPayload>(`/flash/battles/${encodeURIComponent(battleId.value)}/next`, { method: 'POST', body: {} }))
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    answering.value = false
  }
}

function nextCard() {
  if (sync.value) {
    void readyNext()
    return
  }
  if (!flipped.value) return
  index.value += 1
  resetRound()
}

function onKeydown(event: KeyboardEvent) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return
  if (finished.value) return
  const digit = /^[1-4]$/.exec(event.key)?.[0]
  if (digit && card.value && !flipped.value) {
    event.preventDefault()
    const choice = card.value.choices[Number(digit) - 1]
    if (choice) void choose(choice.id)
  } else if ((event.key === 'Enter' || event.key === ' ') && flipped.value) {
    event.preventDefault()
    nextCard()
  }
}

watch(() => route.fullPath, () => { void load() }, { immediate: true })
onMounted(() => {
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  stopSync()
  if (clockTimer) clearInterval(clockTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <section class="play">
    <header class="between">
      <div>
        <button type="button" class="theme-back" @click="backToTheme">← {{ themeName || 'Thèmes' }}</button>
        <h1>{{ deckName || 'Flashcards' }}</h1>
      </div>
      <div class="actions">
        <ShareGeoBattleLink v-if="deckShareUrl" :share-url="deckShareUrl" button-label="Partager" dialog-heading="Partager le paquet" dialog-description="Envoie le lien pour jouer à ce paquet." dialog-title-id="share-flash-deck" share-title="Flashcards — GeoPinpoint" :share-text="`Joue au paquet ${deckName}`" button-aria-label="Partager ce paquet" url-field-aria-label="Lien du paquet" tone="cyan" density="sm" />
        <button v-if="deckId && !battleMode" type="button" class="btn btn-secondary btn-sm duel" :disabled="battleBusy" @click="createBattle('async')">Duel</button>
        <button v-if="deckId && !battleMode" type="button" class="btn btn-secondary btn-sm duel" :disabled="battleBusy" @click="createBattle('sync')">Synchronisé</button>
        <ShareGeoBattleLink v-if="battleShareUrl" :share-url="battleShareUrl" button-label="Partager le duel" dialog-heading="Partager le duel" :dialog-description="sync ? 'Même carte pour tout le monde. Le résultat s’affiche quand chacun a répondu.' : 'Tes amis jouent les mêmes cartes et le classement se remplit.'" dialog-title-id="share-flash-battle" share-title="Duel flashcards — GeoPinpoint" :share-text="sync ? `Rejoins mon duel synchronisé : ${deckName}` : `Rejoins mon duel : ${deckName}`" button-aria-label="Partager ce duel" url-field-aria-label="Lien du duel" tone="cyan" density="sm" />
      </div>
      <div class="badges">
        <span class="badge warn">{{ flashXp.toLocaleString('fr-FR') }} XP flash</span>
        <span class="badge neutral">Série {{ flashStreak }}</span>
      </div>
    </header>
    <p v-if="loading" class="subtle">Chargement des cartes…</p>
    <p v-else-if="error && !card && !sync" class="alert" role="alert">{{ error }}</p>
    <div v-else-if="sync?.phase === 'lobby'" class="surface panel stack-sm">
      <h2>Duel synchronisé</h2>
      <p>Personne ne passe à la carte suivante tant que tout le monde n’a pas répondu. Le résultat s’affiche alors pour tous.</p>
      <ul class="players">
        <li v-for="(player, playerIndex) in sync.players" :key="`${player.pseudo}-${playerIndex}`"><strong>{{ player.pseudo }}</strong><span v-if="player.you" class="subtle"> · toi</span></li>
      </ul>
      <p class="subtle">{{ sync.players.length }} joueur{{ sync.players.length > 1 ? 's' : '' }} sur 8 · 45 secondes maximum par carte</p>
      <button v-if="sync.youAreHost" type="button" class="btn btn-primary btn-block" :disabled="answering || sync.players.length < 2" @click="startSync">{{ sync.players.length < 2 ? 'En attente d’un autre joueur' : 'Lancer' }}</button>
      <p v-else class="subtle" role="status">En attente du lancement par l’hôte.</p>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
    </div>
    <div v-else-if="finished" class="surface panel stack-sm">
      <h2>Paquet terminé</h2>
      <p v-if="!sync">{{ sessionCorrect }} bonne{{ sessionCorrect > 1 ? 's' : '' }} réponse{{ sessionCorrect > 1 ? 's' : '' }} sur {{ cards.length }}.</p>
      <ol v-if="battleMode && leaderboard.length" class="board">
        <li v-for="(row, rowIndex) in leaderboard" :key="`${row.pseudo}-${rowIndex}`"><strong>{{ row.pseudo }}</strong> {{ row.correct }}/{{ row.total }}<span v-if="!row.finished" class="subtle"> en cours</span></li>
      </ol>
      <div class="actions">
        <button v-if="!battleMode" type="button" class="btn btn-primary" @click="load">Rejouer</button>
        <button type="button" class="btn btn-secondary" @click="backToTheme">Autres paquets</button>
      </div>
    </div>
    <p v-else-if="!card" class="empty">Ce paquet n’a pas encore de carte publiée.</p>
    <div v-else class="stack">
      <p class="subtle">Carte {{ (sync ? sync.cardIndex : index) + 1 }} / {{ sync ? sync.cardCount : cards.length }}<template v-if="secondsLeft != null"> · {{ secondsLeft }} s</template></p>
      <ul v-if="sync" class="players">
        <li v-for="(player, playerIndex) in sync.players" :key="`${player.pseudo}-${playerIndex}`">
          <strong>{{ player.pseudo }}</strong>
          <span v-if="player.you" class="subtle"> · toi</span>
          <span v-if="sync.phase === 'reveal'"> — {{ player.correct ? 'bonne réponse' : 'mauvaise réponse' }}</span>
          <span v-else> — {{ player.answered ? 'a répondu' : 'en attente' }}</span>
        </li>
      </ul>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <div class="flip" :class="{ flipped }">
        <div class="flip-inner">
          <div class="face front surface" :aria-hidden="flipped">
            <p v-if="card.prompt.kind === 'text'" class="prompt-text">{{ card.prompt.text }}</p>
            <img v-else-if="card.prompt.kind === 'image'" :src="card.prompt.url" :alt="card.prompt.alt || 'Recto de la carte'" />
            <iframe v-else-if="card.prompt.kind === 'video' && youtubeEmbed(card.prompt)" :src="youtubeEmbed(card.prompt)!" title="Vidéo de la carte" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen />
            <video v-else-if="card.prompt.kind === 'video'" :src="card.prompt.url" controls playsinline />
            <audio v-else :src="card.prompt.url" controls />
          </div>
          <div class="face back surface" :aria-hidden="!flipped">
            <span class="eyebrow">Verso</span>
            <p class="prompt-text">{{ result?.backText }}</p>
          </div>
        </div>
      </div>
      <div class="choices" role="group" aria-label="Quatre réponses">
        <button
          v-for="(choice, choiceIndex) in card.choices"
          :key="choice.id"
          type="button"
          class="btn btn-secondary choice"
          :class="{
            correct: flipped && result?.correctChoiceId === choice.id,
            wrong: flipped && pickedId === choice.id && result?.correctChoiceId !== choice.id,
          }"
          :disabled="answering || flipped || Boolean(sync && (sync.phase !== 'answering' || sync.youAnswered))"
          @click="choose(choice.id)"
        >
          <span class="key">{{ choiceIndex + 1 }}</span>{{ choice.label }}
        </button>
      </div>
      <p v-if="sync?.phase === 'answering' && sync.youAnswered" class="subtle" role="status">Réponse enregistrée. En attente des autres ({{ sync.answeredCount }}/{{ sync.players.length }}).</p>
      <p v-if="flipped" class="subtle" role="status">{{ result?.correct ? 'Bonne réponse.' : 'Mauvaise réponse.' }} {{ result?.xp ? `+${result.xp} XP flash.` : '' }}</p>
      <p v-if="sync?.phase === 'reveal'" class="subtle" role="status">Prêts pour la suite : {{ sync.readyCount }}/{{ sync.players.length }}{{ sync.youReady ? ' · tu es prêt' : '' }}</p>
      <button type="button" class="btn btn-primary" :disabled="sync ? sync.phase !== 'reveal' || sync.youReady : !flipped" @click="nextCard">{{ sync && sync.cardIndex + 1 >= sync.cardCount ? 'Voir le classement' : 'Carte suivante' }}</button>
    </div>
  </section>
</template>

<style scoped>
.play { display: grid; gap: 18px; max-width: 760px; margin-inline: auto; }
.theme-back { min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--muted); font: inherit; text-align: left; cursor: pointer; }
.duel, .actions :deep(.btn) { min-height: 44px; }
.board, .players { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.players { list-style: none; padding-left: 0; }
.flip { width: min(100%, 720px, calc(46vh * 1.5)); margin-inline: auto; perspective: 1000px; }
.flip-inner { position: relative; width: 100%; aspect-ratio: 3 / 2; transform-style: preserve-3d; transition: transform .55s; }
.flipped .flip-inner { transform: rotateY(180deg); }
.face { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; backface-visibility: hidden; overflow: hidden; }
.back { transform: rotateY(180deg); align-content: center; }
.prompt-text { font-size: clamp(22px, 3vw, 32px); font-weight: 700; text-align: center; letter-spacing: -.4px; }
.face img, .face video, .face iframe { width: 100%; height: 100%; min-width: 0; min-height: 0; align-self: stretch; justify-self: stretch; object-fit: contain; border: 0; border-radius: 12px; background: var(--surface-2); }
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.choice { justify-content: flex-start; min-height: 52px; white-space: normal; text-align: left; }
.choice.correct { background: var(--success-soft); border-color: var(--success); color: var(--success); }
.choice.wrong { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
.key { width: 22px; height: 22px; display: inline-grid; place-items: center; border-radius: 6px; background: var(--surface-2); font-size: 12px; }
@media (max-width: 640px) { .choices { grid-template-columns: 1fr; } }
</style>
