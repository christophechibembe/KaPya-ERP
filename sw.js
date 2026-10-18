// KaPya ERP — service worker : mise en cache de l'application (hors-ligne pour l'interface).
// Les données (Supabase) ne sont JAMAIS mises en cache : elles passent toujours par le réseau.
const VERSION = 'kapya-erp-v77';
const SHELL = ['./', './index.html', './css/theme.css', './js/app.js', './js/api.js', './js/auth.js', './js/config.js',
  './js/demo.js', './js/cache.js', './js/roles.js', './js/rate.js', './js/ui.js', './js/print.js', './js/modules/accueil.js', './js/modules/caisse.js', './js/modules/caisse-metrics.mjs', './js/modules/historique.js', './js/modules/sauvegarde.js', './js/modules/depots.js', './js/modules/alertes.js', './js/modules/exports.js', './js/export.js', './js/bootstrap.js', './js/plans.js', './js/modules/actions-mobiles.js', './js/notifications.js', './js/modules/stocks.js', './js/modules/achats.js',
  './js/modules/ventes.js', './js/modules/credits.js', './js/modules/acomptes.js', './js/modules/facture.js', './js/modules/abonnes.js', './js/modules/doc.js', './js/modules/parties.js', './js/modules/clients.js', './js/modules/fournisseurs.js', './js/modules/offline-record-updates.mjs',
  './js/modules/rapports.js', './js/modules/parametres.js', './js/modules/plus.js', './manifest.webmanifest',
  './assets/logo.png', './assets/logo-k.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Ne jamais intercepter les appels vers Supabase ni les requêtes non GET
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord (toujours la version la plus récente), cache en secours hors-ligne
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

