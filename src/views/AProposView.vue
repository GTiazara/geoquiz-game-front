<script setup lang="ts">
import { ArrowLeft, Dices, Flag, Globe2, Landmark, Smartphone, Swords, Trophy, UserRound, Users, SquarePen, Target } from 'lucide-vue-next'

const LAST_UPDATE = '24 avril 2026'
const steps = [
  'Choisissez un thème (pays, capitales, drapeaux…) ou le mode Mixte pour tout combiner.',
  'Une carte du monde s’affiche avec une question (ex. : « Où est le Japon ? »).',
  'Cliquez sur la carte pour placer votre réponse.',
  'Validez pour voir votre score basé sur la distance avec la réponse exacte.',
]
const themes = [
  { icon: Globe2, name: 'Pays', text: 'Localisez un pays sur la carte' },
  { icon: Landmark, name: 'Capitales', text: 'Trouvez la capitale d’un pays' },
  { icon: Flag, name: 'Drapeaux', text: 'Identifiez un pays par son drapeau' },
  { icon: Dices, name: 'Mixte', text: 'Tous les thèmes mélangés aléatoirement' },
]
</script>

<template>
  <div class="narrow doc fade-up">
    <header class="page-heading">
      <div>
        <p class="eyebrow">GeoPinpoint</p>
        <h1>À propos</h1>
        <p>Dernière mise à jour : {{ LAST_UPDATE }}</p>
      </div>
    </header>

    <section class="panel lead">
      <p>
        <strong>GeoPinpoint</strong> est un quiz géographique gratuit et communautaire. Son but : apprendre la géographie
        du monde en s’amusant, seul ou entre amis.
      </p>
    </section>

    <section class="panel row">
      <span class="feature-icon success"><Smartphone :size="22" /></span>
      <div class="stack-sm">
        <h2>Application mobile</h2>
        <p>Jouez aussi sur votre téléphone ! Téléchargez l’application <strong>GeoPinpoint</strong> sur Android.</p>
        <div>
          <a
            class="btn btn-secondary btn-sm"
            href="https://play.google.com/store/apps/details?id=com.skippylab.geopinpoint.twa"
            target="_blank"
            rel="noopener noreferrer"
          >Google Play</a>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Comment jouer ?</h2>
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="i"><span class="step-n">{{ i + 1 }}</span><span>{{ s }}</span></li>
      </ol>
    </section>

    <section class="panel">
      <h2>Les thèmes disponibles</h2>
      <div class="theme-grid">
        <div v-for="t in themes" :key="t.name" class="theme-item">
          <component :is="t.icon" :size="20" class="theme-icon" />
          <div><strong>{{ t.name }}</strong><small class="muted">{{ t.text }}</small></div>
        </div>
      </div>
      <p class="muted small">D’autres thèmes peuvent être créés par la communauté (voir « Contribuer »).</p>
    </section>

    <section class="panel row">
      <span class="feature-icon accent"><Target :size="22" /></span>
      <div class="stack-sm">
        <h2>Le système de points</h2>
        <p>Chaque bonne réponse vous rapporte des <strong>XP (points d’expérience)</strong>. Plus vous êtes précis, plus vous gagnez de points.</p>
        <ul class="bullets">
          <li><strong>Zone exacte</strong> : maximum de points</li>
          <li><strong>Zone de tolérance</strong> : cercle autour de la réponse exacte</li>
          <li><strong>Hors zone</strong> : 0 point</li>
        </ul>
        <p class="muted small">La série 🔥 compte les réponses consécutives dans la zone. Elle repart à zéro après une erreur.</p>
      </div>
    </section>

    <section class="panel row">
      <span class="feature-icon violet"><Swords :size="22" /></span>
      <div class="stack-sm">
        <h2>Geobattle : jouez entre amis</h2>
        <p>La <strong>Geobattle</strong> est un mode multijoueur en temps réel. Créez une salle, partagez le lien avec vos amis, et répondez aux mêmes questions simultanément.</p>
        <p class="muted small">Le premier jour UTC de chaque thème propose une Geobattle « du jour » accessible depuis la carte.</p>
      </div>
    </section>

    <section class="panel row">
      <span class="feature-icon"><UserRound :size="22" /></span>
      <div class="stack-sm">
        <h2>Compte et progression</h2>
        <p>Vous pouvez jouer <strong>sans créer de compte</strong> (mode visiteur). Votre progression est liée à votre appareil et réinitialisée chaque jour UTC.</p>
        <p>Créez un <strong>compte gratuit avec pseudo et mot de passe</strong>, sans e-mail ni autre information personnelle, pour retrouver votre XP sur tous vos appareils, accéder au classement des inscrits et contribuer à la communauté.</p>
      </div>
    </section>

    <section class="panel row">
      <span class="feature-icon accent"><SquarePen :size="22" /></span>
      <div class="stack-sm">
        <h2>Contribuer</h2>
        <p>Tout le monde peut <strong>proposer des questions</strong> (pays, capitales, drapeaux…). La communauté vote pour valider les propositions avant qu’elles n’apparaissent dans le quiz.</p>
        <p class="muted small">Vous pouvez aussi créer vos propres thèmes personnalisés.</p>
      </div>
    </section>

    <section class="panel row">
      <span class="feature-icon"><Trophy :size="22" /></span>
      <div class="stack-sm">
        <h2>Classement</h2>
        <p>Comparez votre XP avec les autres joueurs dans le <strong>classement</strong>. Deux tableaux sont disponibles : « tous joueurs » (visiteurs + inscrits) et « inscrits » (comptes créés).</p>
      </div>
    </section>

    <section class="panel">
      <h2>Contact et retours</h2>
      <p>Vous avez trouvé un bug, une suggestion, ou simplement un avis à partager ? Rejoignez la communauté :</p>
      <div class="actions">
        <RouterLink to="/communaute" class="btn btn-secondary btn-sm"><Users :size="16" /> Communauté</RouterLink>
        <a href="https://www.reddit.com/r/geopinpoint/" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">r/geopinpoint</a>
      </div>
      <p class="muted small">GeoPinpoint est un projet personnel gratuit, sans publicité ni financement externe.</p>
    </section>

    <div class="actions center">
      <RouterLink to="/" class="btn btn-primary"><ArrowLeft :size="16" /> Retour aux quiz</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.doc { display: grid; gap: 16px; }
