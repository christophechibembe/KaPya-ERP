# Démonstration et nouveautés 1.46

## Essayer KaPya sans compte

Ouvrir <https://kapya-erp.pages.dev/demo/> ou choisir **Essayer la démo sans inscription**
sur la connexion. Les exemples couvrent commerce, restauration et salon de coiffure.

- **Guide 2 min** propose une vente, un paiement de crédit, les rapports et la clôture.
- Les ventes, achats, crédits, avoirs, acomptes, transferts et clôtures sont simulés.
- **Réinitialiser** efface uniquement la simulation de ce navigateur.
- Changer de métier réinitialise les données fictives après confirmation.
- **Demander un accès** ouvre la création d'un vrai compte ; l'activation reste soumise
  au code accordé par l'administrateur. Aucune donnée de démo n'est transférée.

### Limites et isolation

La démo n'est pas une entreprise Supabase ni un compte partagé. Sa configuration
neutralise l'URL et la clé de connexion. L'API refuse les appels serveur, la CSP interdit
les connexions réseau applicatives, et le service worker réel n'est ni désinscrit ni
remplacé par la démo.

Les clés `localStorage` / `sessionStorage` sont préfixées `kapya-demo:` et les bases
IndexedDB s'appellent `kapya-demo-offline` et `kapya-demo-local`. Les sessions, paniers,
codes PIN, caches et opérations réelles en attente restent intacts. Une vente simulée
n'entre jamais dans une file d'envoi en production.

Les écrans non simulés (administration, restauration, abonnements, intégrations…) sont
masqués. Les actions non implémentées renvoient une erreur explicite, jamais un faux
succès. La modification/suppression d'une vente déjà liée à des paiements ou avoirs est
volontairement limitée dans la démo.

Les documents HTML, reçus, exports Excel et PDF sont marqués démonstration. L'impression
USB directe et l'ouverture de WhatsApp sont désactivées dans la démo. Les produits et
clients sont inventés ; aucun téléphone réel n'est prérempli.

Le premier chargement exige une connexion pour recevoir les fichiers. Les opérations
simulées fonctionnent ensuite sans serveur, tant que leurs écrans ont été chargés. Il ne
s'agit pas d'une promesse de disponibilité hors connexion après fermeture du navigateur.

## Préparer un rappel WhatsApp

Dans **Crédits clients**, choisir **Préparer un rappel WhatsApp** :

1. Vérifier le téléphone avec indicatif international et le solde affiché.
2. Relire/modifier le message (factures et soldes restants).
3. Cocher **J'ai vérifié le destinataire et le solde**.
4. Cliquer **Ouvrir WhatsApp**, puis confirmer l'envoi dans WhatsApp.

KaPya ne transmet rien automatiquement et ne prétend pas que le message a été reçu.
Le bouton **Copier le message** ne fait qu'une copie locale. Cette fonction reste liée
aux formules qui incluent WhatsApp.

Le regroupement utilise `customer_id`, jamais le nom : deux homonymes ne partagent pas
leur dette. Sans identifiant client, seule la facture sélectionnée figure dans le
rappel. La migration `20261120000000_identifiant_client_credits.sql` complète le résultat
de la RPC existante sans modifier les pièces ni les autorisations.

## Suggestions de réapprovisionnement

**Alertes et rappels**, pour le gérant et le responsable (hors activité sans stock) :

- moyenne journalière = quantités vendues sur les 30 derniers jours / 30 ;
- cible = maximum du seuil minimum et des ventes moyennes pendant la couverture
  souhaitée + le délai fournisseur ;
- quantité suggérée = cible moins stock actuel, arrondie vers le haut à 0,001 unité.

Les calculs couvrent toutes les boutiques. Sans vente récente, seul le minimum de stock
sert de repère. Les retours, saisons, promotions et commandes fournisseurs en cours ne
sont pas pris en compte. Aucune commande n'est créée automatiquement : vérifier le
conditionnement et les commandes déjà lancées.

## Vérifier les changements

`npm.cmd test` comprend des scénarios métier synthétiques et des tests Chromium :
vente réelle dans l'interface démo, documents marqués, crédits, filtres, mobile,
réinitialisation, changement de métier, conservation de données témoins réelles, vente
hors réseau et absence de requêtes Supabase.
