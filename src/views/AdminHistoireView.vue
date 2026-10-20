<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-vue-next'
import GeoMap from '../components/GeoMap.vue'
import HistoryAdventureCover from '../components/HistoryAdventureCover.vue'
import { ApiError, api, errorMessage, setAdminToken } from '$lib/api'
import { app, refreshApp } from '$lib/appStore'
import { cloneHistoryAdventures, type StoryAdventure, type StoryStep } from '$lib/historyAdventures'
import { exportHistoryAdventureToGeoJson, importHistoryAdventureFromGeoJson } from '$lib/historyAdventureGeojsonImport'
import { centroidLngLatFromAnswerArea, parseChallengeAnswerAreaFromGeoJson } from '$lib/geo/polygon'

type Point = { lat: number; lng: number }
const loading = ref(true)
const configured = ref(false)
const authed = ref(false)
const secret = ref('')
const loginBusy = ref(false)
const adventures = ref<StoryAdventure[]>([])
const selectedAdventure = ref(0)
const selectedStep = ref(0)
const saveBusy = ref(false)
const saveMsg = ref('')
const saveErr = ref('')
const dirty = ref(false)
const geojsonText = ref('')
const geojsonFileInput = ref<HTMLInputElement>()
const geojsonFileLabel = ref('')
const importGeoMsg = ref('')
const importGeoErr = ref('')
const importGeoWarnings = ref<string[]>([])
const importReplaceMeta = ref(true)
const geojsonDropActive = ref(false)
const geojsonReading = ref(false)
const challengeAreaGeojsonText = ref('')
const challengeAreaErr = ref('')
const mapPickMode = ref<'step' | 'challenge' | null>(null)
const mapGuess = ref<Point | null>(null)
const currentAdventure = computed(() => adventures.value[selectedAdventure.value] ?? null)
const currentStep = computed(() => currentAdventure.value?.steps[selectedStep.value] ?? null)
const challengePosition = computed(() => currentStep.value ? { lat: currentStep.value.challengeLat ?? currentStep.value.lat, lng: currentStep.value.challengeLng ?? currentStep.value.lng } : null)
const challengeAnswerArea = computed(() => currentStep.value?.challengeAnswerArea ?? null)
const hasDifferentChallengePosition = computed(() => currentStep.value && challengePosition.value && (challengePosition.value.lat !== currentStep.value.lat || challengePosition.value.lng !== currentStep.value.lng))
const geojsonHistoireExample = JSON.stringify({ type: 'FeatureCollection', properties: { title: "L’aventure de Marco Polo", period: '1271-1295', description: 'De Venise vers la Chine.', emoji: '🐫', coverImageUrl: '' }, features: [{ type: 'Feature', properties: { order: 1, title: 'Départ de Venise', year: '1271', narration: 'Le voyage commence…', question: 'Indique la mer qui borde la lagune de Venise au sud.', challengeLat: 43.2, challengeLng: 16, toleranceM: 250000 }, geometry: { type: 'Point', coordinates: [12.3155, 45.4408] } }] }, null, 2)
const challengeAreaGeojsonExample = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { text: 'Où se trouve cette région ?', toleranceM: 500000 }, geometry: { type: 'Polygon', coordinates: [[[12.4, 41.9], [12.6, 41.9], [12.6, 42.1], [12.4, 42.1], [12.4, 41.9]]] } }] }, null, 2)
function cloneAll(items: StoryAdventure[]): StoryAdventure[] { return JSON.parse(JSON.stringify(items)) as StoryAdventure[] }
function handleError(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 401) { setAdminToken(null); app.isAdmin = false; authed.value = false }
  saveErr.value = errorMessage(err, fallback)
}
async function loadAdventures() {
  const result = await api<{ adventures: StoryAdventure[] }>('/admin/history-adventures')
  adventures.value = cloneAll(result.adventures); normalizeIndices(); syncSelection(); dirty.value = false
}
async function checkStatus() {
  loading.value = true; saveErr.value = ''
  try {
    const status = await api<{ configured: boolean; authed: boolean }>('/admin/status')
    configured.value = status.configured; authed.value = status.authed
    if (status.authed) await loadAdventures()
    else { setAdminToken(null); app.isAdmin = false }
  } catch (err) { handleError(err, 'Chargement de l’administration impossible.') }
  finally { loading.value = false }
}
async function login() {
  if (loginBusy.value || !secret.value) return
  loginBusy.value = true; saveErr.value = ''
  try {
    const result = await api<{ token: string }>('/admin/login', { method: 'POST', body: { secret: secret.value } })
    setAdminToken(result.token); secret.value = ''; await checkStatus(); await refreshApp()
  } catch (err) { handleError(err, 'Connexion impossible.') }
  finally { loginBusy.value = false }
}
onMounted(checkStatus)
function syncSelection() {
  const step = currentStep.value
  mapGuess.value = step ? { lat: step.challengeLat ?? step.lat, lng: step.challengeLng ?? step.lng } : null
  mapPickMode.value = null
  challengeAreaGeojsonText.value = step?.challengeAnswerArea ? JSON.stringify(step.challengeAnswerArea, null, 2) : ''
  challengeAreaErr.value = ''
}
watch([selectedAdventure, selectedStep, () => currentStep.value?.id], syncSelection)
function changed() { dirty.value = true; saveMsg.value = '' }
function normalizeIndices() {
  selectedAdventure.value = Math.max(0, Math.min(selectedAdventure.value, adventures.value.length - 1))
  selectedStep.value = Math.max(0, Math.min(selectedStep.value, (currentAdventure.value?.steps.length ?? 0) - 1))
}
function loadDefaultAdventures() {
  if (adventures.value.length && !confirm('Remplacer toutes les aventures en cours par les 3 exemples (Marco Polo, Seconde Guerre mondiale, Lucy) ?')) return
  adventures.value = cloneAll(cloneHistoryAdventures()); selectedAdventure.value = 0; selectedStep.value = 0; saveErr.value = ''; syncSelection(); changed()
}
function newStep(adventureId: string, index: number): StoryStep {
  return { id: `${adventureId}-etape-${Date.now().toString(36)}-${index}`, title: `Étape ${index}`, year: '', lat: 0, lng: 0, narration: '', miniChallenge: { question: '', toleranceM: 250000 } }
}
function addAdventure() {
  const id = `histoire-${Date.now().toString(36)}`
  adventures.value.push({ id, title: 'Nouvelle aventure', period: '', description: '', steps: [newStep(id, 1)] })
  selectedAdventure.value = adventures.value.length - 1; selectedStep.value = 0; changed()
}
function removeAdventure(index: number) { adventures.value.splice(index, 1); normalizeIndices(); syncSelection(); changed() }
function moveAdventure(index: number, direction: -1 | 1) {
  const to = index + direction; const item = adventures.value[index]
  if (!item || to < 0 || to >= adventures.value.length) return
  adventures.value.splice(index, 1); adventures.value.splice(to, 0, item); selectedAdventure.value = to; changed()
}
function addStep() {
  const adv = currentAdventure.value; if (!adv) return
  adv.steps.push(newStep(adv.id, adv.steps.length + 1)); selectedStep.value = adv.steps.length - 1; changed()
}
function removeStep(index: number) {
  if (!currentAdventure.value || currentAdventure.value.steps.length <= 1) return
  currentAdventure.value.steps.splice(index, 1); normalizeIndices(); syncSelection(); changed()
}
function moveStep(index: number, direction: -1 | 1) {
  const steps = currentAdventure.value?.steps; const to = index + direction; const item = steps?.[index]
  if (!steps || !item || to < 0 || to >= steps.length) return
  steps.splice(index, 1); steps.splice(to, 0, item); selectedStep.value = to; changed()
}
function patchCurrentStep(patch: Partial<StoryStep>) { if (currentStep.value) { Object.assign(currentStep.value, patch); changed() } }
function handleAdminMapClick(point: Point) {
  if (!mapPickMode.value || !currentStep.value) return
  patchCurrentStep(mapPickMode.value === 'step' ? point : { challengeLat: point.lat, challengeLng: point.lng })
  mapGuess.value = point; mapPickMode.value = null
}
function updateCoordinate(event: Event, key: 'lat' | 'lng' | 'challengeLat' | 'challengeLng') {
  const raw = (event.target as HTMLInputElement).value
  const value = raw.trim() === '' && key.startsWith('challenge') ? undefined : Number(raw) || 0
  patchCurrentStep({ [key]: value })
}
function updateTolerance(event: Event) {
  if (currentStep.value) patchCurrentStep({ miniChallenge: { ...currentStep.value.miniChallenge, toleranceM: Math.max(10000, Math.round(Number((event.target as HTMLInputElement).value) || 250000)) } })
}
async function saveAll() {
  if (saveBusy.value) return
  saveMsg.value = ''; saveErr.value = ''; saveBusy.value = true
  try {
    const result = await api<{ adventures: StoryAdventure[] }>('/admin/history-adventures', { method: 'PUT', body: { adventures: adventures.value } })
    adventures.value = cloneAll(result.adventures ?? adventures.value); normalizeIndices(); syncSelection(); dirty.value = false
    await refreshApp(); saveMsg.value = 'Modifications enregistrées'
  } catch (err) { handleError(err, 'Enregistrement impossible') }
  finally { saveBusy.value = false }
}
async function loadGeojsonFromFile(file?: File) {
  if (!file) return
  importGeoMsg.value = ''; importGeoErr.value = ''; geojsonReading.value = true; geojsonFileLabel.value = file.name
  try { geojsonText.value = (await file.text()).replace(/^\uFEFF/, '') }
  catch { importGeoErr.value = 'Lecture du fichier impossible'; geojsonFileLabel.value = '' }
  finally { geojsonReading.value = false }
}
function onGeojsonFileChange(event: Event) { const input = event.target as HTMLInputElement; void loadGeojsonFromFile(input.files?.[0]); input.value = '' }
function onGeojsonDrop(event: DragEvent) { geojsonDropActive.value = false; void loadGeojsonFromFile(event.dataTransfer?.files?.[0]) }
function clearGeojsonText() { geojsonText.value = ''; geojsonFileLabel.value = ''; if (geojsonFileInput.value) geojsonFileInput.value.value = '' }
function exportCurrentAdventureGeojson() {
  const adv = currentAdventure.value; if (!adv) return
  importGeoMsg.value = ''; importGeoErr.value = ''
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportHistoryAdventureToGeoJson(adv), null, 2)], { type: 'application/geo+json' }))
  const link = document.createElement('a'); link.href = url; link.download = `${adv.id.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'aventure'}.geojson`; link.click(); URL.revokeObjectURL(url)
  importGeoMsg.value = `Aventure « ${adv.title} » exportée (${adv.steps.length} étape(s)).`
}
function importGeojson(asNew: boolean) {
  importGeoMsg.value = ''; importGeoErr.value = ''; importGeoWarnings.value = []
  const adv = currentAdventure.value
  if (!asNew && !adv) { importGeoErr.value = 'Sélectionne une aventure.'; return }
  const raw = geojsonText.value.replace(/^\uFEFF/, '').trim()
  if (!raw) { importGeoErr.value = 'Colle ou charge un GeoJSON.'; return }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { importGeoErr.value = 'JSON invalide (guillemets, virgules, parenthèses).'; return }
  const result = importHistoryAdventureFromGeoJson(parsed, { existingAdventureId: asNew ? `histoire-${Date.now().toString(36)}` : adv!.id })
  importGeoWarnings.value = result.warnings
  if (!result.ok) { importGeoErr.value = result.error; return }
  if (asNew) {
    let id = result.adventure.id; let suffix = 1
    while (adventures.value.some(a => a.id === id)) id = `${result.adventure.id}-${suffix++}`
    adventures.value.push({ ...result.adventure, id }); selectedAdventure.value = adventures.value.length - 1
  } else if (adv) {
    adventures.value[selectedAdventure.value] = { ...result.adventure, id: adv.id, ...(!importReplaceMeta.value ? { title: adv.title, period: adv.period, description: adv.description, emoji: adv.emoji, coverImageUrl: adv.coverImageUrl } : {}) }
  }
  selectedStep.value = 0; syncSelection(); changed()
  importGeoMsg.value = asNew ? `Nouvelle aventure « ${result.adventure.title} » (${result.adventure.steps.length} étape(s)).` : `${result.adventure.steps.length} étape(s) importée(s).`
}
function applyChallengeAreaGeojson() {
  challengeAreaErr.value = ''
  const raw = challengeAreaGeojsonText.value.replace(/^\uFEFF/, '').trim()
  if (!raw) { patchCurrentStep({ challengeAnswerArea: undefined }); return }
  const result = parseChallengeAnswerAreaFromGeoJson(raw)
  if (!result.ok) { challengeAreaErr.value = result.error; return }
  const step = currentStep.value; if (!step) return
  const center = centroidLngLatFromAnswerArea(result.area)
  patchCurrentStep({ challengeAnswerArea: result.area, challengeLat: center.lat, challengeLng: center.lng, miniChallenge: { ...step.miniChallenge, ...(result.question ? { question: result.question } : {}), ...(result.toleranceM != null ? { toleranceM: result.toleranceM } : {}) } })
  mapGuess.value = center
}
function clearChallengeAreaGeojson() { challengeAreaGeojsonText.value = ''; challengeAreaErr.value = ''; patchCurrentStep({ challengeAnswerArea: undefined }) }
async function onChallengeAreaFileChange(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  try { challengeAreaGeojsonText.value = (await file.text()).replace(/^\uFEFF/, ''); challengeAreaErr.value = '' }
  catch { challengeAreaErr.value = 'Lecture du fichier impossible.' }
  input.value = ''
}
</script>

