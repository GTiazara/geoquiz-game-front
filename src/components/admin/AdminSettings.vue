<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const { data, busy, mutate } = useAdminDashboard()
const minVotes = ref(4), minDown = ref(5)
watch(() => [data.value.communityMinNetVotes, data.value.communityEditProposalRemoveMinNetDown], () => { minVotes.value = data.value.communityMinNetVotes; minDown.value = data.value.communityEditProposalRemoveMinNetDown }, { immediate: true })
async function save() { await mutate('community-settings', { communityMinNetVotes: minVotes.value, communityEditProposalRemoveMinNetDown: minDown.value }, 'Paramètres communautaires enregistrés.') }
</script>
<template>
  <section class="surface panel stack"><h2>Modération communautaire</h2><p class="subtle">Le vote net (votes utiles − votes douteux) valide automatiquement les nouvelles questions et les corrections proposées (texte, lieu, description).</p><p class="subtle">Le retrait s’applique aux questions en attente et aux corrections quand le vote net négatif (douteux − utile) atteint le seuil configuré. La valeur 0 désactive le retrait automatique.</p><form class="stack" @submit.prevent="save"><div class="grid"><label class="field"><span class="field-label">Vote net minimum pour validation</span><input v-model.number="minVotes" type="number" min="1" max="50" step="1" required :disabled="busy" /><span class="field-hint">De 1 à 50 ; défaut historique : 4.</span></label><label class="field"><span class="field-label">Seuil de retrait (questions + corrections)</span><input v-model.number="minDown" type="number" min="0" max="50" step="1" required :disabled="busy" /><span class="field-hint">De 1 à 50 ; 0 = désactivé. Défaut historique : 5.</span></label></div><div class="actions"><button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Enregistrement…' : 'Enregistrer' }}</button></div></form></section>
</template>
