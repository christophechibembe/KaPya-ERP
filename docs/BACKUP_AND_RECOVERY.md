# Sauvegarde et reprise

## Créer une sauvegarde

Dans **Sauvegarde**, choisir **Préparer la sauvegarde**. L’application exporte les tables accessibles, pagine les grands résultats et ajoute une empreinte SHA-256 au fichier JSON. Une table absente ou inaccessible est signalée et rend la sauvegarde incomplète. Ne pas traiter un fichier incomplet comme une copie intégrale.

Le fichier contient des données d’entreprise et des renseignements personnels; le protéger et le conserver hors de l’appareil. Les comptes et mots de passe Supabase ne sont pas inclus. Le rappel de dernière sauvegarde est local à l’appareil.

## Restaurer

La restauration depuis l’interface est réservée au gérant et à la formule Premium, et ne fonctionne que dans une entreprise vide (aucun client, article, vente ou achat). Le fichier est contrôlé par format et empreinte; l’import SQL s’exécute dans une transaction et conserve les contraintes relationnelles. Des identifiants sont remappés par l’interface. Les comptes utilisateurs doivent être recréés/invités séparément.

La procédure contient une suppression ciblée du dépôt existant dans le cadre de cette restauration d’entreprise vide. Ne l’exécuter que dans cette condition; ne pas appeler directement la RPC `restore_backup` sur une entreprise active.

## Vérifier l’intégrité

- Vérifier le champ `complete`, les compteurs et la date dans le fichier.
- Conserver l’empreinte et une copie non modifiable du fichier original.
- Après restauration, vérifier les clients, articles, soldes, paiements, dépôts, stocks et clôtures.
- Lire les avertissements sur l’écart entre stock et mouvements.
- Réaliser périodiquement un essai de restauration dans un environnement isolé, jamais en production active.

## Éviter les doublons et reprendre après incident

Les opérations hors ligne utilisent des identifiants stables/idempotents pour certaines ventes, achats, transferts et paiements. Ne pas supprimer automatiquement des entrées en doublon supposées. Comparer identifiants, dates, montants, références et état de synchronisation; conserver les éléments litigieux pour revue.

En cas de coupure, rétablir le réseau, laisser la synchronisation finir, traiter les refus puis vérifier les rapports et niveaux de stock. Une sauvegarde JSON de l’interface ne contient pas les utilisateurs, réglages du projet Supabase ni objets de stockage éventuels.
