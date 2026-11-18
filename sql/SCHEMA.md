# Inventaire de la base KaPya

> Fichier généré par `npm run inventaire`. **Ce n'est pas le schéma SQL** : c'est la liste de ce
> que le code appelle. Le schéma réel (colonnes, types, index, RLS, RPC) doit être exporté depuis
> Supabase et versionné dans `sql/` (voir `sql/README.md`).

Généré depuis 79 fichiers JavaScript.

## Tables utilisées (40)

| Table | Utilisée dans |
|---|---|
| `app_errors` | js/modules/abonnes.js, js/modules/parametres.js, js/monitor.js |
| `articles` | js/api.js, js/modules/bons.js, js/modules/doc.js, js/modules/facture.js, js/modules/lots.js, js/modules/proforma.js, js/modules/rapports.js, js/modules/retours.js, js/modules/stocks.js, js/modules/transferts.js, js/modules/vente-rapide.js |
| `audit_log` | js/modules/accueil.js, js/modules/historique.js |
| `auto_backups` | js/modules/sauvegarde.js |
| `business_expenses` | js/modules/accueil.js |
| `cash_closures_shop` | js/modules/caisse-boutiques.js |
| `company_codes` | js/modules/abonnes.js |
| `credit_notes` | js/modules/avoirs.js, js/modules/doc.js, js/modules/rapports.js |
| `customer_deposits` | js/api.js, js/modules/accueil.js, js/modules/acomptes.js, js/modules/facture.js, js/modules/vente-rapide.js |
| `customer_returns` | js/modules/doc.js, js/modules/rapports.js |
| `customers` | js/api.js, js/modules/acomptes.js, js/modules/facture.js, js/modules/parties.js, js/modules/proforma.js, js/modules/vente-rapide.js |
| `dashboard_preferences` | js/modules/accueil.js |
| `inventories` | js/modules/parametres.js |
| `inventory_lines` | js/modules/parametres.js |
| `invitations` | js/modules/parametres.js |
| `organizations` | js/api.js, js/modules/abonnes.js, js/modules/accueil.js, js/modules/parametres.js, js/modules/proforma.js, js/modules/workers.js, js/notif-centre.js |
| `paiements_abonnement` | js/modules/parametres.js |
| `platform_audit` | js/modules/parametres.js |
| `profiles` | js/api.js, js/app.js, js/modules/accueil.js, js/modules/facture.js, js/modules/parametres.js, js/modules/proforma.js, js/modules/vente-rapide.js, js/modules/workers.js, js/own-org.js, js/push.js, js/vat.js |
| `proforma_lines` | js/modules/proforma.js |
| `proformas` | js/modules/proforma.js |
| `purchase_orders` | js/modules/bons.js |
| `purchase_payment_balances` | js/modules/accueil.js, js/modules/alertes.js |
| `purchase_payments` | js/modules/accueil.js, js/modules/alertes.js |
| `purchases` | js/api.js, js/modules/accueil.js, js/modules/lots.js, js/modules/rapports.js |
| `push_subscriptions` | js/push.js |
| `sale_cost_snapshots` | js/modules/accueil.js |
| `sale_payments` | js/full-report.js, js/modules/accueil.js, js/modules/doc.js, js/modules/rapports.js |
| `sales` | js/api.js, js/full-report.js, js/global-search.js, js/modules/accueil.js, js/modules/acomptes.js, js/modules/alertes.js, js/modules/avoirs.js, js/modules/credits.js, js/modules/doc.js, js/modules/facture.js, js/modules/rapports.js, js/modules/retours.js, js/modules/vente-rapide.js |
| `settings` | js/api.js, js/rate.js |
| `stock_lots` | js/api.js, js/modules/accueil.js, js/modules/lots.js, js/modules/vente-rapide.js |
| `stock_moves` | js/modules/accueil.js, js/modules/rapports.js, js/modules/stocks.js |
| `suppliers` | js/api.js, js/modules/bons.js, js/modules/retours.js |
| `transfers` | js/modules/rapports.js, js/modules/transferts.js |
| `unit_options` | js/modules/stocks.js |
| `user_warehouses` | js/modules/caisse-boutiques.js, js/modules/facture.js, js/modules/parametres.js, js/modules/vente-rapide.js |
| `warehouse_stock` | js/api.js, js/modules/depots.js, js/modules/doc.js, js/modules/exports.js, js/modules/facture.js, js/modules/rapports.js, js/modules/transferts.js, js/modules/vente-rapide.js |
| `warehouses` | js/api.js, js/modules/depots.js, js/modules/doc.js, js/modules/facture.js, js/modules/parametres.js, js/modules/transferts.js, js/shops.js |
| `worker_payments` | js/modules/workers.js |
| `workers` | js/modules/workers.js |

## Fonctions RPC utilisées (62)

