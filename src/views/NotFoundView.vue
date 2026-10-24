<script setup lang="ts">
import { Compass } from 'lucide-vue-next'
</script>

<template>
  <div class="empty fade-up">
    <div class="empty-icon"><Compass :size="28" /></div>
    <h2>Page introuvable</h2>
    <p>Ce lieu n’existe pas sur notre carte.</p>
    <div class="actions"><RouterLink to="/" class="btn btn-primary">Retour aux quiz</RouterLink></div>
  </div>
</template>
