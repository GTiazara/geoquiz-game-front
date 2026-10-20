import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import GeoBattleRoomView from '../src/views/GeoBattleRoomView.vue'
import HistoireView from '../src/views/HistoireView.vue'
import { api } from '../src/lib/api'
import { app, refreshApp } from '../src/lib/appStore'
import type { StoryAdventure } from '../src/lib/historyAdventures'

vi.mock('vue-router', async (original) => ({
  ...await original<typeof import('vue-router')>(),
  useRoute: () => ({ params: { id: 'test-duel' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('../src/lib/api', async (original) => ({ ...await original<typeof import('../src/lib/api')>(), api: vi.fn() }))
vi.mock('../src/lib/appStore', () => ({
  app: { player: { pseudo: 'Testeur', isGuest: false, xpByTheme: {} }, themes: [], historyAdventures: [] },
  refreshApp: vi.fn(),
}))
vi.mock('../src/lib/googleTranslateBrowser', () => ({ fixGoogleTranslateScrollLayout: vi.fn(), scheduleTranslateRefresh: vi.fn() }))

const adventure: StoryAdventure = {
  id: 'voyage', title: 'Un grand voyage', period: '1271-1275', description: 'Un parcours historique.',
  steps: [
    { id: 'depart', title: 'Le depart', year: '1271', lat: 48, lng: 2, narration: 'Le recit de la premiere etape.', miniChallenge: { question: 'Localise le depart.', toleranceM: 50000 } },
    { id: 'arrivee', title: 'L arrivee', year: '1275', lat: 49, lng: 3, narration: 'Le recit de la seconde etape.', miniChallenge: { question: 'Localise l arrivee.', toleranceM: 50000 } },
  ],
}
const mapStub = {
  props: ['interactive'], emits: ['update:guess'],
  template: '<button class="test-map" :disabled="!interactive" @click="$emit(\'update:guess\', { lat: 48, lng: 2 })">Carte de test</button>',
}
const stubs = { GeoMap: mapStub, GoogleTranslateLangBar: true, ShareGeoBattleLink: true, LeaderboardModal: true, ConfirmDialog: true, RouterLink: { template: '<a><slot /></a>' }, teleport: true }
const wrappers: ReturnType<typeof mount>[] = []

beforeEach(() => {
  vi.clearAllMocks()
  app.historyAdventures = [adventure]
  vi.mocked(refreshApp).mockResolvedValue(undefined)
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

describe('ecrans de jeu sans panneaux sur la carte', () => {
  it('garde la question, la validation et le classement hors de la carte Geobattle', async () => {
    const question = { id: 'question-1', themeId: 'pays', text: 'Ou se trouve la Croatie ?', toleranceM: 50000 }
    const payload = { theme: { emoji: '', name: 'Pays' }, question, canDeleteDuel: false, totalQuestions: 1 }
    vi.mocked(api).mockResolvedValueOnce(payload).mockResolvedValueOnce({ rows: [] })
    const wrapper = mount(GeoBattleRoomView, { global: { stubs } })
    wrappers.push(wrapper)
    await flushPromises()
    expect(wrapper.get('.question-hud').text()).toContain(question.text)
    expect(wrapper.find('.battle-map .question-hud').exists()).toBe(false)
    expect(wrapper.find('.battle-map .round-footer').exists()).toBe(false)
    expect(wrapper.find('.battle-map .ranking-hud').exists()).toBe(false)
    expect(wrapper.get('.ranking-hud').classes()).toContain('is-open')
    await wrapper.get('.test-map').trigger('click')
    const answer = { lat: 48, lng: 2, toleranceM: 50000 }
    vi.mocked(api).mockResolvedValueOnce({ answer, distanceM: 0 }).mockResolvedValueOnce({ ...payload, answer, playLocked: true, myAttempt: { guessLat: 48, guessLng: 2, distanceM: 0, timeSec: 1 } }).mockResolvedValueOnce({ rows: [] })
    await wrapper.get('.round-footer .btn-primary').trigger('click')
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/geo-battle/test-duel/score', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ lat: 48, lng: 2 }) }))
    expect(wrapper.get('.round-footer').text()).toContain('0 m')
    expect(wrapper.get('.test-map').attributes('disabled')).toBeDefined()
  })

  it('conserve la consigne historique visible avec le recit replie et permet de passer a la suite', async () => {
    vi.mocked(api).mockResolvedValueOnce({ adventures: [adventure] })
    const wrapper = mount(HistoireView, { global: { stubs } })
    wrappers.push(wrapper)
    await flushPromises()
    await wrapper.get('.adventure-card').trigger('click')
    expect(wrapper.get('.challenge-prompt').text()).toContain('Localise le depart.')
    expect(wrapper.find('.narration').exists()).toBe(false)
    expect(wrapper.find('.story-map .chapter-card').exists()).toBe(false)
    expect(wrapper.find('.story-map .chapter-footer').exists()).toBe(false)
    await wrapper.get('.chapter-heading button').trigger('click')
    expect(wrapper.get('.narration').text()).toContain('Le recit de la premiere etape.')
    await wrapper.get('.chapter-heading button').trigger('click')
    expect(wrapper.get('.challenge-prompt').text()).toContain('Localise le depart.')
    await wrapper.get('.test-map').trigger('click')
    vi.mocked(api).mockResolvedValueOnce({ xp: 100, distanceM: 0, inBuffer: true })
    await wrapper.get('.chapter-actions .btn-primary').trigger('click')
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/player/history-xp', expect.objectContaining({ body: { adventureId: 'voyage', stepId: 'depart', guessLat: 48, guessLng: 2 } }))
    expect(wrapper.get('.chapter-status').text()).toContain('+100 XP')
    await wrapper.get('.chapter-actions .btn-primary').trigger('click')
    expect(wrapper.get('.chapter-title').text()).toContain('L arrivee')
    expect(wrapper.get('.challenge-prompt').text()).toContain('Localise l arrivee.')
    expect(wrapper.get('.chapter-actions .btn-primary').attributes('disabled')).toBeDefined()
  })
})