import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

test('Paramètres : la carte hors-ligne affiche l’état réel de l’appareil', { skip: !browserPath, timeout: 120000 }, async t => {
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Chemin interdit');
      res.setHeader('Content-Type', (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`, page = await openBrowser(t);
  await page.viewport(1440, 1000);
  await page.goto(origin + '/demo/');
  const until = condition => page.evaluate(`new Promise((resolve, reject) => {
    const end = Date.now() + 12000;
    const check = () => { if (${condition}) resolve(true); else if (Date.now() > end) reject(new Error('Attente: ' + ${JSON.stringify(condition)})); else setTimeout(check, 30); }; check();
  })`);
  await until(`document.querySelector('#demo-bar')`);
  await page.evaluate(`location.hash='#/parametres'`);
  await until(`document.querySelector('#offline-card') && document.querySelector('#offline-state table')`);

  const labels = await page.evaluate(`[...document.querySelectorAll('#offline-state th')].map(th => th.textContent)`);
  assert.deepEqual(labels, ['Réseau', 'Dernière synchronisation', 'File d’attente', 'Copie locale', 'Historique local', 'Application fermée', 'Numéros de facture']);
  assert.match(await page.evaluate(`document.querySelector('#offline-state').textContent`), /0 en attente · 0 refusée\(s\)/);
  assert.match(await page.evaluate(`document.querySelector('#offline-card').textContent`), /Mode démonstration/);

  await page.command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.evaluate(`document.querySelector('#offline-sync').click()`);
  await until(`document.querySelector('#offline-state').textContent.includes('Hors ligne')`);
  assert.equal(await page.evaluate(`document.querySelector('#offline-state').textContent.includes('Hors ligne')`), true);
  await page.command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
});
