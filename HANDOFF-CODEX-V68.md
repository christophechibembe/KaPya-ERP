# KaPya ERP — Passation v68

Base : v67 + fonctions v66 réintégrées. Voir CHANGEMENTS-V68.md pour le détail.

## État des besoins
| # | Besoin | État |
|---|--------|------|
| 1 | Sauvegarde et restauration | Fait (à tester sur Supabase réel) |
| 2 | Historique des actions | Fait (à tester) |
| 3 | Dépôts multiples | Fait (à tester) |
| 4 | Clôture de caisse | Fait (v65/v67) |
| 5 | Alertes et rappels | Fait (à tester) |
| 6 | Exports comptables | Fait en CSV (Excel). PDF non fait |
| 7 | Mode téléphone simplifié | Fait (trois actions rapides) |

## Prochaines étapes
1. Exécuter les quatre scripts SQL dans l'ordre sur Supabase, puis tester les scénarios de la passation v66 (§ 3).
2. Tester les écrans dans un navigateur, en particulier sur téléphone (actions rapides, Facturer).
3. Exports PDF (rapport de ventes et d'inventaire) via print.js, si demandé.
4. Restauration de grosses sauvegardes (découpage), comptable dans l'historique si demandé.

## Décisions
- Taux du jour : admin et manager seulement (retour à la version v66).
- Clients : moteur parties.js de v67 (modification hors ligne conservée), avec colonnes Dette et Rappel WhatsApp.
