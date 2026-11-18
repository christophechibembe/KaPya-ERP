-- KaPya ERP — politiques RLS de production absentes du SQL versionné.
-- Généré le 2026-11-18 08:55 depuis sql/exports/2026-11-18/03-politiques.sql.
--
-- Ces politiques existent DÉJÀ en production : ce fichier sert à versionner leur
-- définition exacte, à la relire et à reconstruire un projet de test. Il n'est pas
-- appliqué automatiquement. Chaque bloc est rejouable (drop if exists puis create).
-- Toute modification doit passer par une migration datée, jamais par ce fichier.

-- app_errors · app_errors_insert (insert, authenticated)
drop policy if exists app_errors_insert on public.app_errors;
create policy app_errors_insert on public.app_errors
  as permissive
  for insert
  to authenticated
  
  with check ((user_id = auth.uid()));

-- app_errors · app_errors_read (select, authenticated)
drop policy if exists app_errors_read on public.app_errors;
create policy app_errors_read on public.app_errors
  as permissive
  for select
  to authenticated
  using (is_platform_admin())
  ;

-- auto_backups · auto_backups_read (select, authenticated)
drop policy if exists auto_backups_read on public.auto_backups;
create policy auto_backups_read on public.auto_backups
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- cash_closures_shop · cash_closures_shop_r (select, authenticated)
drop policy if exists cash_closures_shop_r on public.cash_closures_shop;
create policy cash_closures_shop_r on public.cash_closures_shop
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- commercial_accounts · commercial_platform_only (all, authenticated)
drop policy if exists commercial_platform_only on public.commercial_accounts;
create policy commercial_platform_only on public.commercial_accounts
  as permissive
  for all
  to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));

-- commercial_documents · documents_admin (select, authenticated)
drop policy if exists documents_admin on public.commercial_documents;
create policy documents_admin on public.commercial_documents
  as permissive
  for select
  to authenticated
  using (is_platform_admin())
  ;

-- commercial_dues · commercial_dues_platform (select, authenticated)
drop policy if exists commercial_dues_platform on public.commercial_dues;
create policy commercial_dues_platform on public.commercial_dues
  as permissive
  for select
  to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  ;

-- commercial_payments · commercial_payments_platform (select, authenticated)
drop policy if exists commercial_payments_platform on public.commercial_payments;
create policy commercial_payments_platform on public.commercial_payments
  as permissive
  for select
  to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  ;

-- commercial_resellers · resellers_insert (insert, authenticated)
drop policy if exists resellers_insert on public.commercial_resellers;
create policy resellers_insert on public.commercial_resellers
  as permissive
  for insert
  to authenticated
  
  with check (is_platform_admin());

-- commercial_resellers · resellers_read (select, authenticated)
drop policy if exists resellers_read on public.commercial_resellers;
create policy resellers_read on public.commercial_resellers
  as permissive
  for select
  to authenticated
  using ((is_platform_admin() OR ((user_id = auth.uid()) AND active)))
  ;

-- commercial_resellers · resellers_update (update, authenticated)
drop policy if exists resellers_update on public.commercial_resellers;
create policy resellers_update on public.commercial_resellers
  as permissive
  for update
  to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

-- commercial_seller · seller_admin (all, authenticated)
drop policy if exists seller_admin on public.commercial_seller;
create policy seller_admin on public.commercial_seller
  as permissive
  for all
  to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

-- credit_note_lines · credit_note_lines_r (select, authenticated)
drop policy if exists credit_note_lines_r on public.credit_note_lines;
create policy credit_note_lines_r on public.credit_note_lines
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM credit_notes c
  WHERE (c.id = credit_note_lines.credit_note_id)))))
  ;

-- credit_notes · credit_notes_r (select, authenticated)
drop policy if exists credit_notes_r on public.credit_notes;
create policy credit_notes_r on public.credit_notes
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM sales s
  WHERE (s.id = credit_notes.sale_id)))))
  ;

