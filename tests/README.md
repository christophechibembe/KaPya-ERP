# Tests KaPya ERP

```sh
npm.cmd test
```

Le script vérifie d'abord que `js/version.js`, `package.json` et `sw.js` portent la même version,
puis lance toute la suite.

## Contenu

| Fichier | Couverture |
|---|---|
| `vente-rapide.test.mjs` | calculs de vente, acomptes, crédits, références, soldes |
| `vente-rapide.browser.test.mjs` | interface de vente rapide dans Chromium, impression, panier, stock, rôles, fuseau horaire |
| `accueil.browser.test.mjs` | tableau de bord, actualisation automatique, dates locales |
| `regles.test.mjs` | formules d'abonnement, rôles et écrans, reçus (logo, TVA), calculs, caisse, hors-ligne |
| `saisie.test.mjs` | mots de passe refusés, import CSV, conversion des nombres |
| `dates.test.mjs` | jour local (jamais UTC) |
| `deploiement.test.mjs` | contenu du dossier publié et entrée mobile identique |

## Bon à savoir

- Tests navigateur sans dépendance : Chromium/Edge/Chrome installé et Node.js 22+.
  Définir `KAPYA_BROWSER` pour indiquer un autre emplacement de navigateur.
  Sans navigateur détecté, cette partie est ignorée.
- Les tests servent une page isolée avec des données et des RPC simulées :
  **aucune connexion à Supabase, aucune modification des données réelles**.
- Résolutions vérifiées : 1440×900, 1366×768, 1280×720, 1024×768, 900×600 et 390×844.
- Une capture du rendu est conservée dans le dossier temporaire des tests.

## Vérifier la production

```sh
npm.cmd run verifier:prod
```

Contrôle les fichiers servis, la version publiée, le logo des documents, le guide, la page de
confidentialité, l'entrée `/app/`, les liens légaux et l'absence de débordement horizontal sur
l'écran de connexion.
