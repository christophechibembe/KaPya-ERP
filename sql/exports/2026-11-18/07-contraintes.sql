-- KaPya ERP — export de production (lecture seule)
-- Projet Supabase : ttplxlobehmwzfnxviej
-- Export : 2026-11-18 07:55
-- Généré par scripts/exporter-supabase.mjs. Ne contient aucun secret.

-- app_errors · app_errors_app_version_check (c)
alter table public.app_errors add constraint app_errors_app_version_check CHECK ((char_length(app_version) <= 20));

-- app_errors · app_errors_message_check (c)
alter table public.app_errors add constraint app_errors_message_check CHECK ((char_length(message) <= 500));

-- app_errors · app_errors_page_check (c)
alter table public.app_errors add constraint app_errors_page_check CHECK ((char_length(page) <= 200));

-- app_errors · app_errors_pkey (p)
alter table public.app_errors add constraint app_errors_pkey PRIMARY KEY (id);

-- app_errors · app_errors_source_check (c)
alter table public.app_errors add constraint app_errors_source_check CHECK ((char_length(source) <= 200));

-- articles · articles_barcode_check (c)
alter table public.articles add constraint articles_barcode_check CHECK (((barcode IS NULL) OR ((char_length(barcode) >= 4) AND (char_length(barcode) <= 32))));

-- articles · articles_org_id_fkey (f)
alter table public.articles add constraint articles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- articles · articles_org_id_sku_key (u)
alter table public.articles add constraint articles_org_id_sku_key UNIQUE (org_id, sku);

-- articles · articles_pkey (p)
alter table public.articles add constraint articles_pkey PRIMARY KEY (id);

-- articles · articles_unit_weight_check (c)
alter table public.articles add constraint articles_unit_weight_check CHECK (((unit_weight IS NULL) OR (unit_weight > (0)::numeric)));

-- audit_log · audit_log_action_check (c)
alter table public.audit_log add constraint audit_log_action_check CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])));

-- audit_log · audit_log_actor_id_fkey (f)
alter table public.audit_log add constraint audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- audit_log · audit_log_org_id_fkey (f)
alter table public.audit_log add constraint audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- audit_log · audit_log_pkey (p)
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);

-- auto_backups · auto_backups_pkey (p)
alter table public.auto_backups add constraint auto_backups_pkey PRIMARY KEY (id);

-- business_expenses · business_expenses_amount_check (c)
alter table public.business_expenses add constraint business_expenses_amount_check CHECK ((amount > (0)::numeric));

-- business_expenses · business_expenses_category_check (c)
alter table public.business_expenses add constraint business_expenses_category_check CHECK (((length(TRIM(BOTH FROM category)) >= 1) AND (length(TRIM(BOTH FROM category)) <= 60)));

-- business_expenses · business_expenses_label_check (c)
alter table public.business_expenses add constraint business_expenses_label_check CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 120)));

-- business_expenses · business_expenses_org_id_fkey (f)
alter table public.business_expenses add constraint business_expenses_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- business_expenses · business_expenses_pkey (p)
alter table public.business_expenses add constraint business_expenses_pkey PRIMARY KEY (id);

-- cash_closures · cash_closures_closed_by_fkey (f)
alter table public.cash_closures add constraint cash_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- cash_closures · cash_closures_counted_fc_check (c)
alter table public.cash_closures add constraint cash_closures_counted_fc_check CHECK ((counted_fc >= (0)::numeric));

-- cash_closures · cash_closures_counted_usd_check (c)
alter table public.cash_closures add constraint cash_closures_counted_usd_check CHECK ((counted_usd >= (0)::numeric));

-- cash_closures · cash_closures_exchange_rate_check (c)
alter table public.cash_closures add constraint cash_closures_exchange_rate_check CHECK ((exchange_rate > (0)::numeric));

-- cash_closures · cash_closures_opening_fc_check (c)
alter table public.cash_closures add constraint cash_closures_opening_fc_check CHECK ((opening_fc >= (0)::numeric));

-- cash_closures · cash_closures_opening_usd_check (c)
alter table public.cash_closures add constraint cash_closures_opening_usd_check CHECK ((opening_usd >= (0)::numeric));

-- cash_closures · cash_closures_org_id_business_date_key (u)
alter table public.cash_closures add constraint cash_closures_org_id_business_date_key UNIQUE (org_id, business_date);

-- cash_closures · cash_closures_org_id_fkey (f)
alter table public.cash_closures add constraint cash_closures_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- cash_closures · cash_closures_pkey (p)
alter table public.cash_closures add constraint cash_closures_pkey PRIMARY KEY (id);

-- cash_closures_shop · cash_closures_shop_org_id_warehouse_id_business_date_key (u)
alter table public.cash_closures_shop add constraint cash_closures_shop_org_id_warehouse_id_business_date_key UNIQUE (org_id, warehouse_id, business_date);

-- cash_closures_shop · cash_closures_shop_pkey (p)
alter table public.cash_closures_shop add constraint cash_closures_shop_pkey PRIMARY KEY (id);

-- cash_closures_shop · cash_closures_shop_warehouse_id_fkey (f)
alter table public.cash_closures_shop add constraint cash_closures_shop_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;

-- commercial_accounts · commercial_accounts_currency_check (c)
alter table public.commercial_accounts add constraint commercial_accounts_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'CDF'::text, 'EUR'::text])));

-- commercial_accounts · commercial_accounts_cycle_check (c)
alter table public.commercial_accounts add constraint commercial_accounts_cycle_check CHECK ((cycle = ANY (ARRAY['mensuel'::text, 'annuel'::text])));

-- commercial_accounts · commercial_accounts_id_fkey (f)
alter table public.commercial_accounts add constraint commercial_accounts_id_fkey FOREIGN KEY (id) REFERENCES organizations(id) ON DELETE CASCADE;

