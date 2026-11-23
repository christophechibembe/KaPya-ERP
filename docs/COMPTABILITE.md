# Comptabilité et TVA

Écran `#/comptabilite` : journal, balance et TVA d'une période, calculés à partir des
opérations déjà saisies dans KaPya ERP.

## Périmètre

| Élément | Source |
| --- | --- |
| Ventes | `sales` et `sale_lines` |
| Encaissements clients | `sale_payments` |
| Achats | `purchases` et `purchase_lines` |
| Règlements fournisseurs | `purchase_payments` |
| Dépenses | `business_expenses` |
| Retours et avoirs | `customer_returns`, `credit_notes` |

L'écran est **en lecture seule** : il ne crée, ne modifie et ne supprime aucune donnée.
Deux exports Excel sont disponibles : le journal et la balance.
Les lectures sont **paginées** pour couvrir toute la période, sans troncature silencieuse.

## Accès et formule

- **Standard** et **Premium** : comptabilité incluse.
- **Basique** : non incluse (l'écran affiche un renvoi vers les formules).
- Rôles autorisés : gérant, responsable et comptable.

La TVA reste réglable par le gérant dans **Paramètres > TVA** : case « Facturer la TVA »
et taux de 0 à 100 %. Les prix sont **TTC** ; la TVA est la part contenue dans le total.

## Plan de comptes simplifié

| Compte | Intitulé | Nature |
| --- | --- | --- |
| 401 | Fournisseurs | passif |
| 411 | Clients | actif |
| 443 | TVA collectée | passif |
| 445 | TVA récupérable | actif |
| 571 | Caisse | actif |
| 607 | Achats de marchandises | charge |
| 658 | Charges diverses | charge |
| 701 | Ventes de marchandises | produit |

## Règles d'écriture

- **Vente comptant** : débit 571, crédit 701 (HT) et 443 (TVA).
- **Vente à crédit** : débit 411, crédit 701 et 443 ; chaque encaissement débite 571 et
  crédite 411.
- **Achat** : débit 607 (HT) et 445 (TVA), crédit 401.
- **Règlement fournisseur** : débit 401, crédit 571.
- **Dépense** : débit 658, crédit 571.
- **Retour ou avoir** : débit 701 et 443 ; crédit 571 (caisse) si la vente d'origine était
  comptant, 411 (créance client) si elle était à crédit. Un retour accompagné de son avoir
  automatique n'est comptabilisé qu'une seule fois (l'avoir porte l'écriture).

La TVA d'un montant TTC se calcule ainsi : `TVA = total − total / (1 + taux / 100)`.
Chaque opération produit des lignes équilibrées ; le journal affiche le total des débits,
le total des crédits et l'écart (qui doit rester à 0).

## Limites connues

Cette comptabilité est **simplifiée et indicative**. Elle ne remplace pas un logiciel
certifié ni une déclaration fiscale officielle.

- Pas de grand livre détaillé par client ou par fournisseur (comptes 411 et 401 agrégés).
- Les acomptes versés à la commande (`customer_deposits`) ne sont pas isolés du compte client.
- Les variations de stock ne sont pas comptabilisées (pas d'écriture de stock initial/final).
- Les immobilisations, amortissements et provisions ne sont pas gérés.
- Pas de clôture ni de verrouillage de période.
- Les prix sont traités comme TTC ; un mélange HT/TTC n'est pas géré.
- Le taux de TVA est unique pour l'entreprise.

## Vérifications

- `tests/accounting.test.mjs` : TVA, journal équilibré, balance, formules.
- `tests/parametres-tva.test.mjs` : TVA réglable sur les deux pages Paramètres.
- `tests/comptabilite.browser.test.mjs` : écran réel dans la démonstration.
- `npm.cmd test` : suite complète.
