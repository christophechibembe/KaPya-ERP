-- Retour arrière du durcissement des droits anon (18 novembre 2026).
-- NON APPLIQUÉ. À exécuter seulement si une fonction doit redevenir accessible
-- au rôle anon. Le droit par défaut de PostgreSQL est PUBLIC.
grant execute on function public.article_total_stock() to public;
grant execute on function public.consume_lots_fefo() to public;
grant execute on function public.create_credit_note(p_sale uuid, p_lines jsonb, p_note text, p_id uuid) to public;
grant execute on function public.create_customer_return(p_sale uuid, p_lines jsonb, p_note text, p_credit boolean, p_id uuid) to public;
grant execute on function public.guard_org_delete() to public;
grant execute on function public.log_org_changes() to public;
grant execute on function public.log_platform_admin_changes() to public;
grant execute on function public.log_profile_changes() to public;
grant execute on function public.mark_welcome_seen() to public;
grant execute on function public.paiements_en_attente() to public;
grant execute on function public.rejeter_paiement(p_id uuid) to public;
grant execute on function public.reserve_invoice_range(p_device text, p_size integer) to public;
grant execute on function public.reserve_number_range(p_kind text, p_prefix text, p_device text, p_size integer) to public;
grant execute on function public.valider_paiement(p_id uuid) to public;

-- Fonctions non SECURITY DEFINER fermées le 18 novembre 2026 par
-- supabase/migrations/20261118000003_fermer_fonctions_anon.sql.
grant execute on function public.bump_record_version() to public;
grant execute on function public.create_transfer(p_from uuid, p_to uuid, p_destination text, p_date date, p_lines jsonb, p_id uuid, p_note text) to public;
grant execute on function public.create_worker(p_name text, p_role text, p_kind text, p_usual numeric) to public;
grant execute on function public.delete_worker(p_worker uuid) to public;
grant execute on function public.freeze_sale_line_cost() to public;
grant execute on function public.record_worker_payment(p_worker uuid, p_amount numeric, p_date date, p_method text, p_note text) to public;
grant execute on function public.search_sales(p_term text, p_limit integer, p_offset integer) to public;
grant execute on function public.touch_updated_at() to public;
