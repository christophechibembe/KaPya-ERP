-- KaPya ERP — export de production (lecture seule)
-- Projet Supabase : ttplxlobehmwzfnxviej
-- Export : 2026-11-18 07:16
-- Généré par scripts/exporter-supabase.mjs. Ne contient aucun secret.

-- app_errors · app_errors_created_idx
CREATE INDEX app_errors_created_idx ON public.app_errors USING btree (created_at DESC);

-- app_errors · app_errors_pkey
CREATE UNIQUE INDEX app_errors_pkey ON public.app_errors USING btree (id);

-- articles · articles_barcode_org_uidx
CREATE UNIQUE INDEX articles_barcode_org_uidx ON public.articles USING btree (org_id, barcode) WHERE (barcode IS NOT NULL);

-- articles · articles_org_id_sku_key
CREATE UNIQUE INDEX articles_org_id_sku_key ON public.articles USING btree (org_id, sku);

-- articles · articles_pkey
CREATE UNIQUE INDEX articles_pkey ON public.articles USING btree (id);

-- articles · idx_articles_org_updated
CREATE INDEX idx_articles_org_updated ON public.articles USING btree (org_id, updated_at);

-- audit_log · audit_log_org_time_idx
CREATE INDEX audit_log_org_time_idx ON public.audit_log USING btree (org_id, occurred_at DESC);

-- audit_log · audit_log_pkey
CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id);

-- audit_log · audit_log_record_idx
CREATE INDEX audit_log_record_idx ON public.audit_log USING btree (record_id);

-- auto_backups · auto_backups_org_idx
CREATE INDEX auto_backups_org_idx ON public.auto_backups USING btree (org_id, created_at DESC);

-- auto_backups · auto_backups_pkey
CREATE UNIQUE INDEX auto_backups_pkey ON public.auto_backups USING btree (id);

-- business_expenses · business_expenses_org_paid_idx
CREATE INDEX business_expenses_org_paid_idx ON public.business_expenses USING btree (org_id, paid_at DESC);

-- business_expenses · business_expenses_pkey
CREATE UNIQUE INDEX business_expenses_pkey ON public.business_expenses USING btree (id);

-- cash_closures · cash_closures_org_day_idx
CREATE INDEX cash_closures_org_day_idx ON public.cash_closures USING btree (org_id, business_date DESC);

-- cash_closures · cash_closures_org_id_business_date_key
CREATE UNIQUE INDEX cash_closures_org_id_business_date_key ON public.cash_closures USING btree (org_id, business_date);

-- cash_closures · cash_closures_pkey
CREATE UNIQUE INDEX cash_closures_pkey ON public.cash_closures USING btree (id);

-- cash_closures_shop · cash_closures_shop_org_id_warehouse_id_business_date_key
CREATE UNIQUE INDEX cash_closures_shop_org_id_warehouse_id_business_date_key ON public.cash_closures_shop USING btree (org_id, warehouse_id, business_date);

-- cash_closures_shop · cash_closures_shop_pkey
CREATE UNIQUE INDEX cash_closures_shop_pkey ON public.cash_closures_shop USING btree (id);

-- commercial_accounts · commercial_accounts_pkey
CREATE UNIQUE INDEX commercial_accounts_pkey ON public.commercial_accounts USING btree (id);

-- commercial_documents · commercial_documents_number_key
CREATE UNIQUE INDEX commercial_documents_number_key ON public.commercial_documents USING btree (number);

-- commercial_documents · commercial_documents_pkey
CREATE UNIQUE INDEX commercial_documents_pkey ON public.commercial_documents USING btree (id);

-- commercial_dues · commercial_dues_org_date
CREATE INDEX commercial_dues_org_date ON public.commercial_dues USING btree (org_id, due_on);

-- commercial_dues · commercial_dues_pkey
CREATE UNIQUE INDEX commercial_dues_pkey ON public.commercial_dues USING btree (id);

-- commercial_payments · commercial_payments_due
CREATE INDEX commercial_payments_due ON public.commercial_payments USING btree (due_id);

-- commercial_payments · commercial_payments_pkey
CREATE UNIQUE INDEX commercial_payments_pkey ON public.commercial_payments USING btree (id);