-- customer_deposit_counters · customer_deposit_counters_read (select, authenticated)
drop policy if exists customer_deposit_counters_read on public.customer_deposit_counters;
create policy customer_deposit_counters_read on public.customer_deposit_counters
  as permissive
  for select
  to authenticated
  using ((org_id = my_org()))
  ;

-- customer_return_lines · customer_return_lines_r (select, authenticated)
drop policy if exists customer_return_lines_r on public.customer_return_lines;
create policy customer_return_lines_r on public.customer_return_lines
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM customer_returns r
  WHERE (r.id = customer_return_lines.return_id)))))
  ;

-- customer_returns · customer_returns_r (select, authenticated)
drop policy if exists customer_returns_r on public.customer_returns;
create policy customer_returns_r on public.customer_returns
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- customer_setup · setup_read (select, authenticated)
drop policy if exists setup_read on public.customer_setup;
create policy setup_read on public.customer_setup
  as permissive
  for select
  to authenticated
  using ((is_platform_admin() OR (id = customer_org())))
  ;

-- dashboard_preferences · dashboard_preferences_own (all, authenticated)
drop policy if exists dashboard_preferences_own on public.dashboard_preferences;
create policy dashboard_preferences_own on public.dashboard_preferences
  as permissive
  for all
  to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

-- invoice_counters · invoice_counters_read (select, authenticated)
drop policy if exists invoice_counters_read on public.invoice_counters;
create policy invoice_counters_read on public.invoice_counters
  as permissive
  for select
  to authenticated
  using ((org_id = my_org()))
  ;

-- number_ranges · number_ranges_org (all, authenticated)
drop policy if exists number_ranges_org on public.number_ranges;
create policy number_ranges_org on public.number_ranges
  as permissive
  for all
  to authenticated
  using ((org_id = my_org()))
  with check ((org_id = my_org()));

-- paiements_abonnement · pay_insert (insert, authenticated)
drop policy if exists pay_insert on public.paiements_abonnement;
create policy pay_insert on public.paiements_abonnement
  as permissive
  for insert
  to authenticated
  
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));

-- paiements_abonnement · pay_read_own (select, authenticated)
drop policy if exists pay_read_own on public.paiements_abonnement;
create policy pay_read_own on public.paiements_abonnement
  as permissive
  for select
  to authenticated
  using ((org_id = my_org()))
  ;

-- platform_admins · platform_admins_select (select, authenticated)
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  as permissive
  for select
  to authenticated
  using (is_platform_admin())
  ;

-- platform_audit · platform_audit_read (select, authenticated)
drop policy if exists platform_audit_read on public.platform_audit;
create policy platform_audit_read on public.platform_audit
  as permissive
  for select
  to authenticated
  using (is_platform_admin())
  ;

-- proforma_lines · proforma_lines_r (select, authenticated)
drop policy if exists proforma_lines_r on public.proforma_lines;
create policy proforma_lines_r on public.proforma_lines
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM proformas p
  WHERE (p.id = proforma_lines.proforma_id)))))
  ;

-- proformas · proformas_r (select, authenticated)
drop policy if exists proformas_r on public.proformas;
create policy proformas_r on public.proformas
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- purchase_order_lines · purchase_order_lines_r (select, authenticated)
drop policy if exists purchase_order_lines_r on public.purchase_order_lines;
create policy purchase_order_lines_r on public.purchase_order_lines
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM purchase_orders o
  WHERE (o.id = purchase_order_lines.order_id)))))
  ;

-- purchase_orders · purchase_orders_r (select, authenticated)
drop policy if exists purchase_orders_r on public.purchase_orders;
create policy purchase_orders_r on public.purchase_orders
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptable'::text, 'user'::text]))))
  ;

-- push_subscriptions · push_own (all, authenticated)
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  as permissive
  for all
  to authenticated
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND (org_id = my_org())));

-- reseller_clients · reseller_clients_insert (insert, authenticated)
drop policy if exists reseller_clients_insert on public.reseller_clients;
create policy reseller_clients_insert on public.reseller_clients
  as permissive
  for insert
  to authenticated
  
  with check (is_platform_admin());

