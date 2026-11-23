# Test hors ligne sur Android (Chrome)

Ce test vérifie la seule chose que les tests automatiques ne peuvent pas prouver :
le rejeu réel des écritures quand l'application est **complètement fermée**, et le
verrouillage au retour d'arrière-plan.

À faire sur un téléphone Android avec **Chrome**, sur la version publiée :

<https://kapya-erp.pages.dev/>

Durée : 10 à 15 minutes. À faire une fois, puis à refaire après toute modification
du service worker ou de la file d'attente.

## Avant de commencer

- [ ] Noter la version affichée en bas du menu latéral (`KaPya ERP 1.50.5`) : `____________`
- [ ] Éviter le mode économie de batterie pendant le test (il peut bloquer la reprise
      en arrière-plan ; on le teste séparément à la fin).
- [ ] Choisir un produit de test et noter son stock actuel : `____________`
- [ ] La vente créée pendant le test sera annulée à la fin. Noter son numéro pour la
      retrouver : `____________`

## Préparation (en ligne)

1. [ ] Ouvrir l'application et se connecter.
2. [ ] Aller sur **Vente**, laisser la page se charger complètement.
3. [ ] Aller sur **Paramètres → Mode hors-ligne**. Vérifier :
   - [ ] « Réseau » indique **En ligne**
   - [ ] « Dernière synchronisation » n'est pas « jamais »
   - [ ] « Copie locale » affiche un nombre de requêtes supérieur à 0
   - [ ] « Application fermée » indique **Reprise automatique possible sur ce navigateur**

Si « Application fermée » indique « Non prise en charge », arrêter ici : le
navigateur ne fera pas le test. Me le signaler avec la marque du téléphone.

4. [ ] Créer un **code de verrouillage** (4 à 6 chiffres) dans
      **Paramètres → Mon compte et sécurité → Code de verrouillage**.
      Noter le code : `____________`

## Test A — Vente hors ligne, application fermée

1. [ ] Activer le **mode avion**.
2. [ ] Revenir sur **Vente** : la page doit rester utilisable (écran déjà chargé).
3. [ ] Faire une vente de test (1 article, petite quantité). Elle doit être acceptée
      sans message d'erreur bloquant.
4. [ ] Aller sur **Paramètres → Mode hors-ligne**. Vérifier :
   - [ ] « Réseau » indique **Hors ligne**
   - [ ] « File d'attente » indique **1 en attente** (ou plus)
5. [ ] **Fermer complètement Chrome** : ouvrir les applications récentes et balayer
      Chrome vers le haut. Ne pas se contenter de revenir à l'accueil.
6. [ ] Laisser le mode avion **actif** 30 secondes.
7. [ ] Désactiver le mode avion, sans ouvrir l'application.
8. [ ] Attendre **1 à 2 minutes**.
9. [ ] Rouvrir l'application et aller sur **Paramètres → Mode hors-ligne**. Vérifier :
   - [ ] « File d'attente » indique **0 en attente**
   - [ ] « Dernière synchronisation » est récente (à l'instant ou il y a quelques minutes)

10. [ ] Vérifier sur un autre appareil ou après déconnexion/reconnexion que la vente
       existe bien côté serveur, et que le stock a diminué de la quantité vendue.

**Résultat A :** réussi / partiel / échoué — détails : `______________________`

### Si l'étape 9 échoue

Noter précisément :
- [ ] La file est-elle toujours à 1 en attente ?
- [ ] Y a-t-il des pièces **refusées** (bouton « Voir les pièces refusées ») ?
- [ ] La vente apparaît-elle après avoir rouvert l'application et attendu 1 minute ?

Ce n'est pas forcément un bug du code : Android peut empêcher la reprise en
arrière-plan. Dans ce cas la file repart à la prochaine ouverture, ce qui est le
comportement de secours prévu. Mais il faut le documenter comme limite réelle.

## Test B — Annulation hors ligne

1. [ ] En ligne, noter un document existant à annuler (vente ou achat) : `__________`
2. [ ] Activer le mode avion.
3. [ ] Annuler ce document depuis l'application.
4. [ ] Vérifier que le document disparaît de la liste et que le stock est corrigé
      sur l'écran.
5. [ ] **Fermer complètement Chrome.**
6. [ ] Désactiver le mode avion, attendre 1 à 2 minutes, rouvrir.
7. [ ] Vérifier dans **Paramètres → Mode hors-ligne** que la file est vide, puis
       vérifier côté serveur que le document est bien annulé et le stock correct.

**Résultat B :** réussi / partiel / échoué — détails : `______________________`

## Test C — Verrouillage au retour d'arrière-plan et au rechargement

1. [ ] Le code de verrouillage étant actif, mettre l'application en arrière-plan
      (bouton Accueil) pendant au moins 5 secondes.
2. [ ] Revenir sur Chrome : l'écran **« Application verrouillée »** doit s'afficher.
3. [ ] Saisir le code : l'application doit revenir à l'écran précédent.
4. [ ] Recharger la page (tirer vers le bas, ou fermer puis rouvrir l'application) :
      l'écran **« Application verrouillée »** doit revenir avant l'affichage des données.
5. [ ] Refaire le test en laissant l'application en arrière-plan moins d'une seconde :
      le verrouillage ne doit **pas** s'afficher.

**Résultat C :** réussi / partiel / échoué — détails : `______________________`

## Test D — Économie de batterie (facultatif)

1. [ ] Activer l'optimisation de batterie Android pour Chrome
      (Paramètres Android → Applications → Chrome → Batterie → « Optimisé »).
2. [ ] Refaire les étapes 1 à 9 du test A.
3. [ ] Noter si la reprise en arrière-plan fonctionne encore.

Cela permet de savoir s'il faut conseiller aux clients de désactiver l'optimisation
de batterie pour KaPya.

**Résultat D :** réussi / partiel / échoué — détails : `______________________`

## Nettoyage

1. [ ] Rouvrir l'application en ligne.
2. [ ] Annuler la vente de test créée au test A (elle doit maintenant être en ligne).
3. [ ] Vérifier que le stock est revenu à sa valeur initiale.
4. [ ] Supprimer le code de verrouillage si l'appareil n'est pas le vôtre
      (**Paramètres → Code de verrouillage → Désactiver**).

## Ce qu'il faut me rapporter

- Version et modèle de téléphone, version d'Android, version de Chrome.
- Les quatre résultats (A, B, C, D) avec les captures d'écran de la carte
  **Mode hors-ligne** avant et après.
- Pour chaque échec : la file d'attente, le nombre de refus, et ce qui s'affiche
  dans « Voir les pièces refusées ».

C'est ce rapport qui dira si la promesse « la vente part même application fermée »
est tenue sur téléphone, ou s'il faut la nuancer dans `docs/OFFLINE.md`.
