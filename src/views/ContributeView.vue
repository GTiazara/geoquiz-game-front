<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MapPin, Plus, Send, RefreshCw } from 'lucide-vue-next'
import GeoMap from '../components/GeoMap.vue'
import QuestionHeadingThumb from '../components/QuestionHeadingThumb.vue'
import GoogleTranslateLangBar from '../components/GoogleTranslateLangBar.vue'
import ThemeCreateModal from '../components/ThemeCreateModal.vue'
import CommunityVoteBar from '../components/community/CommunityVoteBar.vue'
import { api, errorMessage } from '$lib/api'
import { app, refreshApp } from '$lib/appStore'
import { MIX_THEME_ID } from '$lib/themes'
import type { Question, QuestionEditProposalRow } from '$lib/types'

const themeModal = ref(false)
const contributeThemePick = ref<string>()
const activeThemeId = computed(() => contributeThemePick.value ?? app.themes[0]?.id ?? '')
const text = ref('')
const imgUrl = ref('')
const youtubeUrl = ref('')
const description = ref('')
const toleranceM = ref(50_000)
const pick = ref<{ lat: number; lng: number } | null>(null)
const latInput = ref('')
const lngInput = ref('')
const borders = ref(true)
const busy = ref(false)
const message = ref('')
const formError = ref('')
const moderationError = ref('')
const themeError = ref('')
const moderationLoading = ref(false)
const themeQuestionsLoading = ref(false)
const moderationQs = ref<Question[]>([])
const moderationProposals = ref<QuestionEditProposalRow[]>([])
const themeQuestions = ref<Question[]>([])
const voteBusy = ref<Record<string, boolean>>({})
const voteErrors = ref<Record<string, string>>({})
const pendingQuestions = computed(() => moderationQs.value.filter(question => !question.approved))
const pendingCount = computed(() => pendingQuestions.value.length + moderationProposals.value.length)
const contributeMapPopup = computed(() => pick.value && (imgUrl.value.trim() || youtubeUrl.value.trim() || description.value.trim()) ? { title: text.value.trim() || 'Aperçu', imgUrl: imgUrl.value.trim() || undefined, youtubeUrl: youtubeUrl.value.trim() || undefined, description: description.value.trim() || undefined } : null)
const formatCoord = (value: number) => String(Number(value.toFixed(6)))
function parseCoord(raw: string) { const value = raw.trim().replace(',', '.'); return value && Number.isFinite(Number(value)) ? Number(value) : null }
function applyCoordsFromFields() {
  const lat = parseCoord(latInput.value), lng = parseCoord(lngInput.value)
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  pick.value = { lat, lng }; return true
}
function applyCoords() {
  formError.value = ''; message.value = ''
  if (!applyCoordsFromFields()) formError.value = 'Latitude ou longitude invalide (−90…90 et −180…180 ; utilise le point ou la virgule comme séparateur décimal).'
}
watch(pick, value => { latInput.value = value ? formatCoord(value.lat) : ''; lngInput.value = value ? formatCoord(value.lng) : '' })
let themeRequest = 0
let moderationRequest = 0
async function refreshThemeQuestions() {
  const request = ++themeRequest
  themeError.value = ''
  if (!activeThemeId.value) { themeQuestions.value = []; themeQuestionsLoading.value = false; return }
  themeQuestionsLoading.value = true
  themeQuestions.value = []
  try {
    const result = await api<{ questions: Question[] }>('/questions', { query: { theme: activeThemeId.value } })
    if (request === themeRequest) themeQuestions.value = result.questions ?? []
  } catch (err) { if (request === themeRequest) themeError.value = errorMessage(err, 'Impossible de charger les questions du thème.') }
  finally { if (request === themeRequest) themeQuestionsLoading.value = false }
}
async function refreshModerationList() {
  const request = ++moderationRequest
  moderationLoading.value = true; moderationError.value = ''
  try {
    const [questions, proposals] = await Promise.all([
      api<{ questions: Question[] }>('/questions', { query: { theme: MIX_THEME_ID } }),
      api<{ proposals: QuestionEditProposalRow[] }>('/question-edit-proposals'),
    ])
    if (request === moderationRequest) { moderationQs.value = questions.questions ?? []; moderationProposals.value = proposals.proposals ?? [] }
  } catch (err) { if (request === moderationRequest) moderationError.value = errorMessage(err, 'Impossible de charger les propositions.') }
  finally { if (request === moderationRequest) moderationLoading.value = false }
}
watch([activeThemeId, () => app.generation], () => { void refreshThemeQuestions() }, { immediate: true })
watch(() => app.generation, () => { void refreshModerationList() }, { immediate: true })
async function publish() {
  if (busy.value) return
  formError.value = ''; message.value = ''
  if (!pick.value && !applyCoordsFromFields()) { formError.value = 'Clique sur la carte pour placer la réponse, ou renseigne latitude (−90…90) et longitude (−180…180) puis « Appliquer sur la carte ».'; return }
  if (!pick.value) return
  busy.value = true
  try {
    await api('/questions', { method: 'POST', body: {
      themeId: activeThemeId.value, text: text.value.trim(), lat: pick.value.lat, lng: pick.value.lng, toleranceM: toleranceM.value,
      ...(imgUrl.value.trim() ? { imgUrl: imgUrl.value.trim() } : {}),
      ...(youtubeUrl.value.trim() ? { youtubeUrl: youtubeUrl.value.trim() } : {}),
      ...(description.value.trim() ? { description: description.value.trim() } : {}),
    } })
    text.value = ''; imgUrl.value = ''; youtubeUrl.value = ''; description.value = ''; pick.value = null
    message.value = 'Question publiée — en attente de votes communautaires.'
    await refreshApp()
  } catch (err) { formError.value = errorMessage(err, 'Impossible de publier la question.') }
  finally { busy.value = false }
}
async function vote(id: string, direction: 'up' | 'down', proposal = false) {
  const key = `${proposal ? 'proposal' : 'question'}-${id}`
  if (voteBusy.value[key]) return
  voteBusy.value[key] = true; voteErrors.value[key] = ''
  try {
    await api(`/${proposal ? 'question-edit-proposals' : 'questions'}/${encodeURIComponent(id)}/vote`, { method: 'POST', body: { dir: direction } })
    await refreshApp()
  } catch (err) { voteErrors.value[key] = errorMessage(err, 'Impossible d’enregistrer le vote.') }
  finally { voteBusy.value[key] = false }
}
function themeLabel(id?: string) { const theme = app.themes.find(item => item.id === id); return theme ? `${theme.emoji} ${theme.name} · ${theme.id}` : `Thème : ${id ?? '—'}` }
async function onThemeCreated() { await refreshApp() }
async function onCorrectionMediaSaved() { await refreshApp() }
</script>