-- reseller_clients · reseller_clients_read (select, authenticated)
drop policy if exists reseller_clients_read on public.reseller_clients;
create policy reseller_clients_read on public.reseller_clients
  as permissive
  for select
  to authenticated
  using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM commercial_resellers r
  WHERE ((r.id = reseller_clients.reseller_id) AND (r.user_id = auth.uid()) AND r.active)))))
  ;

-- reseller_clients · reseller_clients_update (update, authenticated)
drop policy if exists reseller_clients_update on public.reseller_clients;
create policy reseller_clients_update on public.reseller_clients
  as permissive
  for update
  to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

-- reseller_commissions · commissions_read (select, authenticated)
drop policy if exists commissions_read on public.reseller_commissions;
create policy commissions_read on public.reseller_commissions
  as permissive
  for select
  to authenticated
  using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM commercial_resellers r
  WHERE ((r.id = reseller_commissions.reseller_id) AND (r.user_id = auth.uid()) AND r.active)))))
  ;

-- sales_prospects · prospects_admin (all, authenticated)
drop policy if exists prospects_admin on public.sales_prospects;
create policy prospects_admin on public.sales_prospects
  as permissive
  for all
  to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

-- stock_lots · stock_lots_r (select, authenticated)
drop policy if exists stock_lots_r on public.stock_lots;
create policy stock_lots_r on public.stock_lots
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- supplier_return_lines · supplier_return_lines_r (select, authenticated)
drop policy if exists supplier_return_lines_r on public.supplier_return_lines;
create policy supplier_return_lines_r on public.supplier_return_lines
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM supplier_returns r
  WHERE (r.id = supplier_return_lines.return_id)))))
  ;

-- supplier_returns · supplier_returns_r (select, authenticated)
drop policy if exists supplier_returns_r on public.supplier_returns;
create policy supplier_returns_r on public.supplier_returns
  as permissive
  for select
  to authenticated
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptable'::text]))))
  ;

-- support_messages · messages_read (select, authenticated)
drop policy if exists messages_read on public.support_messages;
create policy messages_read on public.support_messages
  as permissive
  for select
  to authenticated
  using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND (t.org_id = customer_org()))))))
  ;

-- support_tickets · tickets_read (select, authenticated)
drop policy if exists tickets_read on public.support_tickets;
create policy tickets_read on public.support_tickets
  as permissive
  for select
  to authenticated
  using ((is_platform_admin() OR (org_id = customer_org())))
  ;

-- unit_options · unit_options_delete (delete, authenticated)
drop policy if exists unit_options_delete on public.unit_options;
create policy unit_options_delete on public.unit_options
  as permissive
  for delete
  to authenticated
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- unit_options · unit_options_insert (insert, authenticated)
drop policy if exists unit_options_insert on public.unit_options;
create policy unit_options_insert on public.unit_options
  as permissive
  for insert
  to authenticated
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text]))));

-- unit_options · unit_options_select (select, authenticated)
drop policy if exists unit_options_select on public.unit_options;
create policy unit_options_select on public.unit_options
  as permissive
  for select
  to authenticated
  using ((org_id = my_org()))
  ;

-- user_warehouses · user_warehouses_r (select, authenticated)
drop policy if exists user_warehouses_r on public.user_warehouses;
create policy user_warehouses_r on public.user_warehouses
  as permissive
  for select
  to authenticated
  using (((user_id = auth.uid()) OR ((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text])))))
  ;

-- user_warehouses · user_warehouses_w (all, authenticated)
drop policy if exists user_warehouses_w on public.user_warehouses;
create policy user_warehouses_w on public.user_warehouses
  as permissive
  for all
  to authenticated
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));

-- worker_payments · worker_payments_admin (all, authenticated)
drop policy if exists worker_payments_admin on public.worker_payments;
create policy worker_payments_admin on public.worker_payments
  as permissive
  for all
  to authenticated
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));

-- workers · workers_admin (all, authenticated)
drop policy if exists workers_admin on public.workers;
create policy workers_admin on public.workers
  as permissive
  for all
  to authenticated
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));
