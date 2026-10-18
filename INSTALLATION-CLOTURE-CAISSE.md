# Installer la clôture de caisse — KaPya ERP v67

## 1. Mettre à jour Supabase

Si la clôture v66 est déjà installée et que son script s’est exécuté avec succès, passe directement à l’étape 2 : v67 ne change pas le SQL.

Sinon :

1. Ouvre **Supabase → SQL Editor**.
2. Depuis le dossier extrait de cette version, ouvre `sql/cloture-caisse.sql`.
3. Copie tout le fichier dans une nouvelle requête et clique sur **Run**.

Le script est réexécutable et ne supprime pas les clôtures enregistrées. Ne lance pas les anciens scripts après celui-ci.

## 2. Ouvrir l’application

1. Décompresse `kapya-v67-kaPya-erp.zip` dans un dossier.
2. Ouvre le dossier extrait et double-clique sur `lancer-8106.bat`.
3. Le navigateur s’ouvrira sur **http://localhost:8106** quand le serveur sera prêt. Garde la fenêtre du serveur ouverte pendant l’utilisation.

Le serveur nécessite Python. Si le port 8106 est déjà occupé, ferme l’autre serveur KaPya avant de relancer.

## 3. Utiliser la clôture

- La clôture concerne la journée en cours. Le gérant, le responsable et le facturier peuvent enregistrer la première clôture. Seuls le gérant et le responsable peuvent la corriger. Le comptable peut consulter les clôtures.
- Compte les fonds initiaux et les espèces restantes séparément en USD et en FC. L’application calcule l’attendu et l’écart au taux configuré.
- Si le taux actif n’a pas été mis à jour à la date du jour, l’application affiche un rappel. Vérifie le taux dans **Paramètres** avant de clôturer.
- Une facture d’achat seule crée une dette fournisseur : elle ne représente pas une sortie de caisse. Pour qu’un paiement soit inclus dans la clôture, enregistre-le comme **Paiement fournisseur**. Les dépenses doivent aussi être enregistrées dans le tableau de bord.
- Les ventes au comptant, paiements de crédit et dépôts clients sont comptés selon leur date d’encaissement. Un acompte déjà encaissé n’est pas compté une seconde fois lorsqu’il est imputé à une vente.

## 4. Imprimer

Choisis la mise en page **85 mm**, **55 mm** ou **A4**, puis dans la fenêtre d’impression sélectionne le papier correspondant à l’imprimante. La mise en page ne peut pas remplacer le réglage du rouleau ou du format papier dans le pilote d’imprimante.

La clôture a besoin d’une connexion à Supabase. Elle ne s’enregistre pas hors ligne. Les autres ajouts hors ligne de v67 sont expliqués dans `INSTALLATION.txt`.

