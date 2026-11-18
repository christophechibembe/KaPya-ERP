# Audit de sécurité KaPya ERP

**Périmètre :** revue statique du dossier de travail reçu, de ses scripts SQL, du code navigateur et de la configuration Netlify. Aucun accès à la base Supabase distante, à ses réglages Auth/Storage, aux journaux d’hébergement ou à une session réelle n’était disponible. Ce document ne certifie donc pas l’état de production.

## Constats classés par gravité

### Élevée — versions de migrations Supabase en collision

- **Preuve :** `supabase/migrations/20261015000004_equipe_correctif.sql` et `20261015000004_taux_historique.sql` ont la même version. Même problème pour `20261017000007_cloture_caisse_rate_date.sql` et `20261017000007_historique_actions.sql`.
- **Impact :** l’ordre d’application et la correspondance avec l’historique de migration distant sont ambigus. Un déploiement automatisé peut refuser ces fichiers ou diverger selon l’outil et l’historique existant.
- **Correction :** aucune version n’a été renommée automatiquement : sans historique distant, changer une version pourrait faire rejouer une modification déjà appliquée. Résoudre les deux collisions après comparaison avec l’historique Supabase, dans une migration dédiée et validée.

### Moyenne — module d’impression absent du préchargement hors ligne

- **Preuve :** `js/modules/facture.js` et `js/modules/credits.js` importent `js/print.js`, mais cette ressource n’était pas dans la liste `SHELL` de `sw.js`.
- **Impact :** après activation du service worker, l’ouverture sans réseau pouvait échouer lors du chargement du graphe de modules.
- **Correction appliquée :** `js/print.js` est maintenant préchargé; le cache et la version affichée sont passés à v77. Un test vérifie l’inclusion des imports au démarrage.

### Risque résiduel — jetons de session conservés dans le stockage navigateur

- **Preuve :** `js/api.js` conserve les jetons Auth dans `localStorage` (`kp.session`).
- **Impact :** un script exécuté dans l’origine pourrait lire le jeton de session. La CSP limite les sources de scripts, mais une politique côté navigateur n’élimine pas l’impact d’une éventuelle injection XSS.
- **État :** aucun point d’injection XSS exploitable n’a été confirmé dans les rendus examinés; les textes d’erreur et données visibles sont fréquemment échappés via `esc`. Une revue dynamique et exhaustive des champs/rendus reste nécessaire.

## Contrôles observés dans le code

- `js/config.js` contient une clé `sb_publishable_`, destinée à être publique; aucune clé `service_role` ou `sb_secret_` n’a été repérée dans les fichiers applicatifs examinés. Protéger les données par RLS demeure obligatoire.
- La configuration CSP dans `index.html` restreint les scripts à l’origine et `connect-src` au projet Supabase configuré. `netlify.toml` définit aussi `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` et HSTS.
- Les politiques versionnées du schéma filtrent généralement par `org_id = public.my_org()`. Plusieurs RPC sensibles vérifient le rôle et l’appartenance des références à l’organisation; les paiements de crédit et certains traitements hors ligne utilisent des identifiants idempotents.
- Les opérations de vente et d’achat sont encapsulées dans des fonctions transactionnelles SQL; le stock utilise des verrous et des contrôles de disponibilité dans les migrations récentes.
- Les fonctions `SECURITY DEFINER`, les rôles `anon`/`authenticated`, les politiques Storage et les tables réelles doivent encore être comparés à la base distante. Les seuls fichiers SQL ne prouvent pas que les migrations ont été appliquées.

## Vérifications non réalisées

- Authentification, récupération de compte, expiration et renouvellement de session sur un vrai projet.
- Tests IDOR/BOLA avec deux organisations et chaque rôle.
- Audit des politiques Storage, des réglages d’authentification, de CORS et des secrets Netlify/Supabase.
- Analyse de dépendances externe : aucun manifeste npm ni fichier de verrouillage n’est présent.
- Limitation de débit : aucun mécanisme applicatif explicite n’a été trouvé pour les RPC métiers; les limites du fournisseur et de l’hébergement n’ont pas été vérifiées.
- Tests XSS/CSRF et en-têtes réellement servis par l’hébergement.

## Conclusion

La configuration et les fonctions visibles comportent des protections utiles, mais les collisions de migrations sont un risque sérieux avant déploiement. Ne pas déployer les migrations avant d’avoir réconcilié leurs versions avec l’historique distant. Aucun changement de base ou déploiement n’a été effectué.
