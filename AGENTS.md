

## Règle fondamentale : Mobile-First

**L'application doit toujours être conçue et développée en Mobile-First.**

Le mobile est la priorité absolue lors de toute création ou modification de l'interface.

### Obligations

- Concevoir les interfaces en priorité pour les petits écrans.
- Adapter ensuite les interfaces aux tablettes et aux ordinateurs.
- Ne jamais supposer que l'utilisateur dispose d'une souris ou d'un clavier physique.
- Garantir une navigation confortable avec les doigts.
- Éviter les éléments trop petits, trop rapprochés ou difficiles à sélectionner.
- Empêcher tout débordement horizontal non intentionnel.
- Adapter les textes, les cartes, les images et les composants à la largeur disponible.
- Respecter les zones de sécurité des smartphones, notamment autour de l'encoche et de la barre système.
- Préserver une expérience fluide en mode portrait comme en mode paysage lorsque cela est pertinent.

### Points de rupture recommandés

Utiliser des points de rupture cohérents, à adapter au système CSS existant :

- Mobile : moins de 640 px.
- Tablette : de 640 px à 1023 px.
- Ordinateur : 1024 px et plus.

Ne pas multiplier inutilement les points de rupture.

## Expérience utilisateur et interface

L'interface doit être moderne, claire, cohérente et facile à comprendre.

### Principes de conception

- Privilégier la simplicité et la lisibilité.
- Limiter les éléments visuels inutiles.
- Maintenir une hiérarchie visuelle claire.
- Utiliser un système cohérent de couleurs, d'espacements, de bordures et de typographies.
- Prévoir des états visuels pour les interactions : survol, sélection, chargement, succès, erreur et désactivation.
- Fournir un retour visuel immédiat après chaque action importante.
- Éviter les animations excessives et les transitions qui ralentissent l'utilisation.
- Respecter la préférence système `prefers-reduced-motion`.
- Prévoir des états vides explicites et des messages d'erreur compréhensibles.

### Ergonomie mobile

- Prévoir des zones tactiles suffisamment grandes, idéalement autour de 44 × 44 px ou davantage.
- Éviter les boutons placés trop près les uns des autres.
- Ne pas dépendre uniquement du survol de la souris.
- Utiliser des tailles de texte confortables.
- Maintenir les actions principales facilement accessibles.
- Éviter les fenêtres modales difficiles à fermer sur mobile.
- Ne pas masquer les informations importantes derrière des interactions complexes.


Chaque page, composant ou fonctionnalité doit fonctionner sur les formats suivants :

- Petit smartphone.
- Smartphone standard.
- Smartphone de grande taille.
- Tablette en portrait et en paysage.
- Ordinateur portable.
- Écran de bureau.

### Règles

- Utiliser en priorité des layouts flexibles : Flexbox, Grid et dimensions relatives.
- Éviter les largeurs fixes qui empêchent l'adaptation.
- Utiliser `min-width: 0` lorsque nécessaire dans les layouts flexibles.
- Utiliser des tailles fluides lorsque cela améliore l'expérience.
- Vérifier les contenus longs, les boutons, les formulaires et les tableaux.
- Prévenir les débordements horizontaux.
- Adapter la densité de l'interface à l'espace disponible.
- Ne pas simplement réduire l'interface desktop pour l'afficher sur mobile : repenser la disposition si nécessaire.

## 6. Accessibilité

L'application doit être accessible au plus grand nombre.

- Utiliser des éléments HTML sémantiques.
- Associer les champs de formulaire à des libellés explicites.
- Garantir un contraste suffisant entre le texte et l'arrière-plan.
- Ne jamais communiquer une information uniquement par la couleur.
- Ajouter des noms accessibles aux boutons qui n'affichent que des icônes.
- Préserver la navigation au clavier.
- Afficher clairement les états de focus.
- Utiliser les attributs ARIA uniquement lorsqu'ils sont nécessaires.
- Prévoir des alternatives aux interactions reposant exclusivement sur des gestes complexes.
- Respecter les préférences d'accessibilité du système.

## 7. Qualité du code

Avant toute modification, analyser la structure existante du projet.

### Obligations

- Respecter le framework, les conventions et l'architecture déjà utilisés.
- Réutiliser les composants existants lorsqu'ils sont adaptés.
- Éviter la duplication de code.
- Privilégier les composants réutilisables et les responsabilités clairement définies.
- Utiliser des noms de variables, fonctions et composants explicites.
- Éviter les abstractions inutiles.
- Ne pas ajouter de dépendance sans justification.
- Ne pas réécrire entièrement une fonctionnalité lorsque des modifications ciblées suffisent.
- Ne pas supprimer une fonctionnalité existante sans demande explicite.
- Préserver la compatibilité avec les fonctionnalités existantes.
- Respecter les conventions de formatage et de typage du projet.

### Avant de modifier un fichier

1. Examiner le code concerné.
2. Identifier les composants et dépendances impliqués.
3. Comprendre les comportements existants.
4. Déterminer les risques de régression.
5. Choisir la solution la plus simple et la plus maintenable.

## Performance

L'application doit rester rapide, particulièrement sur les réseaux mobiles et les appareils peu puissants.

