import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Repli hors ligne : credit_sales_all échoue et la requête normale ne renvoie pas credit_notes_total.
test('crédits hors ligne : les avoirs de la copie locale réduisent le solde affiché', { skip: !browserPath, timeout: 60000 }, async t => {
  const sales = [
    { id: 's1', customer_id: 'c1', number: 'TEST-1', payment: 'credit', paid: 30, sold_at: '2026-11-20', customer_label: 'Client A', customers: { name: 'Client A', phone: '' }, sale_lines: [{ qty: 1, unit_price: 100 }] },
    { id: 's2', customer_id: 'c2', number: 'TEST-2', payment: 'credit', paid: 80, sold_at: '2026-11-20', customer_label: 'Client B', customers: { name: 'Client B', phone: '' }, sale_lines: [{ qty: 1, unit_price: 100 }] }
  ];
  const notes = [
    { sale_id: 's1', total_usd: 20 },
    { sale_id: 's2', total_usd: 20 }
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
          export const db={
            select:async table=>{
              if(table==='sales') return ${JSON.stringify(sales)};
              if(table==='credit_notes') return ${JSON.stringify(notes)};
              return [{organizations:{name:'Commerce Test'}}];
            },
            rpc:async()=>{ throw new Error('hors ligne'); }
          };`); return;
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
  const summary = await page.evaluate(`document.querySelector('#summary').textContent`);
  const table = await page.evaluate(`document.querySelector('#credit-table').textContent`);
  // 100 - 30 - 20 = 50 ; la seconde facture est intégralement soldée par son avoir.
  assert.match(summary, /50,00/);
  assert.match(summary, /1 facture\(s\) en attente/);
  assert.match(table, /50,00/);
  assert.deepEqual(page.errors, []);
});
