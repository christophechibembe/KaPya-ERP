# Diagnostic général

## Architecture observée

KaPya ERP v76 reçu est une application web statique en JavaScript natif, HTML et CSS, sans bundler ni manifeste npm. Elle communique directement avec Supabase Auth et PostgREST par `fetch`. Netlify publie la racine du dépôt; `sw.js` met en cache l’interface. IndexedDB conserve les lectures et la file locale des opérations; les jetons Auth sont dans `localStorage`.

Les modules présents couvrent ventes/factures, crédits, acomptes, achats, clients, fournisseurs, produits/stocks, dépôts/transferts, caisse, rapports, exports, sauvegarde, historique, paramètres et abonnés. Le dépôt contient des migrations Supabase versionnées et un ensemble de scripts SQL historiques.

## État du dossier

- Le dossier de travail ne contient pas de `.git`; la branche, les modifications locales préexistantes et les commits ne peuvent pas être déterminés.
- Le ZIP mentionné et le dossier de travail diffèrent : le ZIP contient notamment les fichiers `CHANGEMENTS-V67` à `V76` absents du dossier; le dossier contient des fichiers et migrations supplémentaires absents du ZIP. Le contenu existant a été préservé.
- Aucun `package.json`, fichier de verrouillage, configuration TypeScript, suite E2E ou manifeste de dépendances n’a été trouvé. Les commandes npm lint/build ne sont donc pas définies.
- Deux paires de migrations Supabase portent un numéro de version identique. L’état réel de la base est inconnu.

## Problème confirmé et réparation

**Moyen — préchargement hors ligne incomplet.** Les imports statiques de facturation et crédits nécessitent `js/print.js`, absent du cache initial du service worker. Le fichier est ajouté à `SHELL`, le cache est versionné v77 et `tests/service-worker-shell.test.mjs` vérifie que le graphe d’import de démarrage est préchargé.

## Fonctionnement et limites

- Interface et lectures disponibles hors ligne selon les ressources et données déjà mises en cache.
- Ventes, achats, transferts, acomptes et paiements de crédit disposent d’une file d’attente ou d’une logique dédiée; les modifications de fiches client/fournisseur/article sont aussi mises en file. Une opération rejetée reste signalée pour examen.
- Le mode hors ligne ne remplace ni les contrôles de la base ni un test sur plusieurs appareils. Les conflits de synchronisation et les scénarios de coupure n’ont pas été testés ici.
- Les rapports, l’intégrité des données distantes, la performance réseau, l’accessibilité et le comportement mobile n’ont pas fait l’objet d’une vérification navigateur complète.

## Vérifications exécutées

- Tests Node : 8 réussis après la correction, dont le test du préchargement hors ligne.
- Vérification syntaxique Node des fichiers `.js` et `.mjs` : réussie.
- Génération de l’aperçu autonome via `tools/build-preview.mjs` : réussie.
- Tests E2E, lint dédié, contrôle TypeScript, build de production hébergé et tests contre Supabase : indisponibles ou non exécutés.
