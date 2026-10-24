import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ThemeStars from '../src/components/ThemeStars.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import HistoryAdventureCover from '../src/components/HistoryAdventureCover.vue'
import GoogleTranslateLangBar from '../src/components/GoogleTranslateLangBar.vue'
import * as googleTranslate from '../src/lib/googleTranslateBrowser'
import OnboardView from '../src/views/OnboardView.vue'
import CompteView from '../src/views/CompteView.vue'
import { api, getAccountToken, resetDeviceId, setAccountToken } from '../src/lib/api'
import { app, refreshApp } from '../src/lib/appStore'

const { push, routeQuery } = vi.hoisted(() => ({ push: vi.fn(), routeQuery: {} as Record<string, string> }))
vi.mock('vue-router', async (original) => ({ ...await original<typeof import('vue-router')>(), useRoute: () => ({ query: routeQuery }), useRouter: () => ({ push }) }))
vi.mock('../src/lib/api', async (original) => ({ ...await original<typeof import('../src/lib/api')>(), api: vi.fn() }))
vi.mock('../src/lib/appStore', () => {
  const state = { player: { pseudo: 'Invite', isGuest: true, xpTotal: 10, xpByTheme: {} }, themes: [], accountAuthenticated: false, ready: true, error: '' }
  return { app: state, refreshApp: vi.fn(), isRegistered: () => state.player?.isGuest === false }
})

describe('shared components', () => {
  it('ouvre les langues et transmet le choix depuis le bouton compact', async () => {
    const apply = vi.spyOn(googleTranslate, 'applyTranslateUiChoiceWithRetry').mockImplementation(() => {})
    const wrapper = mount(GoogleTranslateLangBar, { attachTo: document.body, props: { compact: true } })
    try {
      const trigger = wrapper.get('button')
      expect(trigger.attributes('aria-expanded')).toBe('false')
      await trigger.trigger('click')
      expect(trigger.attributes('aria-expanded')).toBe('true')
      const english = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(option => option.textContent?.includes('English'))!
      english.click()
      await wrapper.vm.$nextTick()
      expect(apply).toHaveBeenCalledWith('en')
      expect(document.querySelector('[role="listbox"]')).toBeNull()
      await trigger.trigger('click')
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()
      expect(trigger.attributes('aria-expanded')).toBe('false')
    } finally {
      wrapper.unmount()
      apply.mockRestore()
    }
  })

  it('renders a partial amber star average', () => {
    const wrapper = mount(ThemeStars, { props: { avg: 3.5 } })
    expect(wrapper.findAll('button')).toHaveLength(5)
    expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.html()).toContain('width: 50%')
  })

  it('emits the bound open state when confirming is dismissed', async () => {
    const wrapper = mount(ConfirmDialog, { attachTo: document.body, props: { open: true, title: 'Supprimer ?', description: 'Cette action est définitive.' } })
    expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain('Supprimer ?')
    document.querySelector('.modal-footer button')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })

  it('shows a fallback emoji when no cover image is provided', () => {
    const wrapper = mount(HistoryAdventureCover, { props: { emoji: '🏛️', title: 'Antiquité' } })
    expect(wrapper.text()).toContain('🏛️')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.sr-only').text()).toBe('Antiquité')
  })
})

describe('compte pseudo et mot de passe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDeviceId()
    for (const key of Object.keys(routeQuery)) delete routeQuery[key]
    app.accountAuthenticated = false
    vi.mocked(api).mockResolvedValue({ token: 'session-test' })
    vi.mocked(refreshApp).mockResolvedValue(undefined)
  })

  it('crée un compte sans autre information et conserve sa session', async () => {
    const wrapper = mount(OnboardView)
    await wrapper.get('#pseudo').setValue('Atlas2042')
    await wrapper.get('#password').setValue('mot-de-passe-123')
    await wrapper.get('#password-confirm').setValue('mot-de-passe-123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/auth/register', { method: 'POST', body: { pseudo: 'Atlas2042', password: 'mot-de-passe-123' } })
    expect(getAccountToken()).toBe('session-test')
    expect(refreshApp).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
    wrapper.unmount()
  })

  it('permet de se connecter avec son pseudo et son mot de passe', async () => {
    const wrapper = mount(OnboardView)
    await wrapper.findAll('.segmented button')[1]!.trigger('click')
    expect(wrapper.find('#password-confirm').exists()).toBe(false)
    expect(wrapper.get('#password').attributes('autocomplete')).toBe('current-password')
    await wrapper.get('#pseudo').setValue('Atlas2042')
    await wrapper.get('#password').setValue('mot-de-passe-123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/auth/login', { method: 'POST', body: { pseudo: 'Atlas2042', password: 'mot-de-passe-123' } })
    wrapper.unmount()
  })

  it('refuse une confirmation différente avant tout appel serveur', async () => {
    const wrapper = mount(OnboardView)
    await wrapper.get('#password').setValue('mot-de-passe-123')
    await wrapper.get('#password-confirm').setValue('autre-mot-de-passe')
    await wrapper.get('form').trigger('submit')
    expect(api).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('ne correspondent pas')
    wrapper.unmount()
  })

  it('demande seulement un mot de passe à un ancien compte et reprend la navigation', async () => {
    const previousPlayer = app.player
    app.player = { pseudo: 'AncienVoyageur', isGuest: false, xpTotal: 75, xpByTheme: { pays: 75 }, updatedAt: '2026-10-20' }
    routeQuery.next = '/themes'
    const wrapper = mount(CompteView)
    expect(wrapper.text()).toContain('Ton compte @AncienVoyageur a été retrouvé')
    const form = wrapper.get('form')
    expect(form.findAll('input').map(input => input.attributes('type'))).toEqual(['password', 'password'])
    await form.get('#account-password').setValue('mon-nouveau-secret-123')
    await form.get('#account-password-confirm').setValue('mon-nouveau-secret-123')
    await form.trigger('submit')
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/auth/register', { method: 'POST', body: { pseudo: 'AncienVoyageur', password: 'mon-nouveau-secret-123' } })
    expect(getAccountToken()).toBe('session-test')
    expect(app.player.xpTotal).toBe(75)
    expect(push).toHaveBeenCalledWith('/themes')
    wrapper.unmount()
    app.player = previousPlayer
  })

  it('propose automatiquement le mot de passe aux anciens comptes sans bloquer la navigation', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { router } = await import('../src/router')
    const previousPlayer = app.player
    await router.push('/themes')
    expect(router.currentRoute.value.path).toBe('/themes')
    app.player = { pseudo: 'AncienVoyageur', isGuest: false, xpTotal: 75, xpByTheme: { pays: 75 }, updatedAt: '2026-10-20' }
    await router.push('/geobattle')
    expect(router.currentRoute.value.path).toBe('/compte')
    expect(router.currentRoute.value.query.next).toBe('/geobattle')
    await router.push('/themes')
    expect(router.currentRoute.value.path).toBe('/themes')
    app.player = previousPlayer
    scrollTo.mockRestore()
  })

  it('déconnecte le compte et oublie la session locale', async () => {
    app.accountAuthenticated = true
    setAccountToken('session-test')
    const wrapper = mount(CompteView)
    const logout = wrapper.findAll('button').find(button => button.text().includes('Se déconnecter'))!
    await logout.trigger('click')
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    expect(getAccountToken()).toBeNull()
    expect(refreshApp).toHaveBeenCalled()
    wrapper.unmount()
  })
})
