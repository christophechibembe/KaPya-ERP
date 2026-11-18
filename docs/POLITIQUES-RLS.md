# Politiques RLS de production

Comparaison entre `sql/exports/2026-11-18/03-politiques.sql` et le SQL versionné
(`sql/*.sql` hors instantané, `supabase/migrations/`). Généré par `scripts/auditer-politiques.mjs`.

- Politiques en production : **110**
- Politiques versionnées : **63**
- Absentes du dépôt : **47** (30 de lecture, 17 d'écriture)
- Versionnées sans équivalent en production : **0**

Les définitions exactes sont désormais dans [`../sql/politiques-production.sql`](../sql/politiques-production.sql).
Ce fichier est une référence : les politiques existent déjà en production et ne sont pas
réappliquées. Toute évolution passe par une migration datée.

## Répartition par table

| Table | Politiques | Lecture | Écriture |
| --- | --- | --- | --- |
| `commercial_resellers` | 3 | 1 | 2 |
| `reseller_clients` | 3 | 1 | 2 |
| `unit_options` | 3 | 1 | 2 |
| `app_errors` | 2 | 1 | 1 |
| `paiements_abonnement` | 2 | 1 | 1 |
| `user_warehouses` | 2 | 1 | 1 |
| `auto_backups` | 1 | 1 | 0 |
| `cash_closures_shop` | 1 | 1 | 0 |
| `commercial_accounts` | 1 | 0 | 1 |
| `commercial_documents` | 1 | 1 | 0 |
| `commercial_dues` | 1 | 1 | 0 |
| `commercial_payments` | 1 | 1 | 0 |
| `commercial_seller` | 1 | 0 | 1 |
| `credit_note_lines` | 1 | 1 | 0 |
| `credit_notes` | 1 | 1 | 0 |
| `customer_deposit_counters` | 1 | 1 | 0 |
| `customer_return_lines` | 1 | 1 | 0 |
| `customer_returns` | 1 | 1 | 0 |
| `customer_setup` | 1 | 1 | 0 |
| `dashboard_preferences` | 1 | 0 | 1 |
| `invoice_counters` | 1 | 1 | 0 |
| `number_ranges` | 1 | 0 | 1 |
| `platform_admins` | 1 | 1 | 0 |
| `platform_audit` | 1 | 1 | 0 |
| `proforma_lines` | 1 | 1 | 0 |
| `proformas` | 1 | 1 | 0 |
| `purchase_order_lines` | 1 | 1 | 0 |
| `purchase_orders` | 1 | 1 | 0 |
| `push_subscriptions` | 1 | 0 | 1 |
| `reseller_commissions` | 1 | 1 | 0 |
| `sales_prospects` | 1 | 0 | 1 |
| `stock_lots` | 1 | 1 | 0 |
| `supplier_return_lines` | 1 | 1 | 0 |
| `supplier_returns` | 1 | 1 | 0 |
| `support_messages` | 1 | 1 | 0 |
| `support_tickets` | 1 | 1 | 0 |
| `worker_payments` | 1 | 0 | 1 |
| `workers` | 1 | 0 | 1 |

## Relecture de sécurité

| Table | Politique | Commande | Rôles | Condition |
| --- | --- | --- | --- | --- |
| `app_errors` | app_errors_insert | insert | authenticated | — · check `(user_id = auth.uid())` |
| `app_errors` | app_errors_read | select | authenticated | `is_platform_admin()` |
| `auto_backups` | auto_backups_read | select | authenticated | `((org_id = my_org()) AND (my_role() = 'admin'::text))` |
| `cash_closures_shop` | cash_closures_shop_r | select | authenticated | `((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop())))` |
| `commercial_accounts` | commercial_platform_only | all | authenticated | `( SELECT is_platform_admin() AS is_platform_admin)` · check `( SELECT is_platform_admin() AS is_platform_admin)` |
| `commercial_documents` | documents_admin | select | authenticated | `is_platform_admin()` |
| `commercial_dues` | commercial_dues_platform | select | authenticated | `( SELECT is_platform_admin() AS is_platform_admin)` |
| `commercial_payments` | commercial_payments_platform | select | authenticated | `( SELECT is_platform_admin() AS is_platform_admin)` |
| `commercial_resellers` | resellers_insert | insert | authenticated | — · check `is_platform_admin()` |
| `commercial_resellers` | resellers_read | select | authenticated | `(is_platform_admin() OR ((user_id = auth.uid()) AND active))` |
| `commercial_resellers` | resellers_update | update | authenticated | `is_platform_admin()` · check `is_platform_admin()` |
| `commercial_seller` | seller_admin | all | authenticated | `is_platform_admin()` · check `is_platform_admin()` |
| `credit_note_lines` | credit_note_lines_r | select | authenticated | `((org_id = my_org()) AND (EXISTS ( SELECT 1 FROM credit_notes c WHERE (c.id = credit_note_` |
| `credit_notes` | credit_notes_r | select | authenticated | `((org_id = my_org()) AND (EXISTS ( SELECT 1 FROM sales s WHERE (s.id = credit_notes.sale_i` |
| `customer_deposit_counters` | customer_deposit_counters_read | select | authenticated | `(org_id = my_org())` |
| `customer_return_lines` | customer_return_lines_r | select | authenticated | `((org_id = my_org()) AND (EXISTS ( SELECT 1 FROM customer_returns r WHERE (r.id = customer` |
| `customer_returns` | customer_returns_r | select | authenticated | `((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop())))` |
| `customer_setup` | setup_read | select | authenticated | `(is_platform_admin() OR (id = customer_org()))` |
| `dashboard_preferences` | dashboard_preferences_own | all | authenticated | `(user_id = auth.uid())` · check `(user_id = auth.uid())` |
| `invoice_counters` | invoice_counters_read | select | authenticated | `(org_id = my_org())` |
| `number_ranges` | number_ranges_org | all | public | `(org_id = my_org())` · check `(org_id = my_org())` |
| `paiements_abonnement` | pay_insert | insert | public | — · check `((org_id = my_org()) AND (my_role() = 'admin'::text))` |
| `paiements_abonnement` | pay_read_own | select | public | `(org_id = my_org())` |
| `platform_admins` | platform_admins_select | select | authenticated | `is_platform_admin()` |
| `platform_audit` | platform_audit_read | select | authenticated | `is_platform_admin()` |
| `proforma_lines` | proforma_lines_r | select | authenticated | `((org_id = my_org()) AND (EXISTS ( SELECT 1 FROM proformas p WHERE (p.id = proforma_lines.` |
| `proformas` | proformas_r | select | authenticated | `((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop())))` |
| `purchase_order_lines` | purchase_order_lines_r | select | authenticated | `((org_id = my_org()) AND (EXISTS ( SELECT 1 FROM purchase_orders o WHERE (o.id = purchase_` |
| `purchase_orders` | purchase_orders_r | select | authenticated | `((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptabl` |
| `push_subscriptions` | push_own | all | public | `(user_id = auth.uid())` · check `((user_id = auth.uid()) AND (org_id = my_org()))` |
| `reseller_clients` | reseller_clients_insert | insert | authenticated | — · check `is_platform_admin()` |
| `reseller_clients` | reseller_clients_read | select | authenticated | `(is_platform_admin() OR (EXISTS ( SELECT 1 FROM commercial_resellers r WHERE ((r.id = rese` |
| `reseller_clients` | reseller_clients_update | update | authenticated | `is_platform_admin()` · check `is_platform_admin()` |
| `reseller_commissions` | commissions_read | select | authenticated | `(is_platform_admin() OR (EXISTS ( SELECT 1 FROM commercial_resellers r WHERE ((r.id = rese` |
| `sales_prospects` | prospects_admin | all | authenticated | `is_platform_admin()` · check `is_platform_admin()` |
| `stock_lots` | stock_lots_r | select | authenticated | `((org_id = my_org()) AND ((my_shop() IS NULL) OR (warehouse_id = my_shop())))` |
| `supplier_return_lines` | supplier_return_lines_r | select | authenticated | `((org_id = my_org()) AND (EXISTS ( SELECT 1 FROM supplier_returns r WHERE (r.id = supplier` |
| `supplier_returns` | supplier_returns_r | select | authenticated | `((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'comptabl` |
| `support_messages` | messages_read | select | authenticated | `(is_platform_admin() OR (EXISTS ( SELECT 1 FROM support_tickets t WHERE ((t.id = support_m` |
| `support_tickets` | tickets_read | select | authenticated | `(is_platform_admin() OR (org_id = customer_org()))` |
| `unit_options` | unit_options_delete | delete | authenticated | `((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text, 'manager'::text])))` |
| `unit_options` | unit_options_insert | insert | authenticated | — · check `((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::te` |
| `unit_options` | unit_options_select | select | authenticated | `(org_id = my_org())` |
| `user_warehouses` | user_warehouses_r | select | authenticated | `((user_id = auth.uid()) OR ((org_id = my_org()) AND (my_role() = ANY (ARRAY['admin'::text,` |
| `user_warehouses` | user_warehouses_w | all | authenticated | `((org_id = my_org()) AND (my_role() = 'admin'::text))` · check `((org_id = my_org()) AND (my_role() = 'admin'::text))` |
| `worker_payments` | worker_payments_admin | all | public | `((org_id = my_org()) AND (my_role() = 'admin'::text))` · check `((org_id = my_org()) AND (my_role() = 'admin'::text))` |
| `workers` | workers_admin | all | public | `((org_id = my_org()) AND (my_role() = 'admin'::text))` · check `((org_id = my_org()) AND (my_role() = 'admin'::text))` |

### Points à vérifier en priorité

- Tables sensibles concernées : `app_errors`, `commercial_accounts`, `commercial_dues`, `commercial_payments`, `paiements_abonnement`, `platform_admins`, `platform_audit`, `reseller_commissions`. Vérifier que la condition isole bien l'entreprise (`org_id = my_org()`) ou le rôle plateforme.
- Plusieurs politiques reposent sur `auth.uid()` : vérifier qu'elles ne permettent pas de lire les données d'un autre utilisateur.

## Politiques ouvertes au rôle public

7 politiques accordées à `public` (tous les rôles). `anon` reste bloqué
en pratique : `my_org()` renvoie `null` sans session, donc aucune ligne ne passe. Il vaut
mieux néanmoins les restreindre à `authenticated`. Proposition non appliquée :
[`../sql/exports/2026-11-18/13-politiques-publiques-propose.sql`](../sql/exports/2026-11-18/13-politiques-publiques-propose.sql).

| Table | Politique |
| --- | --- |
| `number_ranges` | number_ranges_org |
| `paiements_abonnement` | pay_insert |
| `paiements_abonnement` | pay_read_own |
| `push_subscriptions` | push_own |
| `warehouse_stock` | warehouse_stock_r |
| `worker_payments` | worker_payments_admin |
| `workers` | workers_admin |

## Politiques versionnées sans équivalent en production

Aucune.
