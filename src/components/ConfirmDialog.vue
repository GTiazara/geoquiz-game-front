<!-- Props: open, title?, description?, confirmLabel?, cancelLabel?, variant?, busy?, onConfirm?, onCancel?; Emits: update:open; Slots: —; Exposed: — -->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
const props = withDefaults(defineProps<{ open?: boolean; title?: string; description?: string; confirmLabel?: string; cancelLabel?: string; variant?: 'danger' | 'neutral'; busy?: boolean; onConfirm?: () => void | Promise<void>; onCancel?: () => void }>(), { open: false, title: 'Confirmer', description: '', confirmLabel: 'Confirmer', cancelLabel: 'Annuler', variant: 'danger', busy: false })
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const confirmButton = ref<HTMLButtonElement>()
function dismiss() { if (props.busy) return; emit('update:open', false); props.onCancel?.() }
function onKey(e: KeyboardEvent) { if (props.open && e.key === 'Escape' && !props.busy) dismiss() }
watch(() => props.open, value => { if (value && typeof window !== 'undefined') requestAnimationFrame(() => confirmButton.value?.focus()) }, { immediate: true })
if (typeof document !== 'undefined') { document.addEventListener('keydown', onKey); onBeforeUnmount(() => document.removeEventListener('keydown', onKey)) }
async function confirm() { if (!props.busy && props.onConfirm) await props.onConfirm() }
</script>
<template>
  <Teleport to="body"><div v-if="open" class="modal-backdrop" role="presentation" @click.self="dismiss">
    <section class="modal sm" role="alertdialog" aria-modal="true" aria-labelledby="gp-confirm-dialog-title" aria-describedby="gp-confirm-dialog-desc" @keydown.esc.stop="dismiss">
      <div class="modal-header"><h2 id="gp-confirm-dialog-title">{{ title }}</h2></div>
      <div class="modal-body"><p id="gp-confirm-dialog-desc" class="text-pre">{{ description }}</p></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" :disabled="busy" @click="dismiss">{{ cancelLabel }}</button><button ref="confirmButton" type="button" class="btn" :class="variant === 'danger' ? 'btn-danger' : 'btn-primary'" :disabled="busy" @click="confirm">{{ busy ? 'Patienter…' : confirmLabel }}</button></div>
    </section>
  </div></Teleport>
</template>
