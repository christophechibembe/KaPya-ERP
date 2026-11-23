// Stockage hors ligne (IndexedDB, sans dépendance) :
// - kv : réponses de lecture mises en cache (clé = chemin de la requête) ;
// - kvmeta : horodatage de chaque entrée kv (clé identique), pour un diagnostic et un
//   balayage peu coûteux sans désérialiser les grosses réponses ;
// - outbox : pièces (ventes, achats) enregistrées hors ligne, en attente d'envoi ;
// - sync : miroir de session et configuration accessibles au service worker (reprise application fermée).
import { isDemo } from './demo-mode.js';
const NAME = isDemo ? 'kapya-demo-offline' : 'kapya-offline', VER = 3;
let dbp = null;
const open = () => dbp ||= new Promise((ok, ko) => {
  const r = indexedDB.open(NAME, VER);
  r.onupgradeneeded = () => {
    const d = r.result;
    if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    if (!d.objectStoreNames.contains('kvmeta')) d.createObjectStore('kvmeta');
    if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
    if (!d.objectStoreNames.contains('sync')) d.createObjectStore('sync');
  };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => { dbp = null; ko(r.error); };
});
const run = (store, mode, fn) => open().then(d => new Promise((ok, ko) => {
  const t = d.transaction(store, mode), req = fn(t.objectStore(store));
  t.oncomplete = () => ok(req.result);
  t.onerror = () => ko(t.error);
  t.onabort = () => ko(t.error);
}));
// Données de lecture hors ligne : conservées 30 jours au maximum, puis supprimées.
// Une période longue évite de perdre la copie locale après une absence ou des vacances.
export const CACHE_TTL_DAYS = 30;
const CACHE_TTL = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
export const cget = async k => {
  const entry = await run('kv', 'readonly', s => s.get(k));
  if (!entry || typeof entry !== 'object' || typeof entry.t !== 'number') return undefined;
  if (Date.now() - entry.t > CACHE_TTL) {
    run('kv', 'readwrite', s => s.delete(k)).catch(() => {});
    run('kvmeta', 'readwrite', s => s.delete(k)).catch(() => {});
    return undefined;
  }
  return entry.v;
};
export const cset = async (k, v) => {
  const t = Date.now();
  await run('kv', 'readwrite', s => s.put({ v, t }, k));
  await run('kvmeta', 'readwrite', s => s.put(t, k)).catch(() => {});
};
export const ckeys = () => run('kv', 'readonly', s => s.getAllKeys());
// Diagnostic de la copie locale : nombre d'entrées et date de la plus ancienne.
// Lit kvmeta (de simples horodatages) plutôt que kv, pour ne pas désérialiser les
// grosses réponses. Après une migration, kvmeta peut être vide : on le reconstruit une fois.
export const cacheStats = async () => {
  let times = (await run('kvmeta', 'readonly', s => s.getAll()).catch(() => []))
    .filter(time => Number.isFinite(time) && time > 0);
  if (!times.length) {
    const keys = await ckeys().catch(() => []);
    if (keys.length) {
      const pairs = [];
      for (const k of keys) {
        const entry = await run('kv', 'readonly', s => s.get(k)).catch(() => null);
        if (entry && Number.isFinite(entry.t) && entry.t > 0) pairs.push([k, entry.t]);
      }
      if (pairs.length) {
        await run('kvmeta', 'readwrite', s => { for (const [k, t] of pairs) s.put(t, k); }).catch(() => {});
        times = pairs.map(pair => pair[1]);
      }
    }
  }
  const count = await run('kvmeta', 'readonly', s => s.count()).catch(() => times.length);
  return {
    count,
    oldest: times.length ? Math.min(...times) : 0,
    newest: times.length ? Math.max(...times) : 0
  };
};
// Balayage : retire les entrées expirées même si elles ne sont plus jamais relues.
// Parcourt kv en curseur (une entrée à la fois) et purge aussi kvmeta.
export async function sweepCache() {
  const d = await open();
  await new Promise(ok => {
    const t = d.transaction(['kv', 'kvmeta'], 'readwrite');
    const kv = t.objectStore('kv'), meta = t.objectStore('kvmeta');
    const req = kv.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      const e = c.value;
      if (e && typeof e.t === 'number' && Date.now() - e.t > CACHE_TTL) { c.delete(); meta.delete(c.key); }
      c.continue();
    };
    // La connexion est partagée (mise en cache par open()) : on ne la ferme pas ici.
    t.oncomplete = () => ok();
    t.onerror = () => ok();
    t.onabort = () => ok();
  });
}
export const outboxAdd = item => run('outbox', 'readwrite', s => s.add(item));
export const outboxAll = () => run('outbox', 'readonly', s => s.getAll());
export const outboxDel = seq => run('outbox', 'readwrite', s => s.delete(seq));
export const outboxPut = item => run('outbox', 'readwrite', s => s.put(item));
// Miroir pour le service worker : session et configuration Supabase.
// Il ne sert qu'à rejouer la file quand l'application est fermée ; il est effacé à la déconnexion.
export const mirrorSet = (key, value) => run('sync', 'readwrite', s => s.put(value, key));
export const mirrorGet = key => run('sync', 'readonly', s => s.get(key));
export const mirrorDel = key => run('sync', 'readwrite', s => s.delete(key));
export const clearCache = async () => {
  await run('kv', 'readwrite', s => s.clear());
  await run('kvmeta', 'readwrite', s => s.clear()).catch(() => {});
};
// Efface aussi le miroir de session : « vider les données hors ligne » ne laisse pas
// de jeton utilisable par le service worker en arrière-plan.
export const clearAll = () => Promise.all([
  clearCache(),
  run('outbox', 'readwrite', s => s.clear()),
  run('sync', 'readwrite', s => s.clear())
]);
