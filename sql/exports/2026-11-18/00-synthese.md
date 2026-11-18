# Synthèse production

Projet `ttplxlobehmwzfnxviej` — 2026-11-18 08:57.

- Tables : **66**
- Tables sans RLS : **0**
- Tables RLS sans politique : **1** → `document_counters`
- Fonctions : **122**, dont **111** SECURITY DEFINER
- SECURITY DEFINER sans search_path : **0**
- Fonctions exécutables par anon : **0**
- Politiques Storage : **0**
- Tâches planifiées : **1**

## Tables présentes en production mais absentes du SQL versionné (36)

- `app_errors`
- `auto_backups`
- `cash_closures_shop`
- `commercial_accounts`
- `commercial_documents`
- `commercial_dues`
- `commercial_payments`
- `commercial_resellers`
- `commercial_seller`
- `credit_note_lines`
- `credit_notes`
- `customer_return_lines`
- `customer_returns`
- `customer_setup`
- `dashboard_preferences`
- `document_counters`
- `number_ranges`
- `paiements_abonnement`
- `platform_audit`
- `proforma_lines`
- `proformas`
- `purchase_order_lines`
- `purchase_orders`
- `push_subscriptions`
- `reseller_clients`
- `reseller_commissions`
- `sales_prospects`
- `stock_lots`
- `supplier_return_lines`
- `supplier_returns`
- `support_messages`
- `support_tickets`
- `unit_options`
- `user_warehouses`
- `worker_payments`
- `workers`

## Tables du SQL versionné absentes en production (0)

Aucune.

## Fonctions de production absentes du SQL versionné (75)

- `accept_invitation`
- `article_total_stock`
- `backup_now`
- `bump_record_version`
- `cancel_commercial_due`
- `cancel_proforma`
- `cancel_purchase_order`
- `cancel_reseller_commission`
- `cash_close_summary_shop`
- `consume_lots_fefo`
- `create_commercial_document`
- `create_commercial_due`
- `create_credit_note`
- `create_customer_return`
- `create_proforma`
- `create_purchase_order`
- `create_stock_lot`
- `create_supplier_return`
- `create_worker`
- `credit_sales_all`
- `customer_debts`
- `customer_org`
- `decide_commercial_document`
- `delete_company`
- `delete_worker`
- `find_article_by_barcode`
- `freeze_sale_line_cost`
- `generate_reseller_commission`
- `guard_document_org_links`
- `guard_org_delete`
- `guard_payment_commissions`
- `is_reseller`
- `log_org_changes`
- `log_platform_admin_changes`
- `log_profile_changes`
- `make_backup_for_org`
- `mark_proforma_converted`
- `mark_welcome_seen`
- `mobile_money_total`
- `my_shop`
- `next_document_number`
- `open_support_ticket`
- `paiements_en_attente`
- `push_backup_offsite`
- `receive_purchase_order`
- `record_commercial_payment`
- `record_credit_payment_method`
- `record_worker_payment`
- `register_purchase_lots`
- `rejeter_paiement`
- `remove_member`
- `renew_commercial_subscription`
- `reply_support_ticket`
- `reserve_invoice_range`
- `reserve_number_range`
- `rls_auto_enable`
- `run_daily_backups`
- `save_customer_setup`
- `save_shop_closure`
- `search_sales`
- `set_business_type`
- `set_company_header`
- `set_company_logo`
- `set_discounts_enabled`
- `set_hidden_features`
- `set_initial_payment_method`
- `set_receipt_footer`
- `set_sale_payment_method`
- `set_sale_pickup`
- `set_support_status`
- `set_vat`
- `settle_reseller_commission`
- `touch_updated_at`
- `valider_paiement`
- `void_commercial_payment`

## Fonctions du SQL versionné absentes en production (0)

Aucune.

## Politiques de production absentes du SQL versionné (0)

Aucune.
