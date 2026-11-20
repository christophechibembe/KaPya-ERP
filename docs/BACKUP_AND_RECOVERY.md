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

## Sauvegarde automatique hebdomadaire

Le script `scripts/sauvegarde-production.mjs` produit chaque semaine le schéma et les
données, vérifie que chaque fichier est complet, applique une rotation, copie le résultat
hors site **chiffré** et alerte en cas d'échec.

**Préparer une fois**

1. Avoir `pg_dump` (version majeure identique au serveur). Le script le cherche dans
   `%USERPROFILE%\.kapya\pg\bin`, dans `C:\Program Files\PostgreSQL\*\bin`, puis dans le
   `PATH`. Sinon, définir `PG_DUMP`.
2. Écrire l'URL de connexion **Session pooler** dans
   `%USERPROFILE%\.kapya\db-url.txt` (une seule ligne, hors dépôt) :

   ```text
   postgresql://postgres.<reference>:<mot-de-passe>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
   ```

   Si le mot de passe contient des caractères spéciaux, les encoder dans l'URL
   (`@` devient `%40`, `:` devient `%3A`).
3. Facultatif : indiquer un dossier de copie hors site dans
   `%USERPROFILE%\.kapya\copie-sauvegarde.txt`.
4. Facultatif : indiquer un webhook d'alerte (Slack, Discord ou autre URL acceptant un
   JSON `{"text": …}`) dans `%USERPROFILE%\.kapya\webhook-sauvegarde.txt`.

**Lancer et vérifier**

```powershell
npm.cmd run sauvegarde            # 8 sauvegardes conservées par défaut
node scripts/sauvegarde-production.mjs --garder 12
```

Les fichiers vont dans `D:\kapya-sauvegardes\` (ou `KAPYA_SAUVEGARDES`) :
`kapya-AAAA-MM-JJ-schema.sql`, `kapya-AAAA-MM-JJ-donnees.sql`, et le journal
`sauvegarde.log`. Le script échoue si un dump est vide ou incomplet.

La copie hors site contient les mêmes fichiers en `.sql.enc`, chiffrés en AES-256-GCM.
La clé est `%USERPROFILE%\.kapya\cle-sauvegarde.txt`, créée au premier passage : la
conserver dans un gestionnaire de mots de passe. Sans elle, la copie est illisible.
Déchiffrer avant restauration :

```powershell
node scripts/dechiffrer-sauvegarde.mjs "C:\Users\...\OneDrive\Sauvegardes-KaPya\kapya-2026-11-18-donnees.sql.enc" "D:\kapya-sauvegardes\donnees.sql"
```

La rotation s'applique aux fichiers locaux et à la copie hors site.

**Alerte d'échec**

En cas d'échec, le script affiche une notification Windows, écrit `DERNIER-ECHEC.txt` dans
le dossier de sauvegarde, ajoute la cause au journal et envoie le message au webhook
configuré. À la sauvegarde suivante réussie, il lève l'alerte et prévient que la
sauvegarde est rétablie.

**Planifier chaque semaine**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\installer-sauvegarde.ps1 -Jour Dimanche -Heure 03:00 -Garder 8 -Copie "E:\sauvegardes-kapya"
```

La tâche « KaPya - Sauvegarde hebdomadaire » s'exécute avec la session de l'utilisateur
connecté, y compris sur batterie. Pour qu'elle tourne même sans session ouverte,
l'installer dans le Planificateur de tâches avec « Exécuter que l'utilisateur soit
connecté ou non » et le mot de passe Windows. Tester aussitôt avec
`schtasks /Run /TN "KaPya - Sauvegarde hebdomadaire"`.

Le dossier de sauvegarde contient des **données personnelles** : le protéger (droits
restreints), chiffrer toute copie hors site et ne jamais le placer dans le dépôt Git.
Pour une restauration, déchiffrer puis rejouer le schéma et les données dans un projet
vide, jamais en production active.

