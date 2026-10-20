<!-- Props: coverImageUrl?, emoji?, title? (class attribute supported); Emits: —; Slots: —; Exposed: — -->
<script setup lang="ts">
withDefaults(defineProps<{ coverImageUrl?: string; emoji?: string; title?: string }>(), { emoji: '📜', title: '' })
</script>
<template>
  <div class="relative h-full w-full overflow-hidden bg-slate-100">
    <img v-if="coverImageUrl?.trim()" :src="coverImageUrl" alt="" class="h-full w-full object-cover" loading="lazy" decoding="async" />
    <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 text-2xl" aria-hidden="true">{{ emoji || '📜' }}</div>
    <span v-if="title" class="sr-only">{{ title }}</span>
  </div>
</template>