-- commercial_payments · commercial_payments_receipt_number_key
CREATE UNIQUE INDEX commercial_payments_receipt_number_key ON public.commercial_payments USING btree (receipt_number);

-- commercial_resellers · commercial_resellers_pkey
CREATE UNIQUE INDEX commercial_resellers_pkey ON public.commercial_resellers USING btree (id);

-- commercial_resellers · commercial_resellers_user_id_key
CREATE UNIQUE INDEX commercial_resellers_user_id_key ON public.commercial_resellers USING btree (user_id);

-- commercial_seller · commercial_seller_pkey
CREATE UNIQUE INDEX commercial_seller_pkey ON public.commercial_seller USING btree (id);

-- company_codes · company_codes_pkey
CREATE UNIQUE INDEX company_codes_pkey ON public.company_codes USING btree (code);

-- credit_note_lines · credit_note_lines_pkey
CREATE UNIQUE INDEX credit_note_lines_pkey ON public.credit_note_lines USING btree (id);

-- credit_notes · credit_notes_org_id_number_key
CREATE UNIQUE INDEX credit_notes_org_id_number_key ON public.credit_notes USING btree (org_id, number);

-- credit_notes · credit_notes_pkey
CREATE UNIQUE INDEX credit_notes_pkey ON public.credit_notes USING btree (id);

-- customer_deposit_counters · customer_deposit_counters_pkey
CREATE UNIQUE INDEX customer_deposit_counters_pkey ON public.customer_deposit_counters USING btree (org_id);

-- customer_deposits · customer_deposits_org_customer_idx
CREATE INDEX customer_deposits_org_customer_idx ON public.customer_deposits USING btree (org_id, customer_id, received_at DESC);

-- customer_deposits · customer_deposits_org_id_receipt_number_key
CREATE UNIQUE INDEX customer_deposits_org_id_receipt_number_key ON public.customer_deposits USING btree (org_id, receipt_number);

-- customer_deposits · customer_deposits_pkey
CREATE UNIQUE INDEX customer_deposits_pkey ON public.customer_deposits USING btree (id);

-- customer_return_lines · customer_return_lines_pkey
CREATE UNIQUE INDEX customer_return_lines_pkey ON public.customer_return_lines USING btree (id);

-- customer_returns · customer_returns_org_id_number_key
CREATE UNIQUE INDEX customer_returns_org_id_number_key ON public.customer_returns USING btree (org_id, number);

-- customer_returns · customer_returns_pkey
CREATE UNIQUE INDEX customer_returns_pkey ON public.customer_returns USING btree (id);

-- customer_setup · customer_setup_pkey
CREATE UNIQUE INDEX customer_setup_pkey ON public.customer_setup USING btree (id);

-- customers · customers_pkey
CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id);

-- customers · idx_customers_org_updated
CREATE INDEX idx_customers_org_updated ON public.customers USING btree (org_id, updated_at);

-- dashboard_preferences · dashboard_preferences_pkey
CREATE UNIQUE INDEX dashboard_preferences_pkey ON public.dashboard_preferences USING btree (user_id);

-- document_counters · document_counters_pkey
CREATE UNIQUE INDEX document_counters_pkey ON public.document_counters USING btree (org_id, kind);

-- invitations · invitations_code_key
CREATE UNIQUE INDEX invitations_code_key ON public.invitations USING btree (code);

-- invitations · invitations_pending_uniq
CREATE UNIQUE INDEX invitations_pending_uniq ON public.invitations USING btree (org_id, lower(email)) WHERE (used_at IS NULL);

-- invitations · invitations_pkey
CREATE UNIQUE INDEX invitations_pkey ON public.invitations USING btree (id);

-- invoice_counters · invoice_counters_pkey
CREATE UNIQUE INDEX invoice_counters_pkey ON public.invoice_counters USING btree (org_id);

-- number_ranges · number_ranges_pkey
CREATE UNIQUE INDEX number_ranges_pkey ON public.number_ranges USING btree (org_id, kind, device, from_n);

-- organizations · organizations_pkey
CREATE UNIQUE INDEX organizations_pkey ON public.organizations USING btree (id);

-- paiements_abonnement · paiements_abonnement_pkey
CREATE UNIQUE INDEX paiements_abonnement_pkey ON public.paiements_abonnement USING btree (id);

