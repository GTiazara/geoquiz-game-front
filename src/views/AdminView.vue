<script setup lang="ts">
import { ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import AdminLogin from '../components/admin/AdminLogin.vue'
import AdminUsers from '../components/admin/AdminUsers.vue'
import AdminThemes from '../components/admin/AdminThemes.vue'
import AdminQuestions from '../components/admin/AdminQuestions.vue'
import AdminModeration from '../components/admin/AdminModeration.vue'
import AdminGeoBattles from '../components/admin/AdminGeoBattles.vue'
import AdminImport from '../components/admin/AdminImport.vue'
import AdminSettings from '../components/admin/AdminSettings.vue'
import AdminFlashcards from '../components/admin/AdminFlashcards.vue'
import { createAdminDashboard } from '../composables/adminDashboard'
const { configured, authed, checking, loading, busy, error, notice, data, pendingCount, confirmation, initialize, logout, load, confirm } = createAdminDashboard()
const tab = ref('questions')
const tabs = [ ['questions', 'Questions'], ['themes', 'Thèmes'], ['flash', 'Flashcards'], ['moderation', 'Modération'], ['users', 'Joueurs'], ['battles', 'Géobattles'], ['import', 'Import GeoJSON'], ['settings', 'Paramètres'] ]
</script>
<template>
  <div class="stack admin-console">
    <header class="page-heading between">
      <div><span class="eyebrow">Console de gestion</span><h1>Administration</h1><p>Contenus, communauté et défis GeoPinpoint.</p></div>
      <div v-if="authed" class="actions"><RouterLink to="/admin/histoire" class="btn btn-secondary">À la trace de l’histoire</RouterLink><button type="button" class="btn btn-ghost" :disabled="busy" @click="logout">Déconnexion</button></div>
    </header>
    <div v-if="error" class="alert between" role="alert"><span>{{ error }}</span><button type="button" class="btn btn-sm btn-secondary" @click="error = ''">Fermer</button></div>
    <div v-if="notice" class="success" role="status" aria-live="polite">{{ notice }}</div>
    <div v-if="checking" class="loading"><span class="spinner" /> Vérification de la session…</div>
    <div v-else-if="!configured" class="notice warn">Administration désactivée : définis <code>ADMIN_SECRET</code> dans le fichier <code>.env</code> du serveur API, puis redémarre le serveur.</div>
    <AdminLogin v-else-if="!authed" />
    <template v-else>
      <div class="stats">
        <button v-for="stat in [{ label: 'Joueurs', count: data.users.length, key: 'users' }, { label: 'Thèmes', count: data.themes.length, key: 'themes' }, { label: 'Questions', count: data.questions.length, key: 'questions' }, { label: 'Flashcards', count: data.flashCards.length, key: 'flash' }, { label: 'En modération', count: pendingCount, key: 'moderation' }, { label: 'Géobattles', count: data.geoBattles.length, key: 'battles' }]" :key="stat.key" type="button" class="surface stat" @click="tab = stat.key"><span class="subtle">{{ stat.label }}</span><strong>{{ stat.count }}</strong></button>
      </div>
      <div class="between"><nav class="tabs" aria-label="Sections de l’administration"><button v-for="item in tabs" :key="item[0]" type="button" :class="{ active: tab === item[0] }" :aria-current="tab === item[0] ? 'page' : undefined" @click="tab = item[0] ?? 'questions'">{{ item[1] }}<span v-if="item[0] === 'moderation' && pendingCount" class="badge warn">{{ pendingCount }}</span></button></nav><button type="button" class="btn btn-sm btn-ghost" :disabled="loading || busy" @click="load">Actualiser</button></div>
      <p v-if="loading" class="subtle" role="status">Actualisation des données…</p>
      <div :inert="busy || loading || undefined" :aria-busy="busy || loading">
        <AdminQuestions v-if="tab === 'questions'" />
        <AdminThemes v-else-if="tab === 'themes'" @questions="tab = 'questions'" />
        <AdminFlashcards v-else-if="tab === 'flash'" />
        <AdminModeration v-else-if="tab === 'moderation'" />
        <AdminUsers v-else-if="tab === 'users'" />
        <AdminGeoBattles v-else-if="tab === 'battles'" />
        <AdminImport v-else-if="tab === 'import'" />
        <AdminSettings v-else-if="tab === 'settings'" />
      </div>
      <p class="subtle">Joueurs : 200 maximum, triés par activité. Questions : 400 maximum pour le filtre courant. Les compteurs reflètent les données chargées.</p>
    </template>
    <button v-if="!checking && !authed" type="button" class="btn btn-ghost" @click="initialize">Vérifier la connexion</button>
    <ConfirmDialog :open="!!confirmation" title="Confirmer la suppression" :description="confirmation?.description" confirm-label="Supprimer" :busy="busy" :on-confirm="confirm" :on-cancel="() => { confirmation = null }" />
  </div>
</template>
<style scoped>
.page-heading { margin-bottom: 0; }.stats { display: grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); gap: 12px; }.stat { padding: 18px; display: grid; text-align: left; gap: 6px; }.stat strong { font-size: 28px; color: var(--ink); }.tabs { flex: 1; overflow-x: auto; margin: 0; }.tabs button { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
</style>
