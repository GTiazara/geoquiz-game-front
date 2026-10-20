import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const base = env.VITE_BASE_PATH || '/'
  return {
    base,
    resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
    plugins: [
      vue(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['icons/logo.svg', 'icons/logo.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'GeoPinpoint',
          short_name: 'GeoPinpoint',
          description: 'Quiz géographique sur carte sans labels : XP, thèmes, duels, contributions et votes communautaires.',
          theme_color: '#0f766e',
          background_color: '#f6f8fb',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api\//],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
      }),
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: { '/api': env.API_PROXY_TARGET || 'http://localhost:3000' },
    },
  }
})
