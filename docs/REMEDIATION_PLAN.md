# Plan de remédiation

## Terminé localement

1. **Moyen — ouverture hors ligne :** ajout de `js/print.js` au préchargement du service worker, version de cache/application passée à v77 et test de non-régression des imports statiques.
2. **Documentation :** création des sept documents demandés, avec le périmètre réellement vérifiable et les limites de l’audit.

## Priorités avant production

1. **Élevée — migrations en collision :** comparer les versions `20261015000004` et `20261017000007` à l’historique Supabase distant; préparer un plan de versionnement sans rejouer une migration déjà appliquée.
2. **Élevée — contrôle RLS distant :** exporter les politiques, grants, fonctions, triggers, vues et réglages Storage/Auth; exécuter des scénarios par rôle et entre deux organisations.
3. **Élevée — validation métier :** tester ventes, paiements et dépôts en double, stock simultané, synchronisation interrompue, caisse journalière et restauration dans un environnement de test.
4. **Moyenne — assurance front-end :** revue complète des rendus HTML issus de données, tests navigateur responsive/accessibilité, contrôle des en-têtes réellement servis.
5. **Moyenne — gouvernance :** rétablir un historique Git fiable pour distinguer le ZIP v76 du dossier de travail et suivre les futures modifications.

## Contrôles effectués et limites

- Tests Node : 8 réussis après correction; vérification syntaxique et génération de l’aperçu autonome réussies.
- Pas de lint, TypeScript, intégration, E2E ou tests navigateur fournis dans le dépôt.
- Aucun accès Supabase distant, aucune migration appliquée et aucun test de données de production.
- Aucun déploiement ni changement de données effectué.

## Conditions de feu vert

Ne pas publier les migrations avant résolution des collisions et revue de l’historique distant. Exiger une sauvegarde vérifiée, des tests RLS multi-organisation, des scénarios métier sur données synthétiques, une prévisualisation HTTPS et un plan de retour arrière applicatif et base de données. Cette revue statique ne permet pas de déclarer l’application sûre à 100 %.
