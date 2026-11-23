// Cache hors ligne : métadonnées kvmeta (diagnostic peu coûteux), balayage des entrées
// expirées et vidage complet. Le cache utilise IndexedDB : test en navigateur réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

test('Cache hors ligne : métadonnées, balayage des expirées et vidage', { skip: !browserPath, timeout: 120000 }, async t => {
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
  await page.goto(origin + '/demo/');
  await page.evaluate(`new Promise((resolve, reject) => {
    const end = Date.now() + 12000;
    const check = () => { if (document.querySelector('#demo-bar')) resolve(true); else if (Date.now() > end) reject(new Error('démo non chargée')); else setTimeout(check, 30); }; check();
  })`);

  // 1. Le diagnostic lit kvmeta : nombre et bornes corrects après deux écritures.
  const stats = await page.evaluate(`(async () => {
    const cache = await import('/js/cache.js');
    await cache.clearCache();
    await cache.cset('/test/a', { x: 1 });
    await cache.cset('/test/b', { x: 2 });
    return cache.cacheStats();
  })()`);
  assert.equal(stats.count, 2);
  assert.ok(stats.oldest > 0, 'la date la plus ancienne doit être renseignée');
  assert.ok(stats.newest >= stats.oldest, 'la date la plus récente doit suivre');

  // 2. Une entrée expirée (insérée directement) est retirée par le balayage, kvmeta compris.
  const swept = await page.evaluate(`(async () => {
    const cache = await import('/js/cache.js');
    await new Promise((ok, ko) => {
      const r = indexedDB.open('kapya-demo-offline', 3);
      r.onsuccess = () => {
        const d = r.result;
        const tx = d.transaction(['kv', 'kvmeta'], 'readwrite');
        const old = Date.now() - 40 * 24 * 3600 * 1000;
        tx.objectStore('kv').put({ v: { old: true }, t: old }, '/test/expired');
        tx.objectStore('kvmeta').put(old, '/test/expired');
        tx.oncomplete = () => { d.close(); ok(); };
        tx.onerror = () => { d.close(); ko(tx.error); };
      };
      r.onerror = () => ko(r.error);
    });
    const before = await cache.cacheStats();
    await cache.sweepCache();
    const after = await cache.cacheStats();
    const gone = await cache.cget('/test/expired');
    return { before: before.count, after: after.count, gone };
  })()`);
  assert.equal(swept.before, 3, 'l’entrée expirée doit être comptée avant balayage');
  assert.equal(swept.after, 2, 'le balayage doit retirer l’entrée expirée');
  assert.equal(swept.gone, undefined, 'l’entrée expirée ne doit plus être lisible');

  // 3. Le vidage efface kv et kvmeta : le diagnostic retombe à zéro.
  const cleared = await page.evaluate(`(async () => {
    const cache = await import('/js/cache.js');
    await cache.clearCache();
    return cache.cacheStats();
  })()`);
  assert.equal(cleared.count, 0);
  assert.equal(cleared.oldest, 0);
  assert.equal(cleared.newest, 0);
});