<!-- Props: avg?, interactive?, value?, size?, disabled?, onRate?; Emits: —; Slots: —; Exposed: — -->
<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ avg?: number | null; interactive?: boolean; value?: number; size?: 'sm' | 'md'; disabled?: boolean; onRate?: (stars: number) => void }>(), { avg: null, interactive: false, value: 0, size: 'sm', disabled: false })
const fill = computed(() => props.avg == null || props.interactive ? 0 : Math.min(5, Math.max(0, props.avg)))
</script>
<template>
  <div class="inline-flex items-center gap-0.5" :class="size === 'md' ? 'text-lg' : 'text-sm'" :role="interactive ? 'group' : undefined" aria-label="Note">
    <button v-for="star in 5" :key="star" type="button" :disabled="!interactive || disabled" :aria-pressed="interactive && value === star" :aria-label="`${star} étoile${star > 1 ? 's' : ''} sur 5`" class="relative leading-none" :class="interactive ? 'cursor-pointer p-0.5 text-amber-300/30 hover:scale-110 disabled:opacity-50' : 'p-0 text-amber-300/25'" @click="interactive && !disabled && onRate?.(star)">
      <span class="relative inline-block" aria-hidden="true"><span>★</span><span v-if="interactive && value >= star" class="absolute inset-0 text-amber-400">★</span><span v-else-if="!interactive && fill > star - 1" class="absolute left-0 top-0 h-full overflow-hidden text-amber-400" :style="{ width: `${Math.min(1, fill - (star - 1)) * 100}%` }">★</span></span>
    </button>
  </div>
</template>
