# Mode hors-ligne

KaPya ERP fonctionne sur un appareil sans réseau : l'interface est mise en cache par le
service worker, les lectures déjà chargées sont conservées dans IndexedDB, et les pièces
métier sont enregistrées dans une file d'attente puis envoyées au retour de la connexion.

## Ce que « hors-ligne complet » veut dire ici

| Élément | État |
| --- | --- |
| Ouvrir l'application sans réseau | oui, interface en cache |
| Consulter les écrans déjà chargés | oui, copie locale de 30 jours |
| Vendre, acheter, transférer, retourner | oui, mise en file d'attente |
| Encaisser un crédit ou un acompte | oui |
| Clôturer la caisse | oui |
| Créer ou modifier un client, fournisseur, article | oui |
| Numéroter les factures sans doublon | oui, plages réservées par appareil |
| Synchronisation automatique au retour du réseau | oui |
| Reprise avec délai progressif après échec | oui |
| Diagnostic et file refusée dans Paramètres | oui |
| Supprimer une fiche hors ligne | non : l'action demande le réseau |
| RPC non prévues dans la file (inventaire, rôles…) | non : le réseau est requis |
| Synchronisation application fermée | non : la file repart à la réouverture |

## Lectures hors ligne

Le service worker garde les fichiers de l'application. Les données, elles, passent par un
cache IndexedDB nommé `kapya-offline` (`kv`), séparé pour la démonstration
(`kapya-demo-offline`).

Les requêtes suivantes sont préchargées et peuvent être filtrées, triées et limitées sur
l'appareil :

- articles, clients, fournisseurs ;
- ventes récentes (2 000) avec leurs lignes et articles ;
- encaissements clients (`sale_payments`) et règlements fournisseurs (`purchase_payments`) ;
- achats avec lignes et fournisseurs ;
- dépenses (`business_expenses`) ;
- retours (`customer_returns`) et avoirs (`credit_notes`) ;
- acomptes clients (`customer_deposits`) ;
- clôtures de caisse (`cash_closures`, `cash_closures_shop`) ;
- lots en stock et stock par dépôt.

La copie locale est conservée **30 jours**. Au-delà, l'écran demande une reconnexion pour
recharger les données. Le préchargement se fait au plus toutes les 20 minutes ; toutes les
24 heures, une copie complète remplace la copie incrémentale.

Une requête qui ne peut pas être simulée localement (filtre sur une relation, opérateur
inconnu) utilise la copie exacte de la requête si elle a déjà été chargée. Sinon, un message
clair invite à se reconnecter une fois.

## Écritures en attente

La file `outbox` accepte :

- ventes (`create_sale`) et modifications de vente (`update_sale`) ;
- achats (`create_purchase`) et transferts (`create_transfer`) ;
- retours (`create_customer_return`) et avoirs (`create_credit_note`) ;
- acomptes (`create_customer_deposit`) et encaissements de crédit (`record_credit_payment`) ;
- clôtures de caisse (`save_cash_closure`, `save_shop_closure`) ;
- changements de mode de paiement ;
- création et modification de clients, fournisseurs et articles.

Chaque pièce reçoit un identifiant unique avant l'envoi : une pièce envoyée deux fois n'est
enregistrée qu'une fois. Les stocks et les fiches sont mis à jour localement tout de suite,
avec un badge « en attente ».

En cas de refus serveur (stock insuffisant, donnée invalide), la modification locale est
annulée et la pièce passe en **refusée**. Elle reste visible dans Paramètres > Mode
hors-ligne, avec deux choix : réessayer ou retirer.

En cas de conflit de version sur une fiche modifiée sur un autre appareil, la mise à jour
est refusée plutôt qu'écrasée : l'utilisateur recharge la fiche, vérifie, puis réenregistre.

## Reprise automatique

La synchronisation est tentée :

- au retour du réseau (`online`) ;
- au retour sur l'onglet (`visibilitychange`) ;
- toutes les minutes, si la décision de reprise l'autorise ;
- après une nouvelle pièce mise en file (Background Sync quand le navigateur le permet).

Sans pièce en attente, la file est vérifiée au plus toutes les 5 minutes ; le préchargement
des données se fait au plus toutes les 20 minutes. Après un échec réseau, le délai double :
15 s, 30 s, 1 min, 2 min, 5 min, puis 15 min maximum.

Le service worker ne peut pas rejouer la file seul : il ne possède pas la session Supabase.
Le Background Sync sert donc à réveiller les onglets ouverts. Si l'application est fermée,
la file repart à la prochaine ouverture.

## Diagnostic dans Paramètres

La carte **Mode hors-ligne** affiche :

- l'état du réseau ;
- la date de la dernière synchronisation ;
- le nombre de pièces en attente et refusées ;
- le nombre d'entrées de la copie locale, leur âge et la durée de conservation ;
- les numéros de facture encore réservés sur l'appareil ;
- un bouton **Synchroniser maintenant** ;
- un bouton **Voir les pièces refusées** ;
- un bouton **Vider les données hors ligne** (avec confirmation, car les pièces non
  envoyées sont perdues).

## Limites assumées

- Une suppression, un inventaire physique, un changement de rôle ou une invitation demandent
  le réseau : ces opérations ne sont pas mises en file.
- Les lectures très anciennes au-delà des limites de préchargement (2 000 ventes, 1 000
  achats, etc.) peuvent manquer hors ligne.
- Le cache local contient des données commerciales : il faut verrouiller l'appareil et
  utiliser le code de verrouillage de KaPya.
- La synchronisation de deux appareils sur la même fiche reste protégée par la version,
  mais elle n'est pas un travail collaboratif en temps réel.

## Vérifications

- `tests/offline-sync.test.mjs` : délai de reprise, décision de synchronisation, résumé,
  interrogation de la copie locale.
- `tests/offline-record-updates.test.mjs` : mises à jour optimistes et restauration.
- `npm.cmd test` : suite complète, dont les tests navigateur de la démonstration.
