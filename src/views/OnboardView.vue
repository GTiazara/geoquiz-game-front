<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Shuffle, UserRound, Link2 } from 'lucide-vue-next'
import { api, errorMessage } from '$lib/api'
import { app, refreshApp } from '$lib/appStore'
import { pickHistoricalGuestBase } from '../composables/communityHistoricalGuestNames'

const route = useRoute()
const router = useRouter()
const mode = ref<'new' | 'link'>('new')
const pseudo = ref('')
const linkCode = ref('')
const error = ref('')
const loading = ref(false)
const nextUrl = computed(() => {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/'
})
const guestDestination = computed(() => {
  const path = nextUrl.value.split(/[?#]/)[0] ?? '/'
  return /^\/(contribute|compte)(\/|$)/.test(path) ? '/' : nextUrl.value
})
const codeLength = computed(() => linkCode.value.replace(/[\s-]/g, '').length)
function randomPseudo() { pseudo.value = `${pickHistoricalGuestBase()}${Math.floor(100 + Math.random() * 900)}` }
function switchMode(value: 'new' | 'link') { mode.value = value; error.value = '' }
async function submit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'new') await api('/player', { method: 'POST', body: { pseudo: pseudo.value.trim() } })
    else await api('/link-code/redeem', { method: 'POST', body: { code: linkCode.value.trim() } })
    await refreshApp()
    await router.push(nextUrl.value)
  } catch (err) { error.value = errorMessage(err, mode.value === 'new' ? 'Impossible d’enregistrer' : 'Code invalide') }
  finally { loading.value = false }
}
</script>

<template>
  <div class="onboard stack">
    <header class="page-heading">
      <span class="eyebrow">Bienvenue sur GeoPinpoint</span>
      <h1>Créer ton pseudo</h1>
      <p>Gratuit, sans e-mail. Avec un pseudo enregistré, tu gardes ton XP durable, le classement « inscrits », tes contributions et tes votes.</p>
    </header>
    <div class="notice">En <strong>visiteur</strong>, ton pseudo et ta progression sont conservés pour la journée UTC sur cet appareil ; la veille est effacée côté serveur au prochain jour. Le classement « Visiteurs (jour UTC) » mélange invités et XP gagnée ce jour par les comptes enregistrés.</div>
    <div class="segmented" aria-label="Choisir une méthode d’inscription">
      <button type="button" :class="{ active: mode === 'new' }" :aria-pressed="mode === 'new'" :disabled="loading" @click="switchMode('new')"><UserRound :size="16" /> Nouveau pseudo</button>
      <button type="button" :class="{ active: mode === 'link' }" :aria-pressed="mode === 'link'" :disabled="loading" @click="switchMode('link')"><Link2 :size="16" /> Déjà un compte</button>
    </div>
    <form class="surface panel stack" @submit.prevent="submit">
      <template v-if="mode === 'new'">
        <div class="field"><label for="pseudo">Choisis un pseudo</label><input id="pseudo" v-model="pseudo" placeholder="ex. Atlas2042" maxlength="32" minlength="2" autocomplete="username" required :disabled="loading" :aria-invalid="Boolean(error)" /><span class="field-hint">Entre 2 et 32 caractères. Ce pseudo apparaît dans le jeu et le classement.</span></div>
        <p v-if="app.player?.isGuest" class="subtle">Visiteur : @{{ app.player.pseudo }} — progression du jour UTC. Enregistre ci-dessus un pseudo que tu gardes sur cet appareil.</p>
      </template>
      <template v-else>
        <p class="subtle">Sur ton ancien appareil, ouvre <strong>Compte → Code pour un autre appareil</strong>, puis saisis le code ici.</p>
        <div class="field"><label for="onb-link">Code à 8 caractères</label><input id="onb-link" v-model="linkCode" class="mono code" placeholder="XXXX-XXXX" maxlength="11" autocomplete="one-time-code" required :disabled="loading" :aria-invalid="Boolean(error)" /></div>
      </template>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="loading || (mode === 'new' ? pseudo.trim().length < 2 : codeLength < 8)">{{ loading ? 'Enregistrement…' : mode === 'new' ? 'Enregistrer et jouer' : 'Récupérer sur cet appareil' }}</button>
      <button v-if="mode === 'new'" type="button" class="btn btn-secondary" :disabled="loading" @click="randomPseudo"><Shuffle :size="16" /> Pseudo aléatoire</button>
    </form>
    <p class="subtle">Tu préfères ne pas enregistrer de pseudo pour l’instant ? <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="router.push(guestDestination)">Continuer en visiteur</button></p>
  </div>
</template>

<style scoped>
.onboard{max-width:600px;margin:24px auto}.onboard .page-heading{margin-bottom:0}.code{text-align:center;letter-spacing:.15em;font-size:20px}.segmented button{display:flex;align-items:center;justify-content:center;gap:6px;flex:1}
</style>
