import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('liste des ventes : le reste dû tient compte des avoirs', { skip: !browserPath, timeout: 60000 }, async t => {
  const sale = {
    id: 's1', number: 'TEST-1', sold_at: '2026-11-20', customer_id: 'c1', warehouse_id: null,
    payment: 'credit', paid: 80, customer_label: 'Client A', customers: { name: 'Client A' },
    sale_lines: [{ qty: 1, unit_price: 100, articles: { sku: 'ART-1', name: 'Article', unit: 'pièce' } }]
  };
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><main id="main"></main><script type="module" src="/test.js"></script>'); return; }
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      if (pathname === '/test.js') {
        res.end(`import {render} from '/js/modules/ventes.js'; window.ready=render(document.querySelector('main'),{role:'admin'});`); return;
      }
      if (pathname === '/js/api.js') {
        res.end(`export const session=()=>({uid:'test'});export const newId=()=>crypto.randomUUID();export const LOCAL_SALES_KEY='/local/sales-index';export const pendingFor=async()=>[];
          export const db={
            select:async table=>{
              if(table==='sales') return ${JSON.stringify([sale])};
              if(table==='credit_notes') return [{sale_id:'s1',total_usd:20}];
              if(table==='profiles') return [{organizations:{name:'Commerce Test'}}];
              return [];
            },
            rpc:async()=>null, delete:async()=>null
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
  const table = await page.evaluate(`document.querySelector('#tbl').textContent`);
  // 100 - 80 - 20 = 0 : la vente est soldée. Sans les avoirs, elle afficherait encore 20,00 $ à payer.
  assert.match(table, /Soldée/);
  assert.doesNotMatch(table, /À payer/);
  assert.deepEqual(page.errors, []);
});
