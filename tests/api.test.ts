import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, getAccountToken, getDeviceId, resetDeviceId, setAccountToken, setAdminToken } from '../src/lib/api'

const DEVICE = 'abcdefghijklmnop1234'

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    resetDeviceId()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('adopte l’identifiant attribué par le serveur puis le renvoie', async () => {
    const f = mockFetch(200, { ok: true }, { 'X-Device-Id': DEVICE })
    await api('/bootstrap')
    expect(getDeviceId()).toBe(DEVICE)
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].credentials).toBe('include')
    await api('/bootstrap')
    const headers = (f.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['X-Device-Id']).toBe(DEVICE)
  })

  it('envoie le jeton admin et sérialise le corps et la query', async () => {
    setAdminToken('tok')
    const f = mockFetch(200, {})
    await api('/admin/dashboard', { method: 'POST', body: { a: 1 }, query: { theme: 'x', empty: '' } })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin/dashboard?theme=x')
    expect((init.headers as Record<string, string>)['X-Admin-Token']).toBe('tok')
    expect(init.body).toBe('{"a":1}')
  })

  it('lève ApiError avec le message serveur et Retry-After', async () => {
    mockFetch(429, { message: 'Trop de requêtes' }, { 'Retry-After': '12' })
    const err = await api('/questions/x/enrich', { method: 'POST' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(429)
    expect((err as ApiError).message).toBe('Trop de requêtes')
    expect((err as ApiError).retryAfterSec).toBe(12)
  })

  it('envoie la session du compte indépendamment de l’identifiant du navigateur', async () => {
    setAccountToken('session-compte')
    const fetch = mockFetch(200, {})
    await api('/player')
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-compte')
    expect(getDeviceId()).toBeNull()
  })

  it('oublie une session expirée et recharge le bootstrap en invité', async () => {
    setAccountToken('session-expiree')
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Session expirée' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ player: { isGuest: true } }), { status: 200, headers: { 'X-Device-Id': DEVICE } }))
    vi.stubGlobal('fetch', fetch)
    const data = await api<{ player: { isGuest: boolean } }>('/bootstrap')
    expect(data.player.isGuest).toBe(true)
    expect(getAccountToken()).toBeNull()
    expect(getDeviceId()).toBe(DEVICE)
    expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined()
  })
})
