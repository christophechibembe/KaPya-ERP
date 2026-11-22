import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

test('comptabilité dans la démo : journal, balance et TVA s’affichent', { skip: !browserPath, timeout: 120000 }, async t => {
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
    const check = () => { if (${condition}) resolve(true); else if(Date.now()>end) reject(new Error('Attente: '+${JSON.stringify(condition)})); else setTimeout(check,30); }; check();
  })`);
  await until(`document.querySelector('#demo-bar')`);
  await page.evaluate(`location.hash='#/comptabilite'`);
  await until(`document.querySelector('#main')?.dataset.page==='comptabilite' && document.querySelector('#cp-body')`);

  assert.match(await page.evaluate(`document.querySelector('#main h1').textContent`), /Comptabilité/);
  assert.equal(await page.evaluate(`document.querySelectorAll('#cp-body .kpis .kpi').length`), 4);
  assert.ok(await page.evaluate(`document.querySelectorAll('#cp-body table tr').length`) > 2, 'le journal doit contenir des lignes');
  assert.ok(await page.evaluate(`[...document.querySelectorAll('#cp-body h2')].some(h => h.textContent === 'Balance')`), 'la balance doit être affichée');
  assert.ok(await page.evaluate(`[...document.querySelectorAll('#cp-body h2')].some(h => h.textContent === 'TVA')`), 'la TVA doit être affichée');
  assert.match(await page.evaluate(`document.querySelector('#cp-msg').textContent`), /ligne\(s\) comptable\(s\)/);
});
