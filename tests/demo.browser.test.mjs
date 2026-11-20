import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactDir, browserPath, openBrowser } from './browser-helper.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

test('démo publique : vrais écrans, stockage isolé, aucun appel production', { skip: !browserPath, timeout: 120000 }, async t => {
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/setup') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Préparation isolée</title>'); return; }
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
  await page.goto(origin + '/setup');
  await page.evaluate(`(async () => {
    for (const key of ['kp.session','kp.profile','kp.uid','kp.shop','kp.pin','kp.numRange','kp.cart.demo'])
      localStorage.setItem(key, JSON.stringify('TEMOIN-REEL'));
    const cache = await import('/js/cache.js');
    await cache.cset('TEMOIN-REEL', {visible: false});
    await cache.outboxAdd({path:'/NE-JAMAIS-ENVOYER',fn:'create_sale',body:{id:'TEMOIN-REEL'}});
  })()`);
  await page.goto(origin + '/demo/');
  const until = condition => page.evaluate(`new Promise((resolve, reject) => {
    const end = Date.now() + 12000;
    const check = () => { if (${condition}) resolve(true); else if(Date.now()>end) reject(new Error('Attente: '+${JSON.stringify(condition)})); else setTimeout(check,30); }; check();
  })`);
  const input = (selector, value, event = 'input') => page.evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true})); })()`);
  const click = selector => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const go = async route => { await page.evaluate(`location.hash='#/${route}'`); await until(`document.querySelector('#main')?.dataset.page===${JSON.stringify(route)} && document.querySelector('#main h1')`); };
  await until(`document.querySelector('#demo-bar') && document.querySelector('.owner-head')`);

  await t.test('configuration neutralisée et sentinelles réelles non lues', async () => {
    assert.deepEqual(await page.evaluate(`import('/js/config.js').then(({CFG})=>({demo:CFG.demo,url:CFG.url,key:CFG.key}))`), { demo: true, url: '', key: '' });
    assert.equal(await page.evaluate(`import('/js/api.js').then(m=>m.session().uid)`), 'demo');
    assert.equal(await page.evaluate(`import('/js/api.js').then(m=>m.pendingCount())`), 0);
    assert.equal(await page.evaluate(`import('/js/cache.js').then(m=>m.cget('TEMOIN-REEL'))`), undefined);
    assert.equal(await page.evaluate(`navigator.serviceWorker.getRegistrations().then(r=>r.length)`), 0);
    assert.equal(await page.evaluate(`localStorage.getItem('kp.session')`), '"TEMOIN-REEL"');
    assert.equal(await page.evaluate(`document.querySelector('#nav a[data-r="sauvegarde"]')`), null);
  });
  await t.test('vente complète depuis l’interface, stock et facture marquée démo', async () => {
    await go('vente');
    await until(`document.querySelector('#vr-stock') && !document.querySelector('#vr-stock').textContent.includes('Vérification')`);
    await input('#vr-prod', 'RIZ-25');
    await input('#vr-qty', 2);
    await click('#vr-add');
    await until(`document.querySelectorAll('#vr-lines tr').length>0`);
    await click('#vr-save');
    await until(`document.querySelector('#vr-last').textContent.includes('Dernière vente') && !document.querySelector('#vr-save').disabled`);
    const result = await page.evaluate(`(async()=>{const {db}=await import('/js/api.js');return {sale:(await db.select('sales','number=eq.DEMO-FAC-00015'))[0],stock:(await db.select('articles','id=eq.demo-a1'))[0].stock}})()`);
    assert.equal(result.stock, 58);
    assert.equal(result.sale.paid, 90);
    assert.match(result.sale.number, /^DEMO-FAC-/);
    assert.match(await page.evaluate(`import('/js/receipt.js').then(m=>m.receiptHtml({number:'TEST'}))`), /DÉMONSTRATION.*SANS VALEUR COMMERCIALE/);
    await click('#notice-dlg #c');
  });
  await t.test('crédits : aperçu WhatsApp disponible, envoi désactivé en démo', async () => {
    await go('credits'); await until(`document.querySelector('[data-remind]')`);
    await click('[data-remind]');
    await until(`document.querySelector('#reminder-text')`);
    assert.match(await page.evaluate(`document.querySelector('#reminder-text').value`), /DEMO-FAC-/);
    await input('#reminder-phone', '+243999123456');
    await page.evaluate(`document.querySelector('#reminder-checked').checked=true;document.querySelector('#reminder-checked').dispatchEvent(new Event('input'))`);
    assert.equal(await page.evaluate(`document.querySelector('#reminder-open').hasAttribute('href')`), false);
    await click('#credit-dlg #c');
  });
  await t.test('écrans exposés rendus sans erreur et rapports calculés', async () => {
    for (const route of ['stocks', 'clients', 'fournisseurs', 'achats', 'ventes', 'facture', 'avoirs', 'depots', 'acomptes', 'caisse', 'rapports', 'alertes', 'plus']) {
      await go(route);
      await page.evaluate(`new Promise(r=>setTimeout(r,120))`);
      const errors = await page.evaluate(`[...document.querySelectorAll('#main .err')].map(e=>e.textContent.trim()).filter(Boolean)`);
      assert.deepEqual(errors, [], route);
    }
    await go('rapports'); await click('#run-report');
    await until(`document.querySelector('#report-result table')`);
    assert.doesNotMatch(await page.evaluate(`document.querySelector('#report-result').textContent`), /NaN|undefined/);
    await go('alertes'); await until(`document.querySelector('#reorder-result table')`);
    assert.doesNotMatch(await page.evaluate(`document.querySelector('#reorder-result').textContent`), /NaN|undefined/);
  });
  await t.test('mobile : bandeau utilisable et largeur contenue', async () => {
    await page.viewport(390, 844); await go('vente');
    await until(`document.querySelector('#vr-save')`);
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true);
    const { data } = await page.command('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(artifactDir, 'kapya-demo-mobile.png'), Buffer.from(data, 'base64'));
    await page.viewport(1440, 1000);
  });
  await t.test('démo hors connexion : vente locale jamais mise en file réelle', async () => {
    await page.command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const result = await page.evaluate(`(async()=>{
      const m=await import('/js/api.js');
      const id=await m.db.rpc('create_sale',{p_id:'demo-offline',p_lines:[{article_id:'demo-a1',qty:1,unit_price:45}],p_warehouse:'demo-w1'});
      await m.syncNow();
      let refused=false;try{await m.signIn('fictif@example.invalid','fictif')}catch{refused=true}
      return {id,pending:await m.pendingCount(),refused};
    })()`);
    assert.deepEqual(result, { id: 'demo-offline', pending: 0, refused: true });
    await page.command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.evaluate(`import('/js/api.js').then(m=>m.syncNow())`);
  });
  await t.test('réinitialisation et changement de métier sans effacer les vrais comptes', async () => {
    const loaded = page.waitForLoad();
    await page.evaluate(`void import('/js/demo.js').then(m=>m.resetLocal('restauration'))`);
    await loaded;
    await until(`document.querySelector('#demo-business')?.value==='restauration'`);
    assert.equal(await page.evaluate(`localStorage.getItem('kp.session')`), '"TEMOIN-REEL"');
    assert.equal(await page.evaluate(`localStorage.getItem('kp.pin')`), '"TEMOIN-REEL"');
    const names = await page.evaluate(`import('/js/api.js').then(async m=>(await m.db.select('articles')).map(a=>a.name))`);
    assert.ok(names.includes('Poulet et riz'));
    assert.equal(await page.evaluate(`import('/js/api.js').then(async m=>(await m.db.select('sales','id=eq.demo-offline')).length)`), 0);
    await page.goto(origin + '/setup');
    const real = await page.evaluate(`import('/js/cache.js').then(async m=>({cached:await m.cget('TEMOIN-REEL'),pending:(await m.outboxAll()).length}))`);
    assert.deepEqual(real, { cached: { visible: false }, pending: 1 });
  });
  assert.deepEqual(page.requests.filter(url => /supabase\.|NE-JAMAIS-ENVOYER|wa\.me/.test(url)), []);
  assert.deepEqual(page.errors, []);
});
