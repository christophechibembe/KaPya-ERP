import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactDir, browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const layout = `(() => {
  const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom }; };
  return {
    pageHeight: document.scrollingElement.scrollHeight, viewport: innerHeight,
    pageWidth: document.scrollingElement.scrollWidth, viewportWidth: innerWidth,
    cart: rect('#vr-cart'), cartScroll: document.querySelector('#vr-cart').scrollHeight,
    fixed: ['#vr-wh','.vr-entry','.vr-total-row','.vr-client','.vr-payment','.vr-actions'].map(rect),
    overflow: [...document.querySelectorAll('#main,#main *')].filter(el => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight + 1).map(el => el.id || el.className)
  };
})()`;

test('Vente rapide dans Chromium (données isolées)', { skip: !browserPath, timeout: 90000 }, async t => {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      let text, file = pathname;
      if (pathname === '/') file = '/tests/fixtures/vente-rapide.html';
      if (pathname === '/js/api.js') file = '/tests/fixtures/vente-api.mjs';
      if (pathname === '/js/localdb.js') text = `import {fixture} from './api.js'; export const searchArticles = async () => fixture.articles;`;
      if (pathname === '/js/print.js') text = `import {fixture} from './api.js'; export const printHtml = html => { if(fixture.failPrint) throw new Error('Imprimante indisponible (test).'); fixture.printed.push(html); }; export const companyLogo = logo => logo || 'assets/logo-k.png';`;
      const full = path.resolve(root, '.' + file);
      if (!full.startsWith(root + path.sep)) throw new Error('Chemin interdit');
      res.setHeader('Content-Type', (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8');
      res.end(text ?? await readFile(full));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const page = await openBrowser(t);
  await page.viewport(1440, 900);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate('window.ready');
  const reset = options => page.evaluate(`window.resetSale(${JSON.stringify(options)})`);
  const input = (selector, value, event = 'input') => page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
  })()`);
  const click = selector => page.evaluate(`(() => {
    const selector = ${JSON.stringify(selector)};
    if (['#vr-save','#vr-print'].includes(selector) && document.querySelector('#vr-payment-options')?.open) document.querySelector('#vr-options-done').click();
    document.querySelector(selector).click();
  })()`);
  const customer = async (id = 'c1') => {
    if (await page.evaluate(`document.querySelector('#vr-cust-wrap').hidden`)) await click('#vr-cust-toggle');
    await input('#vr-cust', id, 'change');
    await page.evaluate('window.flush()');
  };
  const mode = value => input('#vr-mode', value, 'change');
  const sale = () => page.evaluate(`fixture.calls.find(c => c.fn === 'create_sale')?.payload`);
  const saved = () => page.evaluate(`window.until(() => document.querySelector('#vr-last').textContent.includes('Dernière vente') && !document.querySelector('#vr-save').disabled)`);

  await t.test('seul le panier défile, tous les blocs restent immobiles à plusieurs résolutions', async () => {
    for (const [width, height] of [[1440, 900], [1366, 768], [1280, 720], [1024, 768], [900, 600]]) {
      await page.viewport(width, height);
      await reset({});
      const empty = await page.evaluate(layout);
      await reset({ lines: 80 });
      const full = await page.evaluate(layout);
      assert.ok(full.pageHeight <= height + 1, JSON.stringify(full));
      assert.ok(full.pageWidth <= width, JSON.stringify(full));
      assert.deepEqual(full.fixed, empty.fixed, `${width}×${height} : blocs déplacés`);
      assert.deepEqual(full.cart, empty.cart);
      assert.ok(full.cart.height > 40, JSON.stringify(full));
      assert.ok(full.fixed[3].height <= 108, `${width}×${height} : la carte client réserve trop de place`);
      assert.ok(full.cart.height >= (height <= 600 ? 180 : 220), `${width}×${height} : le panier doit garder plus de place (${full.cart.height}px)`);
      assert.ok(full.cartScroll > full.cart.height);
      assert.deepEqual(full.overflow, ['vr-cart']);
      assert.ok(full.fixed.at(-1).bottom <= height);
      await mode('credit');
      await customer();
      await input('#vr-amode', 'mobile_money', 'change');
      const credit = await page.evaluate(layout);
      assert.deepEqual(credit.fixed, full.fixed, `${width}×${height} : acompte déplace la page`);
      await click('#vr-options-open');
      assert.equal(await page.evaluate(`document.querySelector('#vr-payment-options').open`), true);
      assert.deepEqual((await page.evaluate(layout)).fixed, full.fixed, 'Le dialogue ne doit pas déplacer la vente');
      const paymentBounds = await page.evaluate(`(() => {
        const panel = document.querySelector('#vr-payment-options').getBoundingClientRect();
        return { panel: panel.toJSON(), fields: ['#vr-paid','#vr-aref','#vr-aop','#vr-dep-sel','#vr-dep-amt','#vr-dep-left'].map(id => ({id,rect:document.querySelector(id).getBoundingClientRect().toJSON()})) };
      })()`);
      assert.ok(paymentBounds.fields.every(field => field.rect.height > 0 && field.rect.bottom <= paymentBounds.panel.bottom), `${width}×${height} : champs de paiement coupés ${JSON.stringify(paymentBounds)}`);
      await click('#vr-options-done');
      const clientBounds = await page.evaluate(`(() => {
        const panel = document.querySelector('.vr-client').getBoundingClientRect();
        return { panel: panel.toJSON(), fields: ['#vr-cust','#vr-dep-open','#vr-pickup'].map(id => ({id,rect:document.querySelector(id).getBoundingClientRect().toJSON()})) };
      })()`);
      assert.ok(clientBounds.fields.every(field => field.rect.bottom <= clientBounds.panel.bottom), `${width}×${height} : champs client coupés ${JSON.stringify(clientBounds)}`);
    }
  });

  await page.viewport(1440, 900);
  await t.test('prix local et quantité décimale recalculent sans perdre la saisie', async () => {
    await reset({ lines: 1 });
    await input('[data-price="0"]', 7.5);
    await input('[data-qty="0"]', 2.5);
    assert.equal(await page.evaluate(`document.querySelector('#vr-total').textContent.replace(/\\s/g,'')`), '18,75$');
    assert.equal(await page.evaluate('fixture.articles[0].price_sell'), 10);
    assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem('kp.cart.test-user'))[0].price`), 7.5);
    await page.evaluate(`document.querySelector('[data-price="0"]').focus()`);
    await input('[data-price="0"]', 8);
    assert.equal(await page.evaluate(`document.activeElement.dataset.price`), '0');
    await click('#vr-save');
    await saved();
    const payload = await sale();
    assert.equal(payload.p_lines[0].unit_price, 8);
    assert.equal(payload.p_lines[0].qty, 2.5);
    assert.equal(payload.p_warehouse, 'w1');
    assert.equal(payload.p_payment, 'cash');
  });

  await t.test('prix vide/négatif et quantité nulle ne peuvent pas être enregistrés', async () => {
    for (const [selector, value] of [['[data-price="0"]', ''], ['[data-price="0"]', -1], ['[data-qty="0"]', 0]]) {
      await reset({ lines: 1 });
      await input(selector, value);
      await click('#vr-save');
      assert.equal(await sale(), undefined);
      assert.match(await page.evaluate(`document.querySelector('#vr-err').textContent`), /Corrigez les lignes/);
    }
  });

  await t.test('prix à zéro : avertissement immédiat et annulation sans perte du panier', async () => {
    await reset({ lines: 2 });
    await input('[data-price="0"]', 0);
    assert.equal(await page.evaluate(`document.querySelector('#vr-zero-warning').hidden`), false);
    assert.equal(await page.evaluate(`document.querySelector('[data-zero="0"]').hidden`), false);
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    assert.match(await page.evaluate(`document.querySelector('.confirm-text').textContent`), /prix net à zéro/);
    await click('[data-no]');
    await page.evaluate(`window.until(() => !document.querySelector('#vr-save').disabled)`);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 2);
    assert.ok(await page.evaluate(`localStorage.getItem('kp.cart.test-user') != null`));
    assert.equal(await page.evaluate(`document.activeElement.dataset.price`), '0');
    await input('[data-price="0"]', 8);
    assert.equal(await page.evaluate(`document.querySelector('#vr-zero-warning').hidden`), true);
  });

  await t.test('prix à zéro confirmé : une seule vente et panier vidé, sans changer le catalogue', async () => {
    await reset({ lines: 2 });
    await input('[data-price="0"]', 0);
    await click('#vr-print');
    await click('#vr-save');
    await page.evaluate(`document.querySelector('#main').dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true}))`);
    assert.equal(await sale(), undefined);
    assert.equal(await page.evaluate(`document.querySelectorAll('.confirm-box').length`), 1);
    await click('[data-yes]');
    await saved();
    assert.equal(await page.evaluate(`fixture.calls.filter(c => c.fn === 'create_sale').length`), 1);
    assert.equal((await sale()).p_lines[0].unit_price, 0);
    assert.equal(await page.evaluate(`fixture.articles[0].price_sell`), 10);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 0);
    assert.equal(await page.evaluate(`document.querySelector('#vr-zero-warning').hidden`), true);
    assert.equal(await page.evaluate(`localStorage.getItem('kp.cart.test-user')`), null);
    assert.equal(await page.evaluate(`fixture.printed.length`), 1);
  });

  await t.test('panier entièrement à zéro : refusé sans mouvement de stock', async () => {
    await reset({ lines: 1 });
    await input('[data-price="0"]', 0);
    await click('#vr-print');
    assert.equal(await sale(), undefined);
    assert.equal(await page.evaluate(`fixture.printed.length`), 0);
    assert.match(await page.evaluate(`document.querySelector('#vr-err').textContent`), /Tous les prix sont à zéro/);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 1);
  });

  await t.test('remise de 100 % : prix net nul signalé et confirmation exigée', async () => {
    await reset({ lines: 2, discounts: true });
    await input('[data-disc="0"]', 100);
    assert.equal(await page.evaluate(`document.querySelector('#vr-zero-warning').hidden`), false);
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    await click('[data-no]');
    await page.evaluate(`window.until(() => !document.querySelector('#vr-save').disabled)`);
  });

  await t.test('recherche par référence, quantité saisie et modification catalogue isolée', async () => {
    await reset({ barcode: true });
    await input('#vr-prod', 'TEST-1');
    await input('#vr-qty', 3);
    await click('#vr-add');
    await page.evaluate(`window.until(() => document.querySelectorAll('[data-price]').length === 1)`);
    assert.equal(await page.evaluate(`document.querySelector('[data-qty="0"]').value`), '3');
    assert.equal(await page.evaluate(`document.querySelectorAll('.scan-btn').length`), 1);
    await input('[data-price="0"]', 9);
    await input('#vr-prod', '10000000');
    await click('#vr-add');
    await page.evaluate(`window.until(() => document.querySelector('[data-qty="0"]').value === '4')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-price="0"]').value`), '9');
    assert.equal(await page.evaluate('fixture.articles[0].price_sell'), 10);
  });

  await t.test('acompte / crédit exige un client enregistré, pas seulement un nom', async () => {
    await reset({ lines: 1 });
    await input('#vr-cname', 'Nom libre');
    await mode('credit');
    await input('#vr-paid', 3);
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    assert.match(await page.evaluate(`document.querySelector('#vr-err').textContent`), /client/i);
  });

  await t.test('acompte existant choisi explicitement + versement maintenant : aucun double comptage', async () => {
    await reset({ lines: 1, qty: 10 });
    await mode('credit');
    await customer();
    assert.equal(await page.evaluate(`document.querySelector('#vr-dep-sel').value`), '');
    await input('#vr-dep-sel', 'd1', 'change');
    await input('#vr-dep-amt', 20);
    await input('#vr-paid', 30);
    assert.equal(await page.evaluate(`document.querySelector('#vr-sum-rest').textContent.replace(/\\s/g,'')`), '50,00$');
    await click('#vr-pickup');
    await click('#vr-save');
    await saved();
    const payload = await sale();
    assert.equal(payload.p_customer, 'c1');
    assert.equal(payload.p_payment, 'credit');
    assert.equal(payload.p_paid, 30);
    assert.equal(payload.p_advance_amount, 20);
    assert.equal(payload.p_deposit_id, 'd1');
    assert.ok(await page.evaluate(`fixture.calls.some(c => c.fn === 'set_sale_pickup')`));
    await click('#vr-print');
    await page.evaluate('window.flush()'); // l'impression est interceptée, sans dialogue système
    const html = await page.evaluate('fixture.printed.at(-1)');
    assert.match(html, /Acompte client imputé.*AC-TEST-1/);
    assert.match(html, /Acompte reçu maintenant[^]*30,00/);
    assert.match(html, /Reste dû[^]*50,00/);
  });

  await t.test('paiement mobile : références et opérateurs sont vérifiés', async () => {
    await reset({ lines: 1, qty: 10 });
    await mode('credit');
    await customer();
    await input('#vr-paid', 30);
    await input('#vr-amode', 'mobile_money', 'change');
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    await input('#vr-aref', 'TX-123');
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    await input('#vr-aop', 'mpesa', 'change');
    await click('#vr-save');
    await saved();
    assert.deepEqual(await page.evaluate(`fixture.calls.find(c => c.fn === 'set_initial_payment_method').payload`), {
      p_sale: 'sale-test', p_method: 'mobile_money', p_reference: 'TX-123', p_operator: 'mpesa'
    });
  });

  await t.test('un acompte couvrant tout est soldé sans nouvel encaissement ni référence fictive', async () => {
    await reset({ lines: 1, qty: 4 });
    await customer();
    await input('#vr-dep-sel', 'd1', 'change');
    await mode('bank');
    await click('#vr-save');
    await saved();
    assert.equal((await sale()).p_paid, 0);
    assert.equal((await sale()).p_advance_amount, 40);
    assert.ok(await page.evaluate(`!fixture.calls.some(c => c.fn === 'set_sale_payment_method')`));
  });

  await t.test('changer de client retire immédiatement les acomptes précédents, même homonymes', async () => {
    await reset({ lines: 1, qty: 10 });
    await customer();
    await input('#vr-dep-sel', 'd1', 'change');
    await customer('c2');
    assert.equal(await page.evaluate(`document.querySelector('#vr-dep').hidden`), true);
    await mode('credit');
    await input('#vr-paid', 10);
    await click('#vr-save');
    await saved();
    assert.equal((await sale()).p_customer, 'c2');
    assert.equal((await sale()).p_advance_amount, 0);
  });

  await t.test('double clic et F2 pendant la sauvegarde ne créent qu’une vente', async () => {
    await reset({ lines: 1, holdSale: true });
    await click('#vr-save');
    assert.ok(await page.evaluate(`document.querySelector('[data-price="0"]').matches(':disabled')`));
    await page.evaluate(`for(let i=0;i<3;i++) document.querySelector('#main').dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true}))`);
    assert.equal(await page.evaluate(`fixture.calls.filter(c => c.fn === 'create_sale').length`), 1);
    await page.evaluate('fixture.releaseSale()');
    await saved();
    assert.equal(await page.evaluate(`localStorage.getItem('kp.cart.test-user')`), null);
  });

  await t.test('erreur serveur : panier conservé et actions réactivées', async () => {
    await reset({ lines: 1, failSale: true });
    await click('#vr-save');
    await page.evaluate(`window.until(() => document.querySelector('#vr-err').textContent.includes('Vente refusée'))`);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 1);
    assert.ok(await page.evaluate(`!document.querySelector('#vr-save').disabled && !document.querySelector('#vr-fields').disabled`));
    assert.ok(await page.evaluate(`localStorage.getItem('kp.cart.test-user') != null`));
  });

  await t.test('Imprimer enregistre avant impression, vide le panier et conserve paiements/retrait', async () => {
    await reset({ lines: 1, qty: 10 });
    await mode('credit');
    await customer();
    await input('#vr-paid', 25);
    await click('#vr-pickup');
    await click('#vr-print');
    await saved();
    const html = await page.evaluate('fixture.printed.at(-1)');
    assert.doesNotMatch(html, /VENTE NON ENREGISTRÉE/);
    assert.match(html, /TEST-0001/);
    assert.match(html, /À RETIRER/);
    assert.match(html, /Acompte reçu maintenant[^]*25,00/);
    assert.match(html, /Reste dû[^]*75,00/);
    assert.equal((await sale()).p_paid, 25);
    assert.equal((await sale()).p_customer, 'c1');
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 0);
    assert.equal(await page.evaluate(`localStorage.getItem('kp.cart.test-user')`), null);
    assert.equal(await page.evaluate(`document.querySelector('#vr-restored').hidden`), true);
    assert.equal(await page.evaluate(`document.querySelector('#vr-prod').value`), '');
    assert.equal(await page.evaluate(`document.querySelector('#vr-qty').value`), '1');
  });

  await t.test('le reçu imprimé porte toujours un logo, même sans logo d’entreprise', async () => {
    await reset({ lines: 1 });
    await click('#vr-print');
    await saved();
    const html = await page.evaluate('fixture.printed.at(-1)');
    assert.match(html, /<img src="assets\/logo-k\.png"/);
  });

  await t.test('impression refusée par le serveur : ni impression ni vidage', async () => {
    await reset({ lines: 1, failSale: true });
    await click('#vr-print');
    await page.evaluate(`window.until(() => document.querySelector('#vr-err').textContent.includes('Vente refusée'))`);
    assert.equal(await page.evaluate(`fixture.printed.length`), 0);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 1);
    assert.ok(await page.evaluate(`localStorage.getItem('kp.cart.test-user') != null`));
  });

  await t.test('échec imprimante : vente conservée, panier vide, réimpression sans doublon', async () => {
    await reset({ lines: 1, failPrint: true });
    await click('#vr-print');
    await saved();
    assert.match(await page.evaluate(`document.querySelector('#vr-err').textContent`), /Vente enregistrée.*Imprimante indisponible/);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 0);
    assert.equal(await page.evaluate(`localStorage.getItem('kp.cart.test-user')`), null);
    await page.evaluate(`fixture.failPrint = false`);
    await click('#vr-print');
    await page.evaluate(`window.until(() => fixture.printed.length === 1 && !document.querySelector('#vr-print').disabled)`);
    assert.equal(await page.evaluate(`fixture.calls.filter(c => c.fn === 'create_sale').length`), 1);
    assert.match(await page.evaluate(`fixture.printed[0]`), /TEST-0001/);
  });

  await t.test('Imprimer deux fois réimprime la vente, puis le panier reste vide à la réouverture', async () => {
    await reset({ lines: 2, holdSale: true });
    await click('#vr-print');
    await click('#vr-print');
    assert.equal(await page.evaluate(`fixture.calls.filter(c => c.fn === 'create_sale').length`), 1);
    await page.evaluate(`fixture.releaseSale()`);
    await saved();
    await click('#vr-print');
    await page.evaluate(`window.until(() => fixture.printed.length === 2 && !document.querySelector('#vr-print').disabled)`);
    assert.equal(await page.evaluate(`fixture.calls.filter(c => c.fn === 'create_sale').length`), 1);
    await page.evaluate(`window.reopenSale()`);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 0);
    assert.equal(await page.evaluate(`document.querySelector('#vr-restored').hidden`), true);
  });

  await t.test('réimprimer une ancienne vente ne vide jamais le nouveau panier', async () => {
    await reset({ lines: 1 });
    await click('#vr-save');
    await saved();
    await page.evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close()); fixture.printGate = new Promise(resolve => { fixture.releasePrint = resolve; }); undefined`);
    await click('#vr-print');
    await input('#vr-prod', 'TEST-2');
    await click('#vr-add');
    await page.evaluate(`window.until(() => document.querySelectorAll('[data-price]').length === 1)`);
    await page.evaluate(`fixture.releasePrint()`);
    await page.evaluate(`window.until(() => !document.querySelector('#vr-print').disabled)`);
    assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem('kp.cart.test-user'))[0].article_id`), 'a2');
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 1);
    assert.equal(await page.evaluate(`fixture.calls.filter(c => c.fn === 'create_sale').length`), 1);
  });

  await t.test('baisse du total : acompte existant plafonné, avance excessive refusée', async () => {
    await reset({ lines: 1, qty: 10 });
    await mode('credit');
    await customer();
    await input('#vr-dep-sel', 'd1', 'change');
    await input('#vr-dep-amt', 30);
    await input('#vr-paid', 50);
    await input('[data-price="0"]', 2);
    assert.equal(await page.evaluate(`document.querySelector('#vr-dep-amt').value`), '20');
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    await mode('cash');
    await click('#vr-save');
    await saved();
    assert.equal((await sale()).p_advance_amount, 20);
    assert.equal((await sale()).p_paid, 0);
  });

  await t.test('suppression et vidage : confirmations, pas de F2 à travers la fenêtre', async () => {
    await reset({ lines: 2 });
    await click('[data-del="0"]');
    await page.evaluate(`document.querySelector('#main').dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true}))`);
    assert.equal(await sale(), undefined);
    await click('[data-no]');
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 2);
    await click('[data-del="0"]');
    await click('[data-yes]');
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-price]').length`), 1);
    await click('#vr-clear');
    await click('[data-yes]');
    assert.match(await page.evaluate(`document.querySelector('#vr-lines').textContent`), /Aucun article ajouté/);
    assert.equal(await page.evaluate(`localStorage.getItem('kp.cart.test-user')`), null);
  });

  await t.test('les réponses de stock arrivées dans le désordre ne remplacent pas le dépôt courant', async () => {
    await reset({ lines: 1, qty: 2 });
    await page.evaluate(`fixture.stockGates.w2 = new Promise(resolve => { fixture.releaseStock = resolve; }); undefined`);
    await input('#vr-wh', 'w2', 'change');
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    await input('#vr-wh', 'w1', 'change');
    await page.evaluate('fixture.releaseStock()');
    await page.evaluate('window.flush()');
    await click('#vr-save');
    await saved();
    assert.equal((await sale()).p_warehouse, 'w1');
  });

  await t.test('une ancienne réponse d’acompte ne peut pas contaminer le nouveau client', async () => {
    await reset({ lines: 1 });
    await click('#vr-cust-toggle');
    await page.evaluate(`fixture.depositGates.c1 = new Promise(resolve => { fixture.releaseDeposit = resolve; }); undefined`);
    await input('#vr-cust', 'c1', 'change');
    await input('#vr-cust', 'c2', 'change');
    await page.evaluate('fixture.releaseDeposit()');
    await page.evaluate('window.flush()');
    assert.equal(await page.evaluate(`document.querySelector('#vr-dep').hidden`), true);
    await click('#vr-save');
    await saved();
    assert.equal((await sale()).p_customer, 'c2');
    assert.equal((await sale()).p_deposit_id, null);
  });

  await t.test('stock non vérifiable : enregistrement refusé, pas de repli permissif', async () => {
    await reset({ lines: 1, failStock: true });
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    assert.match(await page.evaluate(`document.querySelector('#vr-err').textContent`), /Stock indisponible/);
  });

  await t.test('changement de dépôt recalcule le stock et bloque une sortie insuffisante', async () => {
    await reset({ lines: 1, qty: 2 });
    await input('#vr-wh', 'w2', 'change');
    await page.evaluate('window.flush()');
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    assert.match(await page.evaluate(`document.querySelector('#vr-err').textContent`), /stock/i);
  });

  await t.test('facturier limité à ses dépôts affectés, sans repli permissif', async () => {
    await reset({ role: 'facturier', assignments: [{ warehouse_id: 'w2' }] });
    assert.deepEqual(await page.evaluate(`[...document.querySelector('#vr-wh').options].map(o => o.value)`), ['w2']);
    await reset({ role: 'facturier', assignments: [], lines: 1 });
    await click('#vr-save');
    assert.equal(await sale(), undefined);
    assert.match(await page.evaluate(`document.querySelector('#vr-err').textContent`), /autorisé/);
  });

  await t.test('téléphone : pas de débordement horizontal, une seule paire d’actions visible', async () => {
    await page.viewport(390, 844);
    await reset({ lines: 40 });
    const state = await page.evaluate(layout);
    assert.ok(state.pageWidth <= 390);
    assert.equal(await page.evaluate(`document.querySelectorAll('#vr-save,#vr-print').length`), 2);
    assert.ok(state.fixed.at(-1).bottom < 844);
  });

  await t.test('blocs de bas de vente : design neutre du thème, aucune couleur de carte ajoutée', async () => {
    await page.viewport(1440, 900);
    await reset({ lines: 3 });
    assert.ok(await page.evaluate(`(() => {
      const client = getComputedStyle(document.querySelector('.vr-client'));
      const payment = getComputedStyle(document.querySelector('.vr-payment'));
      const header = getComputedStyle(document.querySelector('.vr-table th'));
      const paper = document.createElement('div');
      paper.style.background = 'var(--paper)';
      document.body.append(paper);
      const surface = getComputedStyle(paper).backgroundColor;
      paper.remove();
      return client.backgroundColor === surface && payment.backgroundColor === surface && header.backgroundColor !== getComputedStyle(document.querySelector('#vr-save')).backgroundColor;
    })()`));
  });

  await t.test('barre Total allégée : total agrandi et vidage discret', async () => {
    await page.viewport(1440, 900);
    await reset({ lines: 2 });
    const state = await page.evaluate(`(() => {
      const clear = document.querySelector('#vr-clear');
      return {
        total: parseFloat(getComputedStyle(document.querySelector('#vr-total')).fontSize),
        clearText: clear.textContent.trim(),
        clearHidden: clear.hidden
      };
    })()`);
    assert.ok(state.total >= 30, `total trop petit : ${state.total}px`);
    assert.equal(state.clearText, '', 'le bouton de vidage ne doit plus afficher de texte');
    assert.equal(state.clearHidden, false);
    await page.evaluate(`document.querySelector('#vr-clear').click()`);
    await page.evaluate(`document.querySelector('[data-yes]').click()`);
    await page.evaluate(`window.until(() => document.querySelectorAll('[data-price]').length === 0)`);
    assert.equal(await page.evaluate(`document.querySelector('#vr-clear').hidden`), true);
    assert.equal(await page.evaluate(`document.querySelector('#vr-sum-count').hidden`), true);
  });

  await t.test('téléphone : paiement allégé et raccourci Facturer masqué sur la vente', async () => {
    await page.viewport(390, 844);
    await reset({ lines: 1 });
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.vr-payment .vr-settlement')).display`), 'none');
    assert.equal(await page.evaluate(`(() => {
      const link = document.createElement('a');
      link.className = 'fab-m';
      link.dataset.r = 'vente';
      link.textContent = '+';
      document.querySelector('#nav').append(link);
      const display = getComputedStyle(link).display;
      link.remove();
      return display;
    })()`), 'none');
    await mode('credit');
    await customer();
    assert.notEqual(await page.evaluate(`getComputedStyle(document.querySelector('.vr-payment .vr-settlement')).display`), 'none');
    await page.viewport(1440, 900);
  });

  await t.test('la date de vente suit le fuseau de l’appareil, jamais la date UTC', async () => {
    const utc = await page.evaluate(`new Date().toISOString().slice(0, 10)`);
    const zone = await page.evaluate(`['Pacific/Kiritimati','Pacific/Midway','Pacific/Auckland','Pacific/Honolulu'].find(z => new Date().toLocaleDateString('sv-SE', { timeZone: z }) !== new Date().toISOString().slice(0, 10))`);
    assert.ok(zone, 'un fuseau de test doit être trouvé');
    await page.command('Emulation.setTimezoneOverride', { timezoneId: zone });
    try {
      await reset({ lines: 1 });
      await click('#vr-save');
      await saved();
      const { p_date } = await sale();
      const local = await page.evaluate(`new Date().toLocaleDateString('sv-SE')`);
      assert.notEqual(local, utc, `le fuseau ${zone} doit changer la date locale`);
      assert.equal(p_date, local, 'la vente doit être datée du jour local');
    } finally {
      await page.command('Emulation.setTimezoneOverride', { timezoneId: '' });
    }
  });

  await t.test('hors de Vente rapide, le défilement normal de l’application est rétabli', async () => {
    await page.viewport(1440, 900);
    assert.ok(await page.evaluate(`(() => {
      const main = document.querySelector('#main');
      main._venteEvents.abort();
      main.dataset.page = 'accueil';
      main.innerHTML = '<div style="height:2000px">Autre page</div>';
      return document.scrollingElement.scrollHeight > innerHeight && getComputedStyle(main).overflowY !== 'hidden';
    })()`));
  });

  await page.viewport(1440, 900);
  await reset({ lines: 3, qty: 2 });
  const screenshot = await page.command('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(artifactDir, 'kapya-vente-rapide-desktop.png'), Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(page.errors, []);
});