-- commercial_accounts · commercial_accounts_pkey (p)
alter table public.commercial_accounts add constraint commercial_accounts_pkey PRIMARY KEY (id);

-- commercial_accounts · commercial_accounts_price_check (c)
alter table public.commercial_accounts add constraint commercial_accounts_price_check CHECK ((price >= (0)::numeric));

-- commercial_accounts · commercial_accounts_stage_check (c)
alter table public.commercial_accounts add constraint commercial_accounts_stage_check CHECK ((stage = ANY (ARRAY['pilote'::text, 'client'::text, 'arrete'::text])));

-- commercial_documents · commercial_documents_amount_check (c)
alter table public.commercial_documents add constraint commercial_documents_amount_check CHECK (((amount >= (0)::numeric) AND ((amount)::text <> 'NaN'::text)));

-- commercial_documents · commercial_documents_conditions_check (c)
alter table public.commercial_documents add constraint commercial_documents_conditions_check CHECK (((length(TRIM(BOTH FROM conditions)) >= 1) AND (length(TRIM(BOTH FROM conditions)) <= 10000)));

-- commercial_documents · commercial_documents_currency_check (c)
alter table public.commercial_documents add constraint commercial_documents_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'CDF'::text, 'EUR'::text])));

-- commercial_documents · commercial_documents_customer_name_check (c)
alter table public.commercial_documents add constraint commercial_documents_customer_name_check CHECK (((length(TRIM(BOTH FROM customer_name)) >= 1) AND (length(TRIM(BOTH FROM customer_name)) <= 200)));

-- commercial_documents · commercial_documents_cycle_check (c)
alter table public.commercial_documents add constraint commercial_documents_cycle_check CHECK ((cycle = ANY (ARRAY['unique'::text, 'mensuel'::text, 'annuel'::text])));

-- commercial_documents · commercial_documents_kind_check (c)
alter table public.commercial_documents add constraint commercial_documents_kind_check CHECK ((kind = ANY (ARRAY['devis'::text, 'contrat'::text])));

-- commercial_documents · commercial_documents_number_key (u)
alter table public.commercial_documents add constraint commercial_documents_number_key UNIQUE (number);

-- commercial_documents · commercial_documents_org_id_fkey (f)
alter table public.commercial_documents add constraint commercial_documents_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- commercial_documents · commercial_documents_pkey (p)
alter table public.commercial_documents add constraint commercial_documents_pkey PRIMARY KEY (id);

-- commercial_documents · commercial_documents_prospect_id_fkey (f)
alter table public.commercial_documents add constraint commercial_documents_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES sales_prospects(id) ON DELETE RESTRICT;

-- commercial_documents · commercial_documents_seller_check (c)
alter table public.commercial_documents add constraint commercial_documents_seller_check CHECK ((jsonb_typeof(seller) = 'object'::text));

-- commercial_documents · commercial_documents_status_check (c)
alter table public.commercial_documents add constraint commercial_documents_status_check CHECK ((status = ANY (ARRAY['brouillon'::text, 'accepte'::text, 'refuse'::text])));

-- commercial_documents · commercial_documents_title_check (c)
alter table public.commercial_documents add constraint commercial_documents_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 200)));

-- commercial_dues · commercial_dues_amount_check (c)
alter table public.commercial_dues add constraint commercial_dues_amount_check CHECK ((amount > (0)::numeric));

-- commercial_dues · commercial_dues_check (c)
alter table public.commercial_dues add constraint commercial_dues_check CHECK ((period_end >= period_start));

-- commercial_dues · commercial_dues_check1 (c)
alter table public.commercial_dues add constraint commercial_dues_check1 CHECK ((((cancelled_at IS NULL) AND (cancelled_by IS NULL) AND (cancel_reason IS NULL)) OR ((cancelled_at IS NOT NULL) AND (cancelled_by IS NOT NULL) AND ((length(TRIM(BOTH FROM cancel_reason)) >= 3) AND (length(TRIM(BOTH FROM cancel_reason)) <= 500)))));

-- commercial_dues · commercial_dues_currency_check (c)
alter table public.commercial_dues add constraint commercial_dues_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'CDF'::text, 'EUR'::text])));

-- commercial_dues · commercial_dues_label_check (c)
alter table public.commercial_dues add constraint commercial_dues_label_check CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 200)));

-- commercial_dues · commercial_dues_org_id_fkey (f)
alter table public.commercial_dues add constraint commercial_dues_org_id_fkey FOREIGN KEY (org_id) REFERENCES commercial_accounts(id) ON DELETE RESTRICT;

-- commercial_dues · commercial_dues_pkey (p)
alter table public.commercial_dues add constraint commercial_dues_pkey PRIMARY KEY (id);

-- commercial_payments · commercial_payments_amount_check (c)
alter table public.commercial_payments add constraint commercial_payments_amount_check CHECK ((amount > (0)::numeric));

-- commercial_payments · commercial_payments_check (c)
alter table public.commercial_payments add constraint commercial_payments_check CHECK ((((voided_at IS NULL) AND (voided_by IS NULL) AND (void_reason IS NULL)) OR ((voided_at IS NOT NULL) AND (voided_by IS NOT NULL) AND ((length(TRIM(BOTH FROM void_reason)) >= 3) AND (length(TRIM(BOTH FROM void_reason)) <= 500)))));

-- commercial_payments · commercial_payments_due_id_fkey (f)
alter table public.commercial_payments add constraint commercial_payments_due_id_fkey FOREIGN KEY (due_id) REFERENCES commercial_dues(id) ON DELETE RESTRICT;