Utiliser la chaîne **Session pooler** (port `5432`, hôte `aws-0-<région>.pooler.supabase.com`,
utilisateur `postgres.<référence>`), et non la connexion directe, si le réseau refuse IPv6.

## Copie cloud indépendante du PC

Le workflow `.github/workflows/sauvegarde.yml` réalise une deuxième sauvegarde sur un
runner GitHub hébergé, chaque dimanche à **02:17 UTC**. Il peut être lancé manuellement :

1. Ouvrir <https://github.com/christophechibembe/KaPya-ERP/actions>.
2. Choisir **Sauvegarde chiffrée** → **Run workflow** → branche **main**.
3. Ouvrir l'exécution réussie puis télécharger l'artefact `kapya-sauvegarde-…`.
4. Extraire le ZIP : seuls les deux `.sql.enc` et `manifest.json` doivent s'y trouver.
5. Déchiffrer avec `scripts/dechiffrer-sauvegarde.mjs` et la clé habituelle.

La clé existante est réutilisée : **ne pas la régénérer**. Avant téléversement, chaque
fichier chiffré est déchiffré en mémoire et comparé au dump original. Le manifeste
contient les empreintes SHA-256 des fichiers chiffrés, pas de données métier.

Les secrets `KAPYA_DB_URL`, `KAPYA_CLE`, `KAPYA_WEBHOOK` sont dans
**Settings → Secrets and variables → Actions**, jamais dans le code ni les artefacts.
Les dumps en clair restent dans un dossier temporaire du runner, nettoyé en fin de
travail. Le mot de passe PostgreSQL passe par l'environnement, pas les arguments.

La rotation conserve au maximum **8 exécutions**, chacune pendant au plus **56 jours**.
Les archives locales et OneDrive du 18 novembre restent indépendantes de cette rotation.
La sauvegarde Windows hebdomadaire reste en place comme seconde voie.

Le webhook reçoit le résultat et un lien vers l'exécution. Si le runner ne démarre pas,
ne pas attendre une alerte d'un travail qui n'a pas tourné : vérifier périodiquement la
date de la dernière exécution et maintenir la sauvegarde Windows. GitHub peut retarder
une planification et désactive les tâches planifiées d'un dépôt public après une longue
inactivité (60 jours). Ce n'est pas un service de sauvegarde avec garantie contractuelle.

Le dépôt étant public, les artefacts peuvent être téléchargés par d'autres personnes :
**leur contenu doit rester chiffré**, et l'accès administrateur au dépôt doit être
protégé (authentification à deux facteurs). Les utilisateurs capables de modifier les
workflows peuvent potentiellement accéder aux secrets ; limiter ces droits.

Le dump couvre le schéma `public`, comme la sauvegarde locale : il ne remplace pas une
copie des utilisateurs `auth`, du stockage de fichiers et de la configuration Supabase.
Tester périodiquement une restauration dans un projet isolé.

En cas de changement du mot de passe de la base, mettre à jour **également**
`KAPYA_DB_URL` dans les secrets GitHub, puis lancer le workflow manuellement.

## Changer le mot de passe de la base

Depuis le tableau de bord Supabase (*Project Settings → Database → Reset database
password*), ou avec un jeton personnel complet via
`PATCH https://api.supabase.com/v1/projects/<référence>/database/password` et un corps
`{"password": "…"}`. Le point d'entrée `PATCH /v1/projects/<référence>` avec `db_pass`
répond 200 mais ne change pas le mot de passe : ne pas l'utiliser.

Après la rotation, mettre à jour `%USERPROFILE%\.kapya\db-url.txt` (encoder `@` en
`%40`, `:` en `%3A`), vérifier la connexion, puis lancer une sauvegarde de contrôle.
Le 18 novembre 2026, la rotation par le point d'entrée officiel a été appliquée, l'ancien
mot de passe refusé et une sauvegarde complète a réussi avec le nouveau.

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
