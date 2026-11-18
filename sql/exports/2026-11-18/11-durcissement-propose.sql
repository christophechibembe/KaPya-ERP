-- KaPya ERP — export de production (lecture seule)
-- Projet Supabase : ttplxlobehmwzfnxviej
-- Export : 2026-11-18 07:16
-- Généré par scripts/exporter-supabase.mjs. Ne contient aucun secret.

-- PROPOSITION — fichier non appliqué.
-- Les fonctions SECURITY DEFINER ci-dessous sont exécutables par le rôle anon
-- parce qu'elles héritent du droit PUBLIC par défaut. Elles vérifient toutes
-- auth.uid() ou le rôle en interne, mais il vaut mieux fermer l'accès public
-- et n'autoriser que les comptes connectés.
-- À relire, tester sur un projet de test, puis appliquer en une transaction.

revoke all on function public.article_total_stock() from public, anon;
grant execute on function public.article_total_stock() to authenticated;

revoke all on function public.consume_lots_fefo() from public, anon;
grant execute on function public.consume_lots_fefo() to authenticated;

revoke all on function public.create_credit_note(p_sale uuid, p_lines jsonb, p_note text, p_id uuid) from public, anon;
grant execute on function public.create_credit_note(p_sale uuid, p_lines jsonb, p_note text, p_id uuid) to authenticated;

revoke all on function public.create_customer_return(p_sale uuid, p_lines jsonb, p_note text, p_credit boolean, p_id uuid) from public, anon;
grant execute on function public.create_customer_return(p_sale uuid, p_lines jsonb, p_note text, p_credit boolean, p_id uuid) to authenticated;

revoke all on function public.guard_org_delete() from public, anon;
grant execute on function public.guard_org_delete() to authenticated;

revoke all on function public.log_org_changes() from public, anon;
grant execute on function public.log_org_changes() to authenticated;

revoke all on function public.log_platform_admin_changes() from public, anon;
grant execute on function public.log_platform_admin_changes() to authenticated;

revoke all on function public.log_profile_changes() from public, anon;
grant execute on function public.log_profile_changes() to authenticated;

revoke all on function public.mark_welcome_seen() from public, anon;
grant execute on function public.mark_welcome_seen() to authenticated;

revoke all on function public.paiements_en_attente() from public, anon;
grant execute on function public.paiements_en_attente() to authenticated;

revoke all on function public.rejeter_paiement(p_id uuid) from public, anon;
grant execute on function public.rejeter_paiement(p_id uuid) to authenticated;

revoke all on function public.reserve_invoice_range(p_device text, p_size integer) from public, anon;
grant execute on function public.reserve_invoice_range(p_device text, p_size integer) to authenticated;

revoke all on function public.reserve_number_range(p_kind text, p_prefix text, p_device text, p_size integer) from public, anon;
grant execute on function public.reserve_number_range(p_kind text, p_prefix text, p_device text, p_size integer) to authenticated;

revoke all on function public.valider_paiement(p_id uuid) from public, anon;
grant execute on function public.valider_paiement(p_id uuid) to authenticated;
