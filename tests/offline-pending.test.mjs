import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingSaleRows, pendingSaleTotal, pendingSaleCost, pendingLineCount } from '../js/offline-pending.mjs';

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
