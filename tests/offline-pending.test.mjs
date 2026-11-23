import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingSaleRows, pendingSaleTotal, pendingSaleCost, pendingLineCount, pendingCreditRows } from '../js/offline-pending.mjs';

const articles = [
  { id: 'a1', sku: 'SKU1', name: 'Savon', unit: 'pièce', price_buy: 2 },
  { id: 'a2', sku: 'SKU2', name: 'Huile', unit: 'litre', price_buy: 5 }
];

const sale = (id, date, extra = {}) => ({
  fn: 'create_sale',
  status: 'queued',
  body: {
    p_number: `F-${id}`,
    p_id: id,
    p_date: date,
    p_payment: 'cash',
    p_paid: 0,
    p_customer_label: '',
    p_warehouse: 'w1',
    p_lines: [
      { article_id: 'a1', qty: 2, unit_price: 3 },
      { article_id: 'a2', qty: 1, unit_price: 10 }
    ],
    ...extra
  }
});

test('convertit une vente en attente en ligne de vente lisible', () => {
  const rows = pendingSaleRows([sale('s1', '2026-11-23')], { articles });
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.id, 's1');
  assert.equal(row.number, 'F-s1');
  assert.equal(row.sold_at, '2026-11-23');
  assert.equal(row.payment, 'cash');
  assert.equal(row.pending, true);
  assert.equal(row.sale_lines.length, 2);
  assert.equal(row.sale_lines[0].articles.name, 'Savon');
  assert.equal(row.sale_lines[1].articles.price_buy, 5);
});

test('ignore les pièces envoyées, refusées ou d’un autre type', () => {
  const items = [
    sale('s1', '2026-11-23'),
    { ...sale('s2', '2026-11-23'), status: 'rejected' },
    { ...sale('s3', '2026-11-23'), status: 'sent' },
    { fn: 'record_credit_payment', status: 'queued', body: { p_amount: 5 } }
  ];
  assert.deepEqual(pendingSaleRows(items, { articles }).map(row => row.id), ['s1']);
});

test('filtre par période incluse, bornes comprises', () => {
  const items = [sale('s1', '2026-11-20'), sale('s2', '2026-11-23'), sale('s3', '2026-11-25')];
  const rows = pendingSaleRows(items, { from: '2026-11-20', to: '2026-11-23', articles });
  assert.deepEqual(rows.map(row => row.id), ['s1', 's2']);
});

test('filtre par boutique et laisse passer tout si aucune boutique choisie', () => {
  const items = [sale('s1', '2026-11-23', { p_warehouse: 'w1' }), sale('s2', '2026-11-23', { p_warehouse: 'w2' })];
  assert.deepEqual(pendingSaleRows(items, { shop: 'w2', articles }).map(row => row.id), ['s2']);
  assert.equal(pendingSaleRows(items, { articles }).length, 2);
});

test('total d’une vente en attente : le prix unitaire est déjà net de remise', () => {
  const rows = pendingSaleRows([sale('s1', '2026-11-23', {
    p_lines: [{ article_id: 'a1', qty: 2, unit_price: 3, discount_pct: 10 }]
  })], { articles });
  // 2 × 3 = 6, la remise est déjà appliquée dans unit_price : ne pas la retirer deux fois.
  assert.equal(pendingSaleTotal(rows[0]), 6);
});

test('coût estimé au prix d’achat actuel, sans article connu = 0', () => {
  const rows = pendingSaleRows([
    sale('s1', '2026-11-23'),
    sale('s2', '2026-11-23', { p_lines: [{ article_id: 'inconnu', qty: 4, unit_price: 1 }] })
  ], { articles });
  // 2 × 2 + 1 × 5 = 9 ; l'article inconnu ne fabrique pas de coût.
  assert.equal(pendingSaleCost(rows), 9);
  assert.equal(pendingLineCount(rows), 3);
});

// --- Créances nées hors ligne ---

const creditSale = (id, extra = {}) => sale(id, '2026-11-23', { p_payment: 'credit', ...extra });
const creditPay = (saleId, amount, extra = {}) => ({
  fn: 'record_credit_payment', status: 'queued', body: { p_sale_id: saleId, p_amount: amount, ...extra }
});
// Total dû : exactement ce que le tableau de bord ajoute aux créances.
const due = (items, payments = [], options) =>
  pendingCreditRows(items, payments, options).reduce((sum, row) => sum + row.balance, 0);

test('une vente à crédit en attente est une créance réelle, versement déduit', () => {
  // Total 16 (2 × 3 + 1 × 10), versement initial de 6 : reste 10.
  assert.equal(due([creditSale('s1', { p_paid: 6 })]), 10);
});

test('les versements de crédit en attente réduisent la créance sans double comptage', () => {
  const items = [creditSale('s1')];
  // 16 − 4 = 12, puis − 5 = 7.
  assert.equal(due(items, [creditPay('s1', 4), creditPay('s1', 5)]), 7);
  // Une vente cash n'apporte rien ; un versement sur une autre facture non plus.
  assert.equal(due(items, [creditPay('autre', 99)]), 16);
  assert.equal(due([sale('c1', '2026-11-23')], [creditPay('c1', 3)]), 0);
});

test('une créance en attente ne descend jamais sous zéro', () => {
  assert.equal(due([creditSale('s1', { p_paid: 100 })]), 0);
  assert.equal(due([creditSale('s1')], [creditPay('s1', 500)]), 0);
});

test('les pièces envoyées ou refusées ne sont plus des créances en attente', () => {
  const sent = { ...creditSale('s1'), status: 'sent' };
  const rejected = { ...creditSale('s2'), status: 'rejected' };
  assert.equal(due([sent, rejected]), 0);
  // Un versement refusé ou déjà envoyé ne réduit rien.
  assert.equal(due([creditSale('s1')],
    [{ ...creditPay('s1', 4), status: 'rejected' }, { ...creditPay('s1', 4), status: 'sent' }]), 16);
});

test('la créance en attente suit la boutique choisie', () => {
  const items = [creditSale('s1', { p_warehouse: 'w1' }), creditSale('s2', { p_warehouse: 'w2' })];
  assert.equal(due(items, [], { shop: 'w2' }), 16);
  assert.equal(due(items, []), 32);
  assert.equal(due(items, [], { shop: 'w9' }), 0);
});

test('le détail ligne à ligne somme exactement sur le total', () => {
  const items = [creditSale('s1', { p_paid: 6 }), creditSale('s2', { p_date: '2026-11-20' })];
  const payments = [creditPay('s1', 4)];
  const rows = pendingCreditRows(items, payments);
  const total = due(items, payments);
  assert.equal(rows.reduce((sum, row) => sum + row.balance, 0), total);
  // s1 : 16 − 6 − 4 = 6 ; s2 : 16 − 0 = 16.
  assert.equal(total, 22);
  // Tri par date croissante, comme les lignes du serveur.
  assert.deepEqual(rows.map(row => row.id), ['s2', 's1']);
  assert.deepEqual(rows.map(row => row.sold_at), ['2026-11-20', '2026-11-23']);
  assert.equal(rows[1].number, 'F-s1');
  assert.equal(rows[1].balance, 6);
});
