<script setup lang="ts">
import { ref } from 'vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const { battleResult } = useAdminDashboard()
const copied = ref(false), copyError = ref(false)
async function copy() {
  if (!battleResult.value) return
  try { await navigator.clipboard.writeText(battleResult.value.shareUrl); copied.value = true; copyError.value = false }
  catch { copyError.value = true }
}
</script>
<template><div v-if="battleResult" class="notice stack-sm" role="status"><strong>Géobattle créé</strong><label class="field"><span class="field-label">Lien de partage</span><input :value="battleResult.shareUrl" readonly aria-label="Lien de partage du géobattle" @focus="($event.target as HTMLInputElement).select()" /></label><div class="actions"><RouterLink :to="'/geobattle/' + battleResult.battleId" class="btn btn-sm btn-primary">Ouvrir le défi</RouterLink><button type="button" class="btn btn-sm btn-secondary" @click="copy">{{ copied ? 'Copié !' : 'Copier le lien' }}</button><button type="button" class="btn btn-sm btn-ghost" @click="battleResult = null; copied = false">Fermer</button></div><p v-if="copyError" class="subtle">Copie le lien manuellement depuis le champ ci-dessus.</p></div></template>
