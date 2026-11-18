# Guide utilisateur

## Connexion et entreprise

Créer un compte avec une adresse e-mail et un mot de passe d’au moins huit caractères, puis confirmer l’adresse si Supabase le demande. À la première connexion, créer l’entreprise ou saisir un code d’invitation/activation. L’accès aux données exige une session valide.

## Rôles visibles dans l’application

| Rôle | Accès principal observé |
|---|---|
| Gérant | Administration, équipe, ventes, achats, stocks et paramètres selon la formule |
| Responsable | Opérations de vente/achat/stock, caisse et rapports |
| Facturier | Factures, clients, paiements et opérations autorisées |
| Comptable | Consultation des achats et rapports; encaissements de crédit selon les politiques |
| Lecture seule | Consultation des espaces autorisés |

La base applique aussi les permissions. Le tableau est indicatif : le détail des capacités figure dans `js/roles.js` et les règles déployées doivent être contrôlées dans Supabase.

## Opérations courantes

- **Produits et stocks :** créer les articles, prix, unités et seuils; vérifier les mouvements et le dépôt sélectionné.
- **Ventes :** créer une facture, ajouter des articles et quantités, choisir le paiement comptant ou crédit, puis remettre le reçu imprimé.
- **Crédits et acomptes :** enregistrer les versements de crédit; créer un acompte client et l’imputer sur une facture selon le solde disponible.
- **Achats :** enregistrer le fournisseur, les lignes et le dépôt d’entrée. Les rôles autorisés sont gérant et responsable.
- **Caisse :** choisir la journée, comparer les mouvements attendus au montant compté et enregistrer la clôture.
- **Rapports et exports :** définir une période et vérifier les résultats avant téléchargement CSV ou impression PDF.
- **Sauvegarde :** télécharger le JSON, vérifier que l’écran le signale complet et conserver le fichier dans un endroit protégé.

## Hors ligne et erreurs

Le badge de synchronisation indique les opérations en attente ou refusées. À la reconnexion, la file est renvoyée au serveur. Ouvrir le détail des pièces refusées et vérifier le stock ou les champs avant de ressaisir. Ne pas déconnecter l’utilisateur si des opérations restent en attente : la confirmation de déconnexion précise qu’elles seront effacées de cet appareil.

Le cache hors ligne dépend des visites antérieures. Attendre « Synchronisé » avant de fermer la page lorsqu’une opération vient d’être saisie. Une action de lecture seule ou une opération non prévue pour la file exige une connexion.

## Bonnes pratiques

- Utiliser un compte individuel et le rôle minimal nécessaire.
- Vérifier quantités, paiements, taux et dépôt avant validation.
- Contrôler le badge de synchronisation avant de changer d’utilisateur.
- Protéger les exports et sauvegardes, qui contiennent des informations de clients et d’activité.
- Ne pas partager les codes d’activation et mots de passe.
