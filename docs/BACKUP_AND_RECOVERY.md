# Sauvegarde et reprise

## Dump officiel PostgreSQL (`pg_dump`)

L'export de `sql/exports/` ne contient que le schéma (aucune donnée). Pour une
restauration garantie, produire en plus un dump officiel avec la CLI Supabase
(`npx supabase db dump`). Il faut le mot de passe de la base, à saisir au moment de
la commande ou à fournir via `--password` ; il n'est jamais enregistré dans le dépôt.

Le dump contient des **données personnelles** : l'écrire **hors du dépôt**, par exemple
dans `D:\kapya-sauvegardes\`, et ne jamais le committer.

```powershell
# Schéma complet
npx supabase db dump --db-url "postgresql://postgres.ttplxlobehmwzfnxviej:<mot-de-passe>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" -f "D:\kapya-sauvegardes\kapya-2026-11-18-schema.sql"

# Données seules (même chaîne de connexion)
npx supabase db dump --data-only --db-url "postgresql://postgres.ttplxlobehmwzfnxviej:<mot-de-passe>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" -f "D:\kapya-sauvegardes\kapya-2026-11-18-donnees.sql"
```

La CLI Supabase a besoin de Docker. Sans Docker, utiliser directement `pg_dump` (même
version majeure que le serveur, ici 17) avec `PGPASSWORD` dans l'environnement :

```powershell
$env:PGPASSWORD='<mot-de-passe>'
pg_dump -h aws-0-eu-west-1.pooler.supabase.com -p 5432 -U postgres.ttplxlobehmwzfnxviej -d postgres --schema-only --no-owner --schema=public -f "D:\kapya-sauvegardes\kapya-2026-11-18-schema.sql"
pg_dump -h aws-0-eu-west-1.pooler.supabase.com -p 5432 -U postgres.ttplxlobehmwzfnxviej -d postgres --data-only --no-owner --schema=public -f "D:\kapya-sauvegardes\kapya-2026-11-18-donnees.sql"
```

Dump produit le 18 novembre 2026 : 66 tables dans chaque fichier (380 Ko de schéma,
14,2 Mo de données), serveur PostgreSQL 17.11.

Utiliser la chaîne **Session pooler** (port `5432`, hôte `aws-0-<région>.pooler.supabase.com`,
utilisateur `postgres.<référence>`), et non la connexion directe, si le réseau refuse IPv6.
Pour un test, restaurer d'abord dans un projet vide, jamais en production active.

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
