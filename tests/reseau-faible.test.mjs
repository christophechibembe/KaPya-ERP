// Connexion faible : le serveur de données est pré-connecté, une requête très lente
// est attendue jusqu'au bout (aucun abandon prématuré) et un réseau tombé produit un
// message français sans jamais mettre la suppression en file d'attente.
import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; }
  setItem(key, value) { this[key] = String(value); }
  removeItem(key) { delete this[key]; }
}

const storage = new MemoryStorage();
globalThis.localStorage = storage;
globalThis.sessionStorage = new MemoryStorage();

// Document minimal : api.js notifie les écrans par des événements, config.js pose
// le lien de pré-connexion au chargement du module.
const liens = [];
const documentFaux = new EventTarget();
documentFaux.head = { append: lien => liens.push(lien) };
documentFaux.createElement = tag => ({ tag, rel: '', href: '', crossOrigin: '' });
globalThis.document = documentFaux;

storage.setItem('kp.session', JSON.stringify({
  access: 'jeton', refresh: 'renouvellement', uid: 'u1',
  exp: Date.now() + 3600_000, updated: Date.now()
}));

let retard = 0;
let reseauTombe = false;
const appels = [];
globalThis.fetch = async (url, options = {}) => {
  appels.push({ url: String(url), method: options.method || 'GET' });
  if (retard) await new Promise(resolve => setTimeout(resolve, retard));
  if (reseauTombe) throw new TypeError('fetch failed');
  return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
};

const { db } = await import('../js/api.js');

test('le serveur de données est pré-connecté dès le chargement', () => {
  const preconnect = liens.find(lien => lien.rel === 'preconnect');
  assert.ok(preconnect, 'un lien preconnect doit être posé au chargement');
  assert.match(preconnect.href, /^https:\/\//);
  assert.equal(preconnect.crossOrigin, 'anonymous', 'la connexion doit être réutilisable pour une requête CORS');
  assert.ok(appels.length === 0, 'la pré-connexion ne déclenche aucune requête');
});

test('une requête très lente est attendue jusqu’à la réponse, sans abandon', async () => {
  retard = 400;
  const debut = Date.now();
  const reponse = await db.rpc('delete_customer_deposit', { p_id: 'ac1' });
  retard = 0;
  assert.deepEqual(reponse, { ok: true }, 'la réponse du serveur doit être retournée telle quelle');
  assert.ok(Date.now() - debut >= 380, 'la réponse lente doit être attendue, jamais coupée');
});

test('réseau tombé : message français explicite et aucune mise en file', async () => {
  reseauTombe = true;
  await assert.rejects(() => db.rpc('delete_customer_deposit', { p_id: 'ac1' }), erreur => {
    assert.equal(erreur.message, 'Connexion requise pour cette action.');
    // Ce drapeau n'est posé que dans la branche « rien n'est mis en file » de api.js :
    // s'il avait été mis en file, on verrait une promesse résolue au lieu de cette erreur.
    assert.equal(erreur.offline, true, 'le drapeau hors ligne (donc non mis en file) doit être posé');
    return true;
  });
  reseauTombe = false;
  assert.ok(appels.some(appel => appel.url.includes('/rpc/delete_customer_deposit')), 'la tentative réseau a bien été faite');
});

test('une écriture lente réussie reste prise en compte', async () => {
  retard = 300;
  await db.rpc('create_customer_deposit', { p_customer_id: 'c1', p_amount: 10, p_id: 'ac2' });
  retard = 0;
  assert.ok(appels.some(appel => appel.url.endsWith('/rpc/create_customer_deposit')));
});
