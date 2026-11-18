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
