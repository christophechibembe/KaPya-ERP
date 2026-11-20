import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('rappel WhatsApp : aperçu, validation et message modifié avant ouverture', { skip: !browserPath, timeout: 60000 }, async t => {
  const sales = [
    { id: 'v1', customer_id: 'c1', number: 'TEST-1', payment: 'credit', paid: 20, sold_at: '2026-11-20', customers: { name: 'Homonyme', phone: '+243999123456' }, sale_lines: [{ qty: 1, unit_price: 100 }] },
    { id: 'v2', customer_id: 'c2', number: 'TEST-2', payment: 'credit', paid: 0, sold_at: '2026-11-20', customers: { name: 'Homonyme', phone: '' }, sale_lines: [{ qty: 1, unit_price: 200 }] },
    { id: 'v3', customer_id: 'c1', number: 'TEST-3', payment: 'credit', paid: 10, sold_at: '2026-11-20', customers: { name: 'Homonyme', phone: '+243999123456' }, sale_lines: [{ qty: 1, unit_price: 40 }] }
  ];
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><main id="main"></main><script type="module" src="/test.js"></script>'); return; }
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      if (pathname === '/test.js') {
        res.end(`import {render} from '/js/modules/credits.js'; window.ready=render(document.querySelector('main'),{role:'admin'});`); return;
      }
      if (pathname === '/js/api.js') {
        res.end(`export const session=()=>({uid:'test'});export const newId=()=>crypto.randomUUID();
          export const db={select:async()=>[{organizations:{name:'Commerce Test'}}],rpc:async fn=>fn==='credit_sales_all'?${JSON.stringify(sales)}:null};`); return;
      }
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Chemin interdit');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const page = await openBrowser(t);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate('window.ready');
  await page.evaluate(`document.querySelector('[data-remind="v1"]').click()`);
  const message = await page.evaluate(`document.querySelector('#reminder-text').value`);
  assert.match(message, /110,00/); assert.match(message, /TEST-1/); assert.match(message, /TEST-3/); assert.doesNotMatch(message, /TEST-2/);
  assert.equal(await page.evaluate(`document.querySelector('#reminder-open').hasAttribute('href')`), false);
  await page.evaluate(`document.querySelector('#reminder-checked').click()`);
  const url = await page.evaluate(`document.querySelector('#reminder-open').href`);
  assert.match(url, /^https:\/\/wa\.me\/243999123456\?text=/);
  await page.evaluate(`document.querySelector('#reminder-text').value='Texte vérifié & modifié';document.querySelector('#reminder-text').dispatchEvent(new Event('input'))`);
  assert.equal(new URL(await page.evaluate(`document.querySelector('#reminder-open').href`)).searchParams.get('text'), 'Texte vérifié & modifié');
  await page.evaluate(`document.querySelector('#reminder-checked').click()`);
  assert.equal(await page.evaluate(`document.querySelector('#reminder-open').hasAttribute('href')`), false);
  await page.evaluate(`document.querySelector('#reminder-phone').value='javascript:alert(1)';document.querySelector('#reminder-phone').dispatchEvent(new Event('input'))`);
  assert.equal(await page.evaluate(`document.querySelector('#reminder-open').hasAttribute('href')`), false);
  assert.deepEqual(page.requests.filter(url => /wa\.me|supabase\./.test(url)), []);
  assert.deepEqual(page.errors, []);
});
