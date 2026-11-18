# Plan de remédiation

## Terminé localement

1. **Élevée — migrations en collision : résolu dans le dépôt (18 novembre 2026).**
   Les deux collisions de versions sont levées par renommage (`…000004` → `…000006`,
   `…000007` → `…0018`) et deux doublons stricts supprimés, sans changer le SQL.
   Un test refuse désormais deux migrations de même version. Voir
   `supabase/migrations/README.md`.
2. **Moyen — ouverture hors ligne :** ajout de `js/print.js` au préchargement du service
   worker (v77), puis de `js/push.js` et `js/localdb.js` (1.45.11, build 131). Un test
   vérifie que tout module importé au démarrage est précaché.
3. **Documentation :** création des sept documents demandés, avec le périmètre réellement
   vérifiable et les limites de l’audit.
4. **SQL retrouvé et contrôlé :** scripts `sql/` et 28 migrations récupérés ; audit
   statique automatisé (RLS 28/28, `SECURITY DEFINER` avec `search_path` 65/65,
   aucun `anon`).

## Priorités avant production

1. **Élevée — contrôle RLS distant :** exporter les politiques, grants, fonctions, triggers,
   vues et réglages Storage/Auth; exécuter des scénarios par rôle et entre deux organisations.
2. **Élevée — réconciliation de l’historique de migrations :** comparer
   `supabase_migrations.schema_migrations` aux 28 fichiers versionnés avant tout
   `supabase db push`.
3. **Élevée — validation métier :** tester ventes, paiements et dépôts en double, stock
   simultané, synchronisation interrompue, caisse journalière et restauration dans un
   environnement de test.
4. **Moyenne — assurance front-end :** revue complète des rendus HTML issus de données,
   tests navigateur responsive/accessibilité, contrôle des en-têtes réellement servis.
5. **Moyenne — gouvernance :** historique Git fiable en place depuis le 18 novembre 2026
   (dépôt `christophechibembe/KaPya-ERP`, étiquettes `v1.45.9` à `v1.45.11`, instantané
   d’audit conservé sous l’étiquette `archive-github-2026-10-18`).


## Contrôles effectués et limites

- Tests Node : 8 réussis après correction; vérification syntaxique et génération de l’aperçu autonome réussies.
- Pas de lint, TypeScript, intégration, E2E ou tests navigateur fournis dans le dépôt.
- Aucun accès Supabase distant, aucune migration appliquée et aucun test de données de production.
- Aucun déploiement ni changement de données effectué.

## Conditions de feu vert

Ne pas publier les migrations avant résolution des collisions et revue de l’historique distant. Exiger une sauvegarde vérifiée, des tests RLS multi-organisation, des scénarios métier sur données synthétiques, une prévisualisation HTTPS et un plan de retour arrière applicatif et base de données. Cette revue statique ne permet pas de déclarer l’application sûre à 100 %.
