-- KaPya ERP — export de production (lecture seule)
-- Projet Supabase : ttplxlobehmwzfnxviej
-- Export : 2026-11-18 08:57
-- Généré par scripts/exporter-supabase.mjs. Ne contient aucun secret.

-- app_errors · app_errors_insert (INSERT, PERMISSIVE)
create policy app_errors_insert on public.app_errors
  as permissive
  for insert
  to {authenticated}
  
  with check ((user_id = auth.uid()));

-- app_errors · app_errors_read (SELECT, PERMISSIVE)
create policy app_errors_read on public.app_errors
  as permissive
  for select
  to {authenticated}
  using (is_platform_admin())
  ;

-- articles · articles_d (DELETE, PERMISSIVE)
create policy articles_d on public.articles
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- articles · articles_i (INSERT, PERMISSIVE)
create policy articles_i on public.articles
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))));

-- articles · articles_r (SELECT, PERMISSIVE)
create policy articles_r on public.articles
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- articles · articles_u (UPDATE, PERMISSIVE)
create policy articles_u on public.articles
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- audit_log · audit_log_read (SELECT, PERMISSIVE)
create policy audit_log_read on public.audit_log
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text])) AND plan_allows('historique'::text)))
  ;

-- auto_backups · auto_backups_read (SELECT, PERMISSIVE)
create policy auto_backups_read on public.auto_backups
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- business_expenses · business_expenses_r (SELECT, PERMISSIVE)
create policy business_expenses_r on public.business_expenses
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- cash_closures · cash_closures_read (SELECT, PERMISSIVE)
create policy cash_closures_read on public.cash_closures
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptable'::text]))))
  ;

-- cash_closures_shop · cash_closures_shop_r (SELECT, PERMISSIVE)
create policy cash_closures_shop_r on public.cash_closures_shop
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- commercial_accounts · commercial_platform_only (ALL, PERMISSIVE)
create policy commercial_platform_only on public.commercial_accounts
  as permissive
  for all
  to {authenticated}
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));

-- commercial_documents · documents_admin (SELECT, PERMISSIVE)
create policy documents_admin on public.commercial_documents
  as permissive
  for select
  to {authenticated}
  using (is_platform_admin())
  ;

-- commercial_dues · commercial_dues_platform (SELECT, PERMISSIVE)
create policy commercial_dues_platform on public.commercial_dues
  as permissive
  for select
  to {authenticated}
  using (( SELECT is_platform_admin() AS is_platform_admin))
  ;

-- commercial_payments · commercial_payments_platform (SELECT, PERMISSIVE)
create policy commercial_payments_platform on public.commercial_payments
  as permissive
  for select
  to {authenticated}
  using (( SELECT is_platform_admin() AS is_platform_admin))
  ;

-- commercial_resellers · resellers_insert (INSERT, PERMISSIVE)
create policy resellers_insert on public.commercial_resellers
  as permissive
  for insert
  to {authenticated}
  
  with check (is_platform_admin());

-- commercial_resellers · resellers_read (SELECT, PERMISSIVE)
create policy resellers_read on public.commercial_resellers
  as permissive
  for select
  to {authenticated}
  using ((is_platform_admin() OR ((user_id = auth.uid()) AND active)))
  ;

-- commercial_resellers · resellers_update (UPDATE, PERMISSIVE)
create policy resellers_update on public.commercial_resellers
  as permissive
  for update
  to {authenticated}
  using (is_platform_admin())
  with check (is_platform_admin());

-- commercial_seller · seller_admin (ALL, PERMISSIVE)
create policy seller_admin on public.commercial_seller
  as permissive
  for all
  to {authenticated}
  using (is_platform_admin())
  with check (is_platform_admin());

-- company_codes · company_codes_i (INSERT, PERMISSIVE)
create policy company_codes_i on public.company_codes
  as permissive
  for insert
  to {authenticated}
  
  with check (is_platform_admin());

