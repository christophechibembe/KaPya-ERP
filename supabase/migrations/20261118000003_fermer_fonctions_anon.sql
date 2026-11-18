-- KaPya ERP — ferme l'exécution anonyme des 8 fonctions restantes.
--
-- Ces fonctions n'étaient pas `SECURITY DEFINER` : elles s'exécutent avec les droits
-- de l'appelant et RLS s'applique donc normalement. `anon` ne pouvait rien lire ni
-- écrire (`auth.uid()` et `my_org()` renvoient null sans session), mais le droit
-- d'exécution lui-même n'avait pas à rester ouvert.
--
-- Rejouable : revoke puis grant à authenticated. service_role conserve ses propres
-- droits ; les 4 fonctions déclencheurs ne consultent pas EXECUTE.
-- Retour arrière : sql/exports/2026-11-18/12-retour-arriere-droits.sql.

revoke all on function public.bump_record_version() from public, anon;
grant execute on function public.bump_record_version() to authenticated;

revoke all on function public.create_transfer(p_from uuid, p_to uuid, p_destination text, p_date date, p_lines jsonb, p_id uuid, p_note text) from public, anon;
grant execute on function public.create_transfer(p_from uuid, p_to uuid, p_destination text, p_date date, p_lines jsonb, p_id uuid, p_note text) to authenticated;

revoke all on function public.create_worker(p_name text, p_role text, p_kind text, p_usual numeric) from public, anon;
grant execute on function public.create_worker(p_name text, p_role text, p_kind text, p_usual numeric) to authenticated;

revoke all on function public.delete_worker(p_worker uuid) from public, anon;
grant execute on function public.delete_worker(p_worker uuid) to authenticated;

revoke all on function public.freeze_sale_line_cost() from public, anon;
grant execute on function public.freeze_sale_line_cost() to authenticated;

revoke all on function public.record_worker_payment(p_worker uuid, p_amount numeric, p_date date, p_method text, p_note text) from public, anon;
grant execute on function public.record_worker_payment(p_worker uuid, p_amount numeric, p_date date, p_method text, p_note text) to authenticated;

revoke all on function public.search_sales(p_term text, p_limit integer, p_offset integer) from public, anon;
grant execute on function public.search_sales(p_term text, p_limit integer, p_offset integer) to authenticated;

revoke all on function public.touch_updated_at() from public, anon;
grant execute on function public.touch_updated_at() to authenticated;
