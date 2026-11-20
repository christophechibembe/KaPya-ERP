// KaPya ERP — service worker : mise en cache de l'application (hors-ligne pour l'interface).
// Les données (Supabase) ne sont JAMAIS mises en cache : elles passent toujours par le réseau.
const VERSION = 'kapya-erp-1.47.0-build136';
const SHELL = [
  './',
  './404.html',
  './assets/guide',
  './assets/kapya-dashboard-hero.jpg',
  './assets/logo-dark.png',
  './assets/logo-k.png',
  './assets/logo.png',
  './assets/welcome-portrait.jpg',
  './css/theme.css',
  './css/dashboard-modern-pc.css',
  './css/dashboard-modern-mobile.css',
  './css/demo.css',
  './css/welcome.css',
  './guide.html',
  './confidentialite.html',
  './icons/app',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './index.html',
  './js/api.js',
  './js/app.js',
  './js/article-import.js',
  './js/auth.js',
  './js/bootstrap.js',
  './js/business.js',
  './js/cache.js',
  './js/cart-store.js',
  './js/client-import.js',
  './js/config.js',
  './js/conflict.js',
  './js/csv.js',
  './js/dash-cache.js',
  './js/dashboard-modes.js',
  './js/demo.js',
  './js/demo-mode.js',
  './js/demo-ui.js',
  './js/storage.js',
  './js/credit-reminder.mjs',
  './js/replenishment.mjs',
  './js/escape.js',
  './js/export.js',
  './js/full-report.js',
  './js/help.js',
  './js/i18n.js',
  './js/lock.js',
  './js/localdb.js',
  './js/modules/abonnes.js',
  './js/modules/accueil.js',
  './js/modules/achats.js',
  './js/modules/acomptes.js',
  './js/modules/actions-mobiles.js',
  './js/modules/alertes.js',
  './js/modules/avoirs.js',
  './js/modules/bons.js',
  './js/modules/caisse-boutiques.js',
  './js/modules/caisse-metrics.mjs',
  './js/modules/caisse.js',
  './js/modules/clients.js',
  './js/modules/credits.js',
  './js/modules/depots.js',
  './js/modules/doc.js',
  './js/modules/exports.js',
  './js/modules/facture.js',
  './js/modules/fournisseurs.js',
  './js/modules/historique.js',
  './js/modules/lots.js',
  './js/modules/offline-record-updates.mjs',
  './js/modules/parametres.js',
  './js/modules/parties.js',
  './js/modules/plus.js',
  './js/modules/proforma.js',
  './js/modules/rapports.js',
  './js/modules/retours.js',
  './js/modules/sauvegarde.js',
  './js/modules/stocks.js',
  './js/modules/transferts.js',
  './js/modules/vente-rapide.js',
  './js/modules/ventes.js',
  './js/modules/workers.js',
  './js/monitor.js',
  './js/news.js',
  './js/notifications.js',
  './js/onboarding.js',
  './js/own-org.js',
  './js/password.js',
  './js/payment-rules.js',
  './js/pdf.js',
  './js/plans.js',
  './js/print.js',
  './js/push.js',
  './js/rate.js',
  './js/global-search.js',
  './js/vat.js',
  './js/receipt.js',
  './js/replay.js',
  './js/roles.js',
  './js/sale-math.js',
  './js/shops.js',
  './js/ui.js',
  './js/version.js',
  './manifest-app.webmanifest',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  // La nouvelle version prend la main tout de suite ; les fichiers se mettent en cache en arrière-plan,
  // sans bloquer l'ouverture de l'application (les fichiers manquants sont récupérés au premier usage).
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Ne jamais intercepter les appels vers Supabase ni les requêtes non GET
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Pages (navigation) : réseau d'abord, pour toujours obtenir la version la plus récente, cache en secours hors-ligne
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
    return;
  }
  // Fichiers de l'application (scripts, styles, images) : réseau d'abord, pour recevoir tout de suite
  // les corrections après un déploiement ; cache seulement hors connexion.
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});


// Notifications push (téléphone, ordinateur)
self.addEventListener('push', e => {
  let d = { title: 'KaPya ERP', body: '', link: '/' };
  try { d = { ...d, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'assets/logo-k.png', badge: 'assets/logo-k.png', data: { link: d.link } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => (list.length ? list[0].focus() : clients.openWindow('./'))));
});
