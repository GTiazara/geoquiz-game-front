<!-- Props: imgUrl?, youtubeUrl?, class?; Emits: —; Slots: heading, meta, default; Exposed: — -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { extractYoutubeVideoId, toYoutubeEmbedUrl, youtubeThumbnailUrl } from '$lib/youtube'
import ImageThumbLightbox from './ImageThumbLightbox.vue'
const props=withDefaults(defineProps<{imgUrl?:string;youtubeUrl?:string}>(),{})
const videoId=computed(()=>props.youtubeUrl?.trim()?extractYoutubeVideoId(props.youtubeUrl.trim()):null)
const thumb=computed(()=>videoId.value?youtubeThumbnailUrl(videoId.value!):null)
const embed=computed(()=>videoId.value?toYoutubeEmbedUrl(videoId.value!):null)
const videoOpen=ref(false); const panel=ref<HTMLElement>()
function close(){videoOpen.value=false}
function keydown(e:KeyboardEvent){if(e.key==='Escape')close()}
watch(videoOpen,value=>{if(value){document.body.style.overflow='hidden';document.addEventListener('keydown',keydown);requestAnimationFrame(()=>panel.value?.focus())}else{document.body.style.overflow='';document.removeEventListener('keydown',keydown)}})
onBeforeUnmount(()=>{document.body.style.overflow='';document.removeEventListener('keydown',keydown)})
</script>
<template>
 <div class="question-heading"><div class="question-heading__row"><div class="question-heading__text"><slot name="heading"><slot/></slot></div><div v-if="imgUrl?.trim()||thumb" class="question-heading__media"><ImageThumbLightbox v-if="imgUrl?.trim()" :src="imgUrl.trim()" thumb-class="question-heading__image"/><button v-if="thumb&&embed" type="button" class="question-heading__video" aria-label="Lire la vidéo YouTube" @click="videoOpen=true"><img :src="thumb" alt="" loading="lazy" decoding="async"/><span aria-hidden="true">▶</span></button></div></div><div v-if="$slots.meta" class="question-heading__meta"><slot name="meta"/></div></div>
 <Teleport to="body"><div v-if="videoOpen&&embed" class="modal-backdrop" role="presentation" @click.self="close"><section ref="panel" class="modal lg" role="dialog" aria-modal="true" aria-label="Vidéo YouTube" tabindex="-1"><header class="modal-header"><h2>Vidéo YouTube</h2><button type="button" class="btn btn-secondary btn-sm" @click="close">Fermer</button></header><div class="modal-body"><div class="video-frame"><iframe :src="embed" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen/></div></div></section></div></Teleport>
</template>
<style scoped>.question-heading{display:grid;gap:8px}.question-heading__row{display:flex;align-items:center;gap:12px}.question-heading__text{flex:1;min-width:0}.question-heading__media{display:flex;flex:none;gap:8px;align-items:center}.question-heading__image{width:80px;height:64px;border:1px solid var(--border);border-radius:10px;object-fit:contain;background:var(--surface-2);padding:2px}.question-heading__video{position:relative;width:64px;height:64px;padding:0;border:0;background:none;border-radius:10px;overflow:hidden}.question-heading__video img{width:100%;height:100%;object-fit:cover}.question-heading__video span{position:absolute;inset:0;display:grid;place-items:center;color:white;background:#0005;font-size:24px}.question-heading__meta{min-width:0}.video-frame{aspect-ratio:16/9;width:100%;overflow:hidden;border-radius:12px;background:#000}.video-frame iframe{width:100%;height:100%;border:0}</style>
