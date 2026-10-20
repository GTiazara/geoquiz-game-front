<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAdminDashboard } from '../../composables/adminDashboard'
const { data, busy, ask, mutate } = useAdminDashboard()
const search = ref(''), segment = ref('all')
const guests = computed(() => data.value.users.filter(u => u.isGuest).length)
const users = computed(() => data.value.users.filter(u => `${u.pseudo} ${u.deviceId}`.toLowerCase().includes(search.value.toLowerCase()) && (segment.value === 'all' || u.isGuest === (segment.value === 'guest'))))
function deleteGuests() { ask(`Supprimer tous les visiteurs non permanents (${guests.value} dans la liste) ? Leurs votes sur les questions en modération seront aussi effacés. Les comptes inscrits ne sont pas touchés.`, async () => { await mutate('users/delete-all-guests', undefined, 'Tous les visiteurs ont été supprimés.') }) }
</script>
<template>
  <section class="surface panel stack">
    <div class="between"><h2>Joueurs</h2><button type="button" class="btn btn-danger" :disabled="busy || !guests" @click="deleteGuests">Tout supprimer — visiteurs ({{ guests }})</button></div>
    <div class="grid"><label class="field"><span class="field-label">Rechercher un joueur</span><input v-model="search" type="search" placeholder="Pseudo ou identifiant appareil" /></label><label class="field"><span class="field-label">Type de compte</span><select v-model="segment"><option value="all">Tous</option><option value="guest">Visiteurs</option><option value="registered">Inscrits</option></select></label></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Pseudo</th><th>Compte</th><th>XP total</th><th>Jour invité (UTC)</th><th>Identifiant appareil</th><th>Actions</th></tr></thead><tbody><tr v-for="user in users" :key="user.deviceId"><td>{{ user.pseudo }}</td><td><span class="badge" :class="user.isGuest ? 'warn' : 'neutral'">{{ user.isGuest ? 'Visiteur' : 'Inscrit' }}</span></td><td>{{ user.xpTotal.toLocaleString('fr-FR') }}</td><td>{{ user.guestDay || '—' }}</td><td class="mono" style="overflow-wrap:anywhere">{{ user.deviceId }}</td><td><button type="button" class="btn btn-sm btn-danger-ghost" :disabled="busy" @click="ask(`Supprimer le compte « ${user.pseudo} » ?`, () => mutate('users/delete', { deviceId: user.deviceId }, 'Compte supprimé.'))">Supprimer</button></td></tr></tbody></table></div>
    <p v-if="!users.length" class="empty">Aucun joueur correspondant.</p>
  </section>
</template>
