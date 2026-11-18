// Tableau de bord : filtre des dates et mise à jour automatique. Navigateur réel, API simulée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

test('Tableau de bord dans Chromium (données isolées)', { skip: !browserPath, timeout: 90000 }, async t => {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      let file = pathname;
      if (pathname === '/') file = '/tests/fixtures/accueil.html';
      if (pathname === '/js/api.js') file = '/tests/fixtures/accueil-api.mjs';
      const full = path.resolve(root, '.' + file);
      if (!full.startsWith(root + path.sep)) throw new Error('Chemin interdit');
      res.setHeader('Content-Type', (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8');
      res.end(await readFile(full));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const page = await openBrowser(t);
  await page.viewport(1440, 900);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate('window.ready');

  await t.test('les ventes du jour comptent, même si sold_at contient une heure', async () => {
    const text = await page.evaluate('window.text()');
    assert.match(text, /25,00 \$/, `chiffre d’affaires attendu 25,00 $ : ${text.slice(0, 400)}`);
    assert.match(text, /2 vente\(s\)/, 'les deux ventes du jour doivent être comptées');
  });

  await t.test('un bouton Actualiser est toujours visible et l’heure du dernier calcul est affichée', async () => {
    assert.equal(await page.evaluate(`document.querySelector('#owner-refresh') !== null`), true);
    assert.equal(await page.evaluate(`document.querySelector('#owner-refresh').hidden`), false);
    assert.equal(await page.evaluate(`document.querySelector('#owner-updated').hidden`), false);
    assert.match(await page.evaluate(`document.querySelector('#owner-updated').textContent`), /Chiffres à jour/);
  });

  await t.test('une synchronisation (nouvelle vente) recharge les chiffres sans changer de page', async () => {
    await page.evaluate(`window.addSale({ qty: 1, unit: 10 })`);
    assert.match(await page.evaluate('window.text()'), /25,00 \$/, 'rien ne doit changer avant l’événement');
    await page.evaluate(`window.fireSync()`);
    assert.equal(await page.evaluate(`window.waitFor('35,00 $')`), true, 'le tableau de bord doit se mettre à jour tout seul');
    assert.match(await page.evaluate('window.text()'), /3 vente\(s\)/);
  });

  await t.test('le retour sur l’onglet ne recharge pas en boucle et garde les chiffres', async () => {
    const before = await page.evaluate(`document.querySelector('#owner-updated').textContent`);
    await page.evaluate(`window.dispatchEvent(new Event('focus'))`);
    assert.match(await page.evaluate('window.text()'), /35,00 \$/);
    assert.equal(await page.evaluate(`document.querySelector('#owner-updated').textContent`), before);
  });
});
