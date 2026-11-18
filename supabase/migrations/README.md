# Migrations Supabase

Chaque fichier suit `AAAAMMJJHHMMSS_nom.sql`. Les fichiers s'appliquent dans l'ordre
des noms (ordre alphabétique = ordre chronologique).

> **Couverture incomplète.** Ces 28 migrations ne décrivent qu'une partie de la base :
> la production compte 64 tables et 118 fonctions (audit du 18 novembre 2026). Le schéma
> réel est enregistré dans `sql/schema-production.sql` et l'inventaire détaillé dans
> `sql/exports/2026-11-18/`. Ne pas reconstruire une base à partir des seules migrations.

## Versions en collision (résolues le 18 novembre 2026)

L'audit du 18 octobre avait relevé deux versions portées par deux fichiers différents.
Elles ont été renumérotées sans modifier une seule ligne de SQL :

| Ancien fichier | Nouveau fichier | Raison |
| --- | --- | --- |
| `20261015000004_taux_historique.sql` | `20261015000006_taux_historique.sql` | partageait la version `20261015000004` avec `equipe_correctif.sql` |
| `20261017000007_cloture_caisse_rate_date.sql` | `20261017000018_cloture_caisse_rate_date.sql` | partageait la version `20261017000007` avec `historique_actions.sql` |

Deux doublons stricts (contenu identique à l'octet) ont été supprimés :
`20261017000011_historique_actions.sql` (identique à la version `…000007`) et
`20261017000013_depots.sql` (identique à la version `…000009`).

## Avant toute application sur une base existante

1. Sauvegarder la base et vérifier la sauvegarde.
2. Comparer l'historique distant :
   ```sql
   select version, name, inserted_at from supabase_migrations.schema_migrations order by version;
   ```
3. Si les anciennes versions y figurent déjà, ne pas rejouer ces fichiers : les scripts
   sont écrits pour être rejouables (`create or replace`, `if not exists`), mais une
   réapplication en masse n'est jamais neutre sur les données.
4. Appliquer dans un projet de test d'abord.

Les fichiers `.sql` ne sont jamais publiés sur le site : `scripts/preparer-cloudflare.mjs`
les exclut du dossier envoyé à Cloudflare Pages.

## Contrôles automatiques

`npm test` vérifie que les versions sont uniques, que les noms sont conformes, que chaque
table a la RLS et que les fonctions `SECURITY DEFINER` fixent `search_path`.
