<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Theme } from '$lib/types'
import AdminModal from './AdminModal.vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const emit = defineEmits<{ questions: [] }>()
const { data, busy, error, mutate, ask, themeFilter, filterTheme } = useAdminDashboard()
const search = ref('')
const themes = computed(() => data.value.themes.filter(t => `${t.name} ${t.id} ${t.tags?.join(' ') ?? ''}`.toLowerCase().includes(search.value.toLowerCase())))
const edit = ref<{ oldThemeId: string; newId: string; name: string; emoji: string; description: string; coverImageUrl: string; tagsText: string } | null>(null)
function open(theme: Theme) { error.value = ''; edit.value = { oldThemeId: theme.id, newId: theme.id, name: theme.name, emoji: theme.emoji, description: theme.description ?? '', coverImageUrl: theme.coverImageUrl ?? '', tagsText: theme.tags?.join(', ') ?? '' } }
async function save() {
  if (!edit.value) return
  const form = edit.value, oldFilter = themeFilter.value
  const newId = form.newId.trim().toLowerCase()
  const result = await mutate('themes/update', { ...form, newId, name: form.name.trim(), emoji: form.emoji.trim(), tags: form.tagsText.split(/[,;]/).map(t => t.trim()).filter(Boolean) })
  if (result) { edit.value = null; if (oldFilter === form.oldThemeId && newId !== form.oldThemeId) await filterTheme(newId) }
}
async function move(id: string, delta: number) {
  const ids = data.value.themes.map(t => t.id), index = ids.indexOf(id), target = index + delta
  if (index < 0 || target < 0 || target >= ids.length) return
  ids.splice(index, 1); ids.splice(target, 0, id)
  await mutate('themes/reorder', { themeIds: ids }, 'Ordre des thèmes enregistré.')
}
async function remove(theme: Theme) {
  const result = await mutate('themes/delete', { themeId: theme.id }, 'Thème et questions supprimés.')
  if (result && themeFilter.value === theme.id) await filterTheme('')
}
async function questions(id: string) { await filterTheme(id); emit('questions') }
</script>
<template>
  <section class="surface panel stack">
    <h2>Thèmes</h2><p class="subtle">Les flèches définissent l’ordre du bandeau du quiz. Modifier un identifiant met à jour les questions, géobattles et compteurs joueurs associés.</p>
    <label class="field"><span class="field-label">Rechercher un thème</span><input v-model="search" type="search" placeholder="Nom, identifiant ou tag" /></label>
    <div class="table-wrap"><table class="table"><thead><tr><th>Bandeau</th><th>Thème</th><th>Identifiant / tags</th><th>Auteur</th><th>Actions</th></tr></thead><tbody><tr v-for="theme in themes" :key="theme.id"><td><div class="actions"><button type="button" class="icon-button sm" aria-label="Monter ce thème dans le bandeau" :disabled="busy || data.themes[0]?.id === theme.id" @click="move(theme.id, -1)">↑</button><button type="button" class="icon-button sm" aria-label="Descendre ce thème dans le bandeau" :disabled="busy || data.themes[data.themes.length - 1]?.id === theme.id" @click="move(theme.id, 1)">↓</button></div></td><td><strong>{{ theme.emoji }} {{ theme.name }}</strong><p class="subtle clamp">{{ theme.description }}</p></td><td><code>{{ theme.id }}</code><div class="badges"><span v-for="tag in theme.tags" :key="tag" class="badge neutral">{{ tag }}</span></div></td><td>{{ theme.authorPseudo || '—' }}</td><td><div class="actions"><button type="button" class="btn btn-sm btn-secondary" @click="open(theme)">Modifier</button><button type="button" class="btn btn-sm btn-ghost" @click="questions(theme.id)">Questions</button><button type="button" class="btn btn-sm btn-danger-ghost" :disabled="busy" @click="ask(`Supprimer le thème « ${theme.name} » et toutes ses questions ? Cette action est irréversible.`, () => remove(theme))">Supprimer</button></div></td></tr></tbody></table></div><p v-if="!themes.length" class="empty">Aucun thème correspondant.</p>
  </section>
  <AdminModal v-if="edit" title="Modifier le thème" :busy="busy" :on-close="() => { edit = null }"><form @submit.prevent="save"><fieldset class="modal-body stack" :disabled="busy" style="border:0;margin:0"><p v-if="error" class="alert" role="alert">{{ error }}</p><label class="field"><span class="field-label">Nom</span><input v-model="edit.name" required /></label><div class="grid"><label class="field"><span class="field-label">Emoji</span><input v-model="edit.emoji" required /></label><label class="field"><span class="field-label">Identifiant technique</span><input v-model="edit.newId" required pattern="[a-zA-Z0-9_-]+" /></label></div><label class="field"><span class="field-label">Description</span><textarea v-model="edit.description" /></label><label class="field"><span class="field-label">Image de couverture (URL)</span><input v-model="edit.coverImageUrl" type="url" placeholder="https://…" /></label><label class="field"><span class="field-label">Tags séparés par des virgules</span><input v-model="edit.tagsText" placeholder="europe, capitales" /><span class="field-hint">Slugs de regroupement : lettres minuscules, chiffres et tirets.</span></label></fieldset><div class="modal-footer"><button type="button" class="btn btn-secondary" :disabled="busy" @click="edit = null">Annuler</button><button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Enregistrement…' : 'Enregistrer' }}</button></div></form></AdminModal>
</template>
