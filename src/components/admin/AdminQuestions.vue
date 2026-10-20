<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminQuestionRow } from '$lib/types'
import AdminThemeQuestionsMap from '../AdminThemeQuestionsMap.vue'
import QuestionHeadingThumb from '../QuestionHeadingThumb.vue'
import AdminQuestionEditor from './AdminQuestionEditor.vue'
import AdminBattleResult from './AdminBattleResult.vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const { data, themeFilter, busy, error, mutate, ask, filterTheme, createBattle } = useAdminDashboard()
const search = ref(''), status = ref('all'), selected = ref<string[]>([])
const edit = ref<AdminQuestionRow | null>(null), dragId = ref('')
const questions = computed(() => data.value.questions.filter(q => `${q.text} ${q.id} ${q.authorPseudo ?? ''} ${q.description ?? ''}`.toLowerCase().includes(search.value.toLowerCase()) && (status.value === 'all' || q.approved === (status.value === 'published'))))
const allSelected = computed(() => questions.value.length > 0 && questions.value.every(q => selected.value.includes(q.id)))
watch(() => [themeFilter.value, data.value.questions.map(q => q.id).join('\n')], () => { selected.value = [] })
function toggleAll() { selected.value = allSelected.value ? selected.value.filter(id => !questions.value.some(q => q.id === id)) : [...new Set([...selected.value, ...questions.value.map(q => q.id)])] }
async function reorder(id: string, target: number) {
  const ids = data.value.questions.map(q => q.id), index = ids.indexOf(id)
  if (!themeFilter.value || index < 0 || target < 0 || target >= ids.length || index === target) return
  ids.splice(index, 1); ids.splice(target, 0, id)
  await mutate('questions/reorder', { themeId: themeFilter.value, questionIds: ids }, 'Ordre des questions enregistré.')
}
function drop(targetId: string) {
  const sourceId = dragId.value; dragId.value = ''
  if (!sourceId || busy.value) return
  void reorder(sourceId, data.value.questions.findIndex(q => q.id === targetId))
}
function deleteSelected() {
  const ids = [...selected.value]
  if (ids.length) ask(`Supprimer ${ids.length} question(s) sélectionnée(s) ? Cette action est irréversible.`, () => mutate('questions/delete-bulk', { questionIds: ids }, 'Questions supprimées.'))
}
function deleteThemeQuestions() {
  const id = themeFilter.value
  if (id) ask(`Supprimer TOUTES les questions du thème « ${id} », y compris celles au-delà des 400 affichées ? Cette action est irréversible.`, () => mutate('questions/delete-bulk', { deleteAllInTheme: true, themeId: id }, 'Toutes les questions du thème ont été supprimées.'))
}
</script>
<template>
  <section class="stack">
    <div class="surface panel stack">
      <div class="between"><h2>Questions</h2><span class="badge neutral">{{ questions.length }} / {{ data.questions.length }} affichées</span></div>
      <div class="filters"><label class="field"><span class="field-label">Thème — carte et ordre</span><select :value="themeFilter" @change="filterTheme(($event.target as HTMLSelectElement).value)"><option value="">Tous les thèmes</option><option v-for="theme in data.themes" :key="theme.id" :value="theme.id">{{ theme.emoji }} {{ theme.name }} ({{ theme.id }})</option></select></label><label class="field"><span class="field-label">Rechercher</span><input v-model="search" type="search" placeholder="Texte, identifiant, auteur…" /></label><label class="field"><span class="field-label">Publication</span><select v-model="status"><option value="all">Toutes</option><option value="published">Publiées</option><option value="draft">Brouillons</option></select></label></div>
      <p v-if="!themeFilter" class="notice">Sélectionne un thème pour afficher la carte globale et réorganiser ses questions.</p>
      <template v-else-if="data.questions.length"><h3>Carte globale du thème</h3><p class="subtle">Toutes les réponses du thème : disque vert = tolérance, marqueur ambre = point exact. Clique sur un marqueur pour le détail.</p><AdminThemeQuestionsMap :key="themeFilter" :questions="data.questions" /><p class="subtle">Réorganise les questions avec les flèches ou en faisant glisser les lignes du tableau. L’ordre est enregistré automatiquement.</p></template>
      <AdminBattleResult />
      <div class="actions"><button type="button" class="btn btn-sm btn-danger" :disabled="busy || !selected.length" @click="deleteSelected">Supprimer la sélection ({{ selected.length }})</button><button type="button" class="btn btn-sm btn-danger-ghost" :disabled="busy || !themeFilter || !data.questions.length" @click="deleteThemeQuestions">Supprimer toutes les questions du thème</button></div>
      <div class="table-wrap question-table"><table class="table"><thead><tr><th><input type="checkbox" :checked="allSelected" :disabled="!questions.length" aria-label="Sélectionner toutes les questions affichées" @change="toggleAll" /></th><th v-if="themeFilter">Ordre</th><th>Question / médias</th><th>Thème</th><th>Localisation / tolérance</th><th>Publication / votes</th><th>Actions</th></tr></thead><tbody><tr v-for="q in questions" :key="q.id" :draggable="!!themeFilter && !busy" :class="{ dragging: dragId === q.id }" @dragstart="dragId = q.id; $event.dataTransfer?.setData('text/plain', q.id)" @dragend="dragId = ''" @dragover.prevent @drop.prevent="drop(q.id)">
        <td><input v-model="selected" type="checkbox" :value="q.id" :aria-label="`Sélectionner ${q.text}`" /></td>
        <td v-if="themeFilter"><div class="actions"><button type="button" class="icon-button sm" aria-label="Monter la question" :disabled="busy || data.questions[0]?.id === q.id" @click="reorder(q.id, data.questions.findIndex(row => row.id === q.id) - 1)">↑</button><button type="button" class="icon-button sm" aria-label="Descendre la question" :disabled="busy || data.questions[data.questions.length - 1]?.id === q.id" @click="reorder(q.id, data.questions.findIndex(row => row.id === q.id) + 1)">↓</button></div></td>
        <td style="min-width:260px;max-width:380px"><QuestionHeadingThumb :img-url="q.imgUrl" :youtube-url="q.youtubeUrl"><template #heading><strong>{{ q.text }}</strong></template><template #meta><small class="mono">{{ q.id }}</small><p class="subtle">{{ q.authorPseudo ? '@' + q.authorPseudo + ' · ' : '' }}{{ new Date(q.createdAt).toLocaleString('fr-FR') }}</p></template></QuestionHeadingThumb><details v-if="q.description"><summary class="subtle">Description</summary><p class="text-pre subtle">{{ q.description }}</p></details></td>
        <td>{{ q.themeName ?? q.themeId }}</td><td><span class="mono">{{ q.lat.toFixed(4) }}, {{ q.lng.toFixed(4) }}</span><p class="subtle">{{ Math.round(q.toleranceM).toLocaleString('fr-FR') }} m <span v-if="q.answerArea" class="badge neutral">Zone polygone</span></p></td><td><span class="badge" :class="q.approved ? 'success' : 'warn'">{{ q.approved ? 'Publiée' : 'Brouillon' }}</span><p class="subtle">+{{ q.upVotes }} / −{{ q.downVotes }}</p></td>
        <td><div class="row-actions"><button type="button" class="btn btn-sm btn-secondary" @click="error = ''; edit = q">Modifier</button><button type="button" class="btn btn-sm btn-ghost" :disabled="busy || !q.approved" :title="!q.approved ? 'Publie cette question avant de créer un géobattle.' : undefined" @click="createBattle(q.id)">Géobattle</button><button type="button" class="btn btn-sm btn-danger-ghost" :disabled="busy" @click="ask('Supprimer cette question ? Cette action est irréversible.', () => mutate('questions/delete', { questionId: q.id }, 'Question supprimée.'))">Supprimer</button></div></td>
      </tr></tbody></table></div><p v-if="!questions.length" class="empty">Aucune question correspondant aux filtres.</p>
    </div>
    <AdminQuestionEditor v-if="edit" :key="edit.id" :question="edit" :on-close="() => { edit = null }" />
  </section>
</template>
<style scoped>.filters{display:grid;grid-template-columns:1.4fr 1fr .8fr;gap:14px}.question-table{max-height:70vh;overflow:auto}.row-actions{display:grid;gap:5px}.dragging{opacity:.4}summary{cursor:pointer}@media(max-width:800px){.filters{grid-template-columns:1fr}}</style>
