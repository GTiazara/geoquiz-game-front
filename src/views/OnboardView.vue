<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Shuffle, UserRound, Link2, LogIn } from 'lucide-vue-next'
import { api, errorMessage, setAccountToken } from '$lib/api'
import { app, refreshApp } from '$lib/appStore'
import { pickHistoricalGuestBase } from '../composables/communityHistoricalGuestNames'

const route = useRoute()
const router = useRouter()
const mode = ref<'new' | 'login' | 'link'>(route.query.mode === 'login' ? 'login' : 'new')
const pseudo = ref('')
const password = ref('')
const passwordConfirm = ref('')
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
function switchMode(value: 'new' | 'login' | 'link') { mode.value = value; error.value = ''; password.value = ''; passwordConfirm.value = '' }
async function submit() {
  if (loading.value) return
  error.value = ''
  if (mode.value === 'new' && password.value !== passwordConfirm.value) {
    error.value = 'Les mots de passe ne correspondent pas.'
    return
  }
  loading.value = true
  try {
    if (mode.value === 'link') await api('/link-code/redeem', { method: 'POST', body: { code: linkCode.value.trim() } })
    else {
      const result = await api<{ token: string }>(`/auth/${mode.value === 'new' ? 'register' : 'login'}`, {
        method: 'POST', body: { pseudo: pseudo.value.trim(), password: password.value },
      })
      setAccountToken(result.token)
      password.value = ''; passwordConfirm.value = ''
    }
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
      <h1>{{ mode === 'login' ? 'Se connecter' : mode === 'link' ? 'Retrouver un ancien profil' : 'Créer ton compte' }}</h1>
      <p>Un pseudo et un mot de passe, sans e-mail ni autre information personnelle. Ta progression te suit sur tous tes appareils.</p>
    </header>
    <div class="notice">En <strong>visiteur</strong>, ton pseudo et ta progression sont conservés pour la journée UTC sur cet appareil ; la veille est effacée côté serveur au prochain jour. Le classement « Visiteurs (jour UTC) » mélange invités et XP gagnée ce jour par les comptes enregistrés.</div>
    <div class="segmented" aria-label="Choisir une méthode d’inscription">
      <button type="button" :class="{ active: mode === 'new' }" :aria-pressed="mode === 'new'" :disabled="loading" @click="switchMode('new')"><UserRound :size="16" /> Créer un compte</button>
      <button type="button" :class="{ active: mode === 'login' }" :aria-pressed="mode === 'login'" :disabled="loading" @click="switchMode('login')"><LogIn :size="16" /> Se connecter</button>
    </div>
    <form class="surface panel stack" @submit.prevent="submit">
      <template v-if="mode !== 'link'">
        <div class="field"><label for="pseudo">Choisis un pseudo</label><input id="pseudo" v-model="pseudo" placeholder="ex. Atlas2042" maxlength="32" minlength="2" autocomplete="username" required :disabled="loading" :aria-invalid="Boolean(error)" /><span class="field-hint">Entre 2 et 32 caractères. Ce pseudo apparaît dans le jeu et le classement.</span></div>
        <div class="field"><label for="password">Mot de passe</label><input id="password" v-model="password" type="password" :minlength="mode === 'new' ? 12 : undefined" maxlength="128" :autocomplete="mode === 'new' ? 'new-password' : 'current-password'" required :disabled="loading" /><span v-if="mode === 'new'" class="field-hint">12 caractères minimum. Sans e-mail, conserve soigneusement ton mot de passe : il ne peut pas être envoyé ni réinitialisé par e-mail.</span></div>
        <div v-if="mode === 'new'" class="field"><label for="password-confirm">Confirme le mot de passe</label><input id="password-confirm" v-model="passwordConfirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required :disabled="loading" /></div>
        <p v-if="app.player?.isGuest && mode === 'new'" class="subtle">Ta progression visiteur du jour sera conservée dans ton compte.</p>
      </template>
      <template v-else>
        <p class="subtle">Pour un ancien profil sans mot de passe, saisis le code généré depuis la page Compte sur ton ancien navigateur. Ajoute ensuite un mot de passe depuis la page Compte.</p>
        <div class="field"><label for="onb-link">Code à 8 caractères</label><input id="onb-link" v-model="linkCode" class="mono code" placeholder="XXXX-XXXX" maxlength="11" autocomplete="one-time-code" required :disabled="loading" :aria-invalid="Boolean(error)" /></div>
      </template>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="loading || (mode === 'link' ? codeLength < 8 : pseudo.trim().length < 2 || !password)">{{ loading ? 'Connexion…' : mode === 'new' ? 'Créer mon compte' : mode === 'login' ? 'Se connecter' : 'Récupérer sur cet appareil' }}</button>
      <button v-if="mode === 'new'" type="button" class="btn btn-secondary" :disabled="loading" @click="randomPseudo"><Shuffle :size="16" /> Pseudo aléatoire</button>
    </form>
    <button v-if="mode !== 'link'" type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="switchMode('link')"><Link2 :size="16" /> Ancien profil sans mot de passe</button>
    <p class="subtle">Tu préfères ne pas enregistrer de pseudo pour l’instant ? <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="router.push(guestDestination)">Continuer en visiteur</button></p>
  </div>
</template>

<style scoped>
.onboard{max-width:600px;margin:24px auto}.onboard .page-heading{margin-bottom:0}.code{text-align:center;letter-spacing:0;font-size:20px}.segmented button{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;white-space:normal;min-width:0}
</style>
