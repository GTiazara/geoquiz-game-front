<script setup lang="ts">
import { computed, ref } from 'vue'
import GeoMap from '../GeoMap.vue'
import QuestionHeadingThumb from '../QuestionHeadingThumb.vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const { data, pendingCount, busy, mutate, ask } = useAdminDashboard()
const borders = ref(true), search = ref(''), type = ref('all')
const proposals = computed(() => type.value === 'new' ? [] : data.value.pendingEditProposals.filter(p => `${p.questionText} ${p.text} ${p.description} ${p.authorPseudo}`.toLowerCase().includes(search.value.toLowerCase())))
const questions = computed(() => type.value === 'edit' ? [] : data.value.pendingNewQuestions.filter(q => `${q.text} ${q.description} ${q.authorPseudo}`.toLowerCase().includes(search.value.toLowerCase())))
function confidence(q: { upVotes: number; downVotes: number }) { return Math.round(100 * (q.upVotes + 1) / (q.upVotes + q.downVotes + 2)) }
function themeLabel(id?: string) { const theme = data.value.themes.find(t => t.id === id); return theme ? `${theme.emoji} ${theme.name} · ${theme.id}` : id || '—' }
async function approve(action: string, id: string) { await mutate('moderation', { action, id }, 'Élément publié.') }
function reject(action: string, id: string) { ask('Refuser et supprimer cet élément de la modération ? Cette action est irréversible.', () => mutate('moderation', { action, id }, 'Élément refusé et supprimé.')) }
</script>
<template>
  <section class="stack">
    <div class="surface panel stack"><div class="between"><h2>File d’attente de modération</h2><span class="badge warn">{{ pendingCount }} en attente</span></div><p class="subtle">Valide ou refuse les nouvelles questions et corrections sans attendre les votes communautaires. Les zones polygones sont affichées sur la carte.</p><div class="grid"><label class="field"><span class="field-label">Recherche</span><input v-model="search" type="search" placeholder="Question, description, auteur…" /></label><label class="field"><span class="field-label">Type</span><select v-model="type"><option value="all">Tous les éléments</option><option value="new">Nouvelles questions</option><option value="edit">Corrections proposées</option></select></label></div><label class="actions"><input v-model="borders" type="checkbox" /> Limites entre pays (toutes les cartes)</label></div>
    <article v-for="proposal in proposals" :key="proposal.id" class="surface panel stack">
      <div class="between"><span class="badge">Correction proposée</span><small>{{ new Date(proposal.createdAt).toLocaleString('fr-FR') }}</small></div><p class="subtle">{{ themeLabel(proposal.themeId) }}</p>
      <div class="stack-sm"><p class="subtle">Question actuelle</p><h3>{{ proposal.questionText || '—' }}</h3><p v-if="proposal.text !== undefined"><strong>Nouvel énoncé :</strong> {{ proposal.text }}</p><p v-if="proposal.lat !== undefined && proposal.lng !== undefined"><strong>Nouveau lieu :</strong> {{ proposal.lat.toFixed(6) }}, {{ proposal.lng.toFixed(6) }}</p><p v-if="proposal.description !== undefined" class="text-pre"><strong>Description :</strong> {{ proposal.description || '∅' }}</p></div>
      <p class="subtle">Confiance ~{{ confidence(proposal) }} % · +{{ proposal.upVotes }} / −{{ proposal.downVotes }}<span v-if="proposal.authorPseudo"> · par @{{ proposal.authorPseudo }}</span></p>
      <p class="subtle">Emplacement proposé ; polygone = zone actuelle de la question.</p><div class="mod-map"><GeoMap :interactive="false" :guess="null" :answer="{ lat: proposal.lat ?? proposal.questionLat ?? 0, lng: proposal.lng ?? proposal.questionLng ?? 0 }" :show-result="true" :tolerance-m="Math.max(1000, Math.min(5000000, proposal.questionToleranceM ?? 50000))" :answer-area="proposal.questionAnswerArea ?? null" :borders="borders" /></div>
      <div class="actions"><button type="button" class="btn btn-primary" :disabled="busy" @click="approve('approve_edit_proposal', proposal.id)">Publier (accepter)</button><button type="button" class="btn btn-danger-ghost" :disabled="busy" @click="reject('reject_edit_proposal', proposal.id)">Refuser (supprimer)</button></div>
    </article>
    <article v-for="q in questions" :key="q.id" class="surface panel stack">
      <div class="between"><span class="badge warn">Nouvelle question</span><small>{{ new Date(q.createdAt).toLocaleString('fr-FR') }}</small></div><p class="subtle">{{ themeLabel(q.themeId) }}</p><QuestionHeadingThumb :img-url="q.imgUrl" :youtube-url="q.youtubeUrl"><template #heading><h3>{{ q.text }}</h3></template></QuestionHeadingThumb>
      <p v-if="q.description" class="text-pre subtle">{{ q.description }}</p><p class="subtle">Confiance ~{{ confidence(q) }} % · +{{ q.upVotes }} / −{{ q.downVotes }}<span v-if="q.authorPseudo"> · par @{{ q.authorPseudo }}</span></p>
      <div class="mod-map"><GeoMap :interactive="false" :guess="null" :answer="{ lat: q.lat, lng: q.lng }" :show-result="true" :tolerance-m="q.toleranceM" :answer-area="q.answerArea ?? null" :borders="borders" :correction-popup="{ questionId: q.id, mediaEditable: false, mediaReadonlyHint: 'Modifie les médias depuis la liste des questions après publication.', title: q.text, imgUrl: q.imgUrl, youtubeUrl: q.youtubeUrl, description: q.description }" /></div>
      <div class="actions"><button type="button" class="btn btn-primary" :disabled="busy" @click="approve('approve_new_question', q.id)">Publier (accepter)</button><button type="button" class="btn btn-danger-ghost" :disabled="busy" @click="reject('reject_new_question', q.id)">Refuser (supprimer)</button></div>
    </article>
    <p v-if="!proposals.length && !questions.length" class="empty surface">{{ pendingCount ? 'Aucun élément correspondant aux filtres.' : 'Aucun élément en attente.' }}</p>
  </section>
</template>
<style scoped>.mod-map{height:280px;overflow:hidden;border:1px solid var(--border);border-radius:12px}</style>