.doc h2 { font-size: 17px; font-weight: 700; margin: 0 0 6px; color: var(--ink); }
.doc p { line-height: 1.65; color: #334155; font-size: 14px; margin: 0; }
.doc .small { font-size: 12.5px; }
.lead p { font-size: 15px; }
.row { display: flex; gap: 16px; align-items: flex-start; }
.feature-icon { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--primary-soft); color: var(--primary-strong); }
.feature-icon.success { background: #dcfce7; color: #15803d; }
.feature-icon.accent { background: var(--accent-soft); color: #b45309; }
.feature-icon.violet { background: #ede9fe; color: #6d28d9; }
.steps { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 10px; }
.steps li { display: flex; gap: 12px; align-items: flex-start; font-size: 14px; color: #334155; line-height: 1.55; }
.step-n { flex: none; width: 26px; height: 26px; border-radius: 999px; display: grid; place-items: center; background: var(--primary); color: #fff; font-weight: 700; font-size: 13px; }
.theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin: 10px 0 12px; }
.theme-item { display: flex; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); }
.theme-item strong { display: block; font-size: 14px; }
.theme-item small { font-size: 12.5px; }
.theme-icon { color: var(--primary); flex: none; }
.bullets { margin: 0; padding-left: 18px; font-size: 13.5px; color: #334155; display: grid; gap: 4px; }
.center { justify-content: center; margin-top: 8px; }
@media (max-width: 767px) { .row { flex-direction: column; } }
</style>