-- commercial_payments · commercial_payments_method_check (c)
alter table public.commercial_payments add constraint commercial_payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank'::text, 'other'::text])));

-- commercial_payments · commercial_payments_pkey (p)
alter table public.commercial_payments add constraint commercial_payments_pkey PRIMARY KEY (id);

-- commercial_payments · commercial_payments_receipt_number_key (u)
alter table public.commercial_payments add constraint commercial_payments_receipt_number_key UNIQUE (receipt_number);

-- commercial_payments · commercial_payments_reference_check (c)
alter table public.commercial_payments add constraint commercial_payments_reference_check CHECK ((length(reference) <= 200));

-- commercial_resellers · commercial_resellers_name_check (c)
alter table public.commercial_resellers add constraint commercial_resellers_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 200)));

-- commercial_resellers · commercial_resellers_pkey (p)
alter table public.commercial_resellers add constraint commercial_resellers_pkey PRIMARY KEY (id);

-- commercial_resellers · commercial_resellers_rate_check (c)
alter table public.commercial_resellers add constraint commercial_resellers_rate_check CHECK (((rate >= (0)::numeric) AND (rate <= (100)::numeric)));

-- commercial_resellers · commercial_resellers_user_id_key (u)
alter table public.commercial_resellers add constraint commercial_resellers_user_id_key UNIQUE (user_id);

-- commercial_seller · commercial_seller_id_check (c)
alter table public.commercial_seller add constraint commercial_seller_id_check CHECK ((id = 'main'::text));

-- commercial_seller · commercial_seller_pkey (p)
alter table public.commercial_seller add constraint commercial_seller_pkey PRIMARY KEY (id);

-- commercial_seller · commercial_seller_terms_check (c)
alter table public.commercial_seller add constraint commercial_seller_terms_check CHECK ((length(terms) <= 10000));

-- company_codes · company_codes_org_id_fkey (f)
alter table public.company_codes add constraint company_codes_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- company_codes · company_codes_pkey (p)
alter table public.company_codes add constraint company_codes_pkey PRIMARY KEY (code);

-- credit_note_lines · credit_note_lines_article_id_fkey (f)
alter table public.credit_note_lines add constraint credit_note_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- credit_note_lines · credit_note_lines_credit_note_id_fkey (f)
alter table public.credit_note_lines add constraint credit_note_lines_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE;

-- credit_note_lines · credit_note_lines_pkey (p)
alter table public.credit_note_lines add constraint credit_note_lines_pkey PRIMARY KEY (id);

-- credit_note_lines · credit_note_lines_qty_check (c)
alter table public.credit_note_lines add constraint credit_note_lines_qty_check CHECK ((qty > (0)::numeric));

-- credit_note_lines · credit_note_lines_unit_price_check (c)
alter table public.credit_note_lines add constraint credit_note_lines_unit_price_check CHECK ((unit_price >= (0)::numeric));

-- credit_notes · credit_notes_org_id_number_key (u)
alter table public.credit_notes add constraint credit_notes_org_id_number_key UNIQUE (org_id, number);

-- credit_notes · credit_notes_pkey (p)
alter table public.credit_notes add constraint credit_notes_pkey PRIMARY KEY (id);

-- credit_notes · credit_notes_sale_id_fkey (f)
alter table public.credit_notes add constraint credit_notes_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id);

-- credit_notes · credit_notes_total_usd_check (c)
alter table public.credit_notes add constraint credit_notes_total_usd_check CHECK ((total_usd > (0)::numeric));

-- customer_deposit_counters · customer_deposit_counters_org_id_fkey (f)
alter table public.customer_deposit_counters add constraint customer_deposit_counters_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- customer_deposit_counters · customer_deposit_counters_pkey (p)
alter table public.customer_deposit_counters add constraint customer_deposit_counters_pkey PRIMARY KEY (org_id);

-- customer_deposits · customer_deposits_amount_check (c)
alter table public.customer_deposits add constraint customer_deposits_amount_check CHECK ((amount > (0)::numeric));

-- customer_deposits · customer_deposits_check (c)
alter table public.customer_deposits add constraint customer_deposits_check CHECK (((remaining >= (0)::numeric) AND (remaining <= amount)));

-- customer_deposits · customer_deposits_customer_id_fkey (f)
alter table public.customer_deposits add constraint customer_deposits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;

-- customer_deposits · customer_deposits_org_id_fkey (f)
alter table public.customer_deposits add constraint customer_deposits_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- customer_deposits · customer_deposits_org_id_receipt_number_key (u)
alter table public.customer_deposits add constraint customer_deposits_org_id_receipt_number_key UNIQUE (org_id, receipt_number);

-- customer_deposits · customer_deposits_pkey (p)
alter table public.customer_deposits add constraint customer_deposits_pkey PRIMARY KEY (id);

-- customer_return_lines · customer_return_lines_article_id_fkey (f)
alter table public.customer_return_lines add constraint customer_return_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- customer_return_lines · customer_return_lines_pkey (p)
alter table public.customer_return_lines add constraint customer_return_lines_pkey PRIMARY KEY (id);

-- customer_return_lines · customer_return_lines_qty_check (c)
alter table public.customer_return_lines add constraint customer_return_lines_qty_check CHECK ((qty > (0)::numeric));

-- customer_return_lines · customer_return_lines_return_id_fkey (f)
alter table public.customer_return_lines add constraint customer_return_lines_return_id_fkey FOREIGN KEY (return_id) REFERENCES customer_returns(id) ON DELETE CASCADE;

-- customer_return_lines · customer_return_lines_unit_price_check (c)
alter table public.customer_return_lines add constraint customer_return_lines_unit_price_check CHECK ((unit_price >= (0)::numeric));

-- customer_returns · customer_returns_org_id_number_key (u)
alter table public.customer_returns add constraint customer_returns_org_id_number_key UNIQUE (org_id, number);

