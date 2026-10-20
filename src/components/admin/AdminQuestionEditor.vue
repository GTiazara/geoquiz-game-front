<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminQuestionRow } from '$lib/types'
import GeoMap from '../GeoMap.vue'
import AdminModal from './AdminModal.vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const props = defineProps<{ question: AdminQuestionRow; onClose: () => void }>()
const { data, busy, error, mutate } = useAdminDashboard()
const form = ref({ questionId: props.question.id, text: props.question.text, themeId: props.question.themeId, approved: props.question.approved, imgUrl: props.question.imgUrl ?? '', youtubeUrl: props.question.youtubeUrl ?? '', description: props.question.description ?? '' })
const guess = ref<{ lat: number; lng: number } | null>({ lat: props.question.lat, lng: props.question.lng })
const tolerance = ref(Math.max(1000, Math.min(5_000_000, Math.round(props.question.toleranceM))))
const borders = ref(true)
const popup = computed(() => ({ questionId: form.value.questionId, mediaEditable: false, mediaReadonlyHint: 'Modifie les médias dans le formulaire puis enregistre la question.', title: form.value.text.trim() || 'Aperçu', imgUrl: form.value.imgUrl.trim() || undefined, youtubeUrl: form.value.youtubeUrl.trim() || undefined, description: form.value.description.trim() || undefined }))
async function save() {
  if (!guess.value) return
  const result = await mutate('questions/update', { ...form.value, text: form.value.text.trim(), lat: guess.value.lat, lng: guess.value.lng, toleranceM: tolerance.value }, 'Question enregistrée.')
  if (result) props.onClose()
}
</script>
<template>
  <AdminModal title="Modifier la question" :busy="busy" :on-close="onClose"><form @submit.prevent="save"><fieldset class="modal-body stack" :disabled="busy" style="border:0;margin:0">
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <label class="field"><span class="field-label">Texte</span><textarea v-model="form.text" required /></label>
    <label class="field"><span class="field-label">Thème</span><select v-model="form.themeId" required><option v-for="theme in data.themes" :key="theme.id" :value="theme.id">{{ theme.emoji }} {{ theme.name }}</option></select></label>
    <label class="field"><span class="field-label">URL image (optionnel)</span><input v-model="form.imgUrl" type="url" placeholder="https://…" /></label>
    <label class="field"><span class="field-label">URL YouTube (optionnel)</span><input v-model="form.youtubeUrl" type="url" placeholder="https://www.youtube.com/watch?v=…" /></label>
    <label class="field"><span class="field-label">Description (popup)</span><textarea v-model="form.description" /></label>
    <div v-if="guess" class="grid"><label class="field"><span class="field-label">Latitude (WGS84)</span><input v-model.number="guess.lat" type="number" min="-90" max="90" step="any" required /></label><label class="field"><span class="field-label">Longitude (WGS84)</span><input v-model.number="guess.lng" type="number" min="-180" max="180" step="any" required /></label></div>
    <label class="field"><span class="field-label">Tolérance bonus : {{ (tolerance / 1000).toLocaleString('fr-FR') }} km</span><input v-model.number="tolerance" type="range" min="1000" max="5000000" step="500" /><input v-model.number="tolerance" aria-label="Tolérance en mètres" type="number" min="1000" max="5000000" step="1" required /></label>
    <label class="actions"><input v-model="borders" type="checkbox" /> Limites entre pays</label>
    <p class="subtle">Clique sur la carte pour déplacer la bonne réponse. La zone polygone éventuelle est conservée et affichée en lecture seule.</p>
    <div class="editor-map"><GeoMap v-model:guess="guess" :interactive="!busy" :answer="guess" :show-result="!!guess" :tolerance-m="tolerance" :answer-area="question.answerArea ?? null" :borders="borders" :correction-popup="popup" /></div>
    <label class="actions"><input v-model="form.approved" type="checkbox" /> Publiée en jeu (approved)</label>
  </fieldset><div class="modal-footer"><button type="button" class="btn btn-secondary" :disabled="busy" @click="onClose">Annuler</button><button type="submit" class="btn btn-primary" :disabled="busy || !guess">{{ busy ? 'Enregistrement…' : 'Enregistrer' }}</button></div></form></AdminModal>
</template>
<style scoped>.editor-map{height:300px;border:1px solid var(--border);border-radius:12px;overflow:hidden}</style>
