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

Enregistrer ensuite les exports avec un préfixe d'ordre :

```
sql/001-tables.sql
sql/002-fonctions.sql
sql/003-rls.sql
sql/004-planifications.sql
```

## Scripts cités par le code mais absents

- `couts-et-tresorerie.sql` (coûts, dépenses, paiements fournisseurs)
- `cloture-caisse.sql`
- `depots.sql`
- `historique-actions.sql`
- `formules.sql` (`public.plan_allows`)

Ils doivent être retrouvés ou réécrits avant toute nouvelle installation.

## Règles

- Ne jamais modifier une table ou une RPC directement dans Supabase sans enregistrer le changement ici.
- Toute nouvelle fonctionnalité qui touche la base ajoute un fichier SQL et met à jour `SCHEMA.md`.
- Les fichiers `.sql` ne sont jamais publiés sur le site (exclus par `scripts/preparer-cloudflare.mjs`).
