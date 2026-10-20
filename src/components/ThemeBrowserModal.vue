<!-- Props: open, themes, themeStats, isGuest?, onSelectTheme; Emits: update:open; Slots: —; Exposed: — -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Theme, ThemeStat } from '$lib/types'
import ThemeDirectoryContent from './ThemeDirectoryContent.vue'
const props = withDefaults(defineProps<{ open?: boolean; themes: Theme[]; themeStats: Record<string, ThemeStat | undefined>; isGuest?: boolean; onSelectTheme: (themeId:string)=>void }>(), { open:false, isGuest:false })
const emit = defineEmits<{ 'update:open':[value:boolean] }>()
const router = useRouter(); const search = ref(''); const rateBusyId = ref<string|null>(null); const dialog = ref<HTMLElement>()
function close() { emit('update:open',false); search.value='' }
function pick(id:string) { props.onSelectTheme(id); close() }
function keydown(e:KeyboardEvent) { if(e.key==='Escape' && props.open) close() }
watch(()=>props.open,value=>{ if(typeof document==='undefined')return; if(value){ document.addEventListener('keydown',keydown); void nextTick(()=>dialog.value?.focus()) } else document.removeEventListener('keydown',keydown) }, { immediate: true })
onBeforeUnmount(()=>document.removeEventListener('keydown',keydown))
function fullDirectory() { close(); void router.push('/themes') }
</script>
<template>
  <Teleport to="body"><div v-if="open" class="modal-backdrop" role="presentation" @click.self="close"><section ref="dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="theme-browser-title" tabindex="-1" @keydown.esc.stop="close">
    <header class="modal-header"><h2 id="theme-browser-title">Thèmes</h2><button type="button" class="btn btn-ghost btn-sm" @click="close">Fermer</button></header>
    <div class="modal-body"><ThemeDirectoryContent :themes="themes" :theme-stats="themeStats" v-model:search="search" v-model:rate-busy-id="rateBusyId" :is-guest="isGuest" :on-pick-theme="pick"/><div class="modal-footer"><button type="button" class="btn btn-secondary" @click="fullDirectory">Voir tous les thèmes</button></div></div>
  </section></div></Teleport>
</template>
