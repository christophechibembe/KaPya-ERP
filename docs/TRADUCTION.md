# Traduction anglaise

Rapport généré par `scripts/audit-i18n.mjs` le 2026-11-18 07:52.

- Entrées du dictionnaire : **140**
- Textes visibles repérés : **1774**
- Traduits : **225** (12.7 %)
- Restant à traduire : **1549**

La traduction fonctionne par correspondance exacte : un texte absent du dictionnaire
reste en français. Le mécanisme est dans `js/i18n.js` (aucune dépendance).

| Fichier | Textes | À traduire |
| --- | --- | --- |
| `guide.html` | 327 | 308 |
| `js\modules\parametres.js` | 183 | 149 |
| `confidentialite.html` | 132 | 130 |
| `js\modules\rapports.js` | 140 | 104 |
| `js\modules\accueil.js` | 92 | 84 |
| `js\modules\vente-rapide.js` | 62 | 59 |
| `js\modules\facture.js` | 59 | 54 |
| `js\modules\workers.js` | 56 | 54 |
| `js\modules\abonnes.js` | 54 | 50 |
| `js\modules\caisse.js` | 48 | 46 |
| `js\ui.js` | 47 | 45 |
| `js\modules\credits.js` | 43 | 38 |
| `js\print.js` | 40 | 35 |
| `js\modules\doc.js` | 43 | 32 |
| `js\modules\bons.js` | 31 | 25 |
| `js\modules\lots.js` | 26 | 23 |
| `js\modules\proforma.js` | 29 | 23 |
| `js\modules\sauvegarde.js` | 25 | 23 |
| `js\modules\stocks.js` | 26 | 23 |
| `js\modules\depots.js` | 28 | 20 |
| `js\modules\retours.js` | 23 | 20 |
| `js\modules\transferts.js` | 24 | 20 |
| `js\app.js` | 26 | 19 |
| `js\modules\avoirs.js` | 22 | 19 |
| `js\modules\acomptes.js` | 22 | 18 |
| `js\modules\caisse-boutiques.js` | 17 | 17 |
| `js\modules\alertes.js` | 21 | 15 |
| `js\auth.js` | 14 | 10 |
| `js\modules\parties.js` | 12 | 10 |
| `js\thermal-usb.js` | 9 | 9 |
| `js\modules\historique.js` | 10 | 8 |
| `js\receipt.js` | 13 | 8 |
| `js\demo.js` | 6 | 6 |
| `js\bootstrap.js` | 6 | 5 |
| `js\pdf.js` | 5 | 5 |
| `js\api.js` | 4 | 4 |
| `js\lock.js` | 5 | 4 |
| `js\modules\clients.js` | 4 | 4 |
| `js\modules\exports.js` | 10 | 4 |
| `index.html` | 12 | 3 |
| `js\modules\plus.js` | 4 | 3 |
| `js\onboarding.js` | 3 | 3 |
| `js\global-search.js` | 2 | 2 |
| `js\notif-centre.js` | 2 | 2 |
| `js\escape.js` | 1 | 1 |
| `js\export.js` | 1 | 1 |
| `js\news.js` | 1 | 1 |
| `js\payment-rules.js` | 1 | 1 |
| `js\sale-math.js` | 1 | 1 |
| `js\shops.js` | 1 | 1 |
| `404.html` | 1 | 0 |

## Priorités

Les écrans les plus utilisés d’abord : connexion, tableau de bord, vente, clients,
stock. Le guide (`guide.html`) représente à lui seul la majorité des textes restants
et peut être traité séparément.
