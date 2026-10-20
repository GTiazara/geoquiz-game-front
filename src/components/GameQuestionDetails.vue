<!-- Props: current, activeTheme?, showThemeHeading?, borders, textClass?, aiEnrichConfigured?; Emits: update:borders; Slots: —; Exposed: — -->
<script setup lang="ts">
import type { Question, Theme } from '$lib/types'
import { formatToleranceRadiusKm } from '$lib/geo/score'
import QuestionHeadingThumb from './QuestionHeadingThumb.vue'
const props=withDefaults(defineProps<{current:Question;activeTheme?:Theme;showThemeHeading?:boolean;borders?:boolean;textClass?:string;aiEnrichConfigured?:boolean}>(),{showThemeHeading:false,borders:true,textClass:'text-lg font-semibold leading-snug',aiEnrichConfigured:true})
const emit=defineEmits<{ 'update:borders':[value:boolean] }>()
</script>
<template>
 <p v-if="showThemeHeading" class="eyebrow">{{activeTheme?.emoji}} {{activeTheme?.name}}</p>
 <QuestionHeadingThumb :img-url="current.imgUrl" :youtube-url="current.youtubeUrl" :class="showThemeHeading?'mt-1':''"><template #heading><p :class="textClass">{{current.text}}</p></template><template #meta><p class="subtle" :title="'Rayon autour du point exact où la réponse compte comme correcte (zone bonus XP possible).'">~{{formatToleranceRadiusKm(current.toleranceM)}} km</p></template></QuestionHeadingThumb>
</template>
