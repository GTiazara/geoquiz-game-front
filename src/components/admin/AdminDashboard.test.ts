import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '$lib/api'
import { createAdminDashboard, type AdminDashboard } from '../../composables/adminDashboard'
import AdminImport from './AdminImport.vue'
import AdminQuestionEditor from './AdminQuestionEditor.vue'
import AdminQuestions from './AdminQuestions.vue'
import AdminView from '../../views/AdminView.vue'

const mocks = vi.hoisted(() => ({ api: vi.fn(), setAdminToken: vi.fn(), refreshApp: vi.fn() }))
vi.mock('$lib/api', async importOriginal => ({ ...await importOriginal<typeof import('$lib/api')>(), api: mocks.api, setAdminToken: mocks.setAdminToken }))
vi.mock('$lib/appStore', () => ({ refreshApp: mocks.refreshApp }))
vi.mock('$lib/appUrl', () => ({ appUrl: (path: string) => `https://quiz.example/#${path}` }))
vi.mock('../GeoMap.vue', () => ({ default: { template: '<div class="map-stub" />' } }))
vi.mock('../AdminGeojsonPreview.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../AdminThemeQuestionsMap.vue', () => ({ default: { template: '<div />' } }))

const question = { id: 'q1', text: 'Où est Paris ?', themeId: 'cities', lat: 48.8566, lng: 2.3522, toleranceM: 50000, approved: true, upVotes: 2, downVotes: 1, createdAt: '2026-10-20', answerArea: { type: 'Polygon' as const, coordinates: [[[2, 48], [3, 48], [3, 49], [2, 48]]] } }
function dashboard(): AdminDashboard { return { users: [], themes: [{ id: 'cities', name: 'Villes', emoji: '🏙️', createdAt: '2026-10-20' }, { id: 'countries', name: 'Pays', emoji: '🌍', createdAt: '2026-10-20' }], questions: [question], geoBattles: [], pendingNewQuestions: [], pendingEditProposals: [], defaultQuizThemeId: 'cities', communityMinNetVotes: 4, communityEditProposalRemoveMinNetDown: 5 } }
let state: ReturnType<typeof createAdminDashboard>
const wrappers: VueWrapper[] = []
async function setup(child?: ReturnType<typeof defineComponent>, url = '/admin') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: { template: '<div />' } }] })
  await router.push(url); await router.isReady()
  const wrapper = mount(defineComponent({ setup() { state = createAdminDashboard(); return () => child ? h(child) : h('div') } }), { global: { plugins: [router] }, attachTo: document.body })
  wrappers.push(wrapper); await flushPromises()
  return { wrapper, router }
}
beforeEach(() => {
  mocks.api.mockReset(); mocks.setAdminToken.mockReset(); mocks.refreshApp.mockReset()
  mocks.api.mockImplementation(async (path: string) => path === '/admin/status' ? { configured: true, authed: true } : path === '/admin/dashboard' ? dashboard() : { ok: true })
  mocks.refreshApp.mockResolvedValue(undefined)
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('administration — session et contrats API', () => {
  it('does not load protected data when administration is not configured', async () => {
    mocks.api.mockResolvedValue({ configured: false, authed: false })
    await setup()
    expect(state.configured.value).toBe(false)
    expect(mocks.api.mock.calls.map(call => call[0])).toEqual(['/admin/status'])
  })
  it('logs in with secret, persists the token and loads the dashboard', async () => {
    mocks.api.mockImplementation(async (path: string) => path === '/admin/status' ? { configured: true, authed: false } : path === '/admin/login' ? { token: 'admin-token' } : dashboard())
    await setup(); await state.login('correct-secret')
    expect(mocks.api).toHaveBeenCalledWith('/admin/login', { method: 'POST', body: { secret: 'correct-secret' } })
    expect(mocks.setAdminToken).toHaveBeenLastCalledWith('admin-token')
    expect(state.authed.value).toBe(true)
    expect(state.data.value.questions).toHaveLength(1)
    expect(mocks.refreshApp).toHaveBeenCalledOnce()
  })
  it('replaces the route query filter and refetches the dashboard', async () => {
    const { router } = await setup(undefined, '/admin?theme=cities&other=kept')
    expect(mocks.api).toHaveBeenCalledWith('/admin/dashboard', { query: { theme: 'cities' } })
    await state.filterTheme('countries'); await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ theme: 'countries', other: 'kept' })
    expect(mocks.api).toHaveBeenLastCalledWith('/admin/dashboard', { query: { theme: 'countries' } })
  })
  it('clears an expired token on every protected request returning 401', async () => {
    await setup()
    mocks.api.mockRejectedValueOnce(new ApiError(401, 'Session expirée'))
    await state.mutate('questions/delete', { questionId: 'q1' })
    expect(mocks.setAdminToken).toHaveBeenLastCalledWith(null)
    expect(state.authed.value).toBe(false)
    expect(state.error.value).toBe('Session expirée')
  })
  it('refetches dashboard and global app data after a mutation', async () => {
    await setup(); mocks.api.mockClear()
    await state.mutate('community-settings', { communityMinNetVotes: 7, communityEditProposalRemoveMinNetDown: 0 })
    expect(mocks.api.mock.calls.map(call => call[0])).toEqual(['/admin/community-settings', '/admin/dashboard'])
    expect(mocks.refreshApp).toHaveBeenCalledOnce()
  })
  it('builds a frontend-aware share link rather than trusting server URLs', async () => {
    await setup(); mocks.api.mockResolvedValueOnce({ battleId: 'battle-1', shareUrl: 'https://wrong.example/' })
    await state.createBattle('q1')
    expect(state.battleResult.value?.shareUrl).toBe('https://quiz.example/#/geobattle/battle-1')
  })
  it('forgets the token even if logout encounters a network error', async () => {
    await setup(); mocks.api.mockRejectedValueOnce(new ApiError(0, 'Réseau indisponible'))
    await state.logout()
    expect(state.authed.value).toBe(false)
    expect(mocks.setAdminToken).toHaveBeenLastCalledWith(null)
    expect(mocks.refreshApp).toHaveBeenCalledOnce()
  })
  it('shows a successful mutation notice and confirmation only executes after consent', async () => {
    await setup(); const action = vi.fn().mockResolvedValue(undefined)
    state.ask('Supprimer ?', action)
    expect(action).not.toHaveBeenCalled()
    await state.confirm()
    expect(action).toHaveBeenCalledOnce()
    expect(state.confirmation.value).toBeNull()
    await state.mutate('themes/reorder', { themeIds: ['cities'] }, 'Ordre enregistré.')
    expect(state.notice.value).toBe('Ordre enregistré.')
  })
})