-- platform_admins · platform_admins_pkey
CREATE UNIQUE INDEX platform_admins_pkey ON public.platform_admins USING btree (user_id);

-- platform_audit · platform_audit_created_idx
CREATE INDEX platform_audit_created_idx ON public.platform_audit USING btree (created_at DESC);

-- platform_audit · platform_audit_pkey
CREATE UNIQUE INDEX platform_audit_pkey ON public.platform_audit USING btree (id);

-- profiles · profiles_pkey
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

-- proforma_lines · proforma_lines_pkey
CREATE UNIQUE INDEX proforma_lines_pkey ON public.proforma_lines USING btree (id);

-- proformas · proformas_org_id_number_key
CREATE UNIQUE INDEX proformas_org_id_number_key ON public.proformas USING btree (org_id, number);

-- proformas · proformas_pkey
CREATE UNIQUE INDEX proformas_pkey ON public.proformas USING btree (id);

-- purchase_lines · purchase_lines_pkey
CREATE UNIQUE INDEX purchase_lines_pkey ON public.purchase_lines USING btree (id);

-- purchase_order_lines · purchase_order_lines_pkey
CREATE UNIQUE INDEX purchase_order_lines_pkey ON public.purchase_order_lines USING btree (id);

-- purchase_orders · purchase_orders_org_id_number_key
CREATE UNIQUE INDEX purchase_orders_org_id_number_key ON public.purchase_orders USING btree (org_id, number);

-- purchase_orders · purchase_orders_pkey
CREATE UNIQUE INDEX purchase_orders_pkey ON public.purchase_orders USING btree (id);

-- purchase_payment_balances · purchase_payment_balances_pkey
CREATE UNIQUE INDEX purchase_payment_balances_pkey ON public.purchase_payment_balances USING btree (purchase_id);

-- purchase_payments · purchase_payments_org_paid_idx
CREATE INDEX purchase_payments_org_paid_idx ON public.purchase_payments USING btree (org_id, paid_at DESC);

-- purchase_payments · purchase_payments_pkey
CREATE UNIQUE INDEX purchase_payments_pkey ON public.purchase_payments USING btree (id);

-- purchases · purchases_pkey
CREATE UNIQUE INDEX purchases_pkey ON public.purchases USING btree (id);

-- push_subscriptions · push_subscriptions_endpoint_key
CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions USING btree (endpoint);

-- push_subscriptions · push_subscriptions_pkey
CREATE UNIQUE INDEX push_subscriptions_pkey ON public.push_subscriptions USING btree (id);

-- reseller_clients · reseller_clients_pkey
CREATE UNIQUE INDEX reseller_clients_pkey ON public.reseller_clients USING btree (id);

-- reseller_commissions · reseller_commissions_payment_id_key
CREATE UNIQUE INDEX reseller_commissions_payment_id_key ON public.reseller_commissions USING btree (payment_id);

-- reseller_commissions · reseller_commissions_pkey
CREATE UNIQUE INDEX reseller_commissions_pkey ON public.reseller_commissions USING btree (id);

-- sale_cost_snapshots · sale_cost_snapshots_pkey
CREATE UNIQUE INDEX sale_cost_snapshots_pkey ON public.sale_cost_snapshots USING btree (sale_line_id);

-- sale_lines · sale_lines_article_idx
CREATE INDEX sale_lines_article_idx ON public.sale_lines USING btree (article_id, sale_id);

-- sale_lines · sale_lines_pkey
CREATE UNIQUE INDEX sale_lines_pkey ON public.sale_lines USING btree (id);

-- sale_payments · sale_payments_initial_uq
CREATE UNIQUE INDEX sale_payments_initial_uq ON public.sale_payments USING btree (sale_id) WHERE (kind = 'initial'::text);

-- sale_payments · sale_payments_org_date_idx
CREATE INDEX sale_payments_org_date_idx ON public.sale_payments USING btree (org_id, paid_at DESC);

-- sale_payments · sale_payments_pkey
CREATE UNIQUE INDEX sale_payments_pkey ON public.sale_payments USING btree (id);

-- sales · sales_org_number_uniq
CREATE UNIQUE INDEX sales_org_number_uniq ON public.sales USING btree (org_id, number) WHERE (number ~~ 'FAC-%'::text);

