<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Copy, Link2, ShieldAlert, Trophy, Smartphone, LogOut, LockKeyhole } from 'lucide-vue-next'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { api, errorMessage, resetDeviceId, setAccountToken } from '$lib/api'
import { app, refreshApp } from '$lib/appStore'
import { copyTextToClipboard } from '$lib/copy_to_clipboard'

const router = useRouter()
const route = useRoute()
const password = ref('')
const passwordConfirm = ref('')
const accountBusy = ref(false)
const accountError = ref('')
async function secureAccount() {
  if (accountBusy.value) return
  accountError.value = ''
  if (password.value !== passwordConfirm.value) { accountError.value = 'Les mots de passe ne correspondent pas.'; return }
  accountBusy.value = true
  try {
    const result = await api<{ token: string }>('/auth/register', { method: 'POST', body: { pseudo: app.player?.pseudo, password: password.value } })
    setAccountToken(result.token)
    password.value = ''; passwordConfirm.value = ''
    await refreshApp()
    const next = route.query.next
    if (!app.error && typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) {
      await router.push(next)
    }
  } catch (err) { accountError.value = errorMessage(err) }
  finally { accountBusy.value = false }
}
async function logout() {
  if (accountBusy.value) return
  accountBusy.value = true; accountError.value = ''
  try {
    await api('/auth/logout', { method: 'POST' })
    resetDeviceId()
    await refreshApp()
    await router.push('/')
  } catch (err) { accountError.value = errorMessage(err) }
  finally { accountBusy.value = false }
}
const linkCode = ref('')
const linkExpires = ref('')
const linkError = ref('')
const linkLoading = ref(false)
const copyMessage = ref('')
const redeemCode = ref('')
const redeemBusy = ref(false)
const redeemError = ref('')
const redeemMessage = ref('')
const deleteConfirm = ref('')
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref('')
const DELETE_PHRASE = 'SUPPRIMER'
const initials = computed(() => app.player?.pseudo.slice(0, 2) ?? 'GP')
const themeXp = computed(() => Object.entries(app.player?.xpByTheme ?? {}).map(([id, xp]) => ({ id, xp, theme: app.themes.find(theme => theme.id === id) })).sort((a, b) => b.xp - a.xp))
const expiresLabel = computed(() => linkExpires.value ? new Date(linkExpires.value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '')
async function generateLinkCode() {
  linkError.value = ''; copyMessage.value = ''; linkLoading.value = true
  try {
    const result = await api<{ code: string; expiresAt: string }>('/link-code/generate', { method: 'POST' })
    linkCode.value = result.code; linkExpires.value = result.expiresAt
  } catch (err) { linkError.value = errorMessage(err, 'Impossible de générer le code'); linkCode.value = ''; linkExpires.value = '' }
  finally { linkLoading.value = false }
}
async function copyCode() { copyMessage.value = await copyTextToClipboard(linkCode.value) ? 'Code copié.' : 'Copie impossible : sélectionne le code manuellement.' }
async function redeemLink() {
  if (redeemBusy.value) return
  redeemError.value = ''; redeemMessage.value = ''; redeemBusy.value = true
  try {
    await api('/link-code/redeem', { method: 'POST', body: { code: redeemCode.value.trim() } })
    await refreshApp(); redeemCode.value = ''; linkCode.value = ''; linkExpires.value = ''; copyMessage.value = ''; deleteConfirm.value = ''
    redeemMessage.value = 'Ce compte est maintenant synchronisé sur cet appareil.'
  } catch (err) { redeemError.value = errorMessage(err, 'Code invalide') }
  finally { redeemBusy.value = false }
}
async function deleteAccount() {
  if (deleteConfirm.value !== DELETE_PHRASE || deleteBusy.value) return
  deleteError.value = ''; deleteBusy.value = true
  try {
    const result = await api<{ resetDevice: boolean }>('/me/delete', { method: 'POST', body: { confirm: DELETE_PHRASE } })
    if (result.resetDevice) resetDeviceId()
    await refreshApp(); deleteOpen.value = false; await router.push('/')
  } catch (err) { deleteError.value = errorMessage(err, 'Suppression impossible'); deleteOpen.value = false }
  finally { deleteBusy.value = false }
}
</script>

<template>
  <div class="narrow stack">
    <header class="page-heading"><span class="eyebrow">Mon espace</span><h1>Ton compte</h1><p>Un pseudo et un mot de passe. Aucune adresse e-mail ni autre information personnelle demandée.</p></header>
    <section v-if="app.accountAuthenticated" class="stack">
      <p class="notice">Ton compte est accessible sur tous tes appareils avec ton pseudo et ton mot de passe.</p>
      <p v-if="accountError" class="alert" role="alert">{{ accountError }}</p>
      <div class="actions"><button type="button" class="btn btn-secondary" :disabled="accountBusy || deleteBusy" @click="logout"><LogOut :size="16" /> {{ accountBusy ? 'Déconnexion…' : 'Se déconnecter' }}</button></div>
    </section>
    <form v-else class="stack" @submit.prevent="secureAccount">
      <h2><LockKeyhole :size="20" /> Ajouter un mot de passe</h2>
      <p class="notice">Ton compte @{{ app.player?.pseudo }} a été retrouvé sur ce navigateur. Tu conserves ton pseudo, tes XP et tes contributions. Crée simplement ton mot de passe pour utiliser ce même compte sur tous tes appareils.</p>
      <div class="field"><label for="account-password">Mot de passe (12 caractères minimum)</label><input id="account-password" v-model="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required :disabled="accountBusy" /></div>
      <div class="field"><label for="account-password-confirm">Confirme le mot de passe</label><input id="account-password-confirm" v-model="passwordConfirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required :disabled="accountBusy" /></div>
      <p class="field-hint">Conserve ton mot de passe : aucun e-mail de récupération ne pourra être envoyé.</p>
      <p v-if="accountError" class="alert" role="alert">{{ accountError }}</p>
      <div class="actions"><button type="submit" class="btn btn-primary" :disabled="accountBusy || deleteBusy"><LockKeyhole :size="16" /> {{ accountBusy ? 'Enregistrement…' : 'Sécuriser mon compte' }}</button></div>
    </form>
    <section class="surface panel stack">
      <div class="actions profile"><span class="avatar profile-avatar">{{ initials }}</span><div><h2>@{{ app.player?.pseudo ?? '…' }}</h2><p class="subtle">Profil enregistré · progression durable</p></div><span class="badge xp"><Trophy :size="18" /> {{ Math.round(app.player?.xpTotal ?? 0).toLocaleString('fr-FR') }} XP total</span></div>
      <hr /><h3>XP par thème</h3>
      <ul v-if="themeXp.length" class="xp-list"><li v-for="entry in themeXp" :key="entry.id" class="between"><span>{{ entry.theme?.emoji ?? '🌍' }} {{ entry.theme?.name ?? entry.id }}</span><strong>{{ Math.round(entry.xp).toLocaleString('fr-FR') }} XP</strong></li></ul>
      <p v-else class="subtle">Tes premières parties feront apparaître ta progression par thème ici.</p>
    </section>
    <section v-if="!app.accountAuthenticated" class="surface panel stack">
      <div class="actions"><Smartphone :size="22" /><h2>Code pour un autre appareil</h2></div>
      <p class="subtle">Nouveau téléphone ou navigateur : génère un code, puis sur l’autre appareil ouvre <strong>Créer ton pseudo → Déjà un compte</strong> et saisis-le. Le code expire en 10 minutes et ne marche qu’une fois. Ne le partage pas.</p>
      <div v-if="linkCode" class="surface-flat panel stack-sm"><div class="between"><strong class="mono link-code">{{ linkCode }}</strong><button type="button" class="btn btn-secondary btn-sm" @click="copyCode"><Copy :size="16" /> Copier le code</button></div><p v-if="expiresLabel" class="subtle">Valide jusqu’au {{ expiresLabel }}</p><p v-if="copyMessage" class="subtle" role="status">{{ copyMessage }}</p></div>
      <p v-if="linkError" class="alert" role="alert">{{ linkError }}</p>
      <div class="actions"><button type="button" class="btn btn-primary" :disabled="linkLoading || redeemBusy || deleteBusy" @click="generateLinkCode"><Link2 :size="16" /> {{ linkLoading ? 'Génération…' : linkCode ? 'Nouveau code' : 'Code pour un autre appareil' }}</button></div>
      <hr />
      <form class="stack-sm" @submit.prevent="redeemLink"><h3>Récupérer un compte existant ici</h3><p class="field-hint">Saisis le code généré sur ton autre appareil. Cet appareil utilisera le profil associé au code à la place du profil actuel.</p><div class="field"><label for="account-link">Code à 8 caractères</label><input id="account-link" v-model="redeemCode" class="mono" maxlength="11" placeholder="XXXX-XXXX" autocomplete="one-time-code" :disabled="redeemBusy" /></div><p v-if="redeemError" class="alert" role="alert">{{ redeemError }}</p><p v-if="redeemMessage" class="notice" role="status">{{ redeemMessage }}</p><div class="actions"><button type="submit" class="btn btn-secondary" :disabled="redeemBusy || linkLoading || deleteBusy || redeemCode.replace(/[\s-]/g, '').length < 8">{{ redeemBusy ? 'Récupération…' : 'Récupérer sur cet appareil' }}</button></div></form>
    </section>
    <section class="surface panel stack danger-zone">
      <div class="actions"><ShieldAlert :size="22" /><h2>Supprimer le profil</h2></div><p class="subtle">Tout sera effacé pour ce pseudo : progression, contributions liées, votes. Cette action est irréversible.</p>
      <div class="field"><label for="gp-delete-confirm">Tape <strong class="mono">{{ DELETE_PHRASE }}</strong> pour confirmer</label><input id="gp-delete-confirm" v-model="deleteConfirm" autocomplete="off" :placeholder="DELETE_PHRASE" :disabled="deleteBusy" /></div>
      <p v-if="deleteError" class="alert" role="alert">{{ deleteError }}</p>
      <div class="actions"><button type="button" class="btn btn-danger" :disabled="deleteConfirm !== DELETE_PHRASE || deleteBusy || redeemBusy || linkLoading" @click="deleteOpen = true">{{ deleteBusy ? 'Suppression…' : 'Supprimer définitivement ce profil' }}</button></div>
    </section>
    <ConfirmDialog v-model:open="deleteOpen" title="Supprimer définitivement ce profil ?" description="Ta progression, tes contributions liées et tes votes seront effacés. Cette action est irréversible." confirm-label="Supprimer le profil" :busy="deleteBusy" :on-confirm="deleteAccount" />
  </div>
</template>

<style scoped>
.page-heading{margin-bottom:0}.profile-avatar{width:64px;height:64px;font-size:23px}.xp{margin-left:auto;font-size:14px;padding:10px 14px}.xp-list{list-style:none;padding:0;margin:0;display:grid;gap:8px}.xp-list li{padding:12px;background:var(--surface-2);border-radius:10px;font-size:14px}.link-code{font-size:28px;letter-spacing:.12em;overflow-wrap:anywhere}.danger-zone{border-color:#fecdd3}.danger-zone> .actions:first-child{color:var(--danger)}@media(max-width:560px){.xp{margin-left:0}}
</style>
