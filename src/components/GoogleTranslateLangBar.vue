<!-- Props: embedded?, compact?; Emits: —; Slots: —; Exposed: — -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { applyTranslateUiChoiceWithRetry, getCurrentGoogleTranslateTarget, getGoogleTranslateCookieTarget } from '$lib/googleTranslateBrowser'
import { TRANSLATE_UI_LANGS, normalizeTranslateUiCode } from '$lib/translate_languages'
const props = withDefaults(defineProps<{ embedded?: boolean; compact?: boolean }>(), { embedded: false, compact: false })
const open = ref(false); const currentUi = ref('fr'); const button = ref<HTMLButtonElement>(); const menu = ref<HTMLElement>(); const menuStyle = ref<Record<string,string>>({})
const current = computed(() => TRANSLATE_UI_LANGS.find(lang => lang.code === currentUi.value) ?? TRANSLATE_UI_LANGS[0]!)
function sync() { currentUi.value = normalizeTranslateUiCode(getGoogleTranslateCookieTarget() || getCurrentGoogleTranslateTarget()) }
function position() { if (!button.value) return; const r = button.value.getBoundingClientRect(); const width = Math.min(280, Math.max(220, r.width)); menuStyle.value = { top: `${r.bottom + 4}px`, right: `${Math.max(10, window.innerWidth - r.right)}px`, width: `${width}px`, maxHeight: `${Math.min(window.innerHeight * .72, window.innerHeight - r.bottom - 20)}px` } }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false }
function onOutside(e: MouseEvent) { if (!(e.target instanceof Node) || (button.value?.contains(e.target) ?? false) || (menu.value?.contains(e.target) ?? false)) return; open.value = false }
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { if (props.embedded) return; sync(); timer = setInterval(sync, 500); document.addEventListener('keydown', onKey); document.addEventListener('click', onOutside); window.addEventListener('resize', position); window.addEventListener('scroll', position, true) })
onBeforeUnmount(() => { if (timer) clearInterval(timer); document.removeEventListener('keydown', onKey); document.removeEventListener('click', onOutside); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) })
watch(open, value => { if (value) { position(); requestAnimationFrame(position) } })
function pick(code: string) { applyTranslateUiChoiceWithRetry(code); sync(); open.value = false }
</script>
<template>
  <div v-if="!embedded" class="translate-bar" translate="no">
    <button ref="button" type="button" class="btn btn-secondary btn-sm" aria-label="Choisir la langue d’affichage (Google Translate)" aria-haspopup="listbox" :aria-expanded="open" @click.stop="open = !open"><span aria-hidden="true">{{ current.flag }}</span><span v-if="!compact">{{ current.label }}</span><span aria-hidden="true">{{ open ? '▴' : '▾' }}</span></button>
    <Teleport to="body"><ul v-if="open" ref="menu" class="translate-menu" :style="menuStyle" role="listbox" aria-label="Langues disponibles" translate="no"><li v-for="lang in TRANSLATE_UI_LANGS" :key="lang.code"><button type="button" role="option" class="translate-menu__item" :aria-selected="lang.code === currentUi" @click="pick(lang.code)"><span aria-hidden="true">{{ lang.flag }}</span>{{ lang.label }}</button></li></ul></Teleport>
  </div>
</template>
<style scoped>.translate-bar { display:flex; justify-content:flex-end; }.translate-menu { position:fixed; z-index:110000; margin:0; padding:6px; overflow:auto; list-style:none; border:1px solid var(--border); border-radius:12px; background:white; box-shadow:var(--shadow-lg); }.translate-menu__item { display:flex; width:100%; gap:10px; align-items:center; padding:9px 10px; border:0; border-radius:8px; background:transparent; color:var(--text); text-align:left; }.translate-menu__item:hover,.translate-menu__item[aria-selected=true] { background:var(--primary-soft); color:var(--primary-strong); }</style>
