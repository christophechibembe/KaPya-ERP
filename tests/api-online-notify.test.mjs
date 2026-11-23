// Écriture en ligne : le tableau de bord est prévenu et son cache d'affichage vidé.
// Sans cela, une vente faite en ligne reste invisible jusqu'au rechargement manuel
// (le rafraîchissement automatique n'arrive qu'après l'intervalle d'une minute).
import test from 'node:test';
import assert from 'node:assert/strict';

// Remplacement minimal des stockages et du document : api.js lit la session au
// chargement du module et notifie les écrans par un événement « kp:sync ».
class MemoryStorage {
  getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; }
  setItem(key, value) { this[key] = String(value); }
  removeItem(key) { delete this[key]; }
}

const storage = new MemoryStorage();
globalThis.localStorage = storage;
globalThis.sessionStorage = new MemoryStorage();
globalThis.document = new EventTarget();

const DASH_KEY = 'kp.dash.u1.classic.2026-11-01.2026-11-23';
storage.setItem('kp.session', JSON.stringify({
  access: 'jeton', refresh: 'renouvellement', uid: 'u1',
  exp: Date.now() + 3600_000, updated: Date.now()
}));
storage.setItem(DASH_KEY, JSON.stringify({ html: '<b>ancien</b>', at: Date.now() }));

const calls = [];
let offline = false;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || 'GET' });
  if (offline) throw new TypeError('fetch failed');
  const body = (options.method || 'GET') === 'GET' ? '[]' : '{"id":"c1"}';
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
};

let notifications = 0;
document.addEventListener('kp:sync', () => { notifications += 1; });

const { db } = await import('../js/api.js');

test('une écriture en ligne réussie prévient les écrans et vide le cache du tableau de bord', async () => {
  await db.insert('customers', { name: 'Client test' });
  assert.equal(notifications, 1, 'kp:sync doit être émis après une écriture réussie');
  assert.equal(storage.getItem(DASH_KEY), null, 'le cache d’affichage du tableau de bord doit être vidé');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
});

test('une lecture laisse le cache du tableau de bord tranquille', async () => {
  storage.setItem(DASH_KEY, JSON.stringify({ html: '<b>ancien</b>', at: Date.now() }));
  await db.select('customers', 'select=id');
  assert.equal(notifications, 1, 'une lecture ne doit pas forcer un rafraîchissement');
  assert.ok(storage.getItem(DASH_KEY), 'le cache d’affichage reste disponible pour un affichage immédiat');
});

test('une écriture hors ligne échoue sans vider le cache', async () => {
  offline = true;
  await assert.rejects(() => db.rpc('fonction_inconnue', {}), /Connexion requise/);
  offline = false;
  assert.equal(notifications, 1, 'aucune notification sans écriture réussie');
  assert.ok(storage.getItem(DASH_KEY), 'le cache reste affichable');
});