<template>
  <div class="page-heading between"><div><span class="eyebrow">Administration · Histoires</span><h1>Gestion des histoires</h1><p>Titres, parcours, points et ordre des étapes.</p></div><RouterLink to="/admin" class="btn btn-secondary">Retour à l’administration</RouterLink></div>
  <div v-if="saveErr" class="alert" role="alert">{{ saveErr }}</div>
  <div v-if="loading" class="loading"><span class="spinner" /> Chargement…</div>
  <div v-else-if="!configured" class="notice warn">L’admin n’est pas configuré.<button v-if="saveErr" type="button" class="btn btn-ghost btn-sm" @click="checkStatus">Réessayer</button></div>
  <form v-else-if="!authed" class="surface panel stack-sm login-card" @submit.prevent="login"><h2>Connexion administrateur</h2><p class="subtle">Tu dois être connecté en admin.</p><label class="field"><span class="field-label">Secret administrateur</span><input v-model="secret" type="password" autocomplete="current-password" required /></label><button type="submit" class="btn btn-primary" :disabled="loginBusy || !secret">{{ loginBusy ? 'Connexion…' : 'Se connecter' }}</button></form>
  <div v-else class="stack editor-root">
    <div class="surface panel between"><div class="actions"><span class="badge">{{ adventures.length }} aventures</span><span v-if="dirty" class="badge warn">Modifications non enregistrées</span></div><div class="actions"><button type="button" class="btn btn-secondary" :disabled="saveBusy" @click="loadDefaultAdventures">Charger les exemples</button><button type="button" class="btn btn-secondary" :disabled="saveBusy" @click="addAdventure"><Plus :size="16" /> Aventure</button><button type="button" class="btn btn-primary" :disabled="saveBusy" @click="saveAll"><Save :size="16" /> {{ saveBusy ? 'Enregistrement…' : 'Enregistrer' }}</button></div></div>
    <p v-if="saveMsg" class="success" role="status">{{ saveMsg }}</p>
    <fieldset class="editor-layout" :disabled="saveBusy">
      <aside class="adventure-list surface panel stack-sm"><h2>Aventures</h2>
        <article v-for="(adventure, index) in adventures" :key="adventure.id" class="list-card" :class="{ selected: selectedAdventure === index }">
          <button type="button" class="adventure-select" :aria-pressed="selectedAdventure === index" @click="selectedAdventure = index; selectedStep = 0"><HistoryAdventureCover :cover-image-url="adventure.coverImageUrl" :emoji="adventure.emoji" :title="adventure.title" class="list-cover" /><span><strong>{{ adventure.title || `Aventure ${index + 1}` }}</strong><small>{{ adventure.steps.length }} étapes</small></span></button>
          <div class="actions"><button type="button" class="icon-button sm" :disabled="index === 0" aria-label="Monter l’aventure" @click="moveAdventure(index, -1)"><ArrowUp :size="14" /></button><button type="button" class="icon-button sm" :disabled="index === adventures.length - 1" aria-label="Descendre l’aventure" @click="moveAdventure(index, 1)"><ArrowDown :size="14" /></button><button type="button" class="btn btn-danger-ghost btn-sm" @click="removeAdventure(index)"><Trash2 :size="14" /> Suppr</button></div>
        </article><p v-if="!adventures.length" class="subtle">Aucune aventure. Crée un parcours ou charge les exemples.</p>
      </aside>
      <section class="stack editor-content" @input="changed" @change="changed">
        <div v-if="currentAdventure" class="surface panel stack-sm"><h2>Présentation de l’aventure</h2><div class="grid"><label class="field"><span class="field-label">Titre</span><input v-model="currentAdventure.title" /></label><label class="field"><span class="field-label">Période</span><input v-model="currentAdventure.period" /></label></div><label class="field"><span class="field-label">Description</span><textarea v-model="currentAdventure.description" /></label><div class="cover-fields"><HistoryAdventureCover :cover-image-url="currentAdventure.coverImageUrl" :emoji="currentAdventure.emoji" :title="currentAdventure.title" class="editor-cover" /><label class="field"><span class="field-label">Icône (emoji)</span><input v-model.trim="currentAdventure.emoji" maxlength="8" placeholder="🗺️" /></label><label class="field"><span class="field-label">Image de couverture (URL https)</span><input v-model.trim="currentAdventure.coverImageUrl" type="url" placeholder="https://…" autocomplete="off" /><small>Vide = couverture avec emoji.</small></label></div></div>
        <div class="surface panel stack-sm import-panel" :class="{ dropping: geojsonDropActive }" role="region" aria-label="Import et export GeoJSON" @dragover.prevent="geojsonDropActive = true" @dragleave="geojsonDropActive = false" @drop.prevent="onGeojsonDrop">
          <div class="between"><h2>Import / export GeoJSON</h2><button type="button" class="btn btn-secondary btn-sm" :disabled="!currentAdventure" @click="exportCurrentAdventureGeojson">Exporter cette aventure</button></div>
          <p class="subtle">Une FeatureCollection, avec des métadonnées optionnelles dans properties à la racine (titre, période, emoji, image…). Un point ou polygone = une étape ; une ligne = une étape par sommet. Propriétés : order, title, year, narration, question, toleranceM, challengeLat et challengeLng. Le joueur répond sur la carte.</p>
          <label class="actions subtle"><input v-model="importReplaceMeta" type="checkbox" /> Mettre à jour titre, période et description à partir du fichier</label>
          <div class="drop-zone"><label class="field"><span class="field-label">Glisser-déposer un .geojson / .json ici, ou choisir un fichier</span><input ref="geojsonFileInput" type="file" accept=".json,.geojson,application/json" aria-label="Fichier GeoJSON" @change="onGeojsonFileChange" /></label><small v-if="geojsonFileLabel">{{ geojsonFileLabel }} {{ geojsonReading ? '· Lecture…' : '' }}</small></div>
          <label class="field"><span class="field-label">GeoJSON à importer</span><textarea v-model="geojsonText" rows="6" class="mono" placeholder="… ou coller le GeoJSON ici" /></label><div class="actions"><button type="button" class="btn btn-ghost btn-sm" @click="clearGeojsonText">Vider</button></div>
          <details><summary>Exemple de format</summary><pre>{{ geojsonHistoireExample }}</pre></details>
          <div class="actions"><button type="button" class="btn btn-secondary" :disabled="!currentAdventure || geojsonReading" @click="importGeojson(false)">Remplacer le parcours de cette aventure</button><button type="button" class="btn btn-primary" :disabled="geojsonReading" @click="importGeojson(true)">Importer comme nouvelle aventure</button></div>
          <p v-if="importGeoErr" class="alert" role="alert">{{ importGeoErr }}</p><p v-if="importGeoMsg" class="notice" role="status">{{ importGeoMsg }}</p><ul v-if="importGeoWarnings.length" class="notice warn"><li v-for="warning in importGeoWarnings" :key="warning">{{ warning }}</li></ul>
        </div>
        <template v-if="currentAdventure">
          <div class="surface panel stack-sm"><div class="between"><h2>Parcours et ordre des points</h2><button type="button" class="btn btn-secondary btn-sm" @click="addStep"><Plus :size="15" /> Point</button></div><div v-for="(step, index) in currentAdventure.steps" :key="step.id" class="step-row" :class="{ selected: selectedStep === index }"><button type="button" class="step-select" :aria-pressed="selectedStep === index" @click="selectedStep = index">{{ index + 1 }}. {{ step.title || `Étape ${index + 1}` }} <small>{{ step.year }}</small></button><div class="actions"><button type="button" class="icon-button sm" :disabled="index === 0" aria-label="Monter l’étape" @click="moveStep(index, -1)"><ArrowUp :size="14" /></button><button type="button" class="icon-button sm" :disabled="index === currentAdventure.steps.length - 1" aria-label="Descendre l’étape" @click="moveStep(index, 1)"><ArrowDown :size="14" /></button><button type="button" class="icon-button sm" :disabled="currentAdventure.steps.length <= 1" aria-label="Supprimer l’étape" @click="removeStep(index)"><Trash2 :size="14" /></button></div></div></div>
          <div v-if="currentStep" class="surface panel stack"><h2>Édition du point sélectionné</h2><div class="grid"><label class="field"><span class="field-label">Titre du point</span><input v-model="currentStep.title" /></label><label class="field"><span class="field-label">Année</span><input v-model="currentStep.year" /></label><label class="field"><span class="field-label">Latitude étape</span><input :value="currentStep.lat" type="number" step="any" min="-90" max="90" @input="updateCoordinate($event, 'lat')" /></label><label class="field"><span class="field-label">Longitude étape</span><input :value="currentStep.lng" type="number" step="any" min="-180" max="180" @input="updateCoordinate($event, 'lng')" /></label><label class="field"><span class="field-label">Latitude défi</span><input :value="currentStep.challengeLat ?? ''" type="number" step="any" min="-90" max="90" placeholder="Même que l’étape" @input="updateCoordinate($event, 'challengeLat')" /></label><label class="field"><span class="field-label">Longitude défi</span><input :value="currentStep.challengeLng ?? ''" type="number" step="any" min="-180" max="180" placeholder="Même que l’étape" @input="updateCoordinate($event, 'challengeLng')" /></label></div>
            <label class="field"><span class="field-label">Narration</span><textarea v-model="currentStep.narration" /></label><label class="field"><span class="field-label">Consigne du défi (réponse = clic sur la carte)</span><textarea v-model="currentStep.miniChallenge.question" rows="2" /></label><label class="field"><span class="field-label">Rayon de validation (mètres)</span><input :value="currentStep.miniChallenge.toleranceM ?? 250000" type="number" min="10000" step="1000" :disabled="Boolean(currentStep.challengeAnswerArea)" @input="updateTolerance" /><small v-if="currentStep.challengeAnswerArea">Ignoré tant qu’une zone polygonale est définie.</small></label>
            <section class="surface-flat panel stack-sm"><h3>Zone de défi (FeatureCollection)</h3><p class="subtle">Une ou plusieurs géométries Polygon / MultiPolygon. properties.text et toleranceM remplissent la consigne et le rayon. La zone polygonale est prioritaire sur le rayon.</p><label class="field"><span class="field-label">Fichier GeoJSON de la zone de défi</span><input type="file" accept=".json,.geojson,application/json" @change="onChallengeAreaFileChange" /></label><label class="field"><span class="field-label">GeoJSON de la zone</span><textarea v-model="challengeAreaGeojsonText" rows="5" class="mono" placeholder="FeatureCollection GeoJSON" /></label><details><summary>Exemple FeatureCollection</summary><pre>{{ challengeAreaGeojsonExample }}</pre></details><div class="actions"><button type="button" class="btn btn-primary btn-sm" @click="applyChallengeAreaGeojson">Appliquer la zone</button><button type="button" class="btn btn-secondary btn-sm" @click="clearChallengeAreaGeojson">Supprimer la zone</button></div><p v-if="challengeAreaErr" class="alert" role="alert">{{ challengeAreaErr }}</p><p v-else-if="currentStep.challengeAnswerArea" class="notice">Zone active sur cette étape.</p></section>
            <section class="stack-sm"><div class="between"><h3>Carte · Sélection des positions</h3><div class="actions"><button type="button" class="btn btn-sm" :class="mapPickMode === 'step' ? 'btn-primary' : 'btn-secondary'" :aria-pressed="mapPickMode === 'step'" @click="mapPickMode = mapPickMode === 'step' ? null : 'step'">Pointer l’étape</button><button type="button" class="btn btn-sm" :class="mapPickMode === 'challenge' ? 'btn-primary' : 'btn-secondary'" :aria-pressed="mapPickMode === 'challenge'" @click="mapPickMode = mapPickMode === 'challenge' ? null : 'challenge'">Pointer le défi</button></div></div><p class="subtle">1) Choisir « Pointer… » 2) cliquer sur la carte. Sinon, déplacement et zoom habituels.</p><p v-if="mapPickMode" class="notice" role="status">{{ mapPickMode === 'step' ? 'Clic = position de l’étape (pingouin)' : 'Clic = zone attendue du défi (correction)' }}</p>
              <div class="editor-map"><GeoMap v-model:guess="mapGuess" :interactive="mapPickMode !== null" :answer="challengePosition" :answer-area="challengeAnswerArea" :show-result="true" :tolerance-m="currentStep.miniChallenge.toleranceM ?? 250000" :show-basemap-selector="true" :borders="true" :story-enabled="true" :story-layer-with-result="true" :story-steps="currentAdventure.steps" :story-active-step-index="selectedStep" :on-admin-map-click="handleAdminMapClick" /></div>
              <div class="badges"><span class="badge">Étape : {{ currentStep.lat.toFixed(4) }}, {{ currentStep.lng.toFixed(4) }}</span><span v-if="hasDifferentChallengePosition && challengePosition" class="badge warn">Défi : {{ challengePosition.lat.toFixed(4) }}, {{ challengePosition.lng.toFixed(4) }}</span><span v-else-if="!currentStep.challengeAnswerArea" class="badge neutral">Défi = même position</span><span v-if="currentStep.challengeAnswerArea" class="badge success">Zone polygonale active</span></div>
            </section>
          </div>
        </template>
        <div v-else class="empty surface panel">Sélectionne ou crée une aventure, importe un GeoJSON, ou charge les exemples depuis le bouton en haut.</div>
      </section>
    </fieldset>
  </div>
