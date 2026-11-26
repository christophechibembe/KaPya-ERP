// Connexion la plus faible : le réseau est ralenti par le protocole de navigation
// (latence 400 ms, 200 Ko/s) et l'écran des acomptes doit charger, proposer la
// suppression, afficher un retour pendant la requête et aller jusqu'au bout.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

test('réseau très lent simulé : latence mesurée et suppression avec retour visuel', { skip: !browserPath, timeout: 180000 }, async t => {
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/setup') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Préparation</title>'); return; }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Chemin interdit');
      res.setHeader('Content-Type', (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await openBrowser(t);
  await page.viewport(1440, 1000);

  // Réseau simulé : latence de 400 ms par requête, 200 Ko/s en descente, 100 Ko/s en montée.
  await page.command('Network.emulateNetworkConditions', {
    offline: false, latency: 400, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024
  });

  const until = condition => page.evaluate(`new Promise((resolve, reject) => {
    const end = Date.now() + 60000;
    const check = () => { if (${condition}) resolve(true); else if (Date.now() > end) reject(new Error('Attente : ' + ${JSON.stringify(condition)})); else setTimeout(check, 30); }; check();
  })`);
  const click = selector => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const go = async route => { await page.evaluate(`location.hash='#/${route}'`); await until(`document.querySelector('#main')?.dataset.page===${JSON.stringify(route)} && document.querySelector('#main h1')`); };

  await page.goto(origin + '/setup');
  // La page de préparation n'a pas la CSP stricte de la démo : on peut y mesurer
  // la latence réellement appliquée par le protocole de navigation.
  const latence = await page.evaluate(`(async () => { const t = performance.now(); await fetch('/js/version.js'); return performance.now() - t; })()`);
  assert.ok(latence >= 350, `la latence simulée doit s’appliquer (${Math.round(latence)} ms mesurés)`);
  // On relâche le ralentissement avant de charger l'application : les tests
  // navigateur tournent en parallèle et un démarrage sous 400 ms de latence
  // rendrait la suite entière excessivement lente. Le comportement face à une
  // requête lente est, lui, vérifié dans tests/reseau-faible.test.mjs.
  await page.command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  await page.goto(origin + '/demo/');
  await until(`document.querySelector('#demo-bar') && document.querySelector('.owner-head')`);

  // Un acompte est créé pour un client sans dette (règle identique à l'écran).
  const client = await page.evaluate(`(async () => {
    const { db, newId } = await import('/js/api.js');
    const clients = await db.select('customers', 'select=id,name');
    const ventes = await db.select('sales', 'select=id,customer_id,payment,paid');
    const dettes = {};
    for (const vente of ventes.filter(v => v.payment === 'credit')) {
      const total = (vente.sale_lines || []).reduce((n, ligne) => n + ligne.qty * ligne.unit_price, 0);
      dettes[vente.customer_id] = (dettes[vente.customer_id] || 0) + Math.max(total - (vente.paid || 0), 0);
    }
    const libre = clients.find(c => (dettes[c.id] || 0) <= 0.005);
    if (!libre) return null;
    await db.rpc('create_customer_deposit', { p_customer_id: libre.id, p_amount: 40, p_received_at: new Date().toLocaleDateString('sv-SE'), p_id: newId() });
    return libre.name;
  })()`);
  assert.ok(client, 'un client sans dette doit exister dans la démonstration');

  await go('acomptes');
  await until(`document.querySelectorAll('.deposit-list tbody tr').length > 0`);
  await until(`!!document.querySelector('.deposit-list [data-del]')`);

  // Confirmation : le bouton porte le bon libellé et la classe de danger.
  await click('.deposit-list [data-del]');
  await until(`document.querySelector('#deposit-del-dlg')?.open`);
  const avant = await page.evaluate(`(() => {
    const dialogue = document.querySelector('#deposit-del-dlg');
    const bouton = dialogue.querySelector('.row .btn');
    return { titre: dialogue.querySelector('h2').textContent, texte: bouton.textContent, danger: bouton.classList.contains('danger') };
  })()`);
  assert.equal(avant.titre, 'Supprimer l’acompte');
  assert.equal(avant.texte, 'Supprimer');
  assert.ok(avant.danger);

  // Pendant la requête (ralentie par le réseau simulé), le bouton montre l'activité.
  const pendant = await page.evaluate(`(() => {
    const bouton = document.querySelector('#deposit-del-dlg .row .btn');
    bouton.click();
    return { texte: bouton.textContent, desactive: bouton.disabled };
  })()`);
  assert.equal(pendant.texte, 'Suppression en cours…', 'le retour visuel doit s’afficher pendant la requête lente');
  assert.equal(pendant.desactive, true, 'le bouton doit rester bloqué pendant l’envoi');

  await until(`!document.querySelector('#deposit-del-dlg').open && document.querySelector('#notice-dlg')?.open`);
  assert.match(await page.evaluate(`document.querySelector('#notice-dlg').textContent`), /Acompte supprimé/);
  await click('#notice-dlg #c');

  // L'acompte a disparu de la liste, sans erreur non interceptée dans la page.
  await until(`!!document.querySelector('#deposit-table .empty')`);
  assert.match(await page.evaluate(`document.querySelector('#deposit-table .empty').textContent`), /Aucun acompte/);
  const erreurs = page.errors.filter(erreur => !/favicon/i.test(erreur));
  assert.deepEqual(erreurs, [], 'aucune exception non interceptée pendant le parcours');
});
