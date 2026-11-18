-- KaPya ERP — export de production (lecture seule)
-- Projet Supabase : ttplxlobehmwzfnxviej
-- Export : 2026-11-18 07:55
-- Généré par scripts/exporter-supabase.mjs. Ne contient aucun secret.

-- articles · t_bump_version
CREATE TRIGGER t_bump_version BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION bump_record_version();

-- articles · trg_touch_articles
CREATE TRIGGER trg_touch_articles BEFORE INSERT OR UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- business_expenses · audit_business_expenses
CREATE TRIGGER audit_business_expenses AFTER INSERT OR DELETE OR UPDATE ON public.business_expenses FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- cash_closures · audit_cash_closures
CREATE TRIGGER audit_cash_closures AFTER INSERT OR UPDATE ON public.cash_closures FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- commercial_payments · commercial_payment_commissions
CREATE TRIGGER commercial_payment_commissions BEFORE UPDATE OF voided_at ON public.commercial_payments FOR EACH ROW EXECUTE FUNCTION guard_payment_commissions();

-- customer_deposits · audit_customer_deposits
CREATE TRIGGER audit_customer_deposits AFTER INSERT OR DELETE OR UPDATE ON public.customer_deposits FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- customers · t_bump_version
CREATE TRIGGER t_bump_version BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION bump_record_version();

-- customers · trg_touch_customers
CREATE TRIGGER trg_touch_customers BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- organizations · t_guard_org_delete
CREATE TRIGGER t_guard_org_delete BEFORE DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION guard_org_delete();

-- organizations · t_guard_org_plan
CREATE TRIGGER t_guard_org_plan BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION guard_org_plan();

-- organizations · t_log_org_changes
CREATE TRIGGER t_log_org_changes AFTER UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION log_org_changes();

-- platform_admins · t_log_platform_admin
CREATE TRIGGER t_log_platform_admin AFTER INSERT OR DELETE ON public.platform_admins FOR EACH ROW EXECUTE FUNCTION log_platform_admin_changes();

-- profiles · t_guard_admin
CREATE TRIGGER t_guard_admin BEFORE UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_admin();

-- profiles · t_log_profile_changes
CREATE TRIGGER t_log_profile_changes AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION log_profile_changes();

-- purchase_lines · t_initialize_new_purchase_balance
CREATE TRIGGER t_initialize_new_purchase_balance AFTER INSERT ON public.purchase_lines FOR EACH ROW EXECUTE FUNCTION initialize_new_purchase_balance();

-- purchase_lines · t_purchase_line
CREATE TRIGGER t_purchase_line AFTER INSERT OR DELETE ON public.purchase_lines FOR EACH ROW EXECUTE FUNCTION purchase_line_move();

-- purchase_lines · t_purchase_line_warehouse
CREATE TRIGGER t_purchase_line_warehouse BEFORE INSERT ON public.purchase_lines FOR EACH ROW EXECUTE FUNCTION line_takes_document_warehouse();

-- purchase_payments · audit_purchase_payments
CREATE TRIGGER audit_purchase_payments AFTER INSERT OR DELETE OR UPDATE ON public.purchase_payments FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- purchases · audit_purchases_delete
CREATE TRIGGER audit_purchases_delete BEFORE DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- purchases · audit_purchases_insert_update
CREATE TRIGGER audit_purchases_insert_update AFTER INSERT OR UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- purchases · t_guard_purchases_org_links
CREATE TRIGGER t_guard_purchases_org_links BEFORE INSERT OR UPDATE OF org_id, supplier_id, warehouse_id ON public.purchases FOR EACH ROW EXECUTE FUNCTION guard_document_org_links();

-- sale_lines · t_sale_line
CREATE TRIGGER t_sale_line AFTER INSERT OR DELETE ON public.sale_lines FOR EACH ROW EXECUTE FUNCTION sale_line_move();

-- sale_lines · t_sale_line_warehouse
CREATE TRIGGER t_sale_line_warehouse BEFORE INSERT ON public.sale_lines FOR EACH ROW EXECUTE FUNCTION line_takes_document_warehouse();

-- sale_lines · t_snapshot_sale_line_cost
CREATE TRIGGER t_snapshot_sale_line_cost AFTER INSERT ON public.sale_lines FOR EACH ROW EXECUTE FUNCTION snapshot_sale_line_cost();

-- sale_lines · trg_freeze_sale_line_cost
CREATE TRIGGER trg_freeze_sale_line_cost BEFORE INSERT ON public.sale_lines FOR EACH ROW EXECUTE FUNCTION freeze_sale_line_cost();

-- sale_payments · audit_sale_payments
CREATE TRIGGER audit_sale_payments AFTER INSERT OR DELETE OR UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- sales · audit_sales_delete
CREATE TRIGGER audit_sales_delete BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- sales · audit_sales_insert_update
CREATE TRIGGER audit_sales_insert_update AFTER INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- sales · t_guard_credit_paid_amount
CREATE TRIGGER t_guard_credit_paid_amount BEFORE UPDATE OF paid ON public.sales FOR EACH ROW EXECUTE FUNCTION guard_credit_paid_amount();

-- sales · t_guard_sales_org_links
CREATE TRIGGER t_guard_sales_org_links BEFORE INSERT OR UPDATE OF org_id, customer_id, warehouse_id ON public.sales FOR EACH ROW EXECUTE FUNCTION guard_document_org_links();

-- sales · t_restore_customer_deposit_on_sale_delete
CREATE TRIGGER t_restore_customer_deposit_on_sale_delete BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION restore_customer_deposit_on_sale_delete();

-- stock_lots · trg_touch_stock_lots
CREATE TRIGGER trg_touch_stock_lots BEFORE INSERT OR UPDATE ON public.stock_lots FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- stock_moves · t_apply_move
CREATE TRIGGER t_apply_move AFTER INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION apply_move();

-- stock_moves · t_consume_lots
CREATE TRIGGER t_consume_lots AFTER INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION consume_lots_fefo();

-- stock_moves · t_move_warehouse
CREATE TRIGGER t_move_warehouse BEFORE INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION move_takes_default_warehouse();

-- suppliers · t_bump_version
CREATE TRIGGER t_bump_version BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION bump_record_version();

-- suppliers · trg_touch_suppliers
CREATE TRIGGER trg_touch_suppliers BEFORE INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- transfer_lines · t_transfer_line
CREATE TRIGGER t_transfer_line AFTER INSERT ON public.transfer_lines FOR EACH ROW EXECUTE FUNCTION transfer_line_move();

-- transfers · t_guard_plan_transfers
CREATE TRIGGER t_guard_plan_transfers BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION guard_plan_transfers();

-- warehouse_stock · trg_touch_warehouse_stock
CREATE TRIGGER trg_touch_warehouse_stock BEFORE INSERT OR UPDATE ON public.warehouse_stock FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- warehouses · t_guard_warehouse_update
CREATE TRIGGER t_guard_warehouse_update BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION guard_warehouse_update();
