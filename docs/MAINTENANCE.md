# Maintenance

## À chaque mise à jour

- Lire les migrations et les guides associés avant toute application.
- Vérifier les modifications dans un environnement isolé et tester le parcours de connexion, vente, paiement, achat, stock et clôture.
- Vérifier la CSP, la version du service worker et les ressources qu’il précharge.
- Examiner les erreurs de synchronisation et les opérations rejetées.

## Vérifications régulières

- Contrôler les en-têtes réellement servis par Netlify et les erreurs Auth/PostgREST.
- Comparer les rôles et politiques RLS distantes aux migrations versionnées.
- Contrôler l’isolation entre entreprises et l’accès Storage si utilisé.
- Créer une sauvegarde complète, la conserver hors ligne et tester sa restauration en environnement de test.
- Comparer stocks et mouvements; rapprocher les clôtures de caisse des ventes, paiements, dépenses et transferts.

## Dépendances et secrets

Le front-end ne déclare aucune dépendance npm. Lorsqu’une dépendance est ajoutée, enregistrer sa version et un fichier de verrouillage, puis auditer les vulnérabilités avant publication. Garder les clés privées dans un gestionnaire de secrets côté serveur; la clé `sb_publishable_` de l’interface est publique et ne dispense jamais des politiques RLS.

## Remarque sur l’état actuel

Le dépôt de travail ne contient pas Git, ce qui empêche de comparer les changements à un historique fiable. Deux versions de migration sont en double; résoudre cela avant d’utiliser un pipeline Supabase. Maintenir les sauvegardes de production et les procédures de reprise hors du seul poste opérateur.
