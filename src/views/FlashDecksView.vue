<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorMessage } from '$lib/api'
import type { FlashTheme } from '$lib/types'

const router = useRouter()
const themes = ref<FlashTheme[]>([])
const loading = ref(true)
const error = ref('')

/** Charge les thèmes publiés. Les paquets s’ouvrent ensuite dans le thème. */
onMounted(async () => {
  try {
    const result = await api<{ themes: FlashTheme[] }>('/flash/themes')
    themes.value = result.themes
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
})

function openTheme(id: string) {
  void router.push(`/flashcards/theme/${encodeURIComponent(id)}`)
}
</script>

<template>
  <section class="stack">
    <header class="page-heading">
      <span class="eyebrow">Flashcards</span>
      <h1>Thèmes</h1>
      <p>Choisis un thème, puis un paquet. Chaque carte propose quatre réponses avant de se retourner.</p>
    </header>
    <p v-if="loading" class="subtle">Chargement des thèmes…</p>
    <p v-else-if="error" class="alert" role="alert">{{ error }}</p>
    <div v-else-if="themes.length" class="themes">
      <button v-for="theme in themes" :key="theme.id" type="button" class="surface theme" @click="openTheme(theme.id)">
        <img v-if="theme.coverImageUrl" :src="theme.coverImageUrl" alt="" />
        <strong>{{ theme.emoji }} {{ theme.name }}</strong>
        <p class="subtle clamp">{{ theme.description }}</p>
        <span class="badge neutral">{{ theme.deckCount ?? 0 }} paquet{{ (theme.deckCount ?? 0) > 1 ? 's' : '' }}</span>
      </button>
    </div>
    <p v-else class="empty">Aucun thème publié pour le moment.</p>
  </section>
</template>

<style scoped>
.themes { display: grid; gap: 12px; }
.theme { display: grid; gap: 8px; width: 100%; min-height: 48px; padding: 16px; text-align: left; color: inherit; }
.theme img { width: 100%; height: 120px; object-fit: cover; border-radius: 10px; }
.theme:hover { border-color: var(--primary-ring); }
@media (min-width: 640px) {
  .themes { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
}
</style>