-- company_codes · company_codes_r (SELECT, PERMISSIVE)
create policy company_codes_r on public.company_codes
  as permissive
  for select
  to {authenticated}
  using (is_platform_admin())
  ;

-- credit_note_lines · credit_note_lines_r (SELECT, PERMISSIVE)
create policy credit_note_lines_r on public.credit_note_lines
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM credit_notes c
  WHERE (c.id = credit_note_lines.credit_note_id)))))
  ;

-- credit_notes · credit_notes_r (SELECT, PERMISSIVE)
create policy credit_notes_r on public.credit_notes
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM sales s
  WHERE (s.id = credit_notes.sale_id)))))
  ;

-- customer_deposit_counters · customer_deposit_counters_read (SELECT, PERMISSIVE)
create policy customer_deposit_counters_read on public.customer_deposit_counters
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- customer_deposits · customer_deposits_r (SELECT, PERMISSIVE)
create policy customer_deposits_r on public.customer_deposits
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- customer_return_lines · customer_return_lines_r (SELECT, PERMISSIVE)
create policy customer_return_lines_r on public.customer_return_lines
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM customer_returns r
  WHERE (r.id = customer_return_lines.return_id)))))
  ;

-- customer_returns · customer_returns_r (SELECT, PERMISSIVE)
create policy customer_returns_r on public.customer_returns
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- customer_setup · setup_read (SELECT, PERMISSIVE)
create policy setup_read on public.customer_setup
  as permissive
  for select
  to {authenticated}
  using ((is_platform_admin() OR (id = customer_org())))
  ;

-- customers · customers_d (DELETE, PERMISSIVE)
create policy customers_d on public.customers
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- customers · customers_i (INSERT, PERMISSIVE)
create policy customers_i on public.customers
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text]))));

-- customers · customers_r (SELECT, PERMISSIVE)
create policy customers_r on public.customers
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- customers · customers_u (UPDATE, PERMISSIVE)
create policy customers_u on public.customers
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text]))))
  ;

-- dashboard_preferences · dashboard_preferences_own (ALL, PERMISSIVE)
create policy dashboard_preferences_own on public.dashboard_preferences
  as permissive
  for all
  to {authenticated}
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

-- inventories · inventories_r (SELECT, PERMISSIVE)
create policy inventories_r on public.inventories
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- inventory_lines · inventory_lines_r (SELECT, PERMISSIVE)
create policy inventory_lines_r on public.inventory_lines
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- invitations · invitations_d (DELETE, PERMISSIVE)
create policy invitations_d on public.invitations
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- invitations · invitations_i (INSERT, PERMISSIVE)
create policy invitations_i on public.invitations
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text) AND (role = ANY (ARRAY['manager'::text, 'facturier'::text, 'comptable'::text, 'user'::text])) AND (( SELECT count(*) AS count
   FROM profiles p
  WHERE (p.org_id = my_org())) < plan_max_users())));

-- invitations · invitations_r (SELECT, PERMISSIVE)
create policy invitations_r on public.invitations
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- invoice_counters · invoice_counters_read (SELECT, PERMISSIVE)
create policy invoice_counters_read on public.invoice_counters
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- number_ranges · number_ranges_org (ALL, PERMISSIVE)
create policy number_ranges_org on public.number_ranges
  as permissive
  for all
  to {authenticated}
  using ((org_id = my_org()))
  with check ((org_id = my_org()));

-- organizations · organizations_pa (SELECT, PERMISSIVE)
create policy organizations_pa on public.organizations
  as permissive
  for select
  to {authenticated}
  using (is_platform_admin())
  ;

-- organizations · organizations_pu (UPDATE, PERMISSIVE)
create policy organizations_pu on public.organizations
  as permissive
  for update
  to {authenticated}
  using (is_platform_admin())
  with check (true);

-- organizations · organizations_r (SELECT, PERMISSIVE)
create policy organizations_r on public.organizations
  as permissive
  for select
  to {authenticated}
  using ((id = my_org()))
  ;

