<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RefreshCw, X } from 'lucide-vue-next'
import { api, errorMessage } from '$lib/api'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const scope = ref<'daily' | 'global'>('daily')
const rows = ref<Array<{ pseudo: string; xp: number }>>([])
const loading = ref(false)
const error = ref('')
const dialog = ref<HTMLElement>()
let controller: AbortController | undefined
let previousFocus: HTMLElement | null = null

function close() { emit('update:open', false) }

async function load() {
  controller?.abort()
  if (!props.open) return
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = ''
  rows.value = []
  try {
    const result = await api<{ leaderboard: Array<{ pseudo: string; xp: number }> }>('/flash/leaderboard', { query: { scope: scope.value }, signal: request.signal })
    if (!request.signal.aborted) rows.value = result.leaderboard
  } catch (err) {
    if (!request.signal.aborted) error.value = errorMessage(err)
  } finally {
    if (controller === request) loading.value = false
  }
}

function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
  }
  if (event.key !== 'Tab') return
  const elements = dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')
  if (!elements?.length) return
  const first = elements[0]!
  const last = elements[elements.length - 1]!
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => [props.open, scope.value], () => { void load() }, { immediate: true })
watch(() => props.open, async open => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    dialog.value?.focus()
  } else {
    previousFocus?.focus()
    previousFocus = null
  }
}, { immediate: true })
onBeforeUnmount(() => {
  controller?.abort()
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" role="presentation" @click.self="close">
      <section ref="dialog" class="modal flash-leaderboard" role="dialog" aria-modal="true" aria-labelledby="flash-leaderboard-title" tabindex="-1" @keydown="keydown">
        <header class="modal-header">
          <h2 id="flash-leaderboard-title">Classement Flashcards</h2>
          <button type="button" class="icon-button" aria-label="Fermer le classement" title="Fermer" @click="close"><X :size="20" /></button>
        </header>
        <div class="modal-body stack" :aria-busy="loading">
          <div class="segmented" aria-label="Période du classement">
            <button type="button" :class="{ active: scope === 'daily' }" :aria-pressed="scope === 'daily'" @click="scope = 'daily'">Journalier</button>
            <button type="button" :class="{ active: scope === 'global' }" :aria-pressed="scope === 'global'" @click="scope = 'global'">Global</button>
          </div>
          <p class="subtle">{{ scope === 'daily' ? 'Aujourd’hui (UTC) · Tous les joueurs' : 'Tous les temps · Inscrits' }}</p>
          <div aria-live="polite">
            <p v-if="loading" class="loading"><span class="spinner" /> Chargement du classement…</p>
            <div v-else-if="error" class="stack-sm">
              <p class="alert" role="alert">{{ error }}</p>
              <button type="button" class="btn btn-secondary" @click="load"><RefreshCw :size="16" /> Réessayer</button>
            </div>
            <ol v-else-if="rows.length" class="ranking" aria-label="Classement par XP Flashcards">
              <li v-for="(row, index) in rows" :key="`${index}:${row.pseudo}`">
                <span class="rank">{{ index + 1 }}</span>
                <span class="player">{{ row.pseudo }}</span>
                <strong>{{ row.xp.toLocaleString('fr-FR') }} XP</strong>
              </li>
            </ol>
            <p v-else class="empty">Aucun score pour le moment.</p>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.flash-leaderboard { width: min(100%, 560px); }
.modal-header h2 { min-width: 0; font-size: 20px; overflow-wrap: anywhere; }
.modal-header .icon-button { width: 44px; height: 44px; flex-shrink: 0; }
.segmented button { min-height: 44px; flex: 1; }
.ranking { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ranking li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 12px; border-radius: 8px; background: var(--surface-2); }
.rank { color: var(--muted); font-variant-numeric: tabular-nums; }
.player { overflow-wrap: anywhere; }
.ranking strong { color: var(--primary-strong); font-size: 14px; white-space: nowrap; }
</style>