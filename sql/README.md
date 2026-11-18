# Schéma de la base

Le code de KaPya ERP appelle **39 tables** et **62 fonctions RPC** Supabase.
La liste à jour est dans [`SCHEMA.md`](./SCHEMA.md), régénérée avec :

```powershell
npm.cmd run inventaire
```

## Pourquoi ce dossier est important

Sans le schéma versionné, il est impossible de :

- recréer la base sur un nouveau projet Supabase ;
- revenir en arrière après une migration ratée ;
- vérifier que les politiques RLS protègent bien chaque entreprise ;
- installer la base sur un poste de test.

## Exporter le schéma réel (à faire une fois, puis à chaque changement)

Dans **Supabase → SQL Editor**, exécuter et enregistrer le résultat dans `sql/` :

```sql
-- 1. Tables, colonnes, contraintes et index
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 2. Politiques RLS (le plus important pour la sécurité)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Fonctions et triggers
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- 4. Planifications (sauvegardes automatiques, rappels)
select jobid, schedule, command, active from cron.job;
```

Enregistrer chaque export dans `sql/exports/`, avec la date de l'export dans le nom
(par exemple `20261118-tables.sql`, `20261118-rls.sql`). Ces fichiers datés servent de
photographie de la base ; `sql/schema.sql` reste la référence versionnée du schéma.

## Reconstruire un projet de test

[`schema-production.sql`](./schema-production.sql) est la photographie exécutable de la
production : 66 tables, 122 fonctions, 110 politiques, dans l'ordre où elles doivent être
créées (tables, fonctions, valeurs par défaut, contraintes, index, triggers, RLS,
politiques, droits).

```powershell
# Sur un projet Supabase de test, jamais sur la production existante :
psql "postgresql://postgres:<mot-de-passe>@db.<ref>.supabase.co:5432/postgres" ^
     -v ON_ERROR_STOP=1 -f sql/schema-production.sql

# Puis les données, si l'on veut partir d'une copie :
# supabase db dump --data-only -f donnees.sql
```

Le fichier n'est **jamais** exécuté sur la production : les objets y existent déjà.
Il sert à ouvrir un projet de test, à comparer deux bases et à préparer une restauration.
`tests/schema-rebuild.test.mjs` vérifie que l'ordre des dépendances tient (clés étrangères,
valeurs par défaut, triggers, politiques) ; il ne remplace pas une restauration réelle.

## Scripts retrouvés

Les scripts longtemps cités comme absents ont été récupérés depuis le dépôt GitHub
(instantané de l'audit du 18 octobre 2026) et sont désormais versionnés :

- `couts-et-tresorerie.sql` (coûts, dépenses, paiements fournisseurs) ;
- `cloture-caisse.sql` ;
- `depots.sql` ;
- `historique-actions.sql` ;
- `formules.sql` (`public.plan_allows`).

Ces scripts ne couvrent cependant pas toute la base : la production compte 66 tables
et 122 fonctions (18 novembre 2026), contre 28 tables avant l'export du 18 novembre 2026.
Le schéma réel est désormais enregistré dans [`schema-production.sql`](./schema-production.sql),
généré depuis le catalogue Supabase, et l'inventaire complet est dans
[`exports/2026-11-18/`](./exports/2026-11-18/00-synthese.md).

Le dossier `supabase/migrations/` contient en plus les migrations datées, dans
l'ordre d'application, y compris celles du 18 novembre 2026 (inventaire physique et
durcissement des droits `anon`).

## Vérification automatique

`npm test` exécute un audit statique du SQL (`scripts/auditer-sql.mjs`) :

- versions de migration uniques et noms conformes ;
- RLS activée sur chaque table, avec politique ou fermeture volontaire documentée ;
- `SECURITY DEFINER` toujours accompagné de `set search_path` et jamais ouvert à `anon` ;
- scripts cités dans la documentation réellement présents.

Le rapport détaillé se régénère avec `node scripts/auditer-sql.mjs --markdown`
(écrit dans `docs/AUDIT-STATIQUE-SQL.md`).

## Règles

- Ne jamais modifier une table ou une RPC directement dans Supabase sans enregistrer le changement ici.
- Toute nouvelle fonctionnalité qui touche la base ajoute un fichier SQL et met à jour `SCHEMA.md`.
- Les fichiers `.sql` ne sont jamais publiés sur le site (exclus par `scripts/preparer-cloudflare.mjs`).
