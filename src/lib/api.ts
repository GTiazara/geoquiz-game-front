/**
 * Client HTTP de l’API GeoPinpoint.
 *
 * - `VITE_API_BASE_URL` : base de l’API (défaut `/api`, proxifié par Vite en dev).
 * - Identité joueur : `X-Device-Id` (localStorage), éventuellement attribué par le serveur.
 * - Administration : `X-Admin-Token` (sessionStorage) après `POST /admin/login`.
 */

const DEVICE_KEY = 'geopin_device'
const ADMIN_KEY = 'geopin_admin_token'
const ACCOUNT_KEY = 'geopin_account_token'
const DEVICE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSec: number | null = null,
    public body: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function storageGet(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key)
  } catch {
    return null
  }
}

function storageSet(store: 'local' | 'session', key: string, value: string | null): void {
  try {
    const s = store === 'local' ? localStorage : sessionStorage
    if (value == null) s.removeItem(key)
    else s.setItem(key, value)
  } catch {
    /* navigation privée : identité volatile */
  }
}

let deviceIdMemory: string | null = null
let accountTokenMemory: string | null = null

export function getAccountToken(): string | null {
  try { return localStorage.getItem(ACCOUNT_KEY) } catch { return accountTokenMemory }
}

export function setAccountToken(token: string | null): void {
  accountTokenMemory = token
  storageSet('local', ACCOUNT_KEY, token)
}

export function getDeviceId(): string | null {
  const v = deviceIdMemory ?? storageGet('local', DEVICE_KEY)
  return v && DEVICE_PATTERN.test(v) ? v : null
}

export function setDeviceId(id: string | null): void {
  deviceIdMemory = id
  storageSet('local', DEVICE_KEY, id)
}

/** Oublie l’appareil courant (après suppression de compte) : un nouvel identifiant sera attribué. */
export function resetDeviceId(): void {
  setAccountToken(null)
  setDeviceId(null)
}

export function getAdminToken(): string | null {
  return storageGet('session', ADMIN_KEY)
}

export function setAdminToken(token: string | null): void {
  storageSet('session', ADMIN_KEY, token)
}

/** URL absolue d’un chemin de l’API (ex. pour `EventSource`). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Corps déjà sérialisé (ex. gros GeoJSON) envoyé tel quel. */
  rawBody?: string
  query?: Record<string, string | number | boolean | null | undefined>
  signal?: AbortSignal
}

export async function apiFetch(path: string, opts: RequestOptions = {}): Promise<Response> {
  let url = apiUrl(path)
  if (opts.query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    const s = qs.toString()
    if (s) url += (url.includes('?') ? '&' : '?') + s
  }
  const headers: Record<string, string> = { Accept: 'application/json' }
  const device = getDeviceId()
  if (device) headers['X-Device-Id'] = device
  const admin = getAdminToken()
  if (admin) headers['X-Admin-Token'] = admin
  const account = getAccountToken()
  if (account) headers.Authorization = `Bearer ${account}`
  let body: string | undefined
  if (opts.rawBody !== undefined) {
    body = opts.rawBody
    headers['Content-Type'] = 'application/json'
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body)
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: opts.signal, credentials: 'include' })
  if (res.status === 401 && account && getAccountToken() === account) {
    resetDeviceId()
    window.dispatchEvent(new Event('geopin-session-expired'))
    if (path === '/bootstrap') return apiFetch(path, opts)
  }
  const assigned = res.headers.get('X-Device-Id')
  if (assigned && assigned !== device && DEVICE_PATTERN.test(assigned)) setDeviceId(assigned)
  return res
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Requête JSON ; lève `ApiError` (message serveur `{ message }`) si le statut n’est pas 2xx. */
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, opts)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'Serveur injoignable. Vérifiez votre connexion.')
  }
  const data = await readJson(res)
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : typeof data === 'string' && data.length < 300 && data
          ? data
          : `Erreur ${res.status}`
    const ra = Number(res.headers.get('Retry-After'))
    throw new ApiError(res.status, message, Number.isFinite(ra) && ra > 0 ? ra : null, data)
  }
  return data as T
}

export function errorMessage(err: unknown, fallback = 'Une erreur est survenue.'): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}
