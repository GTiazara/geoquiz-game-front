<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { FlashCard, FlashDeck, FlashPrompt, FlashTheme } from '$lib/types'
import AdminModal from './AdminModal.vue'
import { useAdminDashboard } from '../../composables/adminDashboard'

type ThemeForm = { id: string; name: string; emoji: string; description: string; coverImageUrl: string; approved: boolean }
type DeckForm = { id: string; themeId: string; name: string; emoji: string; description: string; coverImageUrl: string; approved: boolean }
type CardForm = {
  id: string
  deckId: string
  kind: FlashPrompt['kind']
  text: string
  url: string
  alt: string
  choiceIds: string[]
  choices: string[]
  correct: number
  backText: string
  approved: boolean
}

const { data, busy, error, mutate, ask } = useAdminDashboard()
const importThemeId = ref('')
const importText = ref('')
const importFileName = ref('')
const importReplace = ref(false)
const importMessage = ref('')
const importError = ref(false)
const importReading = ref(false)
const dropActive = ref(false)
const importFile = ref<HTMLInputElement | null>(null)
let reader: FileReader | null = null
const exampleChoices = [
  { id: 'chene', label: 'Chêne' },
  { id: 'hetre', label: 'Hêtre' },
  { id: 'pin', label: 'Pin' },
  { id: 'sapin', label: 'Sapin' },
]
const exampleDeck = JSON.stringify({
  name: 'Arbres du jardin',
  emoji: '🌳',
  description: 'Une carte par type de recto : texte, image, vidéo, audio.',
  approved: true,
  cards: [
    {
      prompt: { kind: 'text', text: 'Quel arbre produit des glands ?' },
      choices: exampleChoices,
      correctChoiceId: 'chene',
      backText: 'Le chêne produit des glands.',
    },
    {
      prompt: { kind: 'image', url: 'https://example.com/chene.jpg', alt: 'Photo d’un arbre' },
      choices: exampleChoices,
      correctChoiceId: 'chene',
      backText: 'Le chêne pédonculé.',
    },
    {
      prompt: { kind: 'video', url: 'https://example.com/arbre.mp4' },
      choices: exampleChoices,
      correctChoiceId: 'chene',
      backText: 'Vidéo : URL https ou lien YouTube.',
    },
    {
      prompt: { kind: 'audio', url: 'https://example.com/chene.mp3' },
      choices: exampleChoices,
      correctChoiceId: 'chene',
      backText: 'Audio : fichier https (mp3, par exemple).',
    },
  ],
}, null, 2)
const deckId = ref('')
const themeForm = ref<ThemeForm | null>(null)
const deckForm = ref<DeckForm | null>(null)
const cardForm = ref<CardForm | null>(null)
function youtubeVideoId(value: string): string {
  try {
    const url = new URL(value)
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] ?? ''
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      return url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] || ''
    }
  } catch { /* URL vide ou en cours de saisie. */ }
  return ''
}
const videoEmbedUrl = computed(() => {
  const value = cardForm.value?.kind === 'video' ? cardForm.value.url.trim() : ''
  if (!value) return ''
  const id = youtubeVideoId(value)
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : ''
})
const themes = computed(() => data.value.flashThemes)
watch(themes, (list) => {
  if (!list.some(theme => theme.id === importThemeId.value)) importThemeId.value = list[0]?.id ?? ''
}, { immediate: true })
const decks = computed(() => data.value.flashDecks)
const themeName = (id: string) => themes.value.find(theme => theme.id === id)?.name ?? id
const cards = computed(() => data.value.flashCards.filter(card => !deckId.value || card.deckId === deckId.value))

function emptyCard(targetDeck = deckId.value || decks.value[0]?.id || ''): CardForm {
  return { id: '', deckId: targetDeck, kind: 'text', text: '', url: '', alt: '', choiceIds: ['c1', 'c2', 'c3', 'c4'], choices: ['', '', '', ''], correct: 0, backText: '', approved: false }
}

function openTheme(theme?: FlashTheme) {
  error.value = ''
  themeForm.value = theme
    ? { id: theme.id, name: theme.name, emoji: theme.emoji, description: theme.description ?? '', coverImageUrl: theme.coverImageUrl ?? '', approved: theme.approved }
    : { id: '', name: '', emoji: '🚩', description: '', coverImageUrl: '', approved: false }
}