-- organizations · organizations_u (UPDATE, PERMISSIVE)
create policy organizations_u on public.organizations
  as permissive
  for update
  to {authenticated}
  using (((id = my_org()) AND (my_role() = 'admin'::text)))
  with check ((id = my_org()));

-- paiements_abonnement · pay_insert (INSERT, PERMISSIVE)
create policy pay_insert on public.paiements_abonnement
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));

-- paiements_abonnement · pay_read_own (SELECT, PERMISSIVE)
create policy pay_read_own on public.paiements_abonnement
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- platform_admins · platform_admins_select (SELECT, PERMISSIVE)
create policy platform_admins_select on public.platform_admins
  as permissive
  for select
  to {authenticated}
  using (is_platform_admin())
  ;

-- platform_audit · platform_audit_read (SELECT, PERMISSIVE)
create policy platform_audit_read on public.platform_audit
  as permissive
  for select
  to {authenticated}
  using (is_platform_admin())
  ;

-- profiles · profiles_d (DELETE, PERMISSIVE)
create policy profiles_d on public.profiles
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- profiles · profiles_r (SELECT, PERMISSIVE)
create policy profiles_r on public.profiles
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) OR (id = auth.uid())))
  ;

-- profiles · profiles_u (UPDATE, PERMISSIVE)
create policy profiles_u on public.profiles
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- proforma_lines · proforma_lines_r (SELECT, PERMISSIVE)
create policy proforma_lines_r on public.proforma_lines
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM proformas p
  WHERE (p.id = proforma_lines.proforma_id)))))
  ;

-- proformas · proformas_r (SELECT, PERMISSIVE)
create policy proformas_r on public.proformas
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- purchase_lines · purchase_lines_d (DELETE, PERMISSIVE)
create policy purchase_lines_d on public.purchase_lines
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- purchase_lines · purchase_lines_i (INSERT, PERMISSIVE)
create policy purchase_lines_i on public.purchase_lines
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))));

-- purchase_lines · purchase_lines_r (SELECT, PERMISSIVE)
create policy purchase_lines_r on public.purchase_lines
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptable'::text, 'user'::text]))))
  ;

-- purchase_lines · purchase_lines_u (UPDATE, PERMISSIVE)
create policy purchase_lines_u on public.purchase_lines
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- purchase_order_lines · purchase_order_lines_r (SELECT, PERMISSIVE)
create policy purchase_order_lines_r on public.purchase_order_lines
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM purchase_orders o
  WHERE (o.id = purchase_order_lines.order_id)))))
  ;

-- purchase_orders · purchase_orders_r (SELECT, PERMISSIVE)
create policy purchase_orders_r on public.purchase_orders
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptable'::text, 'user'::text]))))
  ;

-- purchase_payment_balances · purchase_payment_balances_r (SELECT, PERMISSIVE)
create policy purchase_payment_balances_r on public.purchase_payment_balances
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- purchase_payments · purchase_payments_r (SELECT, PERMISSIVE)
create policy purchase_payments_r on public.purchase_payments
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- purchases · purchases_d (DELETE, PERMISSIVE)
create policy purchases_d on public.purchases
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- purchases · purchases_i (INSERT, PERMISSIVE)
create policy purchases_i on public.purchases
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))));

-- purchases · purchases_r (SELECT, PERMISSIVE)
create policy purchases_r on public.purchases
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptable'::text, 'user'::text]))))
  ;

-- purchases · purchases_u (UPDATE, PERMISSIVE)
create policy purchases_u on public.purchases
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- push_subscriptions · push_own (ALL, PERMISSIVE)
create policy push_own on public.push_subscriptions
  as permissive
  for all
  to {authenticated}
  using ((user_id = auth.uid()))
  with check (((user_id = auth.uid()) AND (org_id = my_org())));

-- reseller_clients · reseller_clients_insert (INSERT, PERMISSIVE)
create policy reseller_clients_insert on public.reseller_clients
  as permissive
  for insert
  to {authenticated}
  
  with check (is_platform_admin());

