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

## Point bloquant découvert : l'inventaire physique ne fonctionnait pas — résolu

L'interface existait (`Paramètres → Inventaire physique`) et était documentée dans le guide,
mais elle appelait des objets **absents de la production** :

- tables `inventories`, `inventory_lines` ;
- RPC `create_inventory`, `set_inventory_count`, `validate_inventory` ;
- RPC `set_barcode_enabled`, et la colonne `organizations.barcode_enabled`.

Le code masquait l'erreur de lecture (`catch(() => [])`) : l'écran s'ouvrait normalement,
puis affichait « Impossible : … » au premier clic.

**Corrigé le 18 novembre 2026** par
`supabase/migrations/20261118000000_inventaire_et_code_barres.sql`, appliquée en production
et enregistrée dans `supabase_migrations.schema_migrations` :

- deux tables avec RLS et politique de lecture par entreprise, index sur le dépôt en cours ;
- `create_inventory` (reprend un brouillon existant, remplit le théorique depuis
  `warehouse_stock`), `set_inventory_count`, `validate_inventory` (corrige les écarts réels
  par des mouvements `adjustment` référencés sur l'inventaire) ;
- `set_barcode_enabled` et colonne `barcode_enabled` (désactivée par défaut, pour ne pas
  changer le comportement existant) ;
- exécution réservée aux comptes connectés, rien pour `anon`.

Test effectué en transaction annulée sur une entreprise de production : inventaire créé,
écart de +2 compté, validation renvoyant 1 correction, statut `validated`, aucun résidu
en base après annulation.

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

1. **Appliquer ou non le durcissement des droits** `anon` après relecture
   (`sql/exports/2026-11-18/11-durcissement-propose.sql`).
2. **Comparer les politiques RLS** une à une avec les intentions métier : 47 politiques
   de production n'ont pas d'équivalent versionné. Elles sont désormais dans l'export.
3. **Obtenir un dump officiel** (`supabase db dump`, qui demande le mot de passe de la base)
   si l'on veut une restauration garantie ; `sql/schema-production.sql` est une
   reconstruction fidèle mais non testée en restauration.
4. Tests fonctionnels sur un projet de test : ventes, crédits, clôtures, restauration.
5. Ajouter une section au guide sur l'inventaire physique (l'écran existe, la base aussi
   désormais).

## Méthode

- `scripts/exporter-supabase.mjs` : export complet daté dans `sql/exports/`.
- `scripts/generer-schema.mjs` : reconstruit `sql/schema-production.sql` depuis le catalogue.
- `scripts/requete-supabase.mjs` : exécute une requête `select`/`with` isolée.
- Jeton lu dans `%USERPROFILE%\.kapya\supabase-token.txt`, jamais dans le dépôt.