function openDeck(deck?: FlashDeck) {
  error.value = ''
  deckForm.value = deck
    ? { id: deck.id, themeId: deck.themeId, name: deck.name, emoji: deck.emoji, description: deck.description ?? '', coverImageUrl: deck.coverImageUrl ?? '', approved: deck.approved }
    : { id: '', themeId: themes.value[0]?.id ?? '', name: '', emoji: '🃏', description: '', coverImageUrl: '', approved: false }
}

async function saveTheme() {
  if (!themeForm.value) return
  const form = themeForm.value
  const result = await mutate('flash/themes/save', { ...form, id: form.id || undefined, name: form.name.trim(), emoji: form.emoji.trim() }, 'Thème enregistré.')
  if (result) themeForm.value = null
}

function openCard(card?: FlashCard) {
  error.value = ''
  if (!card) {
    cardForm.value = emptyCard()
    return
  }
  const prompt = card.prompt
  cardForm.value = {
    id: card.id,
    deckId: card.deckId,
    kind: prompt.kind,
    text: prompt.kind === 'text' ? prompt.text : '',
    url: prompt.kind === 'text' ? '' : prompt.url,
    alt: prompt.kind === 'image' ? prompt.alt ?? '' : '',
    choiceIds: card.choices.map(choice => choice.id),
    choices: card.choices.map(choice => choice.label),
    correct: Math.max(0, card.choices.findIndex(choice => choice.id === card.correctChoiceId)),
    backText: card.backText,
    approved: card.approved,
  }
}

async function saveDeck() {
  if (!deckForm.value) return
  const form = deckForm.value
  const result = await mutate('flash/decks/save', { ...form, id: form.id || undefined, name: form.name.trim(), emoji: form.emoji.trim() }, 'Paquet enregistré.')
  if (result) deckForm.value = null
}

function clearImport() {
  importText.value = ''
  importFileName.value = ''
  if (importFile.value) importFile.value.value = ''
}

function loadImportFile(file?: File) {
  if (!file || busy.value) return
  reader?.abort()
  importMessage.value = ''
  importError.value = false
  importFileName.value = file.name
  importReading.value = true
  const current = new FileReader()
  reader = current
  current.onload = () => {
    importText.value = String(current.result ?? '').replace(/^\uFEFF/, '')
    importReading.value = false
    reader = null
  }
  current.onerror = () => {
    importMessage.value = 'Lecture du fichier impossible'
    importError.value = true
    importReading.value = false
    importFileName.value = ''
    reader = null
  }
  current.readAsText(file)
}

/** Envoie le JSON dans le thème choisi. Le thème écrit dans le fichier est ignoré. */
async function importDeck() {
  importMessage.value = ''
  importError.value = false
  if (!importThemeId.value) {
    importError.value = true
    importMessage.value = 'Choisis un thème. Crée-en un si la liste est vide.'
    return
  }
  const stripped = importText.value.replace(/^\uFEFF/, '').trim()
  if (!stripped) {
    importError.value = true
    importMessage.value = 'Colle ou charge un JSON de paquet.'
    return
  }
  try { JSON.parse(stripped) } catch {
    importError.value = true
    importMessage.value = 'JSON invalide : vérifie les guillemets, virgules et parenthèses.'
    return
  }
  const result = await mutate<{ imported?: number; errors?: string[]; deckId?: string }>(
    'flash/decks/import',
    undefined,
    'Paquet importé.',
    JSON.stringify({ themeId: importThemeId.value, replace: importReplace.value, deck: stripped })
  )
  if (!result) return
  const warnings = result.errors?.length ? ` Cartes ignorées : ${result.errors.slice(0, 4).join(' ; ')}` : ''
  importMessage.value = `${result.imported ?? 0} carte(s) dans le paquet ${result.deckId ?? ''}.${warnings}`
  clearImport()
}

onBeforeUnmount(() => { reader?.abort(); reader = null })

async function saveCard() {
  const form = cardForm.value
  if (!form) return
  const prompt = form.kind === 'text'
    ? { kind: 'text', text: form.text.trim() }
    : form.kind === 'image'
      ? { kind: 'image', url: form.url.trim(), alt: form.alt.trim() }
      : { kind: form.kind, url: form.url.trim() }
  const choices = form.choices.map((label, index) => ({ id: form.choiceIds[index] || `c${index + 1}`, label: label.trim() }))
  const result = await mutate('flash/cards/save', {
    id: form.id || undefined,
    deckId: form.deckId,
    prompt,
    choices,
    correctChoiceId: choices[form.correct]?.id,
    backText: form.backText.trim(),
    approved: form.approved,
  }, 'Carte enregistrée.')
  if (result) cardForm.value = null
}
</script>

