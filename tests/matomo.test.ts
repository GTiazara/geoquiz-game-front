import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Matomo', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_MATOMO_URL', 'https://matomo.gtiazara.fr/')
    vi.stubEnv('VITE_MATOMO_SITE_ID', '5')
    delete window._paq
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete window._paq
    document.head.querySelectorAll('script[src$="/matomo.js"]').forEach(script => script.remove())
  })

  it('initializes site 5 with asynchronous loading and link tracking only once', async () => {
    const { initMatomo } = await import('../src/lib/matomo')
    initMatomo()
    initMatomo()

    expect(window._paq).toEqual([
      ['setTrackerUrl', 'https://matomo.gtiazara.fr/matomo.php'],
      ['setSiteId', '5'],
      ['trackPageView'],
      ['enableLinkTracking'],
    ])
    const scripts = document.head.querySelectorAll<HTMLScriptElement>('script[src$="/matomo.js"]')
    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.src).toBe('https://matomo.gtiazara.fr/matomo.js')
    expect(scripts[0]?.async).toBe(true)
  })

  it('tracks subsequent page views with the current URL and title', async () => {
    const { initMatomo, trackPageView } = await import('../src/lib/matomo')
    initMatomo()
    trackPageView()

    expect(window._paq?.slice(-3)).toEqual([
      ['setCustomUrl', window.location.href],
      ['setDocumentTitle', document.title],
      ['trackPageView'],
    ])
  })

  it.each(['VITE_MATOMO_URL', 'VITE_MATOMO_SITE_ID'])('stays disabled without %s', async variable => {
    vi.stubEnv(variable, '')
    const { initMatomo, trackPageView } = await import('../src/lib/matomo')
    initMatomo()
    trackPageView()

    expect(window._paq).toBeUndefined()
    expect(document.head.querySelector('script[src$="/matomo.js"]')).toBeNull()
  })
})
