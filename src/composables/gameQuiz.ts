import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api, ApiError, errorMessage } from '$lib/api'
import { app, refreshApp } from '$lib/appStore'
import type { Question } from '$lib/types'
import { computeXp } from '$lib/geo/score'
import { MIX_THEME_ID } from '$lib/themes'
import { questionHasCorrectionMedia } from '$lib/question_correction_media'

/** Quiz deck, lazy polygon hydration and scoring, independent of the map's lifecycle. */
export function useGameQuiz(activeThemeId: Readonly<{ value: string }>) {
  const questions = ref<Question[]>([])
  const current = ref<Question | null>(null)
  const guess = ref<{ lat: number; lng: number } | null>(null)
  const showResult = ref(false)
  const loading = ref(false)
  const validating = ref(false)
  const error = ref('')
  const lastXp = ref(0)
  const xpSaved = ref(false)
  const lastDist = ref(0)
  const inBuffer = ref(false)
  const lastInsideAnswerArea = ref<boolean>()
  const deckPosition = ref(0)
  const deckSize = ref(0)
  const streakHud = ref<{ current: number; best: number; brokenPrev: number | null } | null>(null)
  const streak = computed(() => streakHud.value ?? {
    current: Math.max(0, Math.round(app.player?.quizFlawlessStreak ?? 0)),
    best: Math.max(0, Math.round(app.player?.quizFlawlessBest ?? 0)),
    brokenPrev: null,
  })
  let deck: Question[] = []
  let deckKey = ''
  let roundThemeId: string | null = null
  let loadSeq = 0
  let disposed = false
  let loadController: AbortController | undefined
  const hydration = new Map<string, Promise<Question>>()
  const attempted = new Set<string>()
  const enriching = new Set<string>()
  const correctionRetries = new Set<string>()

  /** Met à jour une question sans perdre sa géométrie déjà chargée à la demande. */
  function updateQuestion(q: Question) {
    const previous = questions.value.find(item => item.id === q.id)
    const updated = { ...q, ...(q.hasAnswerArea && !q.answerArea && previous?.answerArea ? { answerArea: previous.answerArea, hasAnswerArea: undefined } : {}) }
    questions.value = questions.value.map(item => item.id === q.id ? updated : item)
    if (current.value?.id === q.id) current.value = updated
  }

  function resetDeck() {
    deck = []
    deckKey = ''
    deckPosition.value = 0
    deckSize.value = 0
  }

  /** Charge la zone détaillée uniquement au besoin et partage la requête si elle est déjà en cours. */
  async function hydrate(q: Question): Promise<Question> {
    if (!q.hasAnswerArea || q.answerArea) return q
    let request = hydration.get(q.id)
    if (!request) {
      request = (async () => {
        try {
          const result = await api<{ question?: Question }>(`/questions/${encodeURIComponent(q.id)}`, { query: { play: 1 } })
          if (!result.question?.answerArea) throw new Error('La zone de réponse est indisponible. Réessaie avant de valider.')
          const full = { ...(questions.value.find(item => item.id === q.id) ?? q), answerArea: result.question.answerArea, hasAnswerArea: undefined }
          if (!disposed) updateQuestion(full)
          return full
        } finally { hydration.delete(q.id) }
      })()
      hydration.set(q.id, request)
    }
    return request
  }

  /** Pioche dans un paquet mélangé pour éviter les répétitions avant la fin du tour. */
  function pickRandom() {
    correctionRetries.clear()
    streakHud.value = null
    showResult.value = false
    guess.value = null
    lastXp.value = 0
    xpSaved.value = false
    lastDist.value = 0
    inBuffer.value = false
    lastInsideAnswerArea.value = undefined
    error.value = ''
    const pool = activeThemeId.value === MIX_THEME_ID ? questions.value : questions.value.filter(q => q.themeId === activeThemeId.value)
    if (!pool.length) { current.value = null; resetDeck(); return }
    const key = pool.map(q => q.id).sort().join('\0')
    if (key !== deckKey || deckPosition.value >= deck.length || !deck.length) {
      deck = [...pool]
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
      }
      if (deck.length > 1 && deck[0]?.id === current.value?.id) {
        const i = 1 + Math.floor(Math.random() * (deck.length - 1))
        ;[deck[0], deck[i]] = [deck[i]!, deck[0]!]
      }
      deckKey = key
      deckPosition.value = 0
    }
    const slot = deck[deckPosition.value++]!
    deckSize.value = deck.length
    current.value = questions.value.find(q => q.id === slot.id) ?? slot
  }

  async function nextQuestion() {
    if (loading.value || validating.value) return
    pickRandom()
    const q = current.value
    if (!q) return
    try { await hydrate(q) }
    catch (e) { if (!disposed && current.value?.id === q.id) error.value = errorMessage(e) }
  }

  /** Recharge les questions du thème et ignore toute réponse devenue obsolète. */
  async function loadQuestions(themeId: string, startNewRound: boolean) {
    const seq = ++loadSeq
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    loading.value = true
    error.value = ''
    if (startNewRound) { current.value = null; showResult.value = false; guess.value = null; resetDeck() }
    try {
      const result = await api<{ questions?: Question[] }>('/questions', { query: { theme: themeId, play: 1 }, signal: controller.signal })
      if (disposed || seq !== loadSeq) return
      const previous = current.value
      questions.value = result.questions ?? []
      const refreshed = questions.value.find(q => q.id === previous?.id)
      if (refreshed) {
        current.value = refreshed.hasAnswerArea && !refreshed.answerArea && previous?.answerArea
          ? { ...refreshed, answerArea: previous.answerArea, hasAnswerArea: undefined } : refreshed
      }
      if (startNewRound || !refreshed) { resetDeck(); pickRandom() }
      if (current.value) await hydrate(current.value)
    } catch (e) {
      if (!disposed && seq === loadSeq && !controller.signal.aborted) error.value = errorMessage(e, 'Impossible de charger les questions.')
    } finally { if (!disposed && seq === loadSeq) loading.value = false }
  }

  /** Calcule le résultat, l’enregistre côté serveur et rafraîchit l’état XP du joueur. */
  async function validateGuess() {
    if (!current.value || !guess.value || showResult.value || validating.value || loading.value) return
    validating.value = true
    error.value = ''
    const id = current.value.id
    try {
      const hydrated = await hydrate(current.value)
      if (disposed || current.value?.id !== id || !guess.value) return
      const q = current.value.answerArea ? current.value : hydrated
      const point = { lat: Math.max(-90, Math.min(90, guess.value.lat)), lng: ((guess.value.lng + 180) % 360 + 360) % 360 - 180 }
      guess.value = point
      const prevStreak = streak.value.current
      const prevBest = streak.value.best
      const scored = computeXp(point, { lat: q.lat, lng: q.lng }, q.toleranceM, { answerArea: q.answerArea })
      lastXp.value = scored.xp
      lastDist.value = scored.distanceM
      inBuffer.value = scored.inBuffer
      lastInsideAnswerArea.value = scored.insideAnswerArea
      showResult.value = true
      const result = await api<{ xp?: number; distanceM?: number; quizFlawlessStreak?: number; quizFlawlessBest?: number }>('/player/xp', {
        method: 'POST', body: { themeId: q.themeId, xp: scored.xp, distanceM: scored.distanceM, questionId: q.id, guessLat: point.lat, guessLng: point.lng },
      })
      if (disposed) return
      xpSaved.value = true
      if (typeof result.xp === 'number') lastXp.value = result.xp
      if (typeof result.distanceM === 'number') lastDist.value = result.distanceM
      const value = typeof result.quizFlawlessStreak === 'number' ? Math.max(0, Math.round(result.quizFlawlessStreak)) : scored.inBuffer ? prevStreak + 1 : 0
      streakHud.value = {
        current: value,
        best: typeof result.quizFlawlessBest === 'number' ? Math.max(0, Math.round(result.quizFlawlessBest)) : Math.max(prevBest, value),
        brokenPrev: !scored.inBuffer && prevStreak > 0 ? prevStreak : null,
      }
      await refreshApp({ theme: activeThemeId.value })
    } catch (e) {
      if (!disposed) error.value = errorMessage(e, 'Impossible d’enregistrer l’XP de cette manche.')
    } finally { if (!disposed) validating.value = false }
  }

  watch([() => activeThemeId.value, () => app.generation], ([themeId]) => {
    if (!themeId) return
    const start = roundThemeId !== themeId
    roundThemeId = themeId
    void loadQuestions(themeId, start)
  }, { immediate: true })

  watch([() => current.value?.id, () => current.value?.description, () => current.value?.imgUrl, () => current.value?.youtubeUrl, showResult, () => app.aiEnrichConfigured, () => app.forceDescriptionEnrichment], () => {
    const q = current.value
    if (!q?.id || !app.aiEnrichConfigured || (q.description?.trim() && questionHasCorrectionMedia(q) && !app.forceDescriptionEnrichment)) return
    if (showResult.value && attempted.has(q.id) && !correctionRetries.has(q.id) && !enriching.has(q.id)) {
      attempted.delete(q.id)
      correctionRetries.add(q.id)
    }
    if (attempted.has(q.id) || enriching.has(q.id)) return
    enriching.add(q.id)
    void (async () => {
      try {
        const result = await api<{ question?: Question }>(`/questions/${encodeURIComponent(q.id)}/enrich`, { method: 'POST' })
        attempted.add(q.id)
        if (result.question && !disposed) updateQuestion(result.question)
      } catch (e) {
        if (!(e instanceof ApiError && (e.status === 429 || e.status === 503))) attempted.add(q.id)
      } finally { enriching.delete(q.id) }
    })()
  })

  onBeforeUnmount(() => { disposed = true; loadSeq++; loadController?.abort() })

  return { current, guess, showResult, loading, validating, error, lastXp, xpSaved, lastDist, inBuffer, lastInsideAnswerArea, streak, deckPosition, deckSize, nextQuestion, validateGuess, updateQuestion, reload: () => loadQuestions(activeThemeId.value, false) }
}