describe('administration — formulaires', () => {
  it('saves the selected default quiz theme', async () => {
    const { wrapper } = await setup((await import('./AdminThemes.vue')).default)
    const select = wrapper.find('select')
    expect((select.element as HTMLSelectElement).value).toBe('cities')
    await select.setValue('countries')
    expect(mocks.api).toHaveBeenCalledWith('/admin/themes/default', { method: 'POST', body: { themeId: 'countries' } })
  })
  it('shows the login form instead of protected tables without authentication', async () => {
    mocks.api.mockResolvedValue({ configured: true, authed: false })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: AdminView }] })
    await router.push('/admin'); await router.isReady()
    const wrapper = mount(AdminView, { global: { plugins: [router] } }); wrappers.push(wrapper); await flushPromises()
    expect(wrapper.find('input[type=password]').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(false)
  })
  it('validates JSON before posting and sends the import envelope as raw text', async () => {
    const { wrapper } = await setup(AdminImport)
    await wrapper.find('textarea').setValue('invalid json')
    const submit = wrapper.findAll('button').find(button => button.text() === 'Importer')!
    await submit.trigger('click')
    expect(wrapper.text()).toContain('JSON invalide')
    expect(mocks.api).not.toHaveBeenCalledWith('/admin/questions/import-geojson', expect.anything())
    const source = JSON.stringify({ type: 'FeatureCollection', features: [] })
    await wrapper.find('textarea').setValue('\uFEFF' + source)
    mocks.api.mockResolvedValueOnce({ imported: 3, errors: ['Une entrée ignorée'] })
    await submit.trigger('click'); await flushPromises()
    expect(mocks.api).toHaveBeenCalledWith('/admin/questions/import-geojson', { method: 'POST', body: undefined, rawBody: JSON.stringify({ themeId: 'cities', geojson: source }) })
    expect(wrapper.text()).toContain('3 question(s) enregistrée(s)')
    expect(wrapper.text()).toContain('Une entrée ignorée')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })
  it('saves all editable question fields while preserving the readonly area', async () => {
    const Editor = defineComponent({ setup: () => () => h(AdminQuestionEditor, { question, onClose: vi.fn() }) })
    await setup(Editor)
    const modal = document.querySelector('[role=dialog]')!
    const text = modal.querySelector('textarea')!
    text.value = 'Où est Paris maintenant ?'; text.dispatchEvent(new Event('input', { bubbles: true }))
    modal.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises()
    expect(mocks.api).toHaveBeenCalledWith('/admin/questions/update', expect.objectContaining({ body: expect.objectContaining({ questionId: 'q1', text: 'Où est Paris maintenant ?', themeId: 'cities', lat: 48.8566, lng: 2.3522, toleranceM: 50000, approved: true, imgUrl: '', youtubeUrl: '', description: '' }) }))
    expect(question.answerArea.type).toBe('Polygon')
  })
  it('requires confirmation for all-theme deletion, including unlisted questions', async () => {
    const { wrapper } = await setup(AdminQuestions, '/admin?theme=cities')
    const remove = wrapper.findAll('button').find(button => button.text() === 'Supprimer toutes les questions du thème')!
    await remove.trigger('click')
    expect(state.confirmation.value?.description).toContain('au-delà des 400')
    await state.confirm()
    expect(mocks.api).toHaveBeenCalledWith('/admin/questions/delete-bulk', expect.objectContaining({ body: { deleteAllInTheme: true, themeId: 'cities' } }))
  })
})
