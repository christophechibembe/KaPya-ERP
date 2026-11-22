// KaPya ERP — service worker : mise en cache de l'application (hors-ligne pour l'interface).
// Les données (Supabase) ne sont JAMAIS mises en cache : elles passent toujours par le réseau.
const VERSION = 'kapya-erp-1.50.5-build145';
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
  './js/accounting.js',
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
  './js/dashboard-modern.js',
  './js/dashboard-insights.mjs',
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
  './js/offline.js',
  './js/offline-delete.mjs',
  './js/offline-query.mjs',
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
  './js/modules/comptabilite.js',
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


// Reprise après coupure : le service worker rejoue la file d'attente même si l'application est fermée.
// Il utilise le miroir de session déposé dans IndexedDB (jamais localStorage, inaccessible ici).
// Limite honnête : le Background Sync n'existe que sur Chromium (Chrome/Edge/Android), pas sur Safari/iOS.
const OFFLINE_DB = 'kapya-offline', OFFLINE_DB_VERSION = 2;
function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('sync')) db.createObjectStore('sync');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function idbRequest(store, mode, run) {
  return openOfflineDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), request = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}
const idbGet = (store, key) => idbRequest(store, 'readonly', s => s.get(key));
const idbGetAll = store => idbRequest(store, 'readonly', s => s.getAll());
const idbPut = (store, value, key) => idbRequest(store, 'readwrite', s => key === undefined ? s.put(value) : s.put(value, key));
const idbDelete = (store, key) => idbRequest(store, 'readwrite', s => s.delete(key));

function notifyClients(message) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => list.forEach(client => client.postMessage(message)));
}
async function refreshMirroredSession(config, session) {
  const response = await fetch(config.url + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh })
  });
  if (!response.ok) throw new Error('Session à renouveler');
  const data = await response.json();
  const next = { access: data.access_token, refresh: data.refresh_token, uid: data.user?.id || session.uid,
    exp: Date.now() + Number(data.expires_in || 3600) * 1000, updated: Date.now() };
  await idbPut('sync', next, 'session');
  await notifyClients({ type: 'kp-session' });
  return next;
}
async function sendQueuedItem(config, item, token) {
  const headers = { apikey: config.key, Authorization: 'Bearer ' + token };
  if (item.method !== 'DELETE') headers['Content-Type'] = 'application/json';
  if (item.prefer) headers.Prefer = item.prefer;
  const response = await fetch(config.url + item.path, {
    method: item.method || 'POST', headers,
    body: item.method === 'DELETE' ? undefined : JSON.stringify(item.body)
  });
  let message = '';
  if (!response.ok) {
    try { const data = await response.json(); message = data?.msg || data?.message || data?.error_description || `Erreur ${response.status}`; }
    catch { message = `Erreur ${response.status}`; }
  }
  return { ok: response.ok, status: response.status, message };
}
async function replayOfflineQueue() {
  // Un onglet ouvert sait déjà se synchroniser : on évite deux renouvellements de jeton
  // concurrents et deux envois de la même pièce. Le service worker n'agit que sans client.
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clients.length) return notifyClients({ type: 'kp-sync' });
  const [config, mirrored] = await Promise.all([idbGet('sync', 'config'), idbGet('sync', 'session')]);
  if (!config?.url || !config?.key || !mirrored?.refresh) return notifyClients({ type: 'kp-sync' });
  let session = mirrored;
  if (!session.access || Date.now() > Number(session.exp || 0) - 30000) {
    try { session = await refreshMirroredSession(config, session); }
    catch (error) { await notifyClients({ type: 'kp-sync' }); throw error; } // le navigateur réessaiera
  }
  const items = (await idbGetAll('outbox')).filter(item => item.status !== 'rejected' && item.status !== 'sent');
  let interrupted = false;
  for (const item of items) {
    try {
      let result = await sendQueuedItem(config, item, session.access);
      if (result.status === 401) {
        session = await refreshMirroredSession(config, session);
        result = await sendQueuedItem(config, item, session.access);
      }
      // L'application a pu traiter la pièce entre-temps : ne jamais la ressusciter.
      if (!(await idbGet('outbox', item.seq))) continue;
      if (result.ok) await idbPut('outbox', { ...item, status: 'sent', sentAt: Date.now() });
      else if (result.status === 401) { interrupted = true; break; } // session à renouveler : on n'abandonne pas la pièce
      else await idbPut('outbox', { ...item, status: 'rejected', error: result.message,
        swRollback: true, rejectedAt: Date.now() });
    } catch { interrupted = true; break; } // toujours hors ligne : nouvelle tentative du navigateur
  }
  await notifyClients({ type: 'kp-sync' });
  if (interrupted) throw new Error('Synchronisation interrompue : réseau indisponible');
}
self.addEventListener('sync', event => {
  if (event.tag !== 'kapya-sync') return;
  event.waitUntil(replayOfflineQueue().catch(async error => {
    await notifyClients({ type: 'kp-sync' });
    throw error; // échec réel : le navigateur reprogramme la tentative
  }));
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