| Fonction | Utilisée dans |
|---|---|
| `article_total_stock` | js/api.js, js/modules/rapports.js |
| `backup_now` | js/modules/sauvegarde.js |
| `cancel_credit_payment` | js/modules/credits.js |
| `cancel_proforma` | js/modules/proforma.js |
| `cancel_purchase_order` | js/modules/bons.js |
| `cash_close_summary` | js/modules/caisse.js |
| `cash_close_summary_shop` | js/modules/caisse-boutiques.js |
| `create_company_code` | js/modules/abonnes.js |
| `create_credit_note` | js/modules/avoirs.js |
| `create_customer_deposit` | js/modules/acomptes.js |
| `create_customer_return` | js/modules/retours.js |
| `create_inventory` | js/modules/parametres.js |
| `create_proforma` | js/modules/proforma.js |
| `create_purchase_order` | js/modules/bons.js |
| `create_sale` | js/modules/facture.js, js/modules/proforma.js, js/modules/vente-rapide.js |
| `create_stock_lot` | js/modules/lots.js |
| `create_supplier_return` | js/modules/retours.js |
| `create_transfer` | js/modules/facture.js, js/modules/transferts.js |
| `create_warehouse_transfer` | js/modules/depots.js |
| `create_worker` | js/modules/workers.js |
| `credit_sales_all` | js/modules/credits.js |
| `customer_debts` | js/modules/clients.js |
| `delete_company` | js/modules/abonnes.js |
| `delete_worker` | js/modules/workers.js |
| `initialize_purchase_balance` | js/modules/accueil.js |
| `is_platform_admin` | js/app.js |
| `join_org` | js/auth.js |
| `mark_proforma_converted` | js/modules/proforma.js |
| `mark_welcome_seen` | js/app.js |
| `mobile_money_total` | js/modules/caisse-boutiques.js |
| `paiements_en_attente` | js/modules/abonnes.js, js/notif-centre.js |
| `receive_purchase_order` | js/modules/bons.js |
| `record_business_expense` | js/modules/accueil.js |
| `record_credit_payment` | js/modules/credits.js |
| `record_credit_payment_method` | js/modules/credits.js |
| `record_purchase_payment` | js/modules/accueil.js |
| `record_worker_payment` | js/modules/workers.js |
| `redeem_company_code` | js/auth.js |
| `register_purchase_lots` | js/modules/lots.js |
| `rejeter_paiement` | js/modules/abonnes.js |
| `remove_member` | js/modules/parametres.js |
| `reserve_invoice_range` | js/api.js |
| `restore_backup` | js/modules/sauvegarde.js |
| `save_cash_closure` | js/modules/caisse.js |
| `save_shop_closure` | js/modules/caisse-boutiques.js |
| `search_sales` | js/modules/doc.js |
| `set_barcode_enabled` | js/modules/parametres.js |
| `set_business_type` | js/modules/parametres.js |
| `set_company_header` | js/modules/parametres.js |
| `set_company_logo` | js/modules/parametres.js |
| `set_discounts_enabled` | js/modules/parametres.js |
| `set_hidden_features` | js/modules/parametres.js |
| `set_initial_payment_method` | js/modules/vente-rapide.js |
| `set_inventory_count` | js/modules/parametres.js |
| `set_receipt_footer` | js/modules/parametres.js |
| `set_sale_payment_method` | js/modules/facture.js, js/modules/vente-rapide.js |
| `set_sale_pickup` | js/modules/doc.js, js/modules/facture.js, js/modules/vente-rapide.js |
| `set_vat` | js/vat.js |
| `update_credit_payment` | js/modules/credits.js |
| `update_sale` | js/modules/facture.js |
| `validate_inventory` | js/modules/parametres.js |
| `valider_paiement` | js/modules/abonnes.js |

## Scripts SQL cités par le code (5)

Ces fichiers sont mentionnés dans les messages d'erreur ou les commentaires, mais **absents du projet** :
ils doivent être récupérés depuis Supabase (ou réécrits) et versionnés dans `sql/`.

| Script | Cité dans |
|---|---|
| `cloture-caisse.sql` | js/modules/caisse.js |
| `couts-et-tresorerie.sql` | js/modules/accueil.js |
| `depots.sql` | js/modules/depots.js |
| `formules.sql` | js/plans.js |
| `historique-actions.sql` | js/modules/historique.js |

## À faire pour compléter ce dossier

1. Exporter le schéma complet depuis Supabase (SQL Editor) : tables, contraintes, index, vues,
   fonctions, triggers, politiques RLS, planifications (`pg_cron`).
2. Enregistrer chaque export dans `sql/` avec un numéro d'ordre (ex. `001-init.sql`).
3. Vérifier qu'aucune table ni RPC listée ci-dessus ne manque.
4. Tester une restauration complète sur un projet Supabase vide.
