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
| Supprimer une vente ou un achat hors ligne | oui, annulation mise en file et stock corrigé |
| Supprimer un acompte hors ligne | non : message explicite, le réseau reste requis (opération sensible) |
| Inventaire physique et changement de rôle hors ligne | non : message explicite, le réseau reste requis |
| Créer une invitation hors ligne | oui : le code devient actif à la synchronisation |
| Synchronisation application fermée | oui sur Chromium (Background Sync) ; ailleurs, la file repart à la réouverture |
| Historique local réglable | oui : 2 000, 10 000 ou 20 000 pièces |

## Lectures hors ligne

Le service worker garde les fichiers de l'application. Les données, elles, passent par un
cache IndexedDB nommé `kapya-offline` (`kv`), séparé pour la démonstration
(`kapya-demo-offline`).

Les requêtes suivantes sont préchargées et peuvent être filtrées, triées et limitées sur
l'appareil :

- articles, clients, fournisseurs ;
- ventes récentes (2 000 par défaut, réglable) avec leurs lignes et articles ;
- encaissements clients (`sale_payments`) et règlements fournisseurs (`purchase_payments`) ;
- achats avec lignes et fournisseurs ;
- dépenses (`business_expenses`) ;
- retours (`customer_returns`) et avoirs (`credit_notes`) ;
- acomptes clients (`customer_deposits`) ;
- clôtures de caisse (`cash_closures`, `cash_closures_shop`) ;
- lots en stock et stock par dépôt.

La profondeur d'historique est réglable dans **Paramètres > Mode hors-ligne** :
2 000 pièces (standard), 10 000 (étendu) ou 20 000 (maximum). Un changement déclenche un
téléchargement complet de la copie locale. Plus la valeur est grande, plus l'espace utilisé
et la durée de rafraîchissement augmentent. Les pièces au-delà de la fenêtre restent
consultables en ligne, mais peuvent manquer hors connexion.

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
- création et modification de clients, fournisseurs et articles ;
- création d'une invitation (`insert_invitation`) ;
- annulation de ventes et d'achats (`delete_document`).

Chaque pièce reçoit un identifiant unique avant l'envoi : une pièce envoyée deux fois n'est
enregistrée qu'une fois. Les stocks et les fiches sont mis à jour localement tout de suite,
avec un badge « en attente ».

Une annulation de vente ou d'achat retire la pièce de la copie locale immédiatement et
applique le mouvement de stock inverse : le stock vendu revient, le stock acheté sort.
Si le serveur refuse l'annulation, la pièce et le stock sont restaurés.

Sur le tableau de bord, une vente en attente compte dans le chiffre d'affaires, les
graphiques et les activités récentes, avec la mention « En attente d'envoi ». Son coût est
estimé au prix d'achat actuel, faute d'instantané de coût hors ligne ; il est signalé comme
estimation. Dès que la pièce est envoyée, elle est remplacée par la ligne du serveur : elle
n'est jamais comptée deux fois. Les créances clients, elles, restent calculées sur les
ventes confirmées par le serveur.

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

Le service worker rejoue la file avec un miroir de session et de configuration conservé
dans IndexedDB (jamais `localStorage`, inaccessible au service worker). Il renouvelle le
jeton si besoin, envoie les pièces et marque leur résultat ; à la réouverture, l'application
termine le travail local et reprend la session renouvelée.

Cette reprise **application fermée** dépend du Background Sync : elle fonctionne sur
Chromium (Chrome, Edge, Android), pas sur Safari/iOS. Ailleurs, la file repart normalement
à la prochaine ouverture. Les pièces restent idempotentes : un envoi simultané par l'onglet
et le service worker ne crée pas de doublon.

## Diagnostic dans Paramètres

La carte **Mode hors-ligne** affiche :

- l'état du réseau ;
- la date de la dernière synchronisation ;
- le nombre de pièces en attente et refusées ;
- le nombre d'entrées de la copie locale, leur âge et la durée de conservation ;
- la profondeur d'historique conservée (réglable) ;
- la disponibilité de la reprise application fermée sur ce navigateur ;
- les numéros de facture encore réservés sur l'appareil ;
- un bouton **Synchroniser maintenant** ;
- un bouton **Voir les pièces refusées** ;
- un bouton **Vider les données hors ligne** (avec confirmation, car les pièces non
  envoyées sont perdues, le miroir de session du service worker est effacé et le
  catalogue articles local est vidé).

## Limites assumées

- L'inventaire physique, les changements de rôle et la suppression d'un acompte demandent
  le réseau. Ces opérations
  sont sensibles : un message explicite s'affiche hors ligne plutôt qu'une file qui
  modifierait les droits ou le stock sans contrôle.
- Une invitation créée hors ligne n'est active qu'après la synchronisation : ne transmettez
  le code qu'une fois l'appareil reconnecté (ou vérifiez la file dans Paramètres).
- La reprise application fermée dépend du navigateur (Background Sync sur Chromium).
- Les lectures au-delà de la fenêtre d'historique réglée peuvent manquer hors ligne ; elles
  restent disponibles en ligne.
- Le cache local et le miroir de session contiennent des données sensibles : il faut
  verrouiller l'appareil, utiliser un code de verrouillage et se déconnecter sur un appareil
  partagé. Le verrouillage en arrière-plan est activé par défaut avec un code.
- Le code de verrouillage protège l'écran, pas le disque : activez aussi le chiffrement de
  l'appareil (Android, iOS, Windows) pour protéger les fichiers IndexedDB en cas de vol.
  Un rechargement de la page ne lève pas le verrou : le code est redemandé avant l'affichage
  des données.
- La synchronisation de deux appareils sur la même fiche reste protégée par la version,
  mais elle n'est pas un travail collaboratif en temps réel.

## Vérifications

- `tests/offline-sync.test.mjs` : délai de reprise, décision de synchronisation, résumé,
  interrogation de la copie locale, profondeur d'historique et mouvements de stock des
  annulations.
- `tests/offline-record-updates.test.mjs` : mises à jour optimistes et restauration.
- `npm.cmd test` : suite complète, dont les tests navigateur de la démonstration.
- `docs/TEST-HORS-LIGNE-ANDROID.md` : liste de contrôle à faire sur un téléphone
  Android, notamment pour vérifier le rejeu après fermeture complète de Chrome.
