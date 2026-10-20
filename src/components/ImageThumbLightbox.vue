<!-- Props: src, thumbClass?, alt?; Emits: —; Slots: —; Exposed: — -->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
const props = withDefaults(defineProps<{ src: string; thumbClass?: string; alt?: string }>(), { thumbClass: '', alt: '' })
const open = ref(false)
const panel = ref<HTMLElement>()
function close() { open.value = false }
function keydown(e: KeyboardEvent) { if (e.key === 'Escape') close() }
watch(open, value => { if (value) { document.body.style.overflow = 'hidden'; document.addEventListener('keydown', keydown); requestAnimationFrame(() => panel.value?.focus()) } else { document.body.style.overflow = ''; document.removeEventListener('keydown', keydown) } })
onBeforeUnmount(() => { document.body.style.overflow = ''; document.removeEventListener('keydown', keydown) })
</script>
<template>
  <button type="button" class="group shrink-0 cursor-zoom-in rounded-lg border-0 bg-transparent p-0" aria-label="Agrandir l’image" @click="open = true"><img :src="src" :class="thumbClass" :alt="alt" loading="lazy" decoding="async" /></button>
  <Teleport to="body"><div v-if="open" class="modal-backdrop" role="presentation" @click.self="close"><section ref="panel" class="modal lg image-lightbox" role="dialog" aria-modal="true" aria-label="Image en grand" tabindex="-1"><header class="modal-header"><span>Agrandissement</span><button type="button" class="btn btn-secondary btn-sm" aria-label="Fermer" @click="close">Fermer</button></header><div class="modal-body image-lightbox__body"><img :src="src" :alt="alt || 'Agrandissement'" loading="eager" decoding="async" /></div></section></div></Teleport>
</template>
<style scoped>.image-lightbox { max-height: 96dvh; }.image-lightbox__body { display: grid; place-items: center; min-height: 0; background: #0f172a; }.image-lightbox__body img { max-width: 100%; max-height: 78dvh; object-fit: contain; }</style>
