<script setup lang="ts">
import { ref } from 'vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const { busy, authed, login } = useAdminDashboard()
const secret = ref('')
async function submit() { await login(secret.value); if (authed.value) secret.value = '' }
</script>
<template>
  <form class="surface panel stack" style="max-width: 480px" @submit.prevent="submit">
    <h2>Accès administrateur</h2><p class="subtle">Saisis le secret administrateur défini dans <code>ADMIN_SECRET</code> sur le serveur.</p>
    <label class="field"><span class="field-label">Secret administrateur</span><input v-model="secret" type="password" autocomplete="off" required :disabled="busy" /></label>
    <button type="submit" class="btn btn-primary" :disabled="busy || !secret.trim()">{{ busy ? 'Connexion…' : 'Accéder' }}</button>
  </form>
</template>
