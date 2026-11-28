// Fiabilité de la synchronisation : garde-fous hors ligne, verrou entre onglets
// et câblage du bouton « Synchroniser maintenant » / des reprises forcées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; }
  setItem(key, value) { this[key] = String(value); }
  removeItem(key) { delete this[key]; }
}
const storage = new MemoryStorage();
globalThis.localStorage = storage;
globalThis.sessionStorage = new MemoryStorage();
const documentFaux = new EventTarget();
documentFaux.head = { append: () => {} };
documentFaux.createElement = tag => ({ tag });
globalThis.document = documentFaux;
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
const appels = [];
globalThis.fetch = async (url, options = {}) => { appels.push(String(url)); throw new TypeError('fetch failed'); };

storage.setItem('kp.session', JSON.stringify({
  access: 'jeton', refresh: 'renouvellement', uid: 'u1',
  exp: Date.now() + 3600_000, updated: Date.now()
}));

const { syncNow, syncLockExpired } = await import('../js/api.js');

test('sans force, une synchronisation annoncée hors ligne ne tente même pas le réseau', async () => {
  assert.equal(await syncNow(), 'skipped');
  assert.equal(appels.length, 0);
});

test('un verrou récent d’un autre onglet empêche une seconde synchronisation', async () => {
  storage.setItem('kp.sync.lock', String(Date.now()));
  assert.equal(await syncNow({ force: true }), 'locked');
  assert.equal(appels.length, 0, 'aucun envoi en double depuis un second onglet');
});

test('un verrou périmé (onglet fermé en cours de route) ne bloque plus', () => {
  const now = 2_000_000;
  assert.equal(syncLockExpired(String(now - 10_000), now), false);
  assert.equal(syncLockExpired(String(now - 100_000), now), true);
  assert.equal(syncLockExpired('', now), true);
  assert.equal(syncLockExpired('pas-un-chiffre', now), true);
});

test('la reprise automatique et le bouton manuel forcent la synchronisation', async () => {
  const app = await readFile(path.join(root, 'js/app.js'), 'utf8');
  assert.match(app, /forced = waiting > 0 && !navigator\.onLine/);
  assert.match(app, /syncDecision\(\{ online: navigator\.onLine, forced,/);
  assert.match(app, /await syncNow\(\{ force: forced \}\)/);
  const parametres = await readFile(path.join(root, 'js/modules/parametres.js'), 'utf8');
  assert.match(parametres, /syncNow\(\{ force: true \}\)/);
  assert.match(parametres, /'locked'/, 'un verrou d’un autre onglet est signalé à l’utilisateur');
});

test('le réessai d’une pièce refusée réenregistre la reprise et force l’envoi', async () => {
  const api = await readFile(path.join(root, 'js/api.js'), 'utf8');
  const retry = api.slice(api.indexOf('export async function retryRejected'), api.indexOf('export async function discardRejected'));
  assert.match(retry, /requestBackgroundSync\(\)/);
  assert.match(retry, /syncNow\(\{ force: true \}\)/);
  const i18n = await readFile(path.join(root, 'js/i18n.js'), 'utf8');
  assert.match(i18n, /'Synchronisation déjà en cours dans un autre onglet\.'/);
});
