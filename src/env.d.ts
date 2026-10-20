/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ROUTER_MODE?: 'hash' | 'history'
  readonly VITE_MATOMO_URL?: string
  readonly VITE_MATOMO_SITE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __gpAppReady?: boolean
  __gpPendingGoogleTranslateBoot?: () => void
  _paq?: unknown[][]
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
