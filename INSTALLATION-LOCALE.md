# Installer KaPya ERP v67

## Sur l’ordinateur

1. Décompresse le ZIP dans un nouveau dossier.
2. Double-clique sur `lancer-8106.bat`.
3. La page s’ouvre sur `http://localhost:8106`. Garde la fenêtre du serveur ouverte.

Python 3 doit être installé. Si Windows affiche une demande du pare-feu pour Python, autorise l’accès sur ton réseau privé pour utiliser l’application depuis le téléphone.

## Sur le téléphone, sur le même Wi-Fi

Ouvre l’adresse IP de l’ordinateur suivie de `:8106`, par exemple `http://192.168.43.6:8106`. L’adresse IP peut changer quand le téléphone partage le réseau : vérifie-la avec `ipconfig` sur l’ordinateur. Si la page ne s’ouvre pas, vérifie que le serveur est encore démarré et que le pare-feu autorise Python.

En HTTP sur une adresse IP locale, l’application fonctionne dans le navigateur, mais Android peut refuser de l’installer comme application. Pour l’installation PWA et son cache hors ligne, l’adresse doit utiliser HTTPS. Publie le dossier sur un hébergement HTTPS, puis choisis **Installer l’application** dans le menu du navigateur.

## Supabase

Cette version utilise la configuration de Supabase déjà présente dans `js/config.js`. Les nouvelles modifications d’articles, clients et fournisseurs hors ligne ne demandent pas de script SQL supplémentaire. La clôture de caisse nécessite que le script `sql/cloture-caisse.sql` soit exécuté dans **Supabase → SQL Editor** ; les étapes sont détaillées dans `INSTALLATION-CLOTURE-CAISSE.md`.

Ne réinitialise pas le schéma de production. Pour ajouter des fonctions déjà livrées dans une ancienne installation, exécute uniquement le script de migration indiqué par son guide.