-- reseller_clients · reseller_clients_read (SELECT, PERMISSIVE)
create policy reseller_clients_read on public.reseller_clients
  as permissive
  for select
  to {authenticated}
  using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM commercial_resellers r
  WHERE ((r.id = reseller_clients.reseller_id) AND (r.user_id = auth.uid()) AND r.active)))))
  ;

-- reseller_clients · reseller_clients_update (UPDATE, PERMISSIVE)
create policy reseller_clients_update on public.reseller_clients
  as permissive
  for update
  to {authenticated}
  using (is_platform_admin())
  with check (is_platform_admin());

-- reseller_commissions · commissions_read (SELECT, PERMISSIVE)
create policy commissions_read on public.reseller_commissions
  as permissive
  for select
  to {authenticated}
  using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM commercial_resellers r
  WHERE ((r.id = reseller_commissions.reseller_id) AND (r.user_id = auth.uid()) AND r.active)))))
  ;

-- sale_cost_snapshots · sale_cost_snapshots_r (SELECT, PERMISSIVE)
create policy sale_cost_snapshots_r on public.sale_cost_snapshots
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- sale_lines · sale_lines_d (DELETE, PERMISSIVE)
create policy sale_lines_d on public.sale_lines
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- sale_lines · sale_lines_i (INSERT, PERMISSIVE)
create policy sale_lines_i on public.sale_lines
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text]))));

-- sale_lines · sale_lines_r (SELECT, PERMISSIVE)
create policy sale_lines_r on public.sale_lines
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- sale_lines · sale_lines_u (UPDATE, PERMISSIVE)
create policy sale_lines_u on public.sale_lines
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- sale_payments · sale_payments_r (SELECT, PERMISSIVE)
create policy sale_payments_r on public.sale_payments
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (EXISTS ( SELECT 1
   FROM sales s
  WHERE (s.id = sale_payments.sale_id))))))
  ;

-- sales · sales_d (DELETE, PERMISSIVE)
create policy sales_d on public.sales
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND ((my_role() = ANY (ARRAY['admin'::text, 'manager'::text])) OR ((my_role() = 'facturier'::text) AND (warehouse_id = my_shop())))))
  ;

-- sales · sales_i (INSERT, PERMISSIVE)
create policy sales_i on public.sales
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text]))));

-- sales · sales_r (SELECT, PERMISSIVE)
create policy sales_r on public.sales
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- sales · sales_u (UPDATE, PERMISSIVE)
create policy sales_u on public.sales
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND ((my_role() = ANY (ARRAY['admin'::text, 'manager'::text])) OR ((my_role() = 'facturier'::text) AND (warehouse_id = my_shop())))))
  with check ((org_id = my_org()));

-- sales_prospects · prospects_admin (ALL, PERMISSIVE)
create policy prospects_admin on public.sales_prospects
  as permissive
  for all
  to {authenticated}
  using (is_platform_admin())
  with check (is_platform_admin());

-- settings · settings_i (INSERT, PERMISSIVE)
create policy settings_i on public.settings
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));

-- settings · settings_r (SELECT, PERMISSIVE)
create policy settings_r on public.settings
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- settings · settings_u (UPDATE, PERMISSIVE)
create policy settings_u on public.settings
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));

-- stock_lots · stock_lots_r (SELECT, PERMISSIVE)
create policy stock_lots_r on public.stock_lots
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- stock_moves · stock_moves_i (INSERT, PERMISSIVE)
create policy stock_moves_i on public.stock_moves
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (reason = 'adjustment'::text) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))));

-- stock_moves · stock_moves_r (SELECT, PERMISSIVE)
create policy stock_moves_r on public.stock_moves
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- supplier_return_lines · supplier_return_lines_r (SELECT, PERMISSIVE)
create policy supplier_return_lines_r on public.supplier_return_lines
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (EXISTS ( SELECT 1
   FROM supplier_returns r
  WHERE (r.id = supplier_return_lines.return_id)))))
  ;

-- supplier_returns · supplier_returns_r (SELECT, PERMISSIVE)
create policy supplier_returns_r on public.supplier_returns
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptable'::text]))))
  ;

