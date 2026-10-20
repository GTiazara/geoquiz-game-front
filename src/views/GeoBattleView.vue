<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarDays, MapPin, Plus, Swords, Trash2, Users, Zap } from 'lucide-vue-next'
import { api, errorMessage } from '$lib/api'
import { app } from '$lib/appStore'
import { appUrl } from '$lib/appUrl'
import { ACTU_THEME_ID, CUSTOM_GEO_BATTLE_THEME_ID } from '$lib/themes'
import GeoMap from '../components/GeoMap.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ShareGeoBattleLink from '../components/ShareGeoBattleLink.vue'
import GoogleTranslateLangBar from '../components/GoogleTranslateLangBar.vue'

type RecentBattle = { id: string; themeId?: string }
type CreatedBattle = { battleId: string }
type DailyBattle = { dateUtc: string; themeId: string; themeName: string; themeEmoji: string; battleId: string }
const router = useRouter()
const themeId = ref(app.themes[0]?.id ?? '')
const questionCount = ref(1)
const allQuestionsInTheme = ref(false)
const playerMode = ref<'u' | 'l'>('u')
const maxPlayers = ref(4)
const busy = ref(false)
const err = ref('')
const lastBattleId = ref('')
const customBusy = ref(false)
const customErr = ref('')
const lastBattleIdCustom = ref('')
const customPoint = ref<{ lat: number; lng: number } | null>(null)
const customLatStr = ref('')
const customLngStr = ref('')
const customCoordHint = ref('')
const customQuestionText = ref('')
const customDescription = ref('')
const customImgUrl = ref('')
const customYoutubeUrl = ref('')
const customToleranceKm = ref(50)
const customBorders = ref(true)
const recentBattles = ref<RecentBattle[]>([])
const deleteId = ref('')
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteErr = ref('')
const dailyBattles = ref<DailyBattle[]>([])
const dailyBusy = ref(false)
const dailyLoaded = ref(false)
const dailyErr = ref('')
const latestBusy = ref(false)
const latestErr = ref('')
const latestBattleId = ref('')
const joinInput = ref('')
const joinErr = ref('')
const LS = 'gp_geobattle_created'
const maxRounds = computed(() => Math.max(1, app.themeStats[themeId.value]?.questionCount ?? 0))
const playerLimit = () => playerMode.value === 'u' ? null : Math.max(2, Math.min(32, Number(maxPlayers.value) || 4))
const battlePath = (id: string) => `/geobattle/${encodeURIComponent(id)}`
const share = (id: string) => appUrl(battlePath(id))
watch([maxRounds, allQuestionsInTheme, questionCount], () => {
  if (!allQuestionsInTheme.value) questionCount.value = Math.max(1, Math.min(maxRounds.value, Number(questionCount.value) || 1))
})
watch(customPoint, point => {
  if (point) { customLatStr.value = point.lat.toFixed(6); customLngStr.value = point.lng.toFixed(6); customCoordHint.value = '' }
})
function persistRecent() {
  try { localStorage.setItem(LS, JSON.stringify(recentBattles.value)) } catch { /* storage unavailable */ }
}
function remember(id: string, tid?: string) {
  recentBattles.value = [{ id, themeId: tid }, ...recentBattles.value.filter(row => row.id !== id)].slice(0, 25)
  persistRecent()
}
onMounted(() => {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(LS) ?? '[]')
    if (Array.isArray(rows)) recentBattles.value = rows.flatMap((row): RecentBattle[] => {
      if (typeof row === 'string' && row.trim()) return [{ id: row.trim() }]
      if (row && typeof row === 'object' && 'id' in row) {
        const id = String(row.id ?? '').trim()
        if (id) return [{ id, themeId: 'themeId' in row && typeof row.themeId === 'string' ? row.themeId : undefined }]
      }
      return []
    })
  } catch { recentBattles.value = [] }
})
function applyCoords() {
  const parse = (s: string) => s.trim() ? Number(s.trim().replace(',', '.')) : NaN
  const lat = parse(customLatStr.value), lng = parse(customLngStr.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) { customCoordHint.value = 'Latitude et longitude numériques requises (ex. 48.8566 et 2.3522).'; return false }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { customCoordHint.value = 'Hors limites : latitude −90…90, longitude −180…180.'; return false }
  customPoint.value = { lat, lng }
  customCoordHint.value = ''
  return true
}
async function createBattle() {
  if (busy.value) return
  err.value = ''; lastBattleId.value = ''; deleteErr.value = ''
  if (!themeId.value) { err.value = 'Choisis un thème.'; return }
  busy.value = true
  try {
    const result = await api<CreatedBattle>('/geo-battle/create', { method: 'POST', body: {
      themeId: themeId.value, allQuestionsInTheme: allQuestionsInTheme.value,
      questionCount: allQuestionsInTheme.value ? undefined : Math.max(1, Math.min(maxRounds.value, questionCount.value, 200)), maxPlayers: playerLimit(),
    } })
    lastBattleId.value = result.battleId; remember(result.battleId, themeId.value)
  } catch (e) { err.value = errorMessage(e, 'Création impossible') } finally { busy.value = false }
}
async function createCustom() {
  if (customBusy.value) return
  customErr.value = ''; lastBattleIdCustom.value = ''; deleteErr.value = ''
  if (!customQuestionText.value.trim()) { customErr.value = 'Saisis l’intitulé de la question.'; return }
  if ((customLatStr.value.trim() || customLngStr.value.trim()) && !applyCoords()) { customErr.value = customCoordHint.value; return }
  if (!customPoint.value) { customErr.value = 'Indique la bonne réponse : clic sur la carte ou latitude + longitude puis « Appliquer ».'; return }
  customBusy.value = true
  try {
    const result = await api<CreatedBattle>('/geo-battle/create-custom', { method: 'POST', body: {
      text: customQuestionText.value.trim(), ...customPoint.value,
      toleranceM: Math.round(Math.max(5, Math.min(2000, Number(customToleranceKm.value) || 50)) * 1000),
      description: customDescription.value.trim() || undefined, imgUrl: customImgUrl.value.trim() || undefined,
      youtubeUrl: customYoutubeUrl.value.trim() || undefined, maxPlayers: playerLimit(),
    } })
    lastBattleIdCustom.value = result.battleId; remember(result.battleId, CUSTOM_GEO_BATTLE_THEME_ID)
  } catch (e) { customErr.value = errorMessage(e, 'Création impossible') } finally { customBusy.value = false }
}
async function loadDaily() {
  dailyBusy.value = true; dailyErr.value = ''
  try { dailyBattles.value = (await api<{ battles: DailyBattle[] }>('/geo-battle/daily')).battles; dailyLoaded.value = true }
  catch (e) { dailyErr.value = errorMessage(e, 'Chargement impossible') }
  finally { dailyBusy.value = false }
}
async function createLatest() {
  latestBusy.value = true; latestErr.value = ''
  try {
    const result = await api<CreatedBattle>('/geo-battle/create-latest', { method: 'POST' })
    latestBattleId.value = result.battleId; remember(result.battleId, ACTU_THEME_ID)
  } catch (e) { latestErr.value = errorMessage(e, 'Création impossible') } finally { latestBusy.value = false }
}
function goJoin() {
  joinErr.value = ''
  const raw = joinInput.value.trim()
  if (!raw) return
  try {
    const path = raw.includes('/geobattle/') ? raw.split('/geobattle/').pop()! : raw
    const id = decodeURIComponent(path.split(/[?#/]/)[0] ?? '').trim()
    if (!id) throw new Error()
    void router.push(battlePath(id))
  } catch { joinErr.value = 'Identifiant ou lien invalide.' }
}
function askDelete(id: string) { deleteId.value = id; deleteErr.value = ''; deleteOpen.value = true }
async function deleteBattle() {
  if (!deleteId.value || deleteBusy.value) return
  deleteBusy.value = true
  try {
    await api(`/geo-battle/${encodeURIComponent(deleteId.value)}`, { method: 'DELETE' })
    recentBattles.value = recentBattles.value.filter(row => row.id !== deleteId.value); persistRecent()
    if (lastBattleId.value === deleteId.value) lastBattleId.value = ''
    if (lastBattleIdCustom.value === deleteId.value) lastBattleIdCustom.value = ''
    deleteOpen.value = false
  } catch (e) { deleteErr.value = errorMessage(e, 'Suppression impossible'); deleteOpen.value = false }
  finally { deleteBusy.value = false }
}
</script>

<template>
  <div class="battle-lobby stack">
    <header class="page-heading between">
      <div><span class="eyebrow"><Swords :size="15" /> Le défi à partager</span><h1>Geobattle</h1><p>Le même lieu, une tentative par joueur. Défie tes amis : la précision fait la différence, le temps départage les ex æquo.</p></div>
      <GoogleTranslateLangBar embedded compact />
    </header>
    <section class="surface panel stack-sm">
      <div class="between"><h2><Users :size="20" /> À ton rythme ou tous ensemble</h2><span class="badge">Une tentative par manche</span></div>
      <p class="subtle">Illimité : chacun joue à son rythme. Salle : la partie démarre quand tous les joueurs sont présents ; 30 secondes par manche, puis révélation commune.</p>
      <fieldset class="player-settings"><legend class="field-label">Mode joueurs · commun aux deux créations</legend><div class="actions">
        <label><input v-model="playerMode" type="radio" value="u" name="battle-players" /> Illimité</label>
        <label><input v-model="playerMode" type="radio" value="l" name="battle-players" /> Salle</label>
        <label v-if="playerMode === 'l'" class="field"><span class="sr-only">Nombre de joueurs</span><select v-model="maxPlayers"><option v-for="n in [2,3,4,5,6,7,8,10,12,16,24,32]" :key="n" :value="n">{{ n }} joueurs</option></select></label>
      </div></fieldset>
    </section>
    <div class="creation-grid">
      <section class="surface panel stack">
        <div><span class="eyebrow"><Swords :size="15" /> Les thèmes de la communauté</span><h2>Créer une Geobattle</h2></div>
        <label class="field"><span>Thème</span><select v-model="themeId"><option v-for="theme in app.themes" :key="theme.id" :value="theme.id">{{ theme.emoji }} {{ theme.name }}</option></select></label>
        <label class="field notranslate" translate="no"><span>Manches (max. {{ maxRounds }})</span><input v-model.number="questionCount" type="number" min="1" :max="maxRounds" :disabled="allQuestionsInTheme" /></label>
        <label class="actions"><input v-model="allQuestionsInTheme" type="checkbox" /> Tout le thème, dans un ordre aléatoire</label>
        <button type="button" class="btn btn-primary btn-block" :disabled="busy || !app.themes.length" @click="createBattle"><Plus :size="17" /> {{ busy ? 'Création…' : 'Générer le lien' }}</button>
        <p v-if="err" role="alert" class="alert">{{ err }}</p>
        <div v-if="lastBattleId" class="notice stack-sm"><strong>Ta Geobattle est prête !</strong><input :value="share(lastBattleId)" readonly aria-label="Lien de la Geobattle" @focus="($event.target as HTMLInputElement).select()" @click="($event.target as HTMLInputElement).select()" /><div class="actions"><ShareGeoBattleLink :share-url="share(lastBattleId)" /><RouterLink :to="battlePath(lastBattleId)" class="btn btn-primary">Ouvrir</RouterLink><button type="button" class="btn btn-danger-ghost btn-sm" @click="askDelete(lastBattleId)">Supprimer</button></div></div>
      </section>
      <div class="stack discovery">
        <section class="surface panel stack-sm"><span class="eyebrow"><CalendarDays :size="15" /> Le rendez-vous quotidien</span><h2>Geobattle du jour</h2><p class="subtle">Un lien par thème, identique pour tous aujourd’hui (UTC). Même énoncé, classement partagé ; ces duels officiels ne sont pas supprimables.</p><button type="button" class="btn btn-secondary" :disabled="dailyBusy" @click="loadDaily">{{ dailyBusy ? 'Chargement…' : 'Afficher les Geobattle du jour' }}</button><p v-if="dailyErr" class="alert" role="alert">{{ dailyErr }}</p><small v-if="dailyBattles.length">Jour UTC : {{ dailyBattles[0]?.dateUtc }}</small><ul v-if="dailyBattles.length" class="battle-list"><li v-for="row in dailyBattles" :key="row.battleId"><RouterLink :to="battlePath(row.battleId)" class="grow"><strong>{{ row.themeEmoji }} {{ row.themeName }}</strong><small>Jouer →</small></RouterLink><ShareGeoBattleLink :share-url="share(row.battleId)" compact /></li></ul><p v-else-if="dailyLoaded" class="subtle">Aucun duel disponible aujourd’hui.</p></section>
        <section class="surface panel stack-sm"><span class="eyebrow"><Zap :size="15" /> Au cœur de l’actualité</span><h2>La dernière question</h2><p class="subtle">Défie tes amis sur la dernière question publiée du thème actualité.</p><button type="button" class="btn btn-secondary" :disabled="latestBusy" @click="createLatest">{{ latestBusy ? 'Création…' : 'Créer le défi actualité' }}</button><p v-if="latestErr" class="alert" role="alert">{{ latestErr }}</p><div v-if="latestBattleId" class="actions"><RouterLink :to="battlePath(latestBattleId)" class="btn btn-primary">Jouer</RouterLink><ShareGeoBattleLink :share-url="share(latestBattleId)" /></div></section>
      </div>
    </div>
    <section class="surface panel stack">
      <div><span class="eyebrow"><MapPin :size="15" /> Ton idée, ton lieu</span><h2>Geobattle personnalisée</h2><p class="subtle">Compose une question et fixe la bonne réponse sur la carte ou avec des coordonnées WGS84. Les détails et médias sont facultatifs.</p></div>
      <div class="custom-grid"><div class="stack-sm"><div class="custom-map"><GeoMap :key="String(customBorders)" v-model:guess="customPoint" :borders="customBorders" :show-basemap-selector="false" /></div><label class="actions subtle"><input v-model="customBorders" type="checkbox" /> Limites entre pays sur la carte</label><div class="coord-fields notranslate" translate="no"><label class="field"><span>Latitude</span><input v-model="customLatStr" inputmode="decimal" placeholder="48.8566" /></label><label class="field"><span>Longitude</span><input v-model="customLngStr" inputmode="decimal" placeholder="2.3522" /></label><button type="button" class="btn btn-secondary" @click="applyCoords">Appliquer</button></div><p v-if="customCoordHint" class="field-error" role="alert">{{ customCoordHint }}</p><small v-else-if="customPoint">Point actif · {{ customPoint.lat.toFixed(5) }}, {{ customPoint.lng.toFixed(5) }}</small></div>
        <div class="stack-sm"><label class="field"><span>Question *</span><input v-model="customQuestionText" placeholder="Dans quelle ville se trouve ce monument ?" /></label><label class="field"><span>Description (optionnel)</span><textarea v-model="customDescription" rows="3" placeholder="Indice ou contexte…" /></label><label class="field"><span>URL image (https, optionnel)</span><input v-model="customImgUrl" type="url" placeholder="https://…" /></label><label class="field"><span>Vidéo YouTube (optionnel)</span><input v-model="customYoutubeUrl" type="url" placeholder="Lien vers la vidéo" /></label><label class="field"><span>Tolérance (km) · zone correcte</span><input v-model.number="customToleranceKm" type="number" min="5" max="2000" step="1" /></label></div>
      </div>
      <button type="button" class="btn btn-primary custom-create" :disabled="customBusy" @click="createCustom"><Plus :size="17" /> {{ customBusy ? 'Création…' : 'Générer le lien personnalisé' }}</button><p v-if="customErr" class="alert" role="alert">{{ customErr }}</p>
      <div v-if="lastBattleIdCustom" class="notice stack-sm"><strong>Ton défi personnalisé est prêt !</strong><input :value="share(lastBattleIdCustom)" readonly aria-label="Lien de la Geobattle personnalisée" @focus="($event.target as HTMLInputElement).select()" @click="($event.target as HTMLInputElement).select()" /><div class="actions"><ShareGeoBattleLink :share-url="share(lastBattleIdCustom)" /><RouterLink :to="battlePath(lastBattleIdCustom)" class="btn btn-primary">Ouvrir</RouterLink><button type="button" class="btn btn-danger-ghost btn-sm" @click="askDelete(lastBattleIdCustom)">Supprimer</button></div></div>
    </section>
    <section class="surface panel stack-sm"><h2>Rejoindre une Geobattle</h2><label class="field"><span>Identifiant ou URL reçue</span><div class="actions join-fields"><input v-model="joinInput" placeholder="abc12xyz34 ou URL complète" @keydown.enter="goJoin" /><button type="button" class="btn btn-primary" :disabled="!joinInput.trim()" @click="goJoin">Jouer</button></div></label><p v-if="joinErr" class="field-error" role="alert">{{ joinErr }}</p></section>
    <p v-if="deleteErr" class="alert" role="alert">{{ deleteErr }}</p>
    <section v-if="recentBattles.length" class="surface panel stack-sm"><h2>Tes Geobattle récentes</h2><p class="subtle">Les 25 derniers défis créés sur cet appareil.</p><ul class="battle-list"><li v-for="row in recentBattles" :key="row.id"><RouterLink :to="battlePath(row.id)" class="grow mono">{{ row.id }}</RouterLink><ShareGeoBattleLink :share-url="share(row.id)" compact /><button v-if="!row.id.startsWith('daily-') && row.themeId !== ACTU_THEME_ID" type="button" class="icon-button" aria-label="Supprimer cette Geobattle" @click="askDelete(row.id)"><Trash2 :size="15" /></button></li></ul></section>
    <ConfirmDialog v-model:open="deleteOpen" title="Supprimer cette Geobattle ?" :description="`Tu supprimes la Geobattle « ${deleteId} » pour tout le monde.\n\nLe lien partagé ne fonctionnera plus. Toutes les tentatives et le classement seront effacés.\n\nChoisis « Annuler » si tu as changé d’avis.`" confirm-label="Oui, supprimer" :busy="deleteBusy" :on-confirm="deleteBattle" />
  </div>
</template>

<style scoped>
.battle-lobby{padding-bottom:24px}.page-heading{margin-bottom:0}.creation-grid,.custom-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}h2{display:flex;align-items:center;gap:10px}.player-settings{border:0;padding:0;margin:0}.player-settings legend{margin-bottom:10px}.player-settings label:not(.field){display:flex;gap:7px;align-items:center}.player-settings select{width:auto}.discovery{gap:18px}.battle-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.battle-list li{display:flex;gap:8px;align-items:center;padding:10px;border:1px solid var(--border);border-radius:12px;min-width:0}.grow{flex:1;min-width:0;overflow-wrap:anywhere}.grow small{display:block}.custom-map{height:350px;position:relative;overflow:hidden;border-radius:14px;border:1px solid var(--border)}.custom-map :deep(.geo-map){height:100%}.coord-fields{display:flex;gap:10px;align-items:end}.coord-fields .field{flex:1}.custom-create{justify-self:start}.join-fields input{flex:1;width:auto}.join-fields{flex-wrap:nowrap}@media(max-width:900px){.creation-grid,.custom-grid{grid-template-columns:1fr}.coord-fields{flex-wrap:wrap}.coord-fields .field{min-width:100px}.custom-map{height:300px}}
</style>
