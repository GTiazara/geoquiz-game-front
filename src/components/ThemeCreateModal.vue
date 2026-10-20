<!-- Props: open, onCreated?; Emits: update:open; Slots: —; Exposed: — -->
<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue'
import { api, errorMessage } from '$lib/api'
import { slugFromDisplayNameForThemeId } from '$lib/theme_id_slug'
const props=withDefaults(defineProps<{open?:boolean;onCreated?:()=>void}>(),{open:false})
const emit=defineEmits<{ 'update:open':[value:boolean] }>()
const name=ref(''), description=ref(''), emoji=ref('🌍'), busy=ref(false), error=ref<string|null>(null), dialog=ref<HTMLElement>(), nameInput=ref<HTMLInputElement>()
const idPreview=computed(()=>slugFromDisplayNameForThemeId(name.value))
function close(){emit('update:open',false);error.value=null}
function keydown(e:KeyboardEvent){if(e.key==='Escape'&&props.open&&!busy.value)close()}
watch(()=>props.open,value=>{if(typeof document==='undefined')return;if(value){document.addEventListener('keydown',keydown);void nextTick(()=>nameInput.value?.focus())}else document.removeEventListener('keydown',keydown)},{immediate:true})
onBeforeUnmount(()=>document.removeEventListener('keydown',keydown))
async function submit(){if(busy.value||name.value.trim().length<2)return;error.value=null;busy.value=true;try{await api('/themes',{method:'POST',body:{name:name.value.trim(),description:description.value.trim(),emoji:emoji.value.trim()}});name.value='';description.value='';emoji.value='🌍';close();props.onCreated?.()}catch(e){error.value=errorMessage(e,'Échec')}finally{busy.value=false}}
</script>
<template>
 <Teleport to="body"><div v-if="open" class="modal-backdrop" role="presentation" @click.self="close"><section ref="dialog" class="modal sm" role="dialog" aria-modal="true" aria-labelledby="theme-modal-title" @keydown.esc.stop="!busy&&close()"><header class="modal-header"><h2 id="theme-modal-title">Créer un thème</h2><button type="button" class="btn btn-ghost btn-sm" :disabled="busy" aria-label="Fermer" @click="close">Fermer</button></header><form @submit.prevent="submit"><div class="modal-body stack-sm"><p class="subtle">La communauté pourra y ajouter des questions géolocalisées.</p><div class="field"><label for="tm-name">Nom du thème</label><input id="tm-name" ref="nameInput" v-model="name" maxlength="80" required/><small>Identifiant : <code>{{idPreview}}</code><span v-if="name.trim().length>=2"> (déduit du nom ; un suffixe numérique est ajouté si ce slug existe déjà)</span></small></div><div class="field"><label for="tm-desc">Description</label><textarea id="tm-desc" v-model="description" rows="2" maxlength="240"/></div><div class="field"><label for="tm-emoji">Icône (emoji)</label><input id="tm-emoji" v-model="emoji" maxlength="8"/></div><p v-if="error" class="alert" role="alert">{{error}}</p></div><footer class="modal-footer"><button type="button" class="btn btn-secondary" :disabled="busy" @click="close">Annuler</button><button type="submit" class="btn btn-primary" :disabled="busy||name.trim().length<2">{{busy?'…':'Créer'}}</button></footer></form></section></div></Teleport>
</template>
