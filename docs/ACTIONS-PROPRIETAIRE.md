# Actions du propriétaire

Ces opérations demandent votre compte (Supabase, Windows, messagerie). Elles ne peuvent
pas être faites à votre place. Chaque section indique où aller et quoi faire.

## 1. Révoquer les anciens jetons Supabase — priorité

Un jeton personnel donne les droits de votre compte sur tous les projets. Les jetons
`sbp_fce657…` et `sbp_fcff…` ont servi aux opérations de maintenance ; ils ne sont plus
nécessaires.

1. Ouvrir <https://supabase.com/dashboard/account/tokens> (connexion au compte Supabase).
2. La page « Access Tokens » liste les jetons avec leur nom, leur préfixe et leur date.
3. Repérer `sbp_fce657…` et `sbp_fcff…` (ou tout jeton que vous ne reconnaissez pas).
4. Cliquer sur **Revoke** / l'icône de corbeille à droite du jeton, puis confirmer.
5. Vérifier qu'il ne reste que les jetons réellement utilisés.

Effet : l'API de gestion Supabase devient inaccessible avec ces jetons. Le site et
l'application continuent de fonctionner : ils utilisent la clé publique `anon`, distincte.

## 2. Conserver la clé de chiffrement des sauvegardes

Le fichier `%USERPROFILE%\.kapya\cle-sauvegarde.txt` (45 caractères) déchiffre les copies
`.sql.enc` de OneDrive. Sans lui, ces copies sont définitivement illisibles.

1. Ouvrir le fichier : touche Windows + R, coller
   `notepad %USERPROFILE%\.kapya\cle-sauvegarde.txt`, valider.
2. Copier son contenu **exact** (une seule ligne).
3. Dans votre gestionnaire de mots de passe, créer une entrée
   « KaPya — clé de chiffrement des sauvegardes », coller la clé en note, et préciser
   « AES-256-GCM — indispensable pour les fichiers .sql.enc ».
4. Garder aussi une copie hors ligne (papier en lieu sûr ou clé USB chiffrée).
5. Ne jamais envoyer cette clé par courriel, messagerie ou dans le dépôt.

Ne pas régénérer la clé : les sauvegardes existantes ne seraient plus déchiffrables.

## 3. Faire tourner la sauvegarde sans session ouverte

La tâche « KaPya - Sauvegarde hebdomadaire » existe déjà : chaque dimanche à 03:00,
elle exécute `C:\Program Files\nodejs\node.exe` avec
`D:\kapya-erp\scripts\sauvegarde-production.mjs --garder 8`.
Elle est actuellement en mode **Interactive uniquement** : elle ne tourne que si votre
session Windows est ouverte.

1. Touche Windows + R, taper `taskschd.msc`, valider (accepter l'invite administrateur).
2. Dans **Bibliothèque du Planificateur de tâches**, cliquer sur la tâche
   « KaPya - Sauvegarde hebdomadaire » (dossier racine `\`).
3. Clic droit → **Propriétés**.
4. Onglet **Général**, section « Options de sécurité » : choisir
   **Exécuter que l'utilisateur soit connecté ou non**.
5. Valider par **OK** : Windows demande le mot de passe du compte
   `DESKTOP-LVS9QTK\LENOVO`. Le saisir (il est stocké chiffré par Windows).
6. Clic droit → **Exécuter** pour un test immédiat. Vérifier ensuite la colonne
   « Dernier résultat » : `0x0` attendu, et un nouveau couple de fichiers daté du jour
   dans `D:\kapya-sauvegardes` et OneDrive.
7. Onglet **Paramètres** : cocher « Exécuter la tâche dès que possible après un démarrage
   manqué » si vous voulez rattraper une semaine où le PC était éteint.

Si le mot de passe Windows change, rouvrir la tâche et le mettre à jour.
Alternative en ligne de commande, dans un PowerShell **administrateur** :
`schtasks /Change /TN "KaPya - Sauvegarde hebdomadaire" /RU "DESKTOP-LVS9QTK\LENOVO" /RP *`
(le `*` demande le mot de passe).

## 4. Recevoir les alertes d'échec sur téléphone ou messagerie

Le script envoie déjà une notification Windows locale. Pour une alerte distante, il lit
une URL dans `%USERPROFILE%\.kapya\webhook-sauvegarde.txt` (fichier vide, droits
restreints, déjà créé).

**Slack** : <https://api.slack.com/apps> → *Create New App* → *From scratch* → nom
« KaPya Sauvegardes » → *Incoming Webhooks* → activer → *Add New Webhook to Workspace* →
choisir un canal privé (par exemple `#kapya-alertes`) → *Allow* → copier l'URL
`https://hooks.slack.com/services/…`.

**Discord** : Paramètres du serveur → *Intégrations* → *Webhooks* → *Nouveau webhook* →
choisir un canal → *Copier l'URL du webhook* (`https://discord.com/api/webhooks/…`).

Ensuite :

1. Windows + R → `notepad %USERPROFILE%\.kapya\webhook-sauvegarde.txt` → valider.
2. Coller l'URL seule, sur une ligne, sans espace autour, puis enregistrer.
3. Tester : `node scripts/tester-webhook.mjs` depuis `D:\kapya-erp`.
   Le message « Test alerte KaPya : le webhook fonctionne. » doit arriver dans le canal.
   Le script n'affiche jamais l'URL.

L'URL du webhook est un secret : ne pas la partager ni la commiter.

## 5. Jeton pour le projet Supabase de test (facultatif)

Un projet de test dédié permet de rejouer les parcours sans toucher à la production.
Le jeton actuellement utilisé était limité au projet et refusait la création (`403`).
Il faut un jeton **personnel (user-scoped)**, avec accès à l'organisation.

1. Ouvrir <https://supabase.com/dashboard/account/tokens>.
2. Cliquer sur **Generate new token**, nommer « KaPya test jetable ».
3. Si une durée de validité est proposée, choisir la plus courte adaptée (1 jour suffit).
4. Copier le jeton affiché (il n'est plus visible ensuite).
5. Windows + R → `notepad %USERPROFILE%\.kapya\supabase-token.txt` → coller le jeton
   seul, sur une ligne, enregistrer.
6. Me prévenir : je crée le projet, j'y restaure le dump, je rejoue les scénarios, puis
   je supprime le projet et vide le fichier. Il restera à révoquer ce jeton ensuite.

Ne pas coller ce jeton dans la conversation.

## 6. Rappel : sauvegarde du 18 novembre

L'entreprise « CHEZ MAMAN RIZO » a été supprimée le 19 novembre 2026 à 11:37 UTC. La
sauvegarde du **18 novembre** la contient encore intégralement
(`D:\kapya-sauvegardes\kapya-2026-11-18-*.sql`, copie chiffrée OneDrive). Les sauvegardes
suivantes ne l'ont plus. La rotation conserve 8 dates.

## Suivi

- [ ] Jetons `sbp_fce657…` et `sbp_fcff…` révoqués
- [ ] Clé de chiffrement enregistrée dans le gestionnaire de mots de passe
- [ ] Tâche planifiée en « Exécuter que l'utilisateur soit connecté ou non », testée
- [ ] Webhook renseigné et testé
- [ ] Jeton de test collé (si projet de test souhaité)