<template>
  <section class="surface panel stack">
    <div class="between">
      <div>
        <h2>Flashcards</h2>
        <p class="subtle">Un thème regroupe plusieurs paquets. Ces thèmes sont distincts de ceux du quiz carte.</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="openTheme()">Nouveau thème</button>
        <button type="button" class="btn btn-secondary" :disabled="!themes.length" @click="openDeck()">Nouveau paquet</button>
        <button type="button" class="btn btn-primary" :disabled="!decks.length" @click="openCard()">Nouvelle carte</button>
      </div>
    </div>
    <section class="import-panel stack-sm">
      <h3>Importer un paquet</h3>
      <p class="subtle">Le paquet est créé dans le thème choisi ici. Un identifiant déjà présent dans ce thème n’est écrasé que si « Remplacer » est coché.</p>
      <details>
        <summary>Format JSON</summary>
        <p class="subtle">Quatre réponses et un verso pour chaque carte. Image et audio : URL https. Vidéo : URL https ou YouTube.</p>
        <pre class="example">{{ exampleDeck }}</pre>
      </details>
      <div class="actions">
        <label class="field import-theme"><span class="field-label">Thème cible</span>
          <select v-model="importThemeId" :disabled="busy || !themes.length"><option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ theme.emoji }} {{ theme.name }}</option></select>
        </label>
        <label class="btn btn-secondary import-file">Charger un .json
          <input ref="importFile" type="file" accept=".json,application/json" :disabled="busy || importReading" @change="loadImportFile(($event.target as HTMLInputElement).files?.[0])" />
        </label>
        <button type="button" class="btn btn-ghost" :disabled="busy" @click="clearImport">Effacer</button>
      </div>
      <label class="actions"><input v-model="importReplace" type="checkbox" /> Remplacer les cartes si ce paquet existe déjà dans le thème</label>
      <div class="drop-zone" :class="{ active: dropActive }" role="region" aria-label="Coller ou déposer un JSON de paquet" @dragenter.prevent="dropActive = true" @dragover.prevent="dropActive = true" @dragleave.prevent="dropActive = false" @drop.prevent="dropActive = false; loadImportFile($event.dataTransfer?.files[0])">
        <label class="field"><span class="field-label">JSON du paquet — glisser-déposer possible</span>
          <textarea v-model="importText" class="mono" rows="8" placeholder="Colle le JSON du paquet, ou charge un fichier" :disabled="busy || importReading" />
        </label>
      </div>
      <p v-if="importFileName" class="subtle">{{ importFileName }}</p>
      <p v-if="importMessage" :class="importError ? 'alert' : 'success'" role="status">{{ importMessage }}</p>
      <button type="button" class="btn btn-primary" :disabled="busy || importReading || !importThemeId || !importText.trim()" @click="importDeck">{{ importReading ? 'Lecture…' : 'Importer le paquet' }}</button>
    </section>
    <h3>Thèmes</h3>
    <div class="table-wrap"><table class="table"><thead><tr><th>Thème</th><th>État</th><th>Actions</th></tr></thead><tbody>
      <tr v-for="theme in themes" :key="theme.id"><td><strong>{{ theme.emoji }} {{ theme.name }}</strong><p class="subtle clamp">{{ theme.description }}</p></td><td><span class="badge" :class="theme.approved ? 'success' : 'warn'">{{ theme.approved ? 'Publié' : 'Brouillon' }}</span></td><td><div class="actions"><button type="button" class="btn btn-sm btn-secondary" @click="openTheme(theme)">Modifier</button><button type="button" class="btn btn-sm btn-danger-ghost" :disabled="busy" @click="ask(`Supprimer le thème « ${theme.name} », ses paquets et ses cartes ?`, () => mutate('flash/themes/delete', { themeId: theme.id }, 'Thème supprimé.'))">Supprimer</button></div></td></tr>
    </tbody></table></div>
    <h3>Paquets</h3>
    <label class="field"><span class="field-label">Filtrer par paquet</span>
      <select v-model="deckId"><option value="">Tous</option><option v-for="deck in decks" :key="deck.id" :value="deck.id">{{ deck.emoji }} {{ deck.name }}</option></select>
    </label>
    <div class="table-wrap"><table class="table"><thead><tr><th>Paquet</th><th>État</th><th>Actions</th></tr></thead><tbody>
      <tr v-for="deck in decks" :key="deck.id"><td><strong>{{ deck.emoji }} {{ deck.name }}</strong><p class="subtle clamp">{{ themeName(deck.themeId) }}{{ deck.description ? ` · ${deck.description}` : '' }}</p></td><td><span class="badge" :class="deck.approved ? 'success' : 'warn'">{{ deck.approved ? 'Publié' : 'Brouillon' }}</span></td><td><div class="actions"><button type="button" class="btn btn-sm btn-secondary" @click="openDeck(deck)">Modifier</button><button type="button" class="btn btn-sm btn-danger-ghost" :disabled="busy" @click="ask(`Supprimer le paquet « ${deck.name} » et ses cartes ?`, () => mutate('flash/decks/delete', { deckId: deck.id }, 'Paquet supprimé.'))">Supprimer</button></div></td></tr>
    </tbody></table></div>
    <h3>Cartes</h3>
    <div class="table-wrap"><table class="table"><thead><tr><th>Recto</th><th>Verso</th><th>État</th><th>Actions</th></tr></thead><tbody>
      <tr v-for="card in cards" :key="card.id"><td><div class="card-front-cell"><img v-if="card.prompt.kind === 'image'" class="card-media-thumb" :src="card.prompt.url" :alt="card.prompt.alt || 'Image de la flashcard'" loading="lazy" /><img v-else-if="card.prompt.kind === 'video' && youtubeVideoId(card.prompt.url)" class="card-media-thumb" :src="`https://img.youtube.com/vi/${youtubeVideoId(card.prompt.url)}/hqdefault.jpg`" alt="Miniature de la vidéo" loading="lazy" /><video v-else-if="card.prompt.kind === 'video'" class="card-media-thumb" :src="card.prompt.url" muted preload="metadata" aria-label="Vidéo de la flashcard" /><span>{{ card.prompt.kind === 'text' ? card.prompt.text : card.prompt.kind }}</span></div></td><td class="clamp">{{ card.backText }}</td><td><span class="badge" :class="card.approved ? 'success' : 'warn'">{{ card.approved ? 'Publiée' : 'Brouillon' }}</span></td><td><div class="actions"><button type="button" class="btn btn-sm btn-secondary" @click="openCard(card)">Modifier</button><button type="button" class="btn btn-sm btn-danger-ghost" :disabled="busy" @click="ask('Supprimer cette carte ?', () => mutate('flash/cards/delete', { cardId: card.id }, 'Carte supprimée.'))">Supprimer</button></div></td></tr>
    </tbody></table></div>
    <p v-if="!cards.length" class="subtle">Aucune carte pour ce filtre.</p>
  </section>

  <AdminModal v-if="themeForm" title="Thème flashcard" :busy="busy" :on-close="() => { themeForm = null }"><form @submit.prevent="saveTheme"><fieldset class="modal-body stack" :disabled="busy" style="border:0;margin:0">
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <label class="field"><span class="field-label">Nom</span><input v-model="themeForm.name" required /></label>
    <label class="field"><span class="field-label">Emoji</span><input v-model="themeForm.emoji" required /></label>
    <label class="field"><span class="field-label">Description</span><textarea v-model="themeForm.description" /></label>
    <label class="field"><span class="field-label">Couverture (URL https)</span><input v-model="themeForm.coverImageUrl" type="url" placeholder="https://…" /></label>
    <label class="actions"><input v-model="themeForm.approved" type="checkbox" /> Publié</label>
  </fieldset><div class="modal-footer"><button type="button" class="btn btn-secondary" :disabled="busy" @click="themeForm = null">Annuler</button><button type="submit" class="btn btn-primary" :disabled="busy">Enregistrer</button></div></form></AdminModal>

  <AdminModal v-if="deckForm" title="Paquet flashcard" :busy="busy" :on-close="() => { deckForm = null }"><form @submit.prevent="saveDeck"><fieldset class="modal-body stack" :disabled="busy" style="border:0;margin:0">
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <label class="field"><span class="field-label">Thème</span><select v-model="deckForm.themeId" required><option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ theme.emoji }} {{ theme.name }}</option></select></label>
    <label class="field"><span class="field-label">Nom</span><input v-model="deckForm.name" required /></label>
    <label class="field"><span class="field-label">Emoji</span><input v-model="deckForm.emoji" required /></label>
    <label class="field"><span class="field-label">Description</span><textarea v-model="deckForm.description" /></label>
    <label class="field"><span class="field-label">Couverture (URL https)</span><input v-model="deckForm.coverImageUrl" type="url" placeholder="https://…" /></label>
    <label class="actions"><input v-model="deckForm.approved" type="checkbox" /> Publié</label>
  </fieldset><div class="modal-footer"><button type="button" class="btn btn-secondary" :disabled="busy" @click="deckForm = null">Annuler</button><button type="submit" class="btn btn-primary" :disabled="busy">Enregistrer</button></div></form></AdminModal>

  <AdminModal v-if="cardForm" title="Carte flashcard" :busy="busy" :on-close="() => { cardForm = null }"><form @submit.prevent="saveCard"><fieldset class="modal-body stack" :disabled="busy" style="border:0;margin:0">
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <label class="field"><span class="field-label">Paquet</span><select v-model="cardForm.deckId" required><option v-for="deck in decks" :key="deck.id" :value="deck.id">{{ deck.emoji }} {{ deck.name }}</option></select></label>
    <label class="field"><span class="field-label">Recto</span><select v-model="cardForm.kind"><option value="text">Texte</option><option value="image">Image</option><option value="video">Vidéo</option><option value="audio">Audio</option></select></label>
    <label v-if="cardForm.kind === 'text'" class="field"><span class="field-label">Texte</span><textarea v-model="cardForm.text" required /></label>
    <template v-else>
      <label class="field"><span class="field-label">{{ cardForm.kind === 'video' ? 'URL https ou YouTube' : 'URL https' }}</span><input v-model="cardForm.url" type="url" required placeholder="https://…" /></label>
      <label v-if="cardForm.kind === 'image'" class="field"><span class="field-label">Texte alternatif</span><input v-model="cardForm.alt" /></label>
      <div v-if="cardForm.kind === 'image' && cardForm.url.trim()" class="media-preview">
        <span class="field-label">Aperçu</span>
        <img :src="cardForm.url.trim()" :alt="cardForm.alt || 'Aperçu de l’image de la flashcard'" />
      </div>
      <div v-if="cardForm.kind === 'video' && cardForm.url.trim()" class="media-preview">
        <span class="field-label">Aperçu</span>
        <iframe v-if="videoEmbedUrl" :src="videoEmbedUrl" title="Aperçu de la vidéo de la flashcard" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen />
        <video v-else controls preload="metadata" :src="cardForm.url.trim()" aria-label="Aperçu de la vidéo de la flashcard" />
      </div>
    </template>
    <fieldset class="stack-sm" style="border:0;padding:0;margin:0"><legend class="field-label">Quatre réponses, une seule juste</legend>
      <label v-for="(_, choiceIndex) in cardForm.choices" :key="choiceIndex" class="choice-row"><input v-model="cardForm.correct" type="radio" :value="choiceIndex" :aria-label="`Bonne réponse ${choiceIndex + 1}`" /><input v-model="cardForm.choices[choiceIndex]" required :placeholder="`Réponse ${choiceIndex + 1}`" /></label>
    </fieldset>
    <label class="field"><span class="field-label">Verso (définition, destination, contexte)</span><textarea v-model="cardForm.backText" required /></label>
    <label class="actions"><input v-model="cardForm.approved" type="checkbox" /> Publiée</label>
  </fieldset><div class="modal-footer"><button type="button" class="btn btn-secondary" :disabled="busy" @click="cardForm = null">Annuler</button><button type="submit" class="btn btn-primary" :disabled="busy">Enregistrer</button></div></form></AdminModal>
</template>

<style scoped>
.card-front-cell { display: flex; align-items: center; gap: 10px; min-width: 150px; }
.card-media-thumb { display: block; flex: 0 0 80px; width: 80px; height: 52px; object-fit: cover; border: 1px solid var(--border); border-radius: 7px; background: var(--surface-2); }
.choice-row { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center; }
.media-preview { display: grid; gap: 6px; width: min(100%, 320px); }
.media-preview img, .media-preview video, .media-preview iframe { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
.import-panel { padding: 12px; border: 1px solid var(--border); border-radius: 12px; }
.import-theme { flex: 1; min-width: min(100%, 220px); }
.import-file { position: relative; min-height: 44px; overflow: hidden; }
.import-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.drop-zone { padding: 12px; border: 2px dashed var(--border-strong); border-radius: 12px; }
.drop-zone.active { border-color: var(--primary); background: var(--primary-soft); }
.example { white-space: pre; overflow: auto; max-height: min(70vh, 420px); background: var(--surface-2); padding: 12px; border-radius: 12px; font-size: 12px; }
summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; }
</style>