- Limiter la taille du JavaScript envoyé au navigateur.
- Éviter les dépendances lourdes lorsqu'une solution simple existe.
- Charger les ressources volumineuses à la demande lorsque cela est pertinent.
- Optimiser les images et les données cartographiques.
- Éviter les mises à jour inutiles de l'interface.
- Préserver une navigation réactive.
- Éviter les décalages de mise en page pendant le chargement.
- Utiliser le chargement différé pour les ressources non prioritaires.
- Mesurer les performances avant d'introduire des optimisations complexes.

## Sécurité et données

- Ne jamais exposer de clés secrètes ou de credentials dans le code client.
- Ne jamais inscrire de secrets dans le dépôt Git.
- Valider les données provenant de sources externes.
- Respecter les règles de sécurité du framework utilisé.
- Ne pas contourner les mécanismes d'authentification ou d'autorisation existants.
- Ne pas journaliser d'informations personnelles sensibles.
- Ne pas modifier les schémas de base de données sans examiner les conséquences.
- Ne jamais supprimer ou réinitialiser des données réelles sans autorisation explicite.

## Gestion des erreurs

- Prévoir des états de chargement explicites.
- Afficher des messages d'erreur compréhensibles.
- Éviter les erreurs silencieuses.
- Préserver les données de l'utilisateur lorsqu'une opération échoue.
- Prévoir les problèmes de réseau lorsque cela est pertinent.
- Ne pas afficher de détails techniques sensibles dans l'interface publique.
- Ajouter des mécanismes de récupération adaptés à la gravité de l'erreur.

## . Tests obligatoires

Toute modification doit être vérifiée selon son importance et son impact.

### Vérifications minimales

- Vérifier que l'application compile.
- Exécuter les tests pertinents disponibles.
- Vérifier l'absence d'erreurs évidentes dans la console.
- Tester les principaux parcours utilisateur concernés.
- Vérifier les interactions tactiles.
- Vérifier le rendu sur plusieurs tailles d'écran.
- Vérifier les états de chargement, d'erreur et de succès lorsque cela s'applique.

### Tailles d'écran à vérifier

Tester au minimum :

- 320 px de largeur.
- 375 px de largeur.
- 390 px de largeur.
- 768 px de largeur.
- 1024 px de largeur.
- 1440 px de largeur.

Ces valeurs sont des repères de test, pas des contraintes imposées à l'interface.

## 12. Compatibilité mobile

- Privilégier les fonctionnalités compatibles avec les navigateurs mobiles modernes.
- Éviter les comportements dépendant d'API uniquement disponibles sur desktop.
- Vérifier les comportements spécifiques à Safari sur iOS et Chrome sur Android lorsque cela est pertinent.
- Utiliser des unités CSS adaptées aux écrans mobiles.
- Tester les champs de formulaire lorsque le clavier virtuel apparaît.
- Vérifier que les boutons fixes ne masquent pas les contenus.
- Tenir compte des zones de sécurité et de la hauteur variable des barres du navigateur.

## 13. Progressive Web App

Si le projet prend en charge ou prévoit une PWA :

- Vérifier la configuration du manifeste.
- Prévoir des icônes adaptées.
- Vérifier le comportement d'installation.
- Gérer correctement les mises à jour du service worker.
- Ne mettre en cache que les ressources appropriées.
- Ne jamais laisser une ancienne version du jeu corrompre une session.
- Définir explicitement les fonctionnalités disponibles hors ligne.

Ne pas ajouter une architecture PWA complète sans vérifier les besoins réels du projet.

## 14. Règles pour les agents IA

À chaque intervention :

1. Comprendre la demande avant de modifier le code.
2. Examiner les fichiers concernés.
3. Respecter l'architecture et les conventions existantes.
4. Appliquer systématiquement l'approche Mobile-First.
5. Préserver les fonctionnalités déjà opérationnelles.
6. Éviter les modifications sans rapport avec la demande.
7. Tester les changements lorsque les outils le permettent.
8. Corriger les régressions introduites par les modifications.
9. Signaler clairement les tests effectués et ceux qui restent à faire.
10. Ne jamais prétendre qu'un test a réussi s'il n'a pas été exécuté.

### Priorité en cas de conflit

Respecter l'ordre de priorité suivant :

1. Sécurité et intégrité des données.
2. Fonctionnement correct de l'application.
3. Utilisabilité mobile.
4. Accessibilité.
5. Performance.
6. Cohérence visuelle.
7. Préférences esthétiques secondaires.

## 15. Checklist avant livraison

Avant de considérer une tâche comme terminée, vérifier :

- [ ] La fonctionnalité répond à la demande.
- [ ] L'interface fonctionne sur mobile.
- [ ] L'interface reste adaptée aux grands écrans.
- [ ] Les interactions tactiles fonctionnent.
- [ ] Aucun débordement horizontal involontaire n'a été introduit.
- [ ] Les fonctionnalités existantes sont préservées.
- [ ] Les erreurs et états de chargement sont gérés.
- [ ] Les exigences d'accessibilité pertinentes sont respectées.
- [ ] Les tests pertinents ont été exécutés.
- [ ] Les éventuelles limitations sont documentées.

**Règle finale : aucune fonctionnalité, aucun composant et aucune nouvelle page ne doivent être considérés comme terminés sans avoir pris en compte l'expérience mobile.**