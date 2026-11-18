// Règles métier transverses : formules d'abonnement, rôles, reçus, calculs et hors-ligne.
// Aucun réseau : ces tests vérifient le comportement pur du code.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLANS, setPlan, getPlan, planAllows, routeAllowed, featuresOf } from '../js/plans.js';
import { can, canView } from '../js/roles.js';
import { round2, netPrice, lineTotal, cartTotal, creditBalance, stockAllows, closureDifference } from '../js/sale-math.js';
import { esc } from '../js/escape.js';
import { hasNewCashMovements } from '../js/modules/caisse-metrics.mjs';
import { applyCachedRecordUpdate, restoreCachedRecord, setCachedRecordPending } from '../js/modules/offline-record-updates.mjs';

// receipt.js charge api.js, qui lit localStorage au démarrage. On fournit un stockage neutre
// avant l'import, puis chaque test règle la TVA via withVat().
globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {}
};
const { receiptHtml } = await import('../js/receipt.js');

// TVA : le reçu lit le réglage dans localStorage. On le simule pour chaque test.
function withVat(enabled, rate) {
  globalThis.localStorage = {
    getItem: key => (key === 'kp.vat' ? JSON.stringify({ enabled, rate }) : null),
    setItem() {},
    removeItem() {}
  };
}

test('formules : les trois formules existent et se lisent l’une après l’autre', () => {
  assert.deepEqual(PLANS, ['basique', 'standard', 'premium']);
  setPlan('basique');
  assert.equal(getPlan(), 'basique');
  setPlan('premium');
  assert.equal(getPlan(), 'premium');
  setPlan('inconnue');
  assert.equal(getPlan(), 'standard', 'une formule inconnue retombe sur standard');
});

test('formules : basique n’ajoute aucune option, standard et premium les cumulent', () => {
  for (const feature of ['depots', 'transferts', 'alertes', 'exports', 'sauvegarde', 'whatsapp', 'historique', 'exports_pdf', 'restauration', 'personnel']) {
    setPlan('basique');
    assert.equal(planAllows(feature), false, `basique ne doit pas inclure ${feature}`);
  }
  for (const feature of ['depots', 'transferts', 'alertes', 'exports', 'sauvegarde', 'whatsapp']) {
    setPlan('standard');
    assert.equal(planAllows(feature), true, `standard doit inclure ${feature}`);
  }
  for (const feature of ['historique', 'exports_pdf', 'restauration', 'personnel']) {
    setPlan('standard');
    assert.equal(planAllows(feature), false, `standard ne doit pas inclure ${feature}`);
    setPlan('premium');
    assert.equal(planAllows(feature), true, `premium doit inclure ${feature}`);
  }
  setPlan('standard');
});

test('formules : les pages réservées suivent la formule et les pages communes restent ouvertes', () => {
  setPlan('basique');
  assert.equal(routeAllowed('depots'), false);
  assert.equal(routeAllowed('exports'), false);
  assert.equal(routeAllowed('workers'), false);
  assert.equal(routeAllowed('accueil'), true);
  assert.equal(routeAllowed('vente'), true);
  assert.equal(routeAllowed('stocks'), true);

  setPlan('premium');
  assert.equal(routeAllowed('depots'), true);
  assert.equal(routeAllowed('historique'), true);
  assert.equal(routeAllowed('workers'), true);
  setPlan('standard');
});

test('formules : le détail des options indique ce qui est inclus', () => {
  const standard = featuresOf('standard');
  assert.equal(standard.find(item => item.key === 'depots').included, true);
  assert.equal(standard.find(item => item.key === 'personnel').included, false);
  const premium = featuresOf('premium');
  assert.ok(premium.every(item => item.included), 'premium inclut toutes les options');
  for (const item of premium) assert.ok(item.label, 'chaque option a un libellé');
});

test('rôles : les droits écriture et lecture sont cohérents', () => {
  assert.equal(can('admin', 'ventes.write'), true);
  assert.equal(can('manager', 'ventes.write'), true);
  assert.equal(can('facturier', 'ventes.write'), true);
  assert.equal(can('comptable', 'ventes.write'), false);
  assert.equal(can('user', 'ventes.write'), false);

  assert.equal(can('comptable', 'achats.view'), true);
  assert.equal(can('comptable', 'achats.write'), false);
  assert.equal(can('user', 'rapports.view'), true);
  assert.equal(can('user', 'sauvegarde.export'), false);
  assert.equal(can('admin', 'sauvegarde.export'), true);
  assert.equal(can('admin', 'equipe.manage'), true);
  assert.equal(can('manager', 'equipe.manage'), false);
});

test('rôles : les écrans interdits sont masqués pour chaque rôle', () => {
  assert.equal(canView('user', 'sauvegarde'), false);
  assert.equal(canView('user', 'historique'), false);
  assert.equal(canView('user', 'stocks'), true);
  assert.equal(canView('user', 'accueil'), true);
  assert.equal(canView('facturier', 'facture'), true);
  assert.equal(canView('comptable', 'facture'), false);
  assert.equal(canView('admin', 'parametres'), true);
});

