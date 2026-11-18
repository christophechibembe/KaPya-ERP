// Stockage hors ligne (IndexedDB, sans dépendance) :
// - kv : réponses de lecture mises en cache (clé = chemin de la requête) ;
// - outbox : pièces (ventes, achats) enregistrées hors ligne, en attente d'envoi.
const NAME = 'kapya-offline', VER = 1;
let dbp = null;
const open = () => dbp ||= new Promise((ok, ko) => {
  const r = indexedDB.open(NAME, VER);
  r.onupgradeneeded = () => {
    const d = r.result;
    if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
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
// Données de lecture hors ligne : conservées 10 jours au maximum, puis supprimées.
const CACHE_TTL = 10 * 24 * 60 * 60 * 1000;
export const cget = async k => {
  const entry = await run('kv', 'readonly', s => s.get(k));
  if (!entry || typeof entry !== 'object' || typeof entry.t !== 'number') return undefined;
  if (Date.now() - entry.t > CACHE_TTL) { run('kv', 'readwrite', s => s.delete(k)).catch(() => {}); return undefined; }
  return entry.v;
};
export const cset = (k, v) => run('kv', 'readwrite', s => s.put({ v, t: Date.now() }, k));
export const ckeys = () => run('kv', 'readonly', s => s.getAllKeys());
export const outboxAdd = item => run('outbox', 'readwrite', s => s.add(item));
export const outboxAll = () => run('outbox', 'readonly', s => s.getAll());
export const outboxDel = seq => run('outbox', 'readwrite', s => s.delete(seq));
export const outboxPut = item => run('outbox', 'readwrite', s => s.put(item));
export const clearCache = () => run('kv', 'readwrite', s => s.clear());
export const clearAll = () => Promise.all([clearCache(), run('outbox', 'readwrite', s => s.clear())]);
