# Synthèse production

Projet `ttplxlobehmwzfnxviej` — 2026-11-18 07:16.

- Tables : **64**
- Tables sans RLS : **0**
- Tables RLS sans politique : **1** → `document_counters`
- Fonctions : **118**, dont **107** SECURITY DEFINER
- SECURITY DEFINER sans search_path : **0**
- SECURITY DEFINER exécutables par anon : **14** → `article_total_stock`, `consume_lots_fefo`, `create_credit_note`, `create_customer_return`, `guard_org_delete`, `log_org_changes`, `log_platform_admin_changes`, `log_profile_changes`, `mark_welcome_seen`, `paiements_en_attente`, `rejeter_paiement`, `reserve_invoice_range`, `reserve_number_range`, `valider_paiement`
- Politiques Storage : **0**
- Tâches planifiées : **1**

## Tables présentes en production mais absentes du SQL versionné (0)

Aucune.

## Tables du SQL versionné absentes en production (1)

- `as`

## Fonctions de production absentes du SQL versionné (0)

Aucune.

## Fonctions du SQL versionné absentes en production (0)

Aucune.

## Politiques de production absentes du SQL versionné (0)

Aucune.