</template>

<style scoped>
.editor-root{margin-top:20px}.login-card{max-width:420px;margin-top:20px}.editor-layout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:22px;border:0;margin:0;padding:0;min-width:0}.editor-content{min-width:0}.adventure-list{align-self:start;position:sticky;top:20px;max-height:calc(100dvh - 110px);overflow:auto;padding:16px}.list-card{padding:10px;border:1px solid var(--border);border-radius:12px;display:grid;gap:10px}.list-card.selected,.step-row.selected{border-color:var(--primary);background:var(--primary-soft)}.adventure-select{display:flex;gap:10px;align-items:center;width:100%;text-align:left;border:0;background:transparent;padding:0;min-width:0}.adventure-select>span{min-width:0;display:grid;gap:3px}.adventure-select strong{font-size:13px;overflow-wrap:anywhere}.list-cover{width:42px;height:42px;border-radius:9px;flex:none}.editor-cover{width:72px;height:72px;border-radius:12px}.cover-fields{display:grid;grid-template-columns:auto 130px minmax(0,1fr);gap:14px;align-items:start}.import-panel.dropping{border-color:var(--primary);background:var(--primary-soft)}.drop-zone{padding:12px;border:1px dashed var(--border-strong);border-radius:12px}.drop-zone input{max-width:100%;font-size:12px}.step-row{border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:10px;padding:9px}.step-select{border:0;background:transparent;flex:1;text-align:left;font-size:13px;min-width:0}.step-select small{display:block}.step-row .actions{gap:5px;flex-wrap:nowrap}.editor-map{height:350px;position:relative;overflow:hidden;border-radius:12px;border:1px solid var(--border)}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:250px;overflow:auto;background:var(--surface-2);padding:12px;border-radius:10px;font-size:11px}summary{color:var(--primary-strong);cursor:pointer;font-size:12px}.mono{font-size:12px}
@media(max-width:1050px){.editor-layout{grid-template-columns:220px minmax(0,1fr)}.cover-fields{grid-template-columns:72px minmax(0,1fr)}.cover-fields>label:last-child{grid-column:1/-1}.panel{padding:18px}}@media(max-width:767px){.editor-layout{grid-template-columns:1fr}.adventure-list{position:static;max-height:340px}.grid{grid-template-columns:1fr}.editor-map{height:310px}.editor-root>.panel{padding:14px}.actions .btn{white-space:normal}.panel{padding:16px}.page-heading h1{font-size:27px}}
</style>