-- customer_returns · customer_returns_pkey (p)
alter table public.customer_returns add constraint customer_returns_pkey PRIMARY KEY (id);

-- customer_returns · customer_returns_sale_id_fkey (f)
alter table public.customer_returns add constraint customer_returns_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id);

-- customer_returns · customer_returns_warehouse_id_fkey (f)
alter table public.customer_returns add constraint customer_returns_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

-- customer_setup · customer_setup_id_fkey (f)
alter table public.customer_setup add constraint customer_setup_id_fkey FOREIGN KEY (id) REFERENCES organizations(id) ON DELETE CASCADE;

-- customer_setup · customer_setup_pkey (p)
alter table public.customer_setup add constraint customer_setup_pkey PRIMARY KEY (id);

-- customer_setup · customer_setup_steps_check (c)
alter table public.customer_setup add constraint customer_setup_steps_check CHECK ((jsonb_typeof(steps) = 'object'::text));

-- customers · customers_org_id_fkey (f)
alter table public.customers add constraint customers_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- customers · customers_pkey (p)
alter table public.customers add constraint customers_pkey PRIMARY KEY (id);

-- dashboard_preferences · dashboard_preferences_pkey (p)
alter table public.dashboard_preferences add constraint dashboard_preferences_pkey PRIMARY KEY (user_id);

-- document_counters · document_counters_pkey (p)
alter table public.document_counters add constraint document_counters_pkey PRIMARY KEY (org_id, kind);

-- inventories · inventories_org_id_fkey (f)
alter table public.inventories add constraint inventories_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- inventories · inventories_pkey (p)
alter table public.inventories add constraint inventories_pkey PRIMARY KEY (id);

-- inventories · inventories_status_check (c)
alter table public.inventories add constraint inventories_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'validated'::text])));

-- inventories · inventories_warehouse_id_fkey (f)
alter table public.inventories add constraint inventories_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

-- inventory_lines · inventory_lines_article_id_fkey (f)
alter table public.inventory_lines add constraint inventory_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

-- inventory_lines · inventory_lines_counted_check (c)
alter table public.inventory_lines add constraint inventory_lines_counted_check CHECK (((counted IS NULL) OR (counted >= (0)::numeric)));

-- inventory_lines · inventory_lines_inventory_id_article_id_key (u)
alter table public.inventory_lines add constraint inventory_lines_inventory_id_article_id_key UNIQUE (inventory_id, article_id);

-- inventory_lines · inventory_lines_inventory_id_fkey (f)
alter table public.inventory_lines add constraint inventory_lines_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES inventories(id) ON DELETE CASCADE;

-- inventory_lines · inventory_lines_org_id_fkey (f)
alter table public.inventory_lines add constraint inventory_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- inventory_lines · inventory_lines_pkey (p)
alter table public.inventory_lines add constraint inventory_lines_pkey PRIMARY KEY (id);

-- invitations · invitations_email_check (c)
alter table public.invitations add constraint invitations_email_check CHECK ((POSITION(('@'::text) IN (email)) > 1));

-- invitations · invitations_invited_by_fkey (f)
alter table public.invitations add constraint invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- invitations · invitations_org_id_fkey (f)
alter table public.invitations add constraint invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- invitations · invitations_pkey (p)
alter table public.invitations add constraint invitations_pkey PRIMARY KEY (id);

-- invitations · invitations_role_check (c)
alter table public.invitations add constraint invitations_role_check CHECK ((role = ANY (ARRAY['manager'::text, 'facturier'::text, 'comptable'::text, 'user'::text])));

-- invoice_counters · invoice_counters_org_id_fkey (f)
alter table public.invoice_counters add constraint invoice_counters_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- invoice_counters · invoice_counters_pkey (p)
alter table public.invoice_counters add constraint invoice_counters_pkey PRIMARY KEY (org_id);

-- number_ranges · number_ranges_pkey (p)
alter table public.number_ranges add constraint number_ranges_pkey PRIMARY KEY (org_id, kind, device, from_n);

-- organizations · organizations_business_type_check (c)
alter table public.organizations add constraint organizations_business_type_check CHECK ((business_type = ANY (ARRAY['commerce'::text, 'alimentation'::text, 'services'::text, 'restauration'::text, 'autre'::text])));

-- organizations · organizations_pkey (p)
alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);

-- organizations · organizations_plan_check (c)
alter table public.organizations add constraint organizations_plan_check CHECK ((plan = ANY (ARRAY['basique'::text, 'standard'::text, 'premium'::text])));

-- organizations · organizations_receipt_footer_check (c)
alter table public.organizations add constraint organizations_receipt_footer_check CHECK ((char_length(receipt_footer) <= 500));

-- organizations · organizations_status_check (c)
alter table public.organizations add constraint organizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])));

-- paiements_abonnement · paiements_abonnement_pkey (p)
alter table public.paiements_abonnement add constraint paiements_abonnement_pkey PRIMARY KEY (id);

-- paiements_abonnement · paiements_abonnement_plan_check (c)
alter table public.paiements_abonnement add constraint paiements_abonnement_plan_check CHECK ((plan = ANY (ARRAY['basique'::text, 'standard'::text, 'premium'::text])));

-- paiements_abonnement · paiements_abonnement_statut_check (c)
alter table public.paiements_abonnement add constraint paiements_abonnement_statut_check CHECK ((statut = ANY (ARRAY['en_attente'::text, 'valide'::text, 'rejete'::text])));

-- platform_admins · platform_admins_pkey (p)
alter table public.platform_admins add constraint platform_admins_pkey PRIMARY KEY (user_id);

