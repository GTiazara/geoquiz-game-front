<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { app } from '$lib/appStore'
import GoogleTranslateLangBar from '../components/GoogleTranslateLangBar.vue'
import ThemeDirectoryContent from '../components/ThemeDirectoryContent.vue'

const router = useRouter()
const search = ref('')
const rateBusyId = ref<string | null>(null)
function pickTheme(themeId: string) {
  void router.push({ path: '/', query: { theme: themeId } })
}
</script>

<template>
  <section>
    <header class="page-heading between">
      <div>
        <span class="eyebrow">Bibliothèque</span>
        <h1>Thèmes</h1>
        <p>Parcours les thèmes, découvre les plus populaires et lance un quiz sur la carte.</p>
      </div>
      <GoogleTranslateLangBar embedded compact />
    </header>
    <ThemeDirectoryContent
      :themes="app.themes"
      :theme-stats="app.themeStats"
      v-model:search="search"
      v-model:rate-busy-id="rateBusyId"
      :is-guest="app.player?.isGuest === true"
      :on-pick-theme="pickTheme"
    />
  </section>
</template>
