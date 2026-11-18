# Audit de la production — 18 novembre 2026

Première comparaison entre la base Supabase réelle et le SQL versionné, faite en
**lecture seule** via l'API de gestion Supabase (`select` uniquement) le 18 novembre 2026.
Depuis, deux migrations ont été appliquées (inventaire physique, durcissement des droits) :
les chiffres ci-dessous décrivent l'état au moment de l'audit, les sections suivantes
l'état après correction.

- Projet : `ttplxlobehmwzfnxviej` (région `eu-west-1`, état `ACTIVE_HEALTHY`).
- Export complet : `sql/exports/2026-11-18/`.
- Schéma de référence généré : `sql/schema-production.sql`.

## Ce que contient réellement la base

| Objet | Production (audit) | Production (après migrations) | SQL versionné avant cet audit |
| --- | --- | --- | --- |
| Tables | 64 | 66 | 28 |
| Fonctions | 118 (107 `SECURITY DEFINER`) | 122 (111 `SECURITY DEFINER`) | 43 |
| Politiques RLS | 108 | 110 | 61 (hors boucle dynamique) |
| Triggers | 41 | 41 | — |
| Index | 28 | 30 | — |
| Tables sans RLS | 0 | 0 | 0 |

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

- **Aucune table sans RLS** (66/66), aucune table sans politique sauf `document_counters`,
  fermée volontairement (accès uniquement par une RPC `SECURITY DEFINER`).
- **Aucune fonction `SECURITY DEFINER` sans `search_path`** (111/111).
- **Exécution anonyme fermée le 18 novembre 2026.** Les 14 fonctions `SECURITY DEFINER`
  qui héritaient du droit `PUBLIC` ne sont plus accessibles à `anon` ; elles restent
  exécutables par `authenticated` et `service_role`. Migration
  `20261118000001_durcissement_anon.sql`, retour arrière
  `sql/exports/2026-11-18/12-retour-arriere-droits.sql`. Vérifié après application :
  `has_function_privilege('anon', …)` vaut `false` sur les 14, et le nombre total de
  `SECURITY DEFINER` exécutables par `anon` est passé de 14 à 0.
- **Aucune politique Storage** : le stockage n'est pas utilisé par l'application
  (les logos sont stockés en base). À confirmer si une fonctionnalité d'import d'images
  est ajoutée.
- **Une tâche planifiée** (`pg_cron`) : sauvegardes automatiques quotidiennes.

## Bénéfice : dépenses désormais déduites

Le tableau de bord et le rapport « Produits et marges » parlaient de « bénéfice net »
sans déduire les dépenses saisies dans Caisse. Corrigé :

- tableau de bord : nouvelle carte **Résultat net** = bénéfice brut − dépenses de la période,
  à côté de la carte « Bénéfice brut » ;
- rapport « Produits et marges » : le tableau « Du chiffre d'affaires au résultat net »
  détaille désormais bénéfice brut, dépenses, puis résultat net ; l'évolution et le
  pourcentage du CA portent sur ce résultat ;
- test navigateur : une dépense de 5 $ sur 25 $ de ventes fait passer le résultat net à 20 $.

Les achats de marchandises ne sont pas comptés deux fois : ils passent par le coût des
articles vendus, pas par les dépenses.

## Ce qui reste à faire

1. **Comparer les politiques RLS** — fait le 18 novembre 2026 : les 47 politiques de
   production sans équivalent versionné sont dans `sql/politiques-production.sql`, avec
   une relecture et les 7 politiques ouvertes à `public` dans
   `sql/exports/2026-11-18/13-politiques-publiques-propose.sql`. Détail :
   `docs/POLITIQUES-RLS.md`. Reste à décider d'appliquer ou non la proposition.
2. **Obtenir un dump officiel** (`supabase db dump`, qui demande le mot de passe de la base)
   si l'on veut une restauration garantie. `sql/schema-production.sql` est exécutable sur
   un projet vide et vérifié par `tests/schema-rebuild.test.mjs`, mais n'a pas encore été
   rejoué sur un vrai projet de test.
3. **Tests fonctionnels sur un projet de test** : ventes, crédits, clôtures, restauration.
4. **Traduction anglaise** — fait le 18 novembre 2026 : 1 601 textes sur 1 601 sont
   traduits (100 %), y compris le guide et la page de confidentialité, qui chargent
   désormais le moteur de traduction. Le rendu anglais est vérifié dans Chromium
   (`tests/guide.browser.test.mjs`). Seul le chemin technique `/app` reste tel quel.
   Suivi : `docs/TRADUCTION.md` (`npm.cmd run audit:i18n`).

## Méthode

- `scripts/exporter-supabase.mjs` : export complet daté dans `sql/exports/`.
- `scripts/generer-schema.mjs` : reconstruit `sql/schema-production.sql` depuis le catalogue.
- `scripts/requete-supabase.mjs` : exécute une requête `select`/`with` isolée.
- `scripts/appliquer-migration.mjs` : applique une migration, avec `--confirmer`.
- `scripts/audit-i18n.mjs` : mesure la couverture de la traduction anglaise.
- Jeton lu dans `%USERPROFILE%\.kapya\supabase-token.txt`, jamais dans le dépôt.
