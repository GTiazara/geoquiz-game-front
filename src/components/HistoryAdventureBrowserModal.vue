<!-- Props: open, adventures, selectedId?, onSelectAdventure; Emits: update:open; Slots: —; Exposed: — -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { StoryAdventure } from '$lib/historyAdventures'
import HistoryAdventureCover from './HistoryAdventureCover.vue'
const props = withDefaults(defineProps<{ open?: boolean; adventures: StoryAdventure[]; selectedId?: string | null; onSelectAdventure: (id: string) => void }>(), { open: false, selectedId: null })
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const search = ref(''); const dialog = ref<HTMLElement>(); const searchInput = ref<HTMLInputElement>()
const filtered = computed(() => { const q = search.value.trim().toLowerCase(); return q ? props.adventures.filter(a => a.title.toLowerCase().includes(q) || a.period.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || (a.emoji?.includes(q) ?? false)) : props.adventures })
function close() { emit('update:open', false); search.value = '' }
function pick(id: string) { props.onSelectAdventure(id); close() }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) close() }
watch(() => props.open, value => { if (typeof document === "undefined") return; if (value) { document.addEventListener("keydown", onKey); void nextTick(() => searchInput.value?.focus()) } else { document.removeEventListener("keydown", onKey) } }, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>
<template>
  <Teleport to="body"><div v-if="open" class="modal-backdrop" role="presentation" @click.self="close">
    <section ref="dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="adventure-browser-title" @keydown.esc.stop="close">
      <header class="modal-header"><h2 id="adventure-browser-title">Aventures</h2><button type="button" class="btn btn-ghost btn-sm" @click="close">Fermer</button></header>
      <div class="modal-body"><label class="field"><span class="field-label">Rechercher une aventure</span><input ref="searchInput" v-model="search" type="search" placeholder="Rechercher…" /></label>
        <ul class="adventure-list"><li v-for="story in filtered" :key="story.id"><button type="button" class="adventure-card" :class="{ selected: story.id === selectedId }" @click="pick(story.id)"><HistoryAdventureCover :cover-image-url="story.coverImageUrl" :emoji="story.emoji" class="adventure-card__cover" /><span class="adventure-card__text"><strong>{{ story.emoji ? `${story.emoji} ` : '' }}{{ story.title }}</strong><small>{{ story.period }} · {{ story.steps.length }} étapes</small><span v-if="story.description?.trim()" class="adventure-card__description">{{ story.description }}</span></span></button></li><li v-if="!filtered.length" class="empty">Aucune aventure trouvée.</li></ul>
      </div>
    </section>
  </div></Teleport>
</template>
<style scoped>.adventure-list { display:grid; gap:9px; margin:16px 0 0; padding:0; list-style:none; }.adventure-card { display:flex; width:100%; gap:12px; padding:10px; border:1px solid var(--border); border-radius:14px; background:white; text-align:left; }.adventure-card:hover,.adventure-card.selected { border-color:var(--primary); background:var(--primary-soft); }.adventure-card__cover { width:64px; height:64px; flex:none; border-radius:10px; }.adventure-card__text { display:grid; align-content:center; min-width:0; gap:3px; }.adventure-card__text strong,.adventure-card__description { overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }.adventure-card__text strong { font-size:14px; }.adventure-card__text small { font-size:11px; }.adventure-card__description { color:var(--muted); font-size:12px; }.empty { padding:24px; color:var(--muted); }</style>
