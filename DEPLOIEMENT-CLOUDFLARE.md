# Publication KaPya ERP

- Projet Cloudflare Pages : `kapya-erp`
- Branche de production : `main`
- Application : https://kapya-erp.pages.dev/
- Vente rapide : https://kapya-erp.pages.dev/#/vente
- Entrée téléphone : https://kapya-erp.pages.dev/app/
- Démo sans inscription : https://kapya-erp.pages.dev/demo/

Le frontend utilise la configuration Supabase existante, sans modifier la base,
les comptes ou les permissions. La connexion à Cloudflare ne connecte pas
automatiquement l'utilisateur à KaPya : utiliser son compte KaPya habituel.

## Publier une mise à jour

Depuis `D:\kapya-erp` :

```powershell
npm.cmd run publier
```

Le script enchaîne et s'arrête au premier échec :

1. contrôle des versions (`js/version.js`, `package.json`, `sw.js`) ;
2. tests complets ;
3. sauvegarde datée du code dans `D:\kapya-sauvegardes` ;
4. préparation du dossier public (sans tests, scripts, SQL ni fichiers privés) ;
5. déploiement Cloudflare Pages ;
6. vérification de la production en ligne.

Autres commandes utiles :

```powershell
npm.cmd run preparer        # prépare le dossier public sans déployer
npm.cmd run publier -- --preparer   # tests + sauvegarde + préparation, sans déploiement
npm.cmd run publier -- --verifier   # vérifie seulement la production
npm.cmd run verifier:prod   # même vérification, directement
npm.cmd run instantane      # archive datée du code
npm.cmd run inventaire      # met à jour sql/SCHEMA.md
```

## Avant chaque publication

1. Modifier la version dans **les trois fichiers** : `js/version.js` (`APP_VERSION` et `BUILD`),
   `package.json` (`version`) et `sw.js` (`VERSION`) — `npm test` refuse de continuer s'ils divergent.
2. Vérifier que les changements SQL sont enregistrés dans `sql/` (voir `sql/README.md`).
3. Lancer `npm.cmd run publier`.

Seul `js/config.js` contient une clé publique. La préparation refuse toute clé
`sb_secret_` ou `service_role`.

## Si la connexion Cloudflare a expiré

```powershell
npx.cmd --yes wrangler login
```

L'autorisation se fait dans le navigateur. Ne pas mettre de jeton Cloudflare ou
de clé privée Supabase dans le projet.

## Après la publication

- Recharger deux fois l'application (le service worker met à jour son cache).
- Vérifier le numéro de build affiché en bas du menu.
- Pour les e-mails de réinitialisation de mot de passe, vérifier que le domaine est autorisé
  dans **Supabase → Authentication → URL Configuration → Redirect URLs**.