-- sales · sales_pkey
CREATE UNIQUE INDEX sales_pkey ON public.sales USING btree (id);

-- sales · sales_sold_at_idx
CREATE INDEX sales_sold_at_idx ON public.sales USING btree (org_id, sold_at DESC);

-- sales_prospects · sales_prospects_pkey
CREATE UNIQUE INDEX sales_prospects_pkey ON public.sales_prospects USING btree (id);

-- settings · settings_pkey
CREATE UNIQUE INDEX settings_pkey ON public.settings USING btree (org_id);

-- stock_lots · idx_stock_lots_org_updated
CREATE INDEX idx_stock_lots_org_updated ON public.stock_lots USING btree (org_id, updated_at);

-- stock_lots · stock_lots_pkey
CREATE UNIQUE INDEX stock_lots_pkey ON public.stock_lots USING btree (id);

-- stock_moves · stock_moves_pkey
CREATE UNIQUE INDEX stock_moves_pkey ON public.stock_moves USING btree (id);

-- supplier_return_lines · supplier_return_lines_pkey
CREATE UNIQUE INDEX supplier_return_lines_pkey ON public.supplier_return_lines USING btree (id);

-- supplier_returns · supplier_returns_org_id_number_key
CREATE UNIQUE INDEX supplier_returns_org_id_number_key ON public.supplier_returns USING btree (org_id, number);

-- supplier_returns · supplier_returns_pkey
CREATE UNIQUE INDEX supplier_returns_pkey ON public.supplier_returns USING btree (id);

-- suppliers · idx_suppliers_org_updated
CREATE INDEX idx_suppliers_org_updated ON public.suppliers USING btree (org_id, updated_at);

-- suppliers · suppliers_pkey
CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id);

-- support_messages · support_messages_pkey
CREATE UNIQUE INDEX support_messages_pkey ON public.support_messages USING btree (id);

-- support_messages · support_messages_ticket
CREATE INDEX support_messages_ticket ON public.support_messages USING btree (ticket_id, created_at);

-- support_tickets · support_tickets_number_key
CREATE UNIQUE INDEX support_tickets_number_key ON public.support_tickets USING btree (number);

-- support_tickets · support_tickets_org
CREATE INDEX support_tickets_org ON public.support_tickets USING btree (org_id, updated_at);

-- support_tickets · support_tickets_pkey
CREATE UNIQUE INDEX support_tickets_pkey ON public.support_tickets USING btree (id);

-- transfer_lines · transfer_lines_pkey
CREATE UNIQUE INDEX transfer_lines_pkey ON public.transfer_lines USING btree (id);

-- transfers · transfers_pkey
CREATE UNIQUE INDEX transfers_pkey ON public.transfers USING btree (id);

-- unit_options · unit_options_org_id_label_key
CREATE UNIQUE INDEX unit_options_org_id_label_key ON public.unit_options USING btree (org_id, label);

-- unit_options · unit_options_pkey
CREATE UNIQUE INDEX unit_options_pkey ON public.unit_options USING btree (id);

-- user_warehouses · user_warehouses_pkey
CREATE UNIQUE INDEX user_warehouses_pkey ON public.user_warehouses USING btree (user_id);

-- warehouse_stock · idx_warehouse_stock_org_updated
CREATE INDEX idx_warehouse_stock_org_updated ON public.warehouse_stock USING btree (org_id, updated_at);

-- warehouse_stock · warehouse_stock_pkey
CREATE UNIQUE INDEX warehouse_stock_pkey ON public.warehouse_stock USING btree (warehouse_id, article_id);

-- warehouses · warehouses_name_uq
CREATE UNIQUE INDEX warehouses_name_uq ON public.warehouses USING btree (org_id, lower(name));

-- warehouses · warehouses_one_default
CREATE UNIQUE INDEX warehouses_one_default ON public.warehouses USING btree (org_id) WHERE is_default;

-- warehouses · warehouses_pkey
CREATE UNIQUE INDEX warehouses_pkey ON public.warehouses USING btree (id);

-- worker_payments · worker_payments_pkey
CREATE UNIQUE INDEX worker_payments_pkey ON public.worker_payments USING btree (id);

-- workers · workers_pkey
CREATE UNIQUE INDEX workers_pkey ON public.workers USING btree (id);
