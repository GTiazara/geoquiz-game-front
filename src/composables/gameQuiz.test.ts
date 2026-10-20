import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { Question, QuestionAnswerArea } from '$lib/types'
import { MIX_THEME_ID } from '$lib/themes'

const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }))
vi.mock('$lib/api', () => ({
  api: mocks.api,
  ApiError: class extends Error { constructor(public status: number, message: string) { super(message) } },
  errorMessage: (e: unknown) => e instanceof Error ? e.message : 'Erreur',
}))
vi.mock('$lib/appStore', () => ({
  app: reactive({ generation: 0, player: { quizFlawlessStreak: 4, quizFlawlessBest: 7 }, aiEnrichConfigured: false, forceDescriptionEnrichment: false }),
  refreshApp: mocks.refresh,
}))
import { app } from '$lib/appStore'
import { useGameQuiz } from './gameQuiz'

function question(id: string, themeId = 'pays', extra: Partial<Question> = {}): Question {
  return { id, themeId, text: `Où est ${id} ?`, lat: 0, lng: 0, toleranceM: 10000, upVotes: 3, downVotes: 0, approved: true, createdAt: '', ...extra }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
let wrapper: VueWrapper | undefined
function start(themeId = 'pays') {
  const theme = ref(themeId)
  let quiz!: ReturnType<typeof useGameQuiz>
  wrapper = mount(defineComponent({ setup() { quiz = useGameQuiz(theme); return () => h('div') } }))
  return { quiz, theme }
}
beforeEach(() => {
  mocks.api.mockReset()
  mocks.refresh.mockReset().mockResolvedValue(undefined)
  app.generation = 0
  app.aiEnrichConfigured = false
  app.forceDescriptionEnrichment = false
  mocks.api.mockResolvedValue({ questions: [question('a'), question('b'), question('c')] })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

describe('game quiz parity', () => {
  it('draws every question once, avoids repeats at the deck boundary and preserves the round on refresh', async () => {
    const { quiz } = start()
    await flushPromises()
    const seen = [quiz.current.value!.id]
    await quiz.nextQuestion(); seen.push(quiz.current.value!.id)
    await quiz.nextQuestion(); seen.push(quiz.current.value!.id)
    expect(new Set(seen).size).toBe(3)
    const last = quiz.current.value!.id
    app.generation++
    await flushPromises()
    expect(quiz.current.value!.id).toBe(last)
    expect(quiz.deckPosition.value).toBe(3)
    await quiz.nextQuestion()
    expect(quiz.current.value!.id).not.toBe(last)
  })

  it('posts XP to the real question theme in mixed mode, normalizes world copies and prevents duplicate validation', async () => {
    const result = deferred<{ xp: number; distanceM: number; quizFlawlessStreak: number; quizFlawlessBest: number }>()
    mocks.api.mockImplementation((path: string) => path === '/player/xp' ? result.promise : Promise.resolve({ questions: [question('a', 'villes')] }))
    const { quiz } = start(MIX_THEME_ID)
    await flushPromises()
    quiz.guess.value = { lat: 0, lng: 360 }
    const pending = quiz.validateGuess()
    await nextTick()
    await quiz.validateGuess()
    expect(mocks.api.mock.calls.filter(call => call[0] === '/player/xp')).toHaveLength(1)
    expect(mocks.api).toHaveBeenCalledWith('/player/xp', expect.objectContaining({ body: expect.objectContaining({ themeId: 'villes', questionId: 'a', guessLat: 0, guessLng: 0 }) }))
    expect(quiz.showResult.value).toBe(true)
    result.resolve({ xp: 1150, distanceM: 0, quizFlawlessStreak: 5, quizFlawlessBest: 7 })
    await pending
    expect(quiz.lastXp.value).toBe(1150)
    expect(quiz.xpSaved.value).toBe(true)
    expect(quiz.streak.value).toEqual({ current: 5, best: 7, brokenPrev: null })
  })

  it('hydrates polygon answers before scoring and records broken flawless streaks outside the polygon', async () => {
    const polygon: QuestionAnswerArea = { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] }
    mocks.api.mockImplementation((path: string) => {
      if (path === '/questions/a') return Promise.resolve({ question: question('a', 'pays', { answerArea: polygon }) })
      if (path === '/player/xp') return Promise.resolve({ xp: 0, quizFlawlessStreak: 0, quizFlawlessBest: 7 })
      return Promise.resolve({ questions: [question('a', 'pays', { hasAnswerArea: true })] })
    })
    const { quiz } = start()
    await flushPromises()
    expect(quiz.current.value!.answerArea).toEqual(polygon)
    quiz.guess.value = { lat: 5, lng: 5 }
    await quiz.validateGuess()
    expect(quiz.lastXp.value).toBe(0)
    expect(quiz.lastInsideAnswerArea.value).toBe(false)
    expect(quiz.streak.value.brokenPrev).toBe(4)
    expect(mocks.api.mock.calls.filter(call => call[0] === '/questions/a')).toHaveLength(1)
  })

  it('never scores an unavailable polygon as a circular answer', async () => {
    mocks.api.mockImplementation((path: string) => path === '/questions/a' ? Promise.reject(new Error('Zone indisponible')) : Promise.resolve({ questions: [question('a', 'pays', { hasAnswerArea: true })] }))
    const { quiz } = start()
    await flushPromises()
    quiz.guess.value = { lat: 0, lng: 0 }
    await quiz.validateGuess()
    expect(quiz.showResult.value).toBe(false)
    expect(quiz.error.value).toBe('Zone indisponible')
    expect(mocks.api.mock.calls.some(call => call[0] === '/player/xp')).toBe(false)
  })

  it('ignores stale responses after a rapid theme change', async () => {
    const old = deferred<{ questions: Question[] }>()
    mocks.api.mockImplementation((_path: string, options: { query?: { theme: string } }) => options.query?.theme === 'pays' ? old.promise : Promise.resolve({ questions: [question('new', 'villes')] }))
    const { quiz, theme } = start()
    theme.value = 'villes'
    await flushPromises()
    expect(quiz.current.value!.id).toBe('new')
    old.resolve({ questions: [question('old')] })
    await flushPromises()
    expect(quiz.current.value!.id).toBe('new')
  })

  it('retains enriched descriptions while a concurrent polygon hydration completes', async () => {
    const hydrating = deferred<{ question: Question }>()
    const polygon: QuestionAnswerArea = { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, -1]]] }
    app.aiEnrichConfigured = true
    mocks.api.mockImplementation((path: string) => {
      if (path.endsWith('/enrich')) return Promise.resolve({ question: question('a', 'pays', { hasAnswerArea: true, description: 'Description enrichie', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }) })
      if (path === '/questions/a') return hydrating.promise
      return Promise.resolve({ questions: [question('a', 'pays', { hasAnswerArea: true })] })
    })
    const { quiz } = start()
    await flushPromises()
    hydrating.resolve({ question: question('a', 'pays', { answerArea: polygon }) })
    await flushPromises()
    expect(quiz.current.value!.description).toBe('Description enrichie')
    expect(quiz.current.value!.answerArea).toEqual(polygon)
  })

  it('retries failed enrichment once on correction without an enrichment loop', async () => {
    app.aiEnrichConfigured = true
    mocks.api.mockImplementation((path: string) => {
      if (path.endsWith('/enrich')) return Promise.reject(new Error('Échec IA'))
      if (path === '/player/xp') return Promise.resolve({ xp: 1150 })
      return Promise.resolve({ questions: [question('a')] })
    })
    const { quiz } = start()
    await flushPromises()
    expect(mocks.api.mock.calls.filter(call => call[0].endsWith('/enrich'))).toHaveLength(1)
    quiz.guess.value = { lat: 0, lng: 0 }
    await quiz.validateGuess()
    await flushPromises()
    expect(mocks.api.mock.calls.filter(call => call[0].endsWith('/enrich'))).toHaveLength(2)
  })

  it('handles an empty theme and reports XP persistence failures without reposting', async () => {
    mocks.api.mockResolvedValueOnce({ questions: [] })
    const { quiz } = start()
    await flushPromises()
    expect(quiz.current.value).toBeNull()
    await quiz.reload()
    quiz.guess.value = { lat: 0, lng: 0 }
    mocks.api.mockRejectedValueOnce(new Error('Serveur injoignable'))
    await quiz.validateGuess()
    expect(quiz.showResult.value).toBe(true)
    expect(quiz.xpSaved.value).toBe(false)
    expect(quiz.error.value).toBe('Serveur injoignable')
    await quiz.validateGuess()
    expect(mocks.api.mock.calls.filter(call => call[0] === '/player/xp')).toHaveLength(1)
  })
})
