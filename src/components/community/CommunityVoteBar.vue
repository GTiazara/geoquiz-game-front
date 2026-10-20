<script setup lang="ts">
import { computed } from 'vue'
import { ThumbsUp, ThumbsDown } from 'lucide-vue-next'
const props = defineProps<{ upVotes: number; downVotes: number; busy?: boolean; authorPseudo?: string }>()
const emit = defineEmits<{ vote: [direction: 'up' | 'down'] }>()
const confidence = computed(() => Math.round(100 * (props.upVotes + 1) / (props.upVotes + props.downVotes + 2)))
</script>
<template>
  <div class="vote-bar stack-sm">
    <div class="actions"><span class="badge" :class="{ danger: upVotes < downVotes }">Score net : {{ upVotes - downVotes > 0 ? '+' : '' }}{{ upVotes - downVotes }}</span><span class="subtle">Confiance ~{{ confidence }} % · +{{ upVotes }} / −{{ downVotes }}</span><span v-if="authorPseudo" class="subtle">par @{{ authorPseudo }}</span></div>
    <div class="actions"><button type="button" class="btn btn-primary" :disabled="busy" @click="emit('vote', 'up')"><ThumbsUp :size="16" /> Utile — valide la cible</button><button type="button" class="btn btn-secondary down" :disabled="busy" @click="emit('vote', 'down')"><ThumbsDown :size="16" /> Douteux</button><span v-if="busy" class="subtle" role="status">Vote en cours…</span></div>
  </div>
</template>
<style scoped>.vote-bar{padding:18px 20px;border-top:1px solid var(--border)}.down{color:var(--danger);border-color:#fecdd3}</style>
