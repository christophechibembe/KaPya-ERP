# KaPya ERP v69 — installation

## Installer l’application
1. Décompressez le dossier complet dans un nouveau dossier. Gardez l’ancienne version comme sauvegarde.
2. Sur Windows, double-cliquez sur `lancer.bat`.
3. L’application s’ouvre sur `http://localhost:8107`. Gardez la fenêtre du serveur ouverte.
4. Si l’ancienne version reste affichée, faites `Ctrl + F5`.

## Sur le téléphone
Le téléphone et l’ordinateur doivent être sur le même Wi-Fi. Ouvrez `http://ADRESSE-IP-DE-L-ORDINATEUR:8107` (adresse IPv4 visible avec `ipconfig`). L’installation comme application demande HTTPS ; le lanceur local utilise HTTP.

## Scripts Supabase (SQL Editor)
Exécutez uniquement ceux qui ne sont pas encore appliqués sur votre base. Tous peuvent être relancés sans erreur.
- `sql/historique-actions.sql`, `sql/restauration.sql`, `sql/depots.sql`, `sql/depots-ventes-achats.sql` : déjà appliqués si vous avez suivi la passation.
- `sql/taux-admin-seul.sql` : **nouveau dans v69**. Le taux du jour n’est plus modifiable que par l’admin et le responsable.
- `sql/cloture-caisse-rate-date.sql` : à lancer si la clôture de caisse est installée sans ce correctif de date.

Si Supabase affiche une erreur, copiez le message exact avant de continuer.

## Ce qui ne demande aucun script
Les exports CSV, les filtres de ventes et achats, les raccourcis téléphone et les modifications hors ligne des fiches.