-- suppliers · suppliers_d (DELETE, PERMISSIVE)
create policy suppliers_d on public.suppliers
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  ;

-- suppliers · suppliers_i (INSERT, PERMISSIVE)
create policy suppliers_i on public.suppliers
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))));

-- suppliers · suppliers_r (SELECT, PERMISSIVE)
create policy suppliers_r on public.suppliers
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptable'::text, 'user'::text]))))
  ;

-- suppliers · suppliers_u (UPDATE, PERMISSIVE)
create policy suppliers_u on public.suppliers
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- support_messages · messages_read (SELECT, PERMISSIVE)
create policy messages_read on public.support_messages
  as permissive
  for select
  to {authenticated}
  using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND (t.org_id = customer_org()))))))
  ;

-- support_tickets · tickets_read (SELECT, PERMISSIVE)
create policy tickets_read on public.support_tickets
  as permissive
  for select
  to {authenticated}
  using ((is_platform_admin() OR (org_id = customer_org())))
  ;

-- transfer_lines · transfer_lines_i (INSERT, PERMISSIVE)
create policy transfer_lines_i on public.transfer_lines
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text]))));

-- transfer_lines · transfer_lines_r (SELECT, PERMISSIVE)
create policy transfer_lines_r on public.transfer_lines
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (EXISTS ( SELECT 1
   FROM transfers t
  WHERE (t.id = transfer_lines.transfer_id))))))
  ;

-- transfers · transfers_i (INSERT, PERMISSIVE)
create policy transfers_i on public.transfers
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text]))));

-- transfers · transfers_r (SELECT, PERMISSIVE)
create policy transfers_r on public.transfers
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (from_warehouse_id = my_shop()) OR (to_warehouse_id = my_shop()) OR (created_by = auth.uid()))))
  ;

-- unit_options · unit_options_delete (DELETE, PERMISSIVE)
create policy unit_options_delete on public.unit_options
  as permissive
  for delete
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  ;

-- unit_options · unit_options_insert (INSERT, PERMISSIVE)
create policy unit_options_insert on public.unit_options
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text]))));

-- unit_options · unit_options_select (SELECT, PERMISSIVE)
create policy unit_options_select on public.unit_options
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- user_warehouses · user_warehouses_r (SELECT, PERMISSIVE)
create policy user_warehouses_r on public.user_warehouses
  as permissive
  for select
  to {authenticated}
  using (((user_id = auth.uid()) OR ((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text])))))
  ;

-- user_warehouses · user_warehouses_w (ALL, PERMISSIVE)
create policy user_warehouses_w on public.user_warehouses
  as permissive
  for all
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));

-- warehouse_stock · warehouse_stock_r (SELECT, PERMISSIVE)
create policy warehouse_stock_r on public.warehouse_stock
  as permissive
  for select
  to {authenticated}
  using (((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop()))))
  ;

-- warehouses · warehouses_i (INSERT, PERMISSIVE)
create policy warehouses_i on public.warehouses
  as permissive
  for insert
  to {authenticated}
  
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text])) AND (NOT is_default) AND plan_allows('depots'::text)));

-- warehouses · warehouses_r (SELECT, PERMISSIVE)
create policy warehouses_r on public.warehouses
  as permissive
  for select
  to {authenticated}
  using ((org_id = my_org()))
  ;

-- warehouses · warehouses_u (UPDATE, PERMISSIVE)
create policy warehouses_u on public.warehouses
  as permissive
  for update
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))))
  with check (((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))));

-- worker_payments · worker_payments_admin (ALL, PERMISSIVE)
create policy worker_payments_admin on public.worker_payments
  as permissive
  for all
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));

-- workers · workers_admin (ALL, PERMISSIVE)
create policy workers_admin on public.workers
  as permissive
  for all
  to {authenticated}
  using (((org_id = my_org()) AND (my_role() = 'admin'::text)))
  with check (((org_id = my_org()) AND (my_role() = 'admin'::text)));
