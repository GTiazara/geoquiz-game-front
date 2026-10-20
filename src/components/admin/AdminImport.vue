<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AdminGeojsonPreview from '../AdminGeojsonPreview.vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const { data, themeFilter, busy, mutate } = useAdminDashboard()
const themeId = ref(''), text = ref(''), fileName = ref(''), reading = ref(false), progress = ref(0), dropActive = ref(false)
const message = ref(''), isError = ref(false), importing = ref(false), fileInput = ref<HTMLInputElement | null>(null)
let reader: FileReader | null = null
const resolvedTheme = computed(() => [themeId.value, themeFilter.value, data.value.themes[0]?.id ?? ''].find(id => data.value.themes.some(t => t.id === id)) ?? '')
watch(() => [themeFilter.value, data.value.themes.map(t => t.id).join('\n')], () => {
  if (data.value.themes.some(t => t.id === themeFilter.value)) themeId.value = themeFilter.value
  else if (!data.value.themes.some(t => t.id === themeId.value)) themeId.value = data.value.themes[0]?.id ?? ''
}, { immediate: true })
function clear() { text.value = ''; fileName.value = ''; progress.value = 0; if (fileInput.value) fileInput.value.value = '' }
function loadFile(file?: File) {
  if (!file || busy.value || importing.value) return
  reader?.abort()
  message.value = ''; isError.value = false; fileName.value = file.name; reading.value = true; progress.value = 0
  const current = new FileReader(); reader = current
  current.onprogress = event => { if (event.lengthComputable && event.total) progress.value = Math.round(event.loaded / event.total * 100) }
  current.onload = () => { text.value = String(current.result ?? '').replace(/^\uFEFF/, ''); reading.value = false; progress.value = 100; reader = null }
  current.onerror = () => { message.value = 'Lecture du fichier impossible'; isError.value = true; reading.value = false; fileName.value = ''; reader = null }
  current.onabort = () => { reading.value = false }
  current.readAsText(file)
}
function drop(event: DragEvent) { dropActive.value = false; loadFile(event.dataTransfer?.files[0]) }
async function submit() {
  message.value = ''; isError.value = false
  if (!resolvedTheme.value) { isError.value = true; message.value = 'Aucun thème valide. Crée un thème dans l’application puis actualise la page.'; return }
  const stripped = text.value.replace(/^\uFEFF/, '').trim()
  if (!stripped) { isError.value = true; message.value = 'Colle ou charge un GeoJSON non vide.'; return }
  try { JSON.parse(stripped) } catch { isError.value = true; message.value = 'JSON invalide : vérifie les guillemets, virgules et parenthèses du fichier.'; return }
  importing.value = true
  try {
    const result = await mutate<{ imported?: number; errors?: string[] }>('questions/import-geojson', undefined, 'Import GeoJSON terminé.', JSON.stringify({ themeId: resolvedTheme.value, geojson: stripped }))
    if (!result) return
    const warnings = result.errors?.length ? ` — avertissements : ${result.errors.slice(0, 5).join(' ; ')}` : ''
    message.value = `Import terminé : ${result.imported ?? 0} question(s) enregistrée(s).${warnings}`
    clear()
  } finally { importing.value = false }
}
onBeforeUnmount(() => { reader?.abort(); reader = null })
const example = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { text: 'Où se trouve ce lieu ?', toleranceM: 50000, imgUrl: 'https://example.com/photo.jpg', youtubeUrl: 'https://www.youtube.com/watch?v=…', description: 'Texte affiché en popup à la correction (optionnel).' }, geometry: { type: 'Point', coordinates: [2.3522, 48.8566] } }] }, null, 2)
const fields = [
  ['type / features[]', 'Oui', 'Racine FeatureCollection avec une Feature par question.'],
  ['geometry.type', 'Oui', 'Point, Polygon, MultiPolygon ou GeometryCollection de surfaces. Dans une zone = XP max, hors zone = 0 XP.'],
  ['geometry.coordinates', 'Oui', 'WGS84 : [longitude, latitude] pour un point ; anneaux de paires [lng, lat] pour une surface.'],
  ['properties.text', 'Un libellé', 'Texte affiché en jeu. Alias prioritaires : question, name, title.'],
  ['properties.toleranceM', 'Non', 'Rayon en mètres ; défaut 50 000, minimum 1 000. Alias : tolerance, bufferM.'],
  ['properties.imgUrl', 'Non', 'Image HTTP(S) du popup de correction. Alias : imageUrl, image_url.'],
  ['properties.youtubeUrl', 'Non', 'Lien YouTube (watch / embed / youtu.be). Alias : youtube_url.'],
  ['properties.description', 'Non', 'Texte complémentaire dans le popup de correction. Alias : desc.'],
]
</script>
<template>
  <section class="surface panel stack"><h2>Import GeoJSON (questions)</h2><p class="subtle">Charge ou colle une FeatureCollection valide. Le thème cible est celui choisi ci-dessous, pas celui du fichier.</p>
    <details class="surface-flat panel"><summary><strong>Format attendu pour la gestion des questions</strong></summary><div class="stack" style="margin-top:16px"><div class="table-wrap"><table class="table"><thead><tr><th>Champ</th><th>Obligatoire</th><th>Rôle</th></tr></thead><tbody><tr v-for="field in fields" :key="field[0]"><td><code>{{ field[0] }}</code></td><td>{{ field[1] }}</td><td>{{ field[2] }}</td></tr></tbody></table></div><h3>Exemple minimal</h3><pre class="example">{{ example }}</pre></div></details>
    <div class="actions"><label class="field" style="flex:1;min-width:200px"><span class="field-label">Thème cible</span><select v-model="themeId" :disabled="busy || reading"><option v-for="theme in data.themes" :key="theme.id" :value="theme.id">{{ theme.emoji }} {{ theme.name }} ({{ theme.id }})</option></select></label><label class="btn btn-secondary"><span>Charger un fichier .geojson / .json</span><input ref="fileInput" type="file" accept=".geojson,.json,application/geo+json,application/json" class="file-input" :disabled="busy || reading" @change="loadFile(($event.target as HTMLInputElement).files?.[0])" /></label><button type="button" class="btn btn-ghost" :disabled="busy || reading" @click="clear">Effacer</button></div><p v-if="fileName" class="subtle">{{ fileName }}</p>
    <div class="import-grid"><div class="drop-zone" :class="{ active: dropActive }" role="region" aria-label="Coller ou déposer un fichier GeoJSON" @dragenter.prevent="dropActive = true" @dragover.prevent="dropActive = true" @dragleave.prevent="dropActive = false" @drop.prevent="drop"><label class="field"><span class="field-label">Contenu GeoJSON — glisser-déposer possible</span><textarea v-model="text" class="mono" rows="15" placeholder="Coller un GeoJSON ou charger un fichier — FeatureCollection" :disabled="busy || reading" /></label></div><AdminGeojsonPreview :text="text" /></div>
    <div v-if="reading" class="stack-sm" role="status"><span class="subtle">Lecture du fichier… {{ progress }} %</span><progress :value="progress" max="100" aria-label="Progression de lecture" /></div>
    <div v-if="importing" class="notice actions" role="status"><span class="spinner" /> Envoi, analyse et écriture des questions sur le serveur…<progress aria-label="Import en cours" /></div>
    <p v-if="message" :class="isError ? 'alert' : 'success'" role="status" aria-live="polite">{{ message }}</p>
    <p class="subtle">Pour les imports volumineux, adapte <code>BODY_SIZE_LIMIT</code> côté API (par exemple 128mb) et <code>client_max_body_size</code> si nginx est utilisé.</p>
    <div class="actions"><button type="button" class="btn btn-primary" :disabled="busy || reading || !resolvedTheme || !text.trim()" @click="submit">{{ importing ? 'Import en cours…' : reading ? 'Lecture…' : 'Importer' }}</button></div>
  </section>
</template>
<style scoped>.import-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.drop-zone{padding:12px;border:2px dashed var(--border-strong);border-radius:12px}.drop-zone.active{border-color:var(--primary);background:var(--primary-soft)}.example{white-space:pre;overflow:auto;max-height:300px;background:var(--surface-2);padding:16px;border-radius:12px;font-size:12px}.file-input{max-width:180px;font-size:12px}summary{cursor:pointer}progress{accent-color:var(--primary);width:100%}@media(max-width:1000px){.import-grid{grid-template-columns:1fr}}</style>