<template>
  <div class="stack">
    <header class="page-heading between"><div><span class="eyebrow">Construisons le quiz ensemble</span><div class="actions"><h1>Contribuer</h1><span v-if="app.pendingModerationCount > 0" class="badge warn">Vote · {{ app.pendingModerationCount }}</span></div><p>Publier une question ou valider celles de la communauté.</p></div><GoogleTranslateLangBar embedded compact /></header>
    <div v-if="app.pendingModerationCount > 0" class="notice warn between"><div><strong>La communauté a besoin de toi</strong><p>{{ app.pendingModerationCount }} propositions attendent des votes. Aide à vérifier leurs textes et leurs cibles.</p></div><a class="btn btn-secondary btn-sm" href="#a-valider" @click.prevent="($refs.moderationSection as HTMLElement)?.scrollIntoView({ behavior: 'smooth', block: 'start' })">Voter maintenant</a></div>
    <ThemeCreateModal v-model:open="themeModal" :on-created="onThemeCreated" />
    <form class="surface panel stack" @submit.prevent="publish">
      <div class="between"><h2>Proposer une question</h2><span class="badge neutral"><MapPin :size="13" /> Place la bonne réponse</span></div>
      <div class="contribution-layout">
        <div class="stack">
          <div class="field"><label for="qtext">Question</label><input id="qtext" v-model="text" maxlength="200" minlength="4" placeholder="Où se trouve … ?" required /><span class="field-hint">Un énoncé clair et précis, entre 4 et 200 caractères.</span></div>
          <div class="field"><label for="theme">Thème</label><select id="theme" :value="activeThemeId" required @change="contributeThemePick = ($event.target as HTMLSelectElement).value"><option v-for="theme in app.themes" :key="theme.id" :value="theme.id">{{ theme.emoji }} {{ theme.name }}</option></select><div><button type="button" class="btn btn-ghost btn-sm" @click="themeModal = true"><Plus :size="15" /> Créer un thème</button></div></div>
          <div class="field"><label for="qimg">Image (optionnel) — URL https</label><input id="qimg" v-model="imgUrl" type="url" maxlength="2000" placeholder="https://…" /><span class="field-hint">Affichée en grand dans le popup de correction. Tu peux aussi coller une URL YouTube ci-dessous.</span></div>
          <div class="field"><label for="qyt">Vidéo YouTube (optionnel)</label><input id="qyt" v-model="youtubeUrl" type="url" maxlength="2000" placeholder="https://www.youtube.com/watch?v=… ou youtu.be/…" /><span class="field-hint">Lecteur intégré dans le popup sur la carte après la manche.</span></div>
          <div class="field"><label for="qdesc">Description (optionnel)</label><textarea id="qdesc" v-model="description" rows="3" maxlength="4000" placeholder="Contexte, indice léger, source…" /></div>
        </div>
        <div class="stack map-column">
          <div class="field"><label for="tol">Tolérance bonus : {{ (toleranceM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }} km</label><input id="tol" v-model.number="toleranceM" type="range" min="500" max="2000000" step="500" /></div>
          <label class="actions subtle"><input v-model="borders" type="checkbox" /> Limites entre pays sur la carte</label>
          <div class="coordinates"><div class="field"><label for="qlat">Latitude (°)</label><input id="qlat" v-model="latInput" inputmode="decimal" autocomplete="off" placeholder="ex. 48.8566" /></div><div class="field"><label for="qlng">Longitude (°)</label><input id="qlng" v-model="lngInput" inputmode="decimal" autocomplete="off" placeholder="ex. 2.3522" /></div></div>
          <button type="button" class="btn btn-secondary" @click="applyCoords">Appliquer sur la carte</button>
          <p class="field-hint">Clique sur la carte ou saisis les coordonnées puis « Appliquer sur la carte ». Le disque indique la tolérance. Image, vidéo et description s’affichent dans le popup d’aperçu.</p>
          <div class="contribution-map"><GeoMap :key="String(borders)" v-model:guess="pick" :interactive="true" :answer="pick" :show-result="Boolean(pick)" :tolerance-m="toleranceM" :borders="borders" :correction-popup="contributeMapPopup" /></div>
        </div>
      </div>
      <details class="surface-flat existing-questions"><summary>Questions déjà dans ce thème · {{ themeQuestionsLoading ? 'Chargement…' : `${themeQuestions.length} au total` }}</summary><p v-if="themeError" class="alert" role="alert">{{ themeError }} <button type="button" class="btn btn-ghost btn-sm" @click="refreshThemeQuestions">Réessayer</button></p><p v-else-if="!themeQuestionsLoading && !themeQuestions.length" class="subtle">Aucune question en base pour ce thème pour l’instant.</p><ul v-else class="theme-question-list" aria-label="Liste des questions du thème"><li v-for="question in themeQuestions" :key="question.id" class="between"><span>{{ question.text }}</span><div class="actions"><small class="mono">{{ question.lat.toFixed(4) }}°, {{ question.lng.toFixed(4) }}°</small><span class="badge" :class="question.approved ? 'success' : 'warn'">{{ question.approved ? 'Publié' : 'Vote' }}</span></div></li></ul></details>
      <p v-if="formError" class="alert" role="alert">{{ formError }}</p><p v-if="message" class="notice" role="status">{{ message }}</p>
      <div class="actions end"><button type="submit" class="btn btn-primary" :disabled="busy || text.trim().length < 4 || !activeThemeId"><Send :size="16" /> {{ busy ? 'Publication…' : 'Publier' }}</button></div>
    </form>
    <section id="a-valider" ref="moderationSection" class="stack moderation-section">
      <header class="between"><div><span class="eyebrow">Vote communautaire</span><h2>À valider</h2></div><div class="actions"><span class="badge warn">{{ pendingCount }} en attente</span><button type="button" class="btn btn-secondary btn-sm" :disabled="moderationLoading" @click="refreshModerationList"><RefreshCw :size="15" /> Actualiser</button></div></header>
      <div class="notice stack-sm"><p>Tous les thèmes mélangés. Chaque carte montre la <strong>réponse proposée</strong> (point jaune), le disque de tolérance ou la zone de réponse utilisés en jeu. Vote seulement si la cible et le texte te paraissent cohérents.</p><p class="subtle">Validation automatique des questions et corrections : utile − douteux ≥ <strong>{{ app.communityMinNetVotes }}</strong>. Retrait automatique si douteux − utile atteint <strong>{{ app.communityEditProposalRemoveMinNetDown }}</strong> (0 = pas de retrait automatique).</p></div>
      <p v-if="moderationError" class="alert" role="alert">{{ moderationError }}</p><p v-if="moderationLoading" class="subtle" role="status">Chargement des propositions…</p>
      <div class="moderation-grid">
        <article v-for="proposal in moderationProposals" :key="proposal.id" class="surface moderation-card">
          <div class="panel stack-sm"><span class="badge">Correction proposée (question publiée)</span><p class="subtle">{{ themeLabel(proposal.themeId) }}</p><p class="field-hint">Question actuelle</p><h3>{{ proposal.questionText ?? '—' }}</h3><p v-if="proposal.text !== undefined"><strong>Nouvel énoncé :</strong> {{ proposal.text }}</p><p v-if="proposal.lat !== undefined && proposal.lng !== undefined"><strong>Nouveau lieu :</strong> <span class="mono">{{ formatCoord(proposal.lat) }}, {{ formatCoord(proposal.lng) }}</span></p><p v-if="proposal.description !== undefined" class="text-pre"><strong>Description :</strong> {{ proposal.description || '∅' }}</p></div>
          <div class="moderation-map"><GeoMap :key="`${proposal.id}-${borders}`" :interactive="false" :guess="null" :answer="proposal.lat !== undefined && proposal.lng !== undefined ? { lat: proposal.lat, lng: proposal.lng } : { lat: proposal.questionLat ?? 0, lng: proposal.questionLng ?? 0 }" :show-result="true" :tolerance-m="Math.max(1000, Math.min(5000000, proposal.questionToleranceM ?? 50000))" :answer-area="proposal.questionAnswerArea ?? null" :borders="borders" :correction-popup="null" /></div>
          <p v-if="proposal.lat !== undefined && proposal.questionLat !== undefined" class="subtle previous-location">Ancien lieu (réf.) : <span class="mono">{{ formatCoord(proposal.questionLat) }}, {{ formatCoord(proposal.questionLng ?? 0) }}</span></p>
          <p v-if="voteErrors[`proposal-${proposal.id}`]" class="alert vote-error" role="alert">{{ voteErrors[`proposal-${proposal.id}`] }}</p><CommunityVoteBar :up-votes="proposal.upVotes" :down-votes="proposal.downVotes" :author-pseudo="proposal.authorPseudo" :busy="voteBusy[`proposal-${proposal.id}`]" @vote="vote(proposal.id, $event, true)" />
        </article>
        <article v-for="question in pendingQuestions" :key="question.id" class="surface moderation-card">
          <div class="panel stack-sm"><span class="badge warn">Question sous vote</span><p class="subtle">{{ themeLabel(question.themeId) }}</p><QuestionHeadingThumb :img-url="question.imgUrl" :youtube-url="question.youtubeUrl"><template #heading><h3>{{ question.text }}</h3></template></QuestionHeadingThumb><p class="field-hint">Emplacement proposé</p></div>
          <div class="moderation-map"><GeoMap :key="`${question.id}-${borders}`" :interactive="false" :guess="null" :answer="{ lat: question.lat, lng: question.lng }" :show-result="true" :tolerance-m="question.toleranceM" :answer-area="question.answerArea ?? null" :borders="borders" :correction-popup="{ questionId: question.id, mediaEditable: true, title: question.text, imgUrl: question.imgUrl, youtubeUrl: question.youtubeUrl, description: question.description }" :on-correction-media-saved="onCorrectionMediaSaved" /></div>
          <p v-if="voteErrors[`question-${question.id}`]" class="alert vote-error" role="alert">{{ voteErrors[`question-${question.id}`] }}</p><CommunityVoteBar :up-votes="question.upVotes" :down-votes="question.downVotes" :author-pseudo="question.authorPseudo" :busy="voteBusy[`question-${question.id}`]" @vote="vote(question.id, $event)" />
        </article>
      </div>
      <div v-if="!moderationLoading && !moderationError && pendingCount === 0" class="empty surface panel">Aucune proposition en attente sur aucun thème. Reviens plus tard ou publie la tienne plus haut.</div>
    </section>
  </div>
</template>

<style scoped>
.page-heading{margin-bottom:0}.contribution-layout{display:grid;gap:24px}.coordinates{display:grid;grid-template-columns:1fr 1fr;gap:12px}.map-column{align-content:start;gap:14px}.contribution-map{height:clamp(420px,50vh,560px);border-radius:14px;border:1px solid var(--border);overflow:hidden;isolation:isolate}.existing-questions{padding:16px}.existing-questions summary{cursor:pointer;font-size:13px;font-weight:650}.existing-questions[open] summary{margin-bottom:12px}.theme-question-list{max-height:240px;overflow:auto;padding:0;margin:0;list-style:none}.theme-question-list li{padding:10px 0;border-top:1px solid var(--border);font-size:13px}.moderation-section{scroll-margin-top:24px}.moderation-grid{display:grid;gap:20px}.moderation-card{overflow:hidden;min-width:0}.moderation-card>.panel{padding:20px}.moderation-card .badge{justify-self:start}.moderation-map{height:260px;margin:0 16px 16px;border:1px solid var(--border);border-radius:12px;overflow:hidden;isolation:isolate}.previous-location{padding:0 20px 16px}.vote-error{margin:0 16px 16px}@media(min-width:1100px){.contribution-layout{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}.moderation-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