-- platform_admins · platform_admins_user_id_fkey (f)
alter table public.platform_admins add constraint platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- platform_audit · platform_audit_pkey (p)
alter table public.platform_audit add constraint platform_audit_pkey PRIMARY KEY (id);

-- profiles · profiles_id_fkey (f)
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- profiles · profiles_org_id_fkey (f)
alter table public.profiles add constraint profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- profiles · profiles_pkey (p)
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

-- profiles · profiles_role_check (c)
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'facturier'::text, 'comptable'::text, 'user'::text])));

-- proforma_lines · proforma_lines_article_id_fkey (f)
alter table public.proforma_lines add constraint proforma_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- proforma_lines · proforma_lines_pkey (p)
alter table public.proforma_lines add constraint proforma_lines_pkey PRIMARY KEY (id);

-- proforma_lines · proforma_lines_proforma_id_fkey (f)
alter table public.proforma_lines add constraint proforma_lines_proforma_id_fkey FOREIGN KEY (proforma_id) REFERENCES proformas(id) ON DELETE CASCADE;

-- proforma_lines · proforma_lines_qty_check (c)
alter table public.proforma_lines add constraint proforma_lines_qty_check CHECK ((qty > (0)::numeric));

-- proforma_lines · proforma_lines_unit_price_check (c)
alter table public.proforma_lines add constraint proforma_lines_unit_price_check CHECK ((unit_price >= (0)::numeric));

-- proformas · proformas_customer_id_fkey (f)
alter table public.proformas add constraint proformas_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

-- proformas · proformas_org_id_number_key (u)
alter table public.proformas add constraint proformas_org_id_number_key UNIQUE (org_id, number);

-- proformas · proformas_pkey (p)
alter table public.proformas add constraint proformas_pkey PRIMARY KEY (id);

-- proformas · proformas_status_check (c)
alter table public.proformas add constraint proformas_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'converted'::text, 'cancelled'::text])));

-- proformas · proformas_warehouse_id_fkey (f)
alter table public.proformas add constraint proformas_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

-- purchase_lines · purchase_lines_article_id_fkey (f)
alter table public.purchase_lines add constraint purchase_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- purchase_lines · purchase_lines_org_id_fkey (f)
alter table public.purchase_lines add constraint purchase_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- purchase_lines · purchase_lines_pkey (p)
alter table public.purchase_lines add constraint purchase_lines_pkey PRIMARY KEY (id);

-- purchase_lines · purchase_lines_purchase_id_fkey (f)
alter table public.purchase_lines add constraint purchase_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;

-- purchase_lines · purchase_lines_qty_check (c)
alter table public.purchase_lines add constraint purchase_lines_qty_check CHECK ((qty > (0)::numeric));

-- purchase_lines · purchase_lines_warehouse_id_fkey (f)
alter table public.purchase_lines add constraint purchase_lines_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

-- purchase_order_lines · purchase_order_lines_article_id_fkey (f)
alter table public.purchase_order_lines add constraint purchase_order_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- purchase_order_lines · purchase_order_lines_order_id_fkey (f)
alter table public.purchase_order_lines add constraint purchase_order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;

-- purchase_order_lines · purchase_order_lines_pkey (p)
alter table public.purchase_order_lines add constraint purchase_order_lines_pkey PRIMARY KEY (id);

-- purchase_order_lines · purchase_order_lines_qty_check (c)
alter table public.purchase_order_lines add constraint purchase_order_lines_qty_check CHECK ((qty > (0)::numeric));

-- purchase_order_lines · purchase_order_lines_unit_cost_check (c)
alter table public.purchase_order_lines add constraint purchase_order_lines_unit_cost_check CHECK ((unit_cost >= (0)::numeric));

-- purchase_orders · purchase_orders_org_id_number_key (u)
alter table public.purchase_orders add constraint purchase_orders_org_id_number_key UNIQUE (org_id, number);

-- purchase_orders · purchase_orders_pkey (p)
alter table public.purchase_orders add constraint purchase_orders_pkey PRIMARY KEY (id);

-- purchase_orders · purchase_orders_status_check (c)
alter table public.purchase_orders add constraint purchase_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'received'::text, 'cancelled'::text])));

-- purchase_orders · purchase_orders_supplier_id_fkey (f)
alter table public.purchase_orders add constraint purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

-- purchase_orders · purchase_orders_warehouse_id_fkey (f)
alter table public.purchase_orders add constraint purchase_orders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

-- purchase_payment_balances · purchase_payment_balances_opening_balance_check (c)
alter table public.purchase_payment_balances add constraint purchase_payment_balances_opening_balance_check CHECK ((opening_balance >= (0)::numeric));

-- purchase_payment_balances · purchase_payment_balances_org_id_fkey (f)
alter table public.purchase_payment_balances add constraint purchase_payment_balances_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- purchase_payment_balances · purchase_payment_balances_pkey (p)
alter table public.purchase_payment_balances add constraint purchase_payment_balances_pkey PRIMARY KEY (purchase_id);

-- purchase_payment_balances · purchase_payment_balances_purchase_id_fkey (f)
alter table public.purchase_payment_balances add constraint purchase_payment_balances_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE RESTRICT;

-- purchase_payments · purchase_payments_amount_check (c)
alter table public.purchase_payments add constraint purchase_payments_amount_check CHECK ((amount > (0)::numeric));

-- purchase_payments · purchase_payments_org_id_fkey (f)
alter table public.purchase_payments add constraint purchase_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- purchase_payments · purchase_payments_pkey (p)
alter table public.purchase_payments add constraint purchase_payments_pkey PRIMARY KEY (id);

-- purchase_payments · purchase_payments_purchase_id_fkey (f)
alter table public.purchase_payments add constraint purchase_payments_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE RESTRICT;

-- purchases · purchases_org_id_fkey (f)
alter table public.purchases add constraint purchases_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- purchases · purchases_pkey (p)
alter table public.purchases add constraint purchases_pkey PRIMARY KEY (id);

-- purchases · purchases_supplier_id_fkey (f)
alter table public.purchases add constraint purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

-- purchases · purchases_warehouse_id_fkey (f)
alter table public.purchases add constraint purchases_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

-- push_subscriptions · push_subscriptions_endpoint_key (u)
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key UNIQUE (endpoint);

-- push_subscriptions · push_subscriptions_pkey (p)
alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);

-- reseller_clients · reseller_clients_client_label_check (c)
alter table public.reseller_clients add constraint reseller_clients_client_label_check CHECK (((length(TRIM(BOTH FROM client_label)) >= 1) AND (length(TRIM(BOTH FROM client_label)) <= 200)));

-- reseller_clients · reseller_clients_id_fkey (f)
alter table public.reseller_clients add constraint reseller_clients_id_fkey FOREIGN KEY (id) REFERENCES commercial_accounts(id) ON DELETE RESTRICT;

-- reseller_clients · reseller_clients_pkey (p)
alter table public.reseller_clients add constraint reseller_clients_pkey PRIMARY KEY (id);

-- reseller_clients · reseller_clients_reseller_id_fkey (f)
alter table public.reseller_clients add constraint reseller_clients_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES commercial_resellers(id) ON DELETE RESTRICT;

-- reseller_commissions · reseller_commissions_amount_check (c)
alter table public.reseller_commissions add constraint reseller_commissions_amount_check CHECK ((amount > (0)::numeric));

-- reseller_commissions · reseller_commissions_currency_check (c)
alter table public.reseller_commissions add constraint reseller_commissions_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'CDF'::text, 'EUR'::text])));

-- reseller_commissions · reseller_commissions_payment_id_fkey (f)
alter table public.reseller_commissions add constraint reseller_commissions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES commercial_payments(id) ON DELETE RESTRICT;

-- reseller_commissions · reseller_commissions_payment_id_key (u)
alter table public.reseller_commissions add constraint reseller_commissions_payment_id_key UNIQUE (payment_id);

-- reseller_commissions · reseller_commissions_pkey (p)
alter table public.reseller_commissions add constraint reseller_commissions_pkey PRIMARY KEY (id);

-- reseller_commissions · reseller_commissions_reseller_id_fkey (f)
alter table public.reseller_commissions add constraint reseller_commissions_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES commercial_resellers(id) ON DELETE RESTRICT;

-- reseller_commissions · reseller_commissions_status_check (c)
alter table public.reseller_commissions add constraint reseller_commissions_status_check CHECK ((status = ANY (ARRAY['a_payer'::text, 'payee'::text, 'annulee'::text])));

-- sale_cost_snapshots · sale_cost_snapshots_org_id_fkey (f)
alter table public.sale_cost_snapshots add constraint sale_cost_snapshots_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- sale_cost_snapshots · sale_cost_snapshots_pkey (p)
alter table public.sale_cost_snapshots add constraint sale_cost_snapshots_pkey PRIMARY KEY (sale_line_id);

-- sale_cost_snapshots · sale_cost_snapshots_sale_line_id_fkey (f)
alter table public.sale_cost_snapshots add constraint sale_cost_snapshots_sale_line_id_fkey FOREIGN KEY (sale_line_id) REFERENCES sale_lines(id) ON DELETE CASCADE;

-- sale_lines · sale_lines_article_id_fkey (f)
alter table public.sale_lines add constraint sale_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- sale_lines · sale_lines_discount_pct_check (c)
alter table public.sale_lines add constraint sale_lines_discount_pct_check CHECK (((discount_pct >= (0)::numeric) AND (discount_pct <= (100)::numeric)));

-- sale_lines · sale_lines_org_id_fkey (f)
alter table public.sale_lines add constraint sale_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- sale_lines · sale_lines_pkey (p)
alter table public.sale_lines add constraint sale_lines_pkey PRIMARY KEY (id);

-- sale_lines · sale_lines_qty_check (c)
alter table public.sale_lines add constraint sale_lines_qty_check CHECK ((qty > (0)::numeric));

-- sale_lines · sale_lines_sale_id_fkey (f)
alter table public.sale_lines add constraint sale_lines_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;

-- sale_lines · sale_lines_warehouse_id_fkey (f)
alter table public.sale_lines add constraint sale_lines_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

-- sale_payments · sale_payments_amount_check (c)
alter table public.sale_payments add constraint sale_payments_amount_check CHECK ((amount > (0)::numeric));

-- sale_payments · sale_payments_customer_deposit_id_fkey (f)
alter table public.sale_payments add constraint sale_payments_customer_deposit_id_fkey FOREIGN KEY (customer_deposit_id) REFERENCES customer_deposits(id) ON DELETE RESTRICT;

-- sale_payments · sale_payments_kind_check (c)
alter table public.sale_payments add constraint sale_payments_kind_check CHECK ((kind = ANY (ARRAY['initial'::text, 'payment'::text, 'advance'::text])));

-- sale_payments · sale_payments_method_check (c)
alter table public.sale_payments add constraint sale_payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank'::text])));

-- sale_payments · sale_payments_operator_check (c)
alter table public.sale_payments add constraint sale_payments_operator_check CHECK ((operator = ANY (ARRAY['airtel'::text, 'mpesa'::text, 'orange'::text, 'autre'::text])));

-- sale_payments · sale_payments_org_id_fkey (f)
alter table public.sale_payments add constraint sale_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- sale_payments · sale_payments_pkey (p)
alter table public.sale_payments add constraint sale_payments_pkey PRIMARY KEY (id);

-- sale_payments · sale_payments_reference_check (c)
alter table public.sale_payments add constraint sale_payments_reference_check CHECK ((char_length(reference) <= 80));

-- sale_payments · sale_payments_sale_id_fkey (f)
alter table public.sale_payments add constraint sale_payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;

-- sales · sales_customer_id_fkey (f)
alter table public.sales add constraint sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

-- sales · sales_org_id_fkey (f)
alter table public.sales add constraint sales_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- sales · sales_payment_check (c)
alter table public.sales add constraint sales_payment_check CHECK ((payment = ANY (ARRAY['cash'::text, 'credit'::text])));

-- sales · sales_payment_method_check (c)
alter table public.sales add constraint sales_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank'::text])));

-- sales · sales_payment_operator_check (c)
alter table public.sales add constraint sales_payment_operator_check CHECK ((payment_operator = ANY (ARRAY['airtel'::text, 'mpesa'::text, 'orange'::text, 'autre'::text])));

-- sales · sales_payment_reference_check (c)
alter table public.sales add constraint sales_payment_reference_check CHECK ((char_length(payment_reference) <= 80));

-- sales · sales_pkey (p)
alter table public.sales add constraint sales_pkey PRIMARY KEY (id);

-- sales · sales_warehouse_id_fkey (f)
alter table public.sales add constraint sales_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

-- sales_prospects · sales_prospects_company_check (c)
alter table public.sales_prospects add constraint sales_prospects_company_check CHECK (((length(TRIM(BOTH FROM company)) >= 1) AND (length(TRIM(BOTH FROM company)) <= 200)));

-- sales_prospects · sales_prospects_notes_check (c)
alter table public.sales_prospects add constraint sales_prospects_notes_check CHECK ((length(notes) <= 5000));

-- sales_prospects · sales_prospects_pkey (p)
alter table public.sales_prospects add constraint sales_prospects_pkey PRIMARY KEY (id);

-- sales_prospects · sales_prospects_stage_check (c)
alter table public.sales_prospects add constraint sales_prospects_stage_check CHECK ((stage = ANY (ARRAY['a_contacter'::text, 'demo_prevue'::text, 'essai'::text, 'gagne'::text, 'perdu'::text])));

-- settings · settings_org_id_fkey (f)
alter table public.settings add constraint settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- settings · settings_pkey (p)
alter table public.settings add constraint settings_pkey PRIMARY KEY (org_id);

-- settings · settings_usd_cdf_check (c)
alter table public.settings add constraint settings_usd_cdf_check CHECK ((usd_cdf > (0)::numeric));

-- stock_lots · stock_lots_article_id_fkey (f)
alter table public.stock_lots add constraint stock_lots_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- stock_lots · stock_lots_lot_number_check (c)
alter table public.stock_lots add constraint stock_lots_lot_number_check CHECK (((char_length(lot_number) >= 1) AND (char_length(lot_number) <= 60)));

-- stock_lots · stock_lots_pkey (p)
alter table public.stock_lots add constraint stock_lots_pkey PRIMARY KEY (id);

-- stock_lots · stock_lots_qty_left_check (c)
alter table public.stock_lots add constraint stock_lots_qty_left_check CHECK ((qty_left >= (0)::numeric));

-- stock_lots · stock_lots_warehouse_id_fkey (f)
alter table public.stock_lots add constraint stock_lots_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

-- stock_moves · stock_moves_article_id_fkey (f)
alter table public.stock_moves add constraint stock_moves_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- stock_moves · stock_moves_org_id_fkey (f)
alter table public.stock_moves add constraint stock_moves_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- stock_moves · stock_moves_pkey (p)
alter table public.stock_moves add constraint stock_moves_pkey PRIMARY KEY (id);

-- stock_moves · stock_moves_reason_check (c)
alter table public.stock_moves add constraint stock_moves_reason_check CHECK ((reason = ANY (ARRAY['sale'::text, 'purchase'::text, 'adjustment'::text, 'transfer'::text, 'client_return'::text, 'supplier_return'::text])));

-- stock_moves · stock_moves_warehouse_id_fkey (f)
alter table public.stock_moves add constraint stock_moves_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

-- supplier_return_lines · supplier_return_lines_article_id_fkey (f)
alter table public.supplier_return_lines add constraint supplier_return_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- supplier_return_lines · supplier_return_lines_pkey (p)
alter table public.supplier_return_lines add constraint supplier_return_lines_pkey PRIMARY KEY (id);

-- supplier_return_lines · supplier_return_lines_qty_check (c)
alter table public.supplier_return_lines add constraint supplier_return_lines_qty_check CHECK ((qty > (0)::numeric));

-- supplier_return_lines · supplier_return_lines_return_id_fkey (f)
alter table public.supplier_return_lines add constraint supplier_return_lines_return_id_fkey FOREIGN KEY (return_id) REFERENCES supplier_returns(id) ON DELETE CASCADE;

-- supplier_returns · supplier_returns_org_id_number_key (u)
alter table public.supplier_returns add constraint supplier_returns_org_id_number_key UNIQUE (org_id, number);

-- supplier_returns · supplier_returns_pkey (p)
alter table public.supplier_returns add constraint supplier_returns_pkey PRIMARY KEY (id);

-- supplier_returns · supplier_returns_supplier_id_fkey (f)
alter table public.supplier_returns add constraint supplier_returns_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

-- supplier_returns · supplier_returns_warehouse_id_fkey (f)
alter table public.supplier_returns add constraint supplier_returns_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

-- suppliers · suppliers_org_id_fkey (f)
alter table public.suppliers add constraint suppliers_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- suppliers · suppliers_pkey (p)
alter table public.suppliers add constraint suppliers_pkey PRIMARY KEY (id);

