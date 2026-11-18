// Guide : la version anglaise s'applique réellement, y compris dans les tableaux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };

test('Guide en anglais dans Chromium', { skip: !browserPath, timeout: 90000 }, async t => {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const full = path.resolve(root, '.' + (pathname === '/' ? '/guide.html' : pathname));
      if (!full.startsWith(root + path.sep)) throw new Error('Chemin interdit');
      res.setHeader('Content-Type', (mime[path.extname(full)] || 'text/plain') + '; charset=utf-8');
      res.end(await readFile(full));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const page = await openBrowser(t);
  await page.viewport(1200, 900);
  const url = `http://127.0.0.1:${server.address().port}/guide.html`;

  // Premier chargement en français, puis on choisit l'anglais et on recharge.
  await page.goto(url);
  await page.evaluate(`localStorage.setItem('kp.language', 'en')`);
  await page.goto(url);
  assert.equal(await page.evaluate(`document.documentElement.lang`), 'en');

  const text = await page.evaluate(`document.body.innerText`);
  assert.match(text, /User guide/, 'le titre du guide doit être traduit');
  assert.match(text, /1\. Overview and choosing the version/, 'le sommaire doit être traduit');
  assert.match(text, /Sales > New invoice/, 'les chemins de menu doivent être traduits');
  assert.match(text, /Everything: sales, purchases, stock, warehouses, team, reports, costs, backups\./,
    'les cellules de tableau doivent être traduites');
  assert.match(text, /The company-wide closing is refused until every active store has closed/,
    'les paragraphes longs doivent être traduits');

  assert.equal(await page.evaluate(`document.querySelector('figure img').alt`),
    'The version number and name are shown at the bottom of the menu.',
    'le texte alternatif des images doit être traduit');

  assert.deepEqual(page.errors, [], 'aucune erreur JavaScript ne doit survenir');
});
