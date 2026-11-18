# KaPya ERP

Application de gestion pour commerces : ventes, achats, stock, crédits, caisse et rapports.
Frontend statique (modules ES, sans framework ni étape de compilation), base Supabase, publication Cloudflare Pages.

- Production : https://kapya-erp.pages.dev/
- Vente rapide : https://kapya-erp.pages.dev/#/vente
- Entrée téléphone : https://kapya-erp.pages.dev/app/

## Structure

| Dossier | Rôle |
|---|---|
| `index.html` | point d'entrée unique (PWA) |
| `guide.html` | guide d'utilisation, imprimable |
| `confidentialite.html` | confidentialité et conditions d'utilisation |
| `js/` | application : `app.js` (routes), `api.js` (Supabase, hors-ligne), `modules/` (écrans) |
| `css/` | `theme.css` (application), `welcome.css` (accueil public) |
| `assets/`, `icons/` | logos, images et icônes PWA |
| `sw.js`, `manifest*.webmanifest` | service worker et manifestes |
| `sql/` | inventaire de la base et scripts SQL à versionner |
| `scripts/` | outils locaux : préparation, publication, vérification, sauvegarde |
| `tests/` | tests unitaires et tests navigateur isolés (aucune donnée réelle) |

## Lancer et tester

```powershell
npm.cmd start        # serveur local (scripts/lancer.mjs)
npm.cmd test         # contrôle des versions + tests unitaires et navigateur
```

Les tests navigateur utilisent Edge/Chrome/Chromium installé. Sans navigateur détecté, ils sont ignorés.
Ils servent une page isolée avec des données et des RPC simulées : aucune connexion à Supabase.

## Publier

```powershell
npm.cmd run publier
```

Le script enchaîne : contrôle des versions → tests → sauvegarde datée → préparation du dossier public → déploiement Cloudflare Pages → vérification de la production. Si une étape échoue, la publication s'arrête.

Autres commandes :

```powershell
npm.cmd run preparer        # prépare le dossier de publication sans déployer
npm.cmd run verifier:prod   # vérifie la production en ligne
npm.cmd run inventaire      # régénère sql/SCHEMA.md depuis le code
npm.cmd run audit:sql       # audit statique du SQL (RLS, migrations) → docs/AUDIT-STATIQUE-SQL.md
npm.cmd run exporter        # relit la production Supabase → sql/exports/<date>/
npm.cmd run instantane      # archive datée du projet (sauvegarde du code)
```

La connexion Cloudflare se fait avec `npx.cmd wrangler login`. Ne jamais placer de jeton
Cloudflare ni de clé privée Supabase dans le projet : seul `js/config.js` contient la clé publique.

## Base de données

Le schéma réel (tables, RPC, RLS) vit dans Supabase. `sql/SCHEMA.md` recense ce que le code utilise,
`sql/README.md` explique comment exporter et versionner le schéma, et `supabase/migrations/`
contient les 28 migrations datées. **Ne pas modifier la base sans avoir exporté le schéma au préalable.**

`npm test` contrôle en plus : versions de migration uniques, RLS sur chaque table,
`SECURITY DEFINER` toujours accompagné de `search_path`, et scripts cités réellement présents.
Le détail est régénérable dans `docs/AUDIT-STATIQUE-SQL.md`.

## Versions

Trois fichiers doivent rester alignés :

- `js/version.js` : `APP_VERSION` et `BUILD` (affichés dans l'application) ;
- `package.json` : `version` ;
- `sw.js` : `VERSION = 'kapya-erp-<version>-build<build>'`.

`npm.cmd test` refuse de démarrer si les trois divergent.

## Versionnement

Le dépôt Git est initialisé sur la branche `main`. Git est installé en version portable dans
`D:\outils\MinGit` (sans droits administrateur) et son dossier `cmd` est ajouté au `PATH` de
l'utilisateur : rouvrez un terminal pour utiliser `git`.

Le premier commit et l'étiquette `v1.45.9` portent l'identité de départ
`KaPya Digital <kapya@example.invalid>`. Définissez votre identité dans le dossier du projet ;
elle s'appliquera aux commits suivants :

```powershell
cd /d D:\kapya-erp
git config user.name "Prénom Nom"
git config user.email "vous@exemple.com"
git config --get user.name
```

Ne réécrivez pas l'historique sans nécessité : l'étiquette de version pointe sur le premier commit.

Après chaque changement important :

```powershell
git add .
git commit -m "Décrivez le changement"
```

`npm.cmd run instantane` reste utile : il produit une archive datée dans `D:\kapya-sauvegardes`
en plus de l'historique Git.

## Limites connues

- La restauration d'une sauvegarde n'est possible que dans une entreprise vide.
- Le bénéfice affiché est brut : les dépenses ne sont pas déduites.
- Devises : USD et CDF uniquement.
- La traduction anglaise est partielle.
