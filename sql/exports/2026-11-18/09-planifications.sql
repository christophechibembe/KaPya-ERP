-- KaPya ERP — export de production (lecture seule)
-- Projet Supabase : ttplxlobehmwzfnxviej
-- Export : 2026-11-18 07:16
-- Généré par scripts/exporter-supabase.mjs. Ne contient aucun secret.
-- job 1 (actif) 0 2 * * *
select public.run_daily_backups();;
