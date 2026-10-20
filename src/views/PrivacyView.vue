<script setup lang="ts">
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-vue-next'

const LAST_UPDATE = '20 octobre 2026'
const CONTACT_EMAIL = 'contact@skippylab.com'
const toc = [
  'Responsable du traitement',
  'Données que nous traitons',
  'Finalités et bases légales',
  'Partage avec des tiers',
  'Durée de conservation',
  'Vos droits',
  'Sécurité',
  'Enfants',
  'Modifications',
]

function scrollTo(n: number): void {
  document.getElementById(`privacy-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="narrow doc fade-up">
    <header class="page-heading">
      <div>
        <p class="eyebrow">GeoPinpoint</p>
        <h1>Politique de confidentialité</h1>
        <p>Dernière mise à jour : {{ LAST_UPDATE }}</p>
      </div>
    </header>

    <section class="panel intro">
      <span class="shield"><ShieldCheck :size="22" /></span>
      <div class="stack-sm">
        <p>
          GeoPinpoint (ci-après « l’application ») est un quiz géographique communautaire édité à titre personnel. Cette
          politique explique quelles données sont traitées, pourquoi, où elles sont stockées, et comment exercer vos droits.
        </p>
        <p class="muted">L’application <strong>ne cible pas les enfants de moins de 13 ans</strong> et n’est pas conçue pour eux.</p>
      </div>
    </section>

    <nav class="panel toc" aria-label="Sommaire">
      <a v-for="(t, i) in toc" :key="t" :href="`#privacy-${i + 1}`" @click.prevent="scrollTo(i + 1)">{{ i + 1 }}. {{ t }}</a>
    </nav>

    <section id="privacy-1" class="panel">
      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement est l’éditeur de GeoPinpoint, à titre personnel. Pour toute question relative à vos
        données : <a class="link" :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>.
      </p>
    </section>

    <section id="privacy-2" class="panel">
      <h2>2. Données que nous traitons</h2>
      <ul>
        <li><strong>Identifiant de navigateur (« deviceId »)</strong> : identifiant anonyme conservé dans le stockage local du navigateur. Il identifie le profil visiteur, qui reste lié à ce navigateur.</li>
        <li><strong>Ancien cookie V1 (« geopin_device »)</strong> : si ce cookie HttpOnly est encore présent et accessible sur le domaine de l’API, il permet de retrouver votre ancien compte sans mot de passe. L’identifiant est alors repris par la V2. Ce cookie seul ne permet plus l’accès au compte après la création du mot de passe.</li>
        <li><strong>Pseudo</strong> : choisi librement par vous (compte invité ou compte « inscrit »). Aucun nom réel ni adresse e-mail n’est requis.</li>
        <li><strong>Mot de passe et session de compte</strong> : l’inscription demande uniquement un pseudo et un mot de passe. Seul un hachage salé du mot de passe (scrypt) est conservé côté serveur. Un jeton de session est enregistré dans votre navigateur ; seul son hachage est conservé côté serveur. La connexion permet de retrouver le même profil sur plusieurs appareils, sans information personnelle supplémentaire.</li>
        <li><strong>Progression de jeu</strong> : expérience (XP), scores par thème, résultats des Geobattle (distance, temps), liés au deviceId.</li>
        <li><strong>Contributions</strong> : questions, coordonnées géographiques du lieu à deviner, descriptions, images/URL YouTube ajoutées, votes. Ces contenus sont destinés à être affichés publiquement dans le jeu.</li>
        <li><strong>Mesure d’audience</strong> : pages consultées, via une instance auto-hébergée de <em>Matomo</em> (<code class="mono">matomo.gtiazara.fr</code>). Aucune donnée d’audience n’est transmise à des régies publicitaires ou à des tiers.</li>
        <li><strong>Journaux techniques serveur</strong> : adresse IP, date, chemin de la requête — utilisés pour la sécurité et le dépannage, conservés de manière limitée dans le temps.</li>
      </ul>
      <p class="muted">GeoPinpoint <strong>ne demande pas</strong> la géolocalisation de votre appareil, ne collecte pas de photos ni de contacts, et n’accède pas au micro ou à la caméra.</p>
    </section>

    <section id="privacy-3" class="panel">
      <h2>3. Finalités et bases légales</h2>
      <ul>
        <li>Fournir le service (jeu, classements, Geobattle, contributions) — <em>exécution du service demandé</em>.</li>
        <li>Maintenir la sécurité, prévenir les abus et corriger des bugs — <em>intérêt légitime</em>.</li>
        <li>Mesurer l’audience de manière agrégée (Matomo auto-hébergé) — <em>intérêt légitime</em> ; aucun profilage publicitaire.</li>
      </ul>
    </section>

    <section id="privacy-4" class="panel">
      <h2>4. Partage avec des tiers</h2>
      <p>Les données ne sont pas vendues. Elles ne sont pas partagées avec des régies publicitaires. Le service utilise des composants techniques tiers suivants, strictement nécessaires :</p>
      <ul>
        <li><strong>OpenStreetMap / fournisseurs de tuiles</strong> : le rendu cartographique peut entraîner des requêtes vers les serveurs de tuiles (adresse IP transmise par votre navigateur, comme pour tout site web).</li>
        <li><strong>YouTube (iframes)</strong> : si une question contient une vidéo YouTube, votre navigateur contacte YouTube lors de la lecture. Consultez leur propre politique.</li>
        <li><strong>Hébergeur du service</strong> : les données sont stockées sur l’infrastructure utilisée par l’éditeur pour faire fonctionner l’application (base de données MongoDB).</li>
      </ul>
    </section>

    <section id="privacy-5" class="panel">
      <h2>5. Durée de conservation</h2>
      <ul>
        <li><strong>Comptes invités</strong> : les sessions « visiteur » sont conservées pour la journée UTC en cours, puis purgées automatiquement.</li>
        <li><strong>Comptes inscrits (pseudo)</strong> : conservés tant que le compte existe. Vous pouvez demander la suppression à tout moment (voir ci-dessous).</li>
        <li><strong>Sessions de connexion</strong> : valables 30 jours, révoquées à la déconnexion sur le navigateur concerné. La suppression du compte efface son mot de passe haché et toutes ses sessions.</li>
        <li><strong>Contributions publiques</strong> : les questions publiées restent associées à votre pseudo tant qu’elles sont utilisées dans le jeu. En cas de suppression de compte, les questions peuvent être conservées sous forme anonymisée.</li>
        <li><strong>Journaux serveur / audience</strong> : conservés de manière limitée et régulièrement purgés.</li>
      </ul>
    </section>

    <section id="privacy-6" class="panel">
      <h2>6. Vos droits</h2>
      <p>Conformément au RGPD, vous disposez d’un droit d’accès, de rectification, de suppression, de limitation et d’opposition. Vous pouvez :</p>
      <ul>
        <li>Supprimer votre compte et les données associées depuis la page <RouterLink class="link" to="/compte">Mon compte</RouterLink>.</li>
        <li>Vider vos données locales en effaçant le stockage du navigateur. Cela oublie la session locale sans supprimer le compte : vous pouvez vous reconnecter avec votre pseudo et votre mot de passe.</li>
        <li>Nous écrire à <a class="link" :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a> pour toute demande liée à vos droits.</li>
      </ul>
    </section>

    <section id="privacy-7" class="panel">
      <h2>7. Sécurité</h2>
      <p>Les échanges sont chiffrés (HTTPS). L’accès à la base de données est restreint. Les mots de passe des comptes sont hachés avec un sel aléatoire et les tentatives de connexion sont limitées. Sans adresse e-mail, aucun mot de passe ne peut être renvoyé ou réinitialisé par e-mail. En cas d’incident de sécurité susceptible d’affecter vos données, l’éditeur prendra les mesures appropriées, dans le cadre d’un service opéré à titre personnel.</p>
    </section>

    <section id="privacy-8" class="panel">
      <h2>8. Enfants</h2>
      <p>GeoPinpoint n’est pas destiné aux enfants de moins de 13 ans. Aucune donnée n’est collectée sciemment à propos d’un enfant de moins de 13 ans. Si vous pensez qu’un tel enregistrement a eu lieu, contactez-nous afin que nous puissions le supprimer.</p>
    </section>

    <section id="privacy-9" class="panel">
      <h2>9. Modifications</h2>
      <p>Cette politique peut évoluer avec le service. La date de mise à jour en tête de page est actualisée à chaque modification significative.</p>
    </section>

    <div class="actions">
      <RouterLink to="/" class="btn btn-secondary"><ArrowLeft :size="16" /> Retour au jeu</RouterLink>
      <a :href="`mailto:${CONTACT_EMAIL}`" class="btn btn-primary"><Mail :size="16" /> Nous contacter</a>
    </div>
  </div>
</template>

<style scoped>
.doc { display: grid; gap: 16px; }
.doc h2 { font-size: 17px; font-weight: 700; margin: 0 0 8px; color: var(--ink); }
.doc p, .doc li { line-height: 1.65; color: #334155; font-size: 14px; }
.doc p { margin: 0; }
.doc ul { margin: 8px 0; padding-left: 18px; display: grid; gap: 8px; }
.doc .muted { color: var(--muted); }
.intro { display: flex; gap: 16px; align-items: flex-start; }
.shield { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--primary-soft); color: var(--primary-strong); }
.toc { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; }
.toc a { color: var(--primary-strong); font-weight: 600; }
.toc a:hover { text-decoration: underline; }
.link { color: var(--primary-strong); font-weight: 600; }
.link:hover { text-decoration: underline; }
</style>
