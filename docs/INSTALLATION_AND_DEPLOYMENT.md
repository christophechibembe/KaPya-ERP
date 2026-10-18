# Installation et déploiement

## Prérequis

- Un navigateur moderne avec JavaScript, IndexedDB et stockage local activés.
- Pour servir le dossier localement sur Windows : Python 3 (`py` ou `python`) et le port 8106 libre.
- Un projet Supabase existant et configuré pour KaPya pour utiliser les comptes et données réels.

## Lancement local

1. Décompresser le projet dans un dossier.
2. Sous Windows, lancer `lancer-8106.bat`; ouvrir `http://localhost:8106`.
3. Garder la fenêtre du serveur ouverte. Le lanceur annonce encore « v67 » : ce texte est obsolète; le code corrigé indique v77.
4. Sous macOS/Linux, démarrer un serveur HTTP statique depuis la racine. `lancer.sh` utilise le port 8100.

Ne pas ouvrir directement `index.html` avec `file://`. Pour une installation PWA et le service worker, utiliser une origine HTTPS ou localhost.

## Configuration Supabase

`js/config.js` contient l’URL du projet et une clé publique. Remplacer ces valeurs uniquement par les paramètres du projet visé. Une clé publique peut apparaître dans le navigateur; ne jamais y placer `service_role`, `sb_secret_` ou un secret privé. La CSP de `index.html` doit autoriser le domaine Supabase exact.

Le dépôt ne contient pas de fichier `.env` ni de CLI Supabase détectée pendant cet audit. Les migrations sont dans `supabase/migrations/`; les scripts manuels complémentaires sont dans `sql/`. Lire chaque script et son préambule avant exécution. Le schéma `sql/schema.sql` indique qu’il est destiné à une installation neuve uniquement.

**Avant toute migration :** vérifier l’historique réel de Supabase, résoudre les deux versions de migration dupliquées et comparer le schéma attendu au schéma déployé. Aucun déploiement ne doit utiliser `schema.sql` comme réinitialisation d’une base existante.

## Commandes et aperçu

- Tests : `node --test tests/*.test.mjs`
- Vérification de syntaxe : `node --check` sur les fichiers JavaScript concernés.
- Aperçu autonome fictif : `node tools/build-preview.mjs <chemin-de-sortie.html>`

Il n’existe pas de scripts npm de lint, de typage ou de build de production.

## Netlify

`netlify.toml` publie la racine (`publish = "."`) et définit plusieurs en-têtes ainsi que des règles 404 pour masquer les dossiers internes. Vérifier le domaine CSP dans `index.html` et contrôler les en-têtes effectivement servis après un déploiement de prévisualisation. Aucune publication n’a été effectuée pendant l’audit.

## Retour arrière

Conserver l’ancienne version de fichiers et le résultat du déploiement de prévisualisation. En cas d’incident front-end, redéployer l’artefact précédent et faire recharger/mettre à jour le service worker. Un retour arrière applicatif ne restaure pas une migration SQL déjà appliquée; toute opération sur la base doit avoir sa procédure corrective validée séparément. Ne pas supprimer ni réinitialiser de données.