test('calculs : remise, ligne, panier et solde restent exacts au centime', () => {
  assert.equal(round2(10.005), 10.01);
  assert.equal(netPrice(10, 10), 9);
  assert.equal(netPrice(10, 150), 0, 'une remise supérieure à 100 % est plafonnée');
  assert.equal(netPrice(10, -5), 10, 'une remise négative est ignorée');
  assert.equal(lineTotal(3, 2.5), 7.5);
  assert.equal(cartTotal([{ qty: 1, price: 9.99 }, { qty: 2, price: 5 }]), 19.99);
  assert.equal(creditBalance(100, 30), 70);
  assert.equal(creditBalance(100, 30, 10), 60);
  assert.equal(creditBalance(10, 20), 0, 'un solde ne devient jamais négatif');
  assert.equal(closureDifference(95, 100), -5);
  assert.equal(closureDifference(100, 95), 5);
});

test('stock : une quantité inconnue est acceptée, une quantité excessive est refusée', () => {
  assert.equal(stockAllows(10, null), true);
  assert.equal(stockAllows(5, 5), true);
  assert.equal(stockAllows(6, 5), false);
});

test('échappement : les caractères HTML sont neutralisés', () => {
  assert.equal(esc('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('reçu : sans logo, aucun cadre image n’est ajouté', () => {
  withVat(false, 0);
  const html = receiptHtml({
    org: { name: 'Entreprise test' }, number: 'FAC-1', date: '17/11/2026',
    lines: [{ name: 'Article', unit: 'pce', qty: 1, price: 5, sub: 5 }], total: 5, paid: 5,
    money: value => value + ' $'
  });
  assert.doesNotMatch(html, /<div class="c"><img/);
  assert.match(html, /Entreprise test/);
  assert.match(html, /FAC-1/);
});

test('reçu : un logo fourni est imprimé et les textes sont échappés', () => {
  withVat(false, 0);
  const logo = 'data:image/png;base64,AAAA';
  const html = receiptHtml({
    org: { name: 'Entreprise <test>' }, logo, number: 'FAC-2', date: '17/11/2026',
    client: '<script>', lines: [{ name: 'Article', unit: 'pce', qty: 1, price: 5, sub: 5 }],
    total: 5, paid: 5, money: value => value + ' $'
  });
  assert.match(html, new RegExp(`<div class="c"><img src="${logo}"`));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('reçu à crédit : le reste dû est calculé sur le total et l’acompte', () => {
  withVat(false, 0);
  const html = receiptHtml({
    org: { name: 'Entreprise test' }, number: 'FAC-3', date: '17/11/2026',
    client: 'Client', lines: [{ name: 'Article', unit: 'pce', qty: 1, price: 100, sub: 100 }],
    total: 100, paid: 30, kind: 'credit', money: value => value + ' $'
  });
  assert.match(html, /Reste dû/);
  assert.match(html, /70,00 \$/);
});

test('reçu : la TVA affichée est la part contenue dans le total TTC', () => {
  withVat(true, 16);
  const html = receiptHtml({
    org: { name: 'Entreprise test' }, number: 'FAC-4', date: '17/11/2026',
    lines: [{ name: 'Article', unit: 'pce', qty: 1, price: 116, sub: 116 }],
    total: 116, paid: 116, money: value => Number(value).toFixed(2) + ' $'
  });
  assert.match(html, /dont TVA 16 % : 16,00 \$/);
  withVat(false, 0);
});

test('caisse : un mouvement est détecté à partir du centime, pas en dessous', () => {
  const snapshot = { cash_sales: 10, credit_payments: 0, cash_in: 0 };
  assert.equal(hasNewCashMovements({ ...snapshot }, null), false, 'sans snapshot, aucun mouvement');
  assert.equal(hasNewCashMovements({ ...snapshot, cash_sales: 10.004 }, snapshot), false);
  assert.equal(hasNewCashMovements({ ...snapshot, cash_sales: 10.02 }, snapshot), true);
  assert.equal(hasNewCashMovements({ ...snapshot, expenses: 5 }, snapshot), true);
});

test('hors-ligne : une fiche mise en attente est marquée puis restaurée', () => {
  const rows = [{ id: 'a', name: 'Ancien' }, { id: 'b', name: 'Autre' }];
  const previous = structuredClone(rows[0]);
  assert.equal(applyCachedRecordUpdate(rows, { id: 'a', name: 'Nouveau' }), true);
  assert.equal(rows[0].name, 'Nouveau');
  assert.equal(rows[0]._offline_pending, true);
  assert.equal(rows[1]._offline_pending, undefined);

  assert.equal(setCachedRecordPending(rows, 'a', false), true);
  assert.equal(rows[0]._offline_pending, undefined);

  assert.equal(restoreCachedRecord(rows, 'a', previous), true);
  assert.equal(rows[0].name, 'Ancien');
  assert.equal(rows[0]._offline_pending, undefined);
  assert.equal(restoreCachedRecord(rows, 'a', null), false);
});
