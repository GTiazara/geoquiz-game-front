<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Layers, MapPinned } from 'lucide-vue-next'
import { api } from '$lib/api'
import { app, isRegistered } from '$lib/appStore'
import { asset } from '$lib/appUrl'
import type { FlashTheme } from '$lib/types'

const flashCount = ref<number | null>(null)

/** Le catalogue reste affichable même si le décompte des thèmes échoue. */
onMounted(async () => {
  try {
    const result = await api<{ themes: FlashTheme[] }>('/flash/themes')
    flashCount.value = result.themes.length
  } catch {
    flashCount.value = null
  }
})
</script>

<template>
  <div class="showcase">
    <header class="site-header">
      <RouterLink to="/" class="brand">
        <img :src="asset('icons/logo.png')" alt="" />
        <span>Geo<span class="brand-accent">Pinpoint</span></span>
      </RouterLink>
      <div class="site-actions">
        <nav class="site-nav" aria-label="Site">
          <RouterLink to="/a-propos">À propos</RouterLink>
          <RouterLink to="/privacy">Confidentialité</RouterLink>
        </nav>
        <RouterLink v-if="!isRegistered()" to="/onboard?mode=login" class="btn btn-primary btn-sm">Se connecter</RouterLink>
        <RouterLink v-else to="/compte" class="btn btn-secondary btn-sm">{{ app.player?.pseudo }}</RouterLink>
      </div>
    </header>

    <section class="hero">
      <span class="eyebrow">Catalogue</span>
      <h1>Choisis un quiz</h1>
      <p>Chaque jeu s’ouvre dans son propre espace. GeoPinpoint reste le quiz sur carte, avec ses menus, ses thèmes et ses duels.</p>
    </section>

    <section class="catalog" aria-label="Jeux">
      <RouterLink to="/geopinpoint" class="surface game">
        <span class="game-mark"><MapPinned :size="26" /></span>
        <div>
          <h2>GeoPinpoint</h2>
          <p>Place le lieu sur une carte muette. Thèmes, classements, Geobattle et aventures historiques.</p>
        </div>
        <span class="btn btn-primary">Ouvrir le jeu</span>
      </RouterLink>
      <RouterLink to="/flashcards" class="surface game">
        <span class="game-mark alt"><Layers :size="26" /></span>
        <div>
          <h2>Flashcards</h2>
          <p>Image, texte, vidéo ou audio. Quatre réponses, une seule juste, puis le verso révèle le contexte.</p>
        </div>
        <span class="btn btn-secondary">{{ flashCount == null ? 'Voir les thèmes' : `${flashCount} thème${flashCount > 1 ? 's' : ''}` }}</span>
      </RouterLink>
    </section>

    <footer class="site-footer">
      <span>© GeoPinpoint</span>
      <RouterLink to="/a-propos">À propos</RouterLink>
      <RouterLink to="/privacy">Confidentialité</RouterLink>
    </footer>
  </div>
</template>

<style scoped>
.showcase { min-height: 100dvh; min-height: 100svh; display: flex; flex-direction: column; overflow-x: clip; background: linear-gradient(180deg, #f3fbf9 0%, var(--color-canvas) 220px); }
.site-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; padding-top: calc(12px + env(safe-area-inset-top)); padding-left: calc(16px + env(safe-area-inset-left)); padding-right: calc(16px + env(safe-area-inset-right)); }
.site-header .brand { flex: 1; min-width: 0; font-size: 18px; white-space: nowrap; }
.site-header .brand span { overflow: hidden; text-overflow: ellipsis; }
.site-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.site-actions .btn { min-height: 44px; }
.site-nav { display: none; }
.hero { padding: 28px 16px 8px; padding-left: calc(16px + env(safe-area-inset-left)); padding-right: calc(16px + env(safe-area-inset-right)); }
.hero h1 { font-size: clamp(32px, 10vw, 60px); margin-top: 8px; }
.hero p { margin-top: 12px; color: var(--muted); font-size: 16px; line-height: 1.5; }
.catalog { display: grid; gap: 12px; padding: 20px 16px 28px; padding-left: calc(16px + env(safe-area-inset-left)); padding-right: calc(16px + env(safe-area-inset-right)); }
.game { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px 14px; align-items: start; padding: 16px; color: inherit; }
.game:hover { border-color: var(--primary-ring); color: inherit; }
.game h2, .game p { overflow-wrap: anywhere; }
.game p { color: var(--muted); margin-top: 6px; }
.game .btn { grid-column: 1 / -1; width: 100%; min-height: 48px; }
.game-mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; background: var(--primary-soft); color: var(--primary-strong); }
.game-mark.alt { background: var(--accent-soft); color: #92400e; }
.site-footer { margin-top: auto; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px 16px; padding: 16px; padding-bottom: calc(16px + env(safe-area-inset-bottom)); color: var(--muted); font-size: 13px; border-top: 1px solid var(--border); }
.site-footer a { color: var(--muted); font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }
@media (min-width: 640px) {
  .site-header { padding: 18px 28px; }
  .site-header .brand { font-size: 21px; }
  .site-nav { display: flex; align-items: center; gap: 16px; }
  .site-nav a { color: var(--muted); font-size: 14px; font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }
  .hero { padding: 48px 28px 12px; max-width: 820px; }
  .hero p { font-size: 18px; max-width: 640px; }
  .catalog { gap: 16px; padding: 28px; max-width: 980px; }
  .game { grid-template-columns: auto minmax(0, 1fr) auto; gap: 18px; align-items: center; padding: 22px; }
  .game .btn { grid-column: auto; width: auto; }
  .game-mark { width: 56px; height: 56px; border-radius: 16px; }
  .site-footer { justify-content: space-between; padding: 18px 28px; }
}
</style>
