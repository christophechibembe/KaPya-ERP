# Migrations Supabase

Chaque fichier suit `AAAAMMJJHHMMSS_nom.sql`. Les fichiers s'appliquent dans l'ordre
des noms (ordre alphabétique = ordre chronologique).

> **Couverture incomplète.** Ces migrations ne décrivent qu'une partie de la base :
> la production compte 66 tables et 122 fonctions (18 novembre 2026). Le schéma réel est
> enregistré dans `sql/schema-production.sql` et l'inventaire détaillé dans
> `sql/exports/2026-11-18/`. Ne pas reconstruire une base à partir des seules migrations.

## Migrations appliquées manuellement

| Version | Sujet | État |
| --- | --- | --- |
| `20261118000000` | Inventaire physique et réglage du code-barres | appliquée en production le 18 novembre 2026, enregistrée dans `supabase_migrations.schema_migrations` |
| `20261118000001` | Fermeture de l'exécution anonyme des fonctions `SECURITY DEFINER` | appliquée en production le 18 novembre 2026 ; retour arrière dans `sql/exports/2026-11-18/12-retour-arriere-droits.sql` |
| `20261118000002` | Restriction des politiques ouvertes à `public` | appliquée en production le 18 novembre 2026 |
| `20261118000003` | Fermeture des fonctions `public` encore exécutables par `anon` | appliquée en production le 18 novembre 2026 |
| `20261119000000` | Réparation des compteurs de documents et unicité des numéros | appliquée en production le 19 novembre 2026 ; corrige `create_warehouse_transfer` ; rejouée le 19 novembre 2026 sur le projet de test restauré (compteurs et `TRF-00011` conformes) |
| `20261120000000` | Identifiant client dans la liste des crédits (rappels sans mélange des homonymes) | validée sur PostgreSQL isolé restauré (66 tables, 30 crédits identiques hors champ ajouté), appliquée avec `--psql --confirmer` le 20 novembre 2026 ; 30 identifiants sur 30 vérifiés, exécution anonyme toujours interdite |
| `20261122000000` | Comptabilité incluse dans les formules Standard et Premium | appliquée en production le 22 novembre 2026 ; met à jour `plan_allows` avec la fonction `comptabilite` |
| `20261123000000` | Avoirs, retours et TVA historisée (`credit_notes.return_id`, `sales.vat_rate`) | appliquée en production (colonnes vérifiées le 26 novembre 2026) |
| `20261126000000` | Suppression d'un acompte client (`delete_customer_deposit`) | appliquée en production le 26 novembre 2026 après sauvegarde ; droits vérifiés (anon refusé, `authenticated` autorisé, session exigée) |
| `20261128000000` | Entrées de stock par un facturier autorisé (`can_receive_stock`, `create_purchase` en `SECURITY DEFINER`) | appliquée en production le 28 novembre 2026 après sauvegarde ; colonne, fonction, droits et politiques vérifiés |
| `20261128000001` | Ajustement de stock par le facturier autorisé (`stock_moves_i` bornée à son dépôt) | appliquée en production le 28 novembre 2026 après sauvegarde |

Application contrôlée : `node scripts/appliquer-migration.mjs supabase/migrations/<fichier>.sql --confirmer`
(jeton Supabase dans `%USERPROFILE%\.kapya\supabase-token.txt`). Sans jeton `sbp_`, ou avec
`--psql`, le script passe par la connexion PostgreSQL directe de
`%USERPROFILE%\.kapya\db-url.txt`, dans une transaction unique, et enregistre la version
dans `schema_migrations`. Le drapeau `--confirmer` reste obligatoire dans les deux cas.

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
