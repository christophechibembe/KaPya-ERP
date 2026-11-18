# Audit de la production — 18 novembre 2026

Première comparaison entre la base Supabase réelle et le SQL versionné, faite en
**lecture seule** via l'API de gestion Supabase (`select` uniquement). Aucune table,
fonction, politique ou donnée n'a été modifiée.

- Projet : `ttplxlobehmwzfnxviej` (région `eu-west-1`, état `ACTIVE_HEALTHY`).
- Export complet : `sql/exports/2026-11-18/`.
- Schéma de référence généré : `sql/schema-production.sql`.

## Ce que contient réellement la base

| Objet | Production | SQL versionné avant cet audit |
| --- | --- | --- |
| Tables | 64 | 28 |
| Fonctions | 118 (107 `SECURITY DEFINER`) | 43 |
| Politiques RLS | 108 | 61 (hors boucle dynamique) |
| Triggers | 41 | — |
| Index | 28 | — |
| Tables sans RLS | 0 | 0 |

La production est donc **plus avancée** que le dossier SQL : proformas, avoirs, retours,
lots, bons de commande, personnel, commercial, support, abonnements, sauvegardes
automatiques y existent, mais n'étaient pas versionnés. C'est l'inverse du constat de
l'audit d'octobre : ce n'est pas la base qui est incomplète, c'est le dépôt.

## Point bloquant découvert : l'inventaire physique ne fonctionne pas

L'interface existe (`Paramètres → Inventaire physique`) et est documentée dans le guide,
mais elle appelle des objets **absents de la production** :

- tables `inventories`, `inventory_lines` ;
- RPC `create_inventory`, `set_inventory_count`, `validate_inventory`.

Le code masque l'erreur de lecture (`catch(() => [])`), donc l'écran s'ouvre normalement,
puis affiche « Impossible : … » au premier clic. Deux autres appels n'existent pas non plus :
`set_barcode_enabled` (réglage du code-barres).

Vérifié par requête : aucune fonction dont le nom contient `invent`, `inventory` ou `barcode`,
sauf `find_article_by_barcode`. Le test `tests/schema-production.test.mjs` échouera si un
nouvel appel de ce type apparaît ; ces cinq entrées sont explicitement listées comme
« à implémenter ».

## Sécurité

- **Aucune table sans RLS** (64/64), aucune table sans politique sauf `document_counters`,
  fermée volontairement (accès uniquement par une RPC `SECURITY DEFINER`).
- **Aucune fonction `SECURITY DEFINER` sans `search_path`** (107/107).
- **14 fonctions `SECURITY DEFINER` exécutables par `anon`** : elles héritent du droit
  `PUBLIC` par défaut. Toutes vérifient `auth.uid()` ou le rôle en interne, donc un appel
  anonyme échoue — mais le droit devrait être fermé. Proposition prête, non appliquée :
  `sql/exports/2026-11-18/11-durcissement-propose.sql`.
- **Aucune politique Storage** : le stockage n'est pas utilisé par l'application
  (les logos sont stockés en base). À confirmer si une fonctionnalité d'import d'images
  est ajoutée.
- **Une tâche planifiée** (`pg_cron`) : sauvegardes automatiques quotidiennes.

## Ce qui reste à faire

1. **Décider du sort de l'inventaire physique** : l'implémenter côté base (deux tables,
   trois RPC, RLS, tests) ou retirer l'écran et la section du guide en attendant.
2. **Appliquer ou non le durcissement des droits** `anon` après relecture.
3. **Comparer les politiques RLS** une à une avec les intentions métier : 47 politiques
   de production n'ont pas d'équivalent versionné. Elles sont désormais dans l'export.
4. **Obtenir un dump officiel** (`supabase db dump`, qui demande le mot de passe de la base)
   si l'on veut une restauration garantie ; `sql/schema-production.sql` est une
   reconstruction fidèle mais non testée en restauration.
5. Tests fonctionnels sur un projet de test : ventes, crédits, clôtures, restauration.

## Méthode

- `scripts/exporter-supabase.mjs` : export complet daté dans `sql/exports/`.
- `scripts/generer-schema.mjs` : reconstruit `sql/schema-production.sql` depuis le catalogue.
- `scripts/requete-supabase.mjs` : exécute une requête `select`/`with` isolée.
- Jeton lu dans `%USERPROFILE%\.kapya\supabase-token.txt`, jamais dans le dépôt.
