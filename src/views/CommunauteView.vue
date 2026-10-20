<script setup lang="ts">
import { ExternalLink, MessageCircle, Users, Flag, Heart, Plus } from 'lucide-vue-next'
const REDDIT_LINK = 'https://www.reddit.com/r/geopinpoint/'
const FACEBOOK_GROUP = 'https://www.facebook.com/share/g/18KDX5kS1Z/'
</script>
<template>
  <div class="narrow stack">
    <header class="page-heading"><span class="eyebrow">GeoPinpoint · Ensemble, allons plus loin</span><h1>Communauté</h1><p>Dernière mise à jour : 24 avril 2026</p></header>
    <section class="surface panel"><p>GeoPinpoint est un projet <strong>communautaire</strong>. Plusieurs espaces permettent de discuter, signaler des problèmes, ou simplement partager votre avis.</p></section>
    <section class="stack"><h2>Discuter et donner son avis</h2><div class="community-links">
      <a :href="REDDIT_LINK" target="_blank" rel="noopener noreferrer" class="surface panel community-link"><span class="link-icon reddit"><MessageCircle :size="26" /></span><div><h3>Reddit</h3><small>r/geopinpoint</small><p>Forum principal pour les discussions, suggestions et retours.</p></div><ExternalLink :size="17" class="muted" aria-label="Nouvel onglet" /></a>
      <a :href="FACEBOOK_GROUP" target="_blank" rel="noopener noreferrer" class="surface panel community-link"><span class="link-icon facebook"><Users :size="26" /></span><div><h3>Groupe Facebook</h3><small>Groupe public</small><p>Échanger avec d’autres joueurs, partager vos scores et tips.</p></div><ExternalLink :size="17" class="muted" aria-label="Nouvel onglet" /></a>
    </div></section>
    <section class="surface panel stack-sm"><div class="actions"><Flag :size="21" /><h2>Signaler un problème</h2></div><p>Vous avez trouvé un <strong>bug</strong>, une erreur dans une question, ou un comportement inattendu ?</p><p>Le meilleur moyen de le signaler est de poster sur <a :href="REDDIT_LINK" target="_blank" rel="noopener noreferrer" class="text-link">r/geopinpoint</a> sur Reddit. Cela permet à tout le monde de voir le problème et à l’équipe de suivre les signalements.</p></section>
    <section class="surface panel stack-sm"><span class="eyebrow">Partagez vos connaissances</span><h2>Contribuer</h2><p>Vous pouvez <strong>proposer vos propres questions</strong> (pays, capitales, drapeaux…) directement dans l’application via l’onglet « Contribuer ».</p><p>La communauté vote pour valider les propositions avant qu’elles n’apparaissent dans le quiz. C’est aussi un moyen de participer activement à l’évolution de GeoPinpoint.</p><div class="actions"><RouterLink to="/contribute" class="btn btn-primary"><Plus :size="16" /> Aller sur Contribuer</RouterLink></div></section>
    <section class="surface panel stack-sm"><h2>Créer un thème</h2><p>Vous voulez créer un <strong>thème personnalisé</strong> ? C’est possible directement depuis l’application (bouton « + Créer » dans la liste des thèmes).</p><p class="subtle">Les thèmes personnalisés n’apparaissent que pour vous, sauf si vous les partagez via le lien de Geobattle.</p></section>
    <section class="surface panel stack-sm"><div class="actions"><Heart :size="21" /><h2>À propos du projet</h2></div><p>GeoPinpoint est un projet personnel gratuit, sans publicité ni financement externe. Il est développé et maintenu avec passion pour les fans de géographie.</p><p class="subtle">Merci à tous les contributeurs qui proposent des questions et à la communauté pour son soutien !</p></section>
    <div class="actions"><RouterLink to="/" class="btn btn-secondary">← Retour au jeu</RouterLink><RouterLink to="/a-propos" class="btn btn-ghost">À propos</RouterLink></div>
  </div>
</template>
<style scoped>
.page-heading{margin-bottom:0}.community-links{display:grid;gap:14px}.community-link{display:flex;align-items:center;gap:16px;transition:border-color .15s,box-shadow .15s}.community-link:hover{border-color:var(--primary);box-shadow:var(--shadow-md)}.community-link>div{flex:1}.community-link p{font-size:13px;margin-top:6px;color:var(--muted)}.link-icon{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;flex-shrink:0}.reddit{background:#fff1e8;color:#c2410c}.facebook{background:#eff6ff;color:#2563eb}.text-link{color:var(--primary-strong);text-decoration:underline;font-weight:650}
</style>
