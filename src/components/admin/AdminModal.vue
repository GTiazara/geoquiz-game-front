<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
const props = defineProps<{ title: string; busy?: boolean; onClose: () => void }>()
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.busy) { event.preventDefault(); props.onClose() }
  if (event.key !== 'Tab' || !dialog.value) return
  const elements = [...dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
  const first = elements[0], last = elements[elements.length - 1]
  if (!first || !last) { event.preventDefault(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
onMounted(() => { previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.value?.focus(); document.addEventListener('keydown', keydown) })
onBeforeUnmount(() => { document.removeEventListener('keydown', keydown); previousFocus?.focus() })
</script>
<template><Teleport to="body"><div class="modal-backdrop" @click.self="!busy && onClose()"><section ref="dialog" class="modal" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" style="max-width:780px"><div class="modal-header between"><h2>{{ title }}</h2><button type="button" class="icon-button" aria-label="Fermer" :disabled="busy" @click="onClose">×</button></div><slot /></section></div></Teleport></template>

<style scoped>
.modal-header{flex-shrink:0}.modal :deep(form){display:flex;flex-direction:column;min-height:0;overflow:hidden}.modal :deep(.modal-body){flex:1;min-height:0}.modal :deep(.modal-footer){flex-shrink:0}
</style>