-- support_messages · support_messages_body_check (c)
alter table public.support_messages add constraint support_messages_body_check CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 5000)));

-- support_messages · support_messages_pkey (p)
alter table public.support_messages add constraint support_messages_pkey PRIMARY KEY (id);

-- support_messages · support_messages_ticket_id_fkey (f)
alter table public.support_messages add constraint support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE RESTRICT;

-- support_tickets · support_tickets_category_check (c)
alter table public.support_tickets add constraint support_tickets_category_check CHECK ((category = ANY (ARRAY['technique'::text, 'abonnement'::text, 'utilisation'::text, 'autre'::text])));

-- support_tickets · support_tickets_number_key (u)
alter table public.support_tickets add constraint support_tickets_number_key UNIQUE (number);

-- support_tickets · support_tickets_org_id_fkey (f)
alter table public.support_tickets add constraint support_tickets_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- support_tickets · support_tickets_pkey (p)
alter table public.support_tickets add constraint support_tickets_pkey PRIMARY KEY (id);

-- support_tickets · support_tickets_priority_check (c)
alter table public.support_tickets add constraint support_tickets_priority_check CHECK ((priority = ANY (ARRAY['normale'::text, 'urgente'::text])));

-- support_tickets · support_tickets_status_check (c)
alter table public.support_tickets add constraint support_tickets_status_check CHECK ((status = ANY (ARRAY['ouvert'::text, 'en_cours'::text, 'resolu'::text])));

-- support_tickets · support_tickets_subject_check (c)
alter table public.support_tickets add constraint support_tickets_subject_check CHECK (((length(TRIM(BOTH FROM subject)) >= 3) AND (length(TRIM(BOTH FROM subject)) <= 200)));

-- transfer_lines · transfer_lines_article_id_fkey (f)
alter table public.transfer_lines add constraint transfer_lines_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id);

-- transfer_lines · transfer_lines_org_id_fkey (f)
alter table public.transfer_lines add constraint transfer_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- transfer_lines · transfer_lines_pkey (p)
alter table public.transfer_lines add constraint transfer_lines_pkey PRIMARY KEY (id);

-- transfer_lines · transfer_lines_qty_check (c)
alter table public.transfer_lines add constraint transfer_lines_qty_check CHECK ((qty > (0)::numeric));

-- transfer_lines · transfer_lines_transfer_id_fkey (f)
alter table public.transfer_lines add constraint transfer_lines_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE;

-- transfers · transfers_from_warehouse_id_fkey (f)
alter table public.transfers add constraint transfers_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

-- transfers · transfers_org_id_fkey (f)
alter table public.transfers add constraint transfers_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- transfers · transfers_pkey (p)
alter table public.transfers add constraint transfers_pkey PRIMARY KEY (id);

-- transfers · transfers_to_warehouse_id_fkey (f)
alter table public.transfers add constraint transfers_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

-- unit_options · unit_options_label_check (c)
alter table public.unit_options add constraint unit_options_label_check CHECK (((char_length(TRIM(BOTH FROM label)) >= 1) AND (char_length(TRIM(BOTH FROM label)) <= 30)));

-- unit_options · unit_options_org_id_label_key (u)
alter table public.unit_options add constraint unit_options_org_id_label_key UNIQUE (org_id, label);

-- unit_options · unit_options_pkey (p)
alter table public.unit_options add constraint unit_options_pkey PRIMARY KEY (id);

-- user_warehouses · user_warehouses_pkey (p)
alter table public.user_warehouses add constraint user_warehouses_pkey PRIMARY KEY (user_id);

-- user_warehouses · user_warehouses_warehouse_id_fkey (f)
alter table public.user_warehouses add constraint user_warehouses_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;

-- warehouse_stock · warehouse_stock_article_id_fkey (f)
alter table public.warehouse_stock add constraint warehouse_stock_article_id_fkey FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

-- warehouse_stock · warehouse_stock_org_id_fkey (f)
alter table public.warehouse_stock add constraint warehouse_stock_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- warehouse_stock · warehouse_stock_pkey (p)
alter table public.warehouse_stock add constraint warehouse_stock_pkey PRIMARY KEY (warehouse_id, article_id);

-- warehouse_stock · warehouse_stock_warehouse_id_fkey (f)
alter table public.warehouse_stock add constraint warehouse_stock_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;

-- warehouses · warehouses_name_check (c)
alter table public.warehouses add constraint warehouses_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)));

-- warehouses · warehouses_org_id_fkey (f)
alter table public.warehouses add constraint warehouses_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- warehouses · warehouses_pkey (p)
alter table public.warehouses add constraint warehouses_pkey PRIMARY KEY (id);

-- worker_payments · worker_payments_amount_check (c)
alter table public.worker_payments add constraint worker_payments_amount_check CHECK ((amount > (0)::numeric));

-- worker_payments · worker_payments_method_check (c)
alter table public.worker_payments add constraint worker_payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank'::text])));

-- worker_payments · worker_payments_pkey (p)
alter table public.worker_payments add constraint worker_payments_pkey PRIMARY KEY (id);

-- worker_payments · worker_payments_worker_id_fkey (f)
alter table public.worker_payments add constraint worker_payments_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES workers(id);

-- workers · workers_name_check (c)
alter table public.workers add constraint workers_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));

-- workers · workers_pay_kind_check (c)
alter table public.workers add constraint workers_pay_kind_check CHECK ((pay_kind = ANY (ARRAY['fixed'::text, 'daily'::text])));

-- workers · workers_pkey (p)
alter table public.workers add constraint workers_pkey PRIMARY KEY (id);

-- workers · workers_usual_amount_check (c)
alter table public.workers add constraint workers_usual_amount_check CHECK ((usual_amount >= (0)::numeric));
