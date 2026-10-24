<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, errorMessage } from '$lib/api'
import { appUrl } from '$lib/appUrl'
import type { FlashDeck, FlashTheme } from '$lib/types'
import ShareGeoBattleLink from '../components/ShareGeoBattleLink.vue'

const route = useRoute()
const router = useRouter()
const themeId = computed(() => String(route.params.themeId ?? ''))
const theme = ref<FlashTheme | null>(null)
const decks = ref<FlashDeck[]>([])
const loading = ref(true)
const error = ref('')
const battleDeckId = ref('')

/** Charge les paquets publiés du thème ouvert. */
async function load() {
  loading.value = true
  error.value = ''
  theme.value = null
  decks.value = []
  try {
    const result = await api<{ theme: FlashTheme; decks: FlashDeck[] }>(`/flash/themes/${encodeURIComponent(themeId.value)}/decks`)
    theme.value = result.theme
    decks.value = result.decks
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}

function openDeck(id: string) {
  void router.push(`/flashcards/${encodeURIComponent(id)}`)
}

/** Crée un duel sur ce paquet et ouvre le lien à partager. */
async function createBattle(id: string, mode: 'async' | 'sync' = 'async') {
  if (battleDeckId.value) return
  battleDeckId.value = id
  error.value = ''
  try {
    const result = await api<{ battleId: string }>('/flash/battles', { method: 'POST', body: { deckId: id, mode } })
    await router.push(`/flashcards/battle/${encodeURIComponent(result.battleId)}`)
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    battleDeckId.value = ''
  }
}

watch(themeId, () => { void load() }, { immediate: true })
</script>

<template>
  <section class="stack">
    <header class="page-heading">
      <RouterLink to="/flashcards" class="subtle">← Thèmes</RouterLink>
      <span class="eyebrow">Flashcards</span>
      <h1>{{ theme ? `${theme.emoji} ${theme.name}` : 'Paquets' }}</h1>
      <p>{{ theme?.description || 'Plusieurs paquets peuvent partager le même thème.' }}</p>
    </header>
    <p v-if="loading" class="subtle">Chargement des paquets…</p>
    <p v-else-if="error" class="alert" role="alert">{{ error }}</p>
    <div v-else-if="decks.length" class="decks">
      <article v-for="deck in decks" :key="deck.id" class="surface deck">
        <button type="button" class="deck-open" @click="openDeck(deck.id)">
          <img v-if="deck.coverImageUrl" :src="deck.coverImageUrl" alt="" />
          <strong>{{ deck.emoji }} {{ deck.name }}</strong>
          <p class="subtle clamp">{{ deck.description }}</p>
          <span class="badge neutral">{{ deck.cardCount ?? 0 }} carte{{ (deck.cardCount ?? 0) > 1 ? 's' : '' }}</span>
        </button>
        <div class="actions">
          <button type="button" class="btn btn-primary deck-action" @click="openDeck(deck.id)">Jouer</button>
          <ShareGeoBattleLink :share-url="appUrl(`/flashcards/${deck.id}`)" button-label="Partager" dialog-heading="Partager le paquet" dialog-description="Envoie le lien pour jouer à ce paquet." :dialog-title-id="`share-${deck.id}`" share-title="Flashcards — GeoPinpoint" :share-text="`Joue au paquet ${deck.name}`" button-aria-label="Partager ce paquet" url-field-aria-label="Lien du paquet" tone="cyan" density="sm" />
          <button type="button" class="btn btn-secondary deck-action" :disabled="battleDeckId === deck.id" @click="createBattle(deck.id)">Duel</button>
          <button type="button" class="btn btn-secondary deck-action" :disabled="battleDeckId === deck.id" @click="createBattle(deck.id, 'sync')">Synchronisé</button>
        </div>
      </article>
    </div>
    <p v-else class="empty">Aucun paquet publié dans ce thème.</p>
  </section>
</template>

<style scoped>
.decks { display: grid; gap: 12px; }
.deck { display: grid; gap: 12px; padding: 16px; }
.deck-open { display: grid; gap: 8px; width: 100%; min-height: 48px; padding: 0; border: 0; background: transparent; text-align: left; color: inherit; cursor: pointer; }
.deck img { width: 100%; height: 120px; object-fit: cover; border-radius: 10px; }
.deck-action, .actions :deep(.btn) { min-height: 44px; }
.deck:hover { border-color: var(--primary-ring); }
@media (min-width: 640px) {
  .decks { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
}
</style>
