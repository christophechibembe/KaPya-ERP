import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDatabase, seedDemo } from '../js/demo.js';
const now = () => new Date('2026-11-20T12:00:00');
const fresh = () => {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  return { db: createDemoDatabase({ storage, now }), storage };
};
const sale = (db, options = {}) => db.rpc('create_sale', { p_id: 'new-sale', p_customer: 'demo-c1', p_warehouse: 'demo-w1',
  p_lines: [{ article_id: 'demo-a1', qty: 2, unit_price: 45 }], p_date: '2026-11-20', ...options });
const readSale = async db => (await db.select('sales', 'id=eq.new-sale'))[0];

test('démo : jeux synthétiques par métier, dates relatives et stock cohérent', () => {
  for (const business of ['commerce', 'restauration', 'services']) {
    const seed = seedDemo(now(), business);
    assert.equal(seed.tables.organizations[0].business_type, business);
    assert.equal(seed.tables.settings[0].rate_date, '2026-11-20');
    assert.ok(seed.tables.sales.some(s => s.sold_at === '2026-11-20'));
    assert.ok(seed.tables.customers.every(c => !c.phone && !c.email));
    for (const article of seed.tables.articles) assert.equal(article.stock, seed.tables.warehouse_stock.filter(s => s.article_id === article.id).reduce((n, s) => n + s.qty, 0));
  }
});
test('démo : vente comptant persistante et idempotente, stocks du bon dépôt', async () => {
  const { db, storage } = fresh();
  await sale(db); await sale(db);
  assert.equal((await readSale(db)).paid, 90);
  assert.equal((await db.select('articles', 'id=eq.demo-a1'))[0].stock, 58);
  assert.equal((await db.select('warehouse_stock', 'article_id=eq.demo-a1&warehouse_id=eq.demo-w1'))[0].qty, 46);
  assert.equal((await db.select('warehouse_stock', 'article_id=eq.demo-a1&warehouse_id=eq.demo-w2'))[0].qty, 12);
  assert.equal((await createDemoDatabase({ storage, now }).select('sales', 'id=eq.new-sale')).length, 1);
});
test('démo : quantités cumulées, prix et stocks invalides sont refusés sans mutation partielle', async () => {
  const { db } = fresh();
  const before = await db.select('articles');
  for (const lines of [
    [{ article_id: 'demo-a1', qty: 40, unit_price: 1 }, { article_id: 'demo-a1', qty: 40, unit_price: 1 }],
    [{ article_id: 'demo-a1', qty: -1, unit_price: 1 }],
    [{ article_id: 'demo-a1', qty: 1, unit_price: -1 }],
    [{ article_id: 'demo-a1', qty: 1, unit_price: Infinity }]
  ]) await assert.rejects(sale(db, { p_lines: lines }));
  assert.deepEqual(await db.select('articles'), before);
  assert.equal((await db.select('sales', 'id=eq.new-sale')).length, 0);
});
test('démo : crédit et paiements idempotents, refus du trop-perçu', async () => {
  const { db } = fresh();
  await sale(db, { p_payment: 'credit', p_paid: 10 });
  const args = { p_id: 'new-payment', p_sale_id: 'new-sale', p_amount: 80, p_paid_at: '2026-11-20' };
  await db.rpc('record_credit_payment', args); await db.rpc('record_credit_payment', args);
  assert.equal((await readSale(db)).paid, 90);
  assert.equal((await db.select('sale_payments', 'sale_id=eq.new-sale')).length, 2);
  await assert.rejects(db.rpc('record_credit_payment', { ...args, p_id: 'extra', p_amount: 1 }), /solde/);
});
test('démo : modes de paiement et référence mobile money', async () => {
  const { db } = fresh();
  await sale(db, { p_payment: 'credit', p_paid: 0 });
  const a = { p_id: 'mobile', p_sale_id: 'new-sale', p_amount: 20, p_method: 'mobile_money', p_paid_at: '2026-11-20' };
  await assert.rejects(db.rpc('record_credit_payment_method', a), /référence/);
  await db.rpc('record_credit_payment_method', { ...a, p_reference: 'DEMO-TRANSACTION' });
  assert.equal((await db.select('sale_payments', 'id=eq.mobile'))[0].method, 'mobile_money');
});
test('démo : avoir idempotent et quantités limitées, sans retour de stock', async () => {
  const { db } = fresh(); await sale(db);
  const a = { p_id: 'credit', p_sale: 'new-sale', p_lines: [{ article_id: 'demo-a1', qty: 1 }] };
  await db.rpc('create_credit_note', a); await db.rpc('create_credit_note', a);
  assert.equal((await db.select('credit_notes', 'sale_id=eq.new-sale'))[0].total_usd, 45);
  await assert.rejects(db.rpc('create_credit_note', { ...a, p_id: 'other', p_lines: [{ article_id: 'demo-a1', qty: 2 }] }), /Quantité/);
  assert.equal((await db.select('articles', 'id=eq.demo-a1'))[0].stock, 58);
});
test('démo : transfert conserve le stock total et utilise les dépôts source et cible', async () => {
  const { db } = fresh();
  await db.rpc('create_warehouse_transfer', { p_from: 'demo-w1', p_to: 'demo-w2', p_lines: [{ article_id: 'demo-a1', qty: 4 }] });
  assert.equal((await db.select('articles', 'id=eq.demo-a1'))[0].stock, 60);
  const stocks = await db.select('warehouse_stock', 'article_id=eq.demo-a1&order=warehouse_id');
  assert.deepEqual(stocks.map(s => s.qty), [44, 16]);
  assert.match((await db.select('transfers'))[0].number, /^DEMO-TRF-/);
});
test('démo : achats et paiements fournisseurs', async () => {
  const { db } = fresh();
  const id = await db.rpc('create_purchase', { p_id: 'purchase', p_supplier: 'demo-f1', p_lines: [{ article_id: 'demo-a1', qty: 10, unit_cost: 38 }] });
  await db.rpc('record_purchase_payment', { p_purchase_id: id, p_amount: 380 });
  await assert.rejects(db.rpc('record_purchase_payment', { p_purchase_id: id, p_amount: 1 }), /solde/);
  assert.equal((await db.select('articles', 'id=eq.demo-a1'))[0].stock, 70);
});
test('démo : clôtures boutique puis globale et conservation des totaux', async () => {
  const { db } = fresh();
  const args = { p_day: '2026-11-20', p_opening_usd: 0, p_counted_usd: 0 };
  await assert.rejects(db.rpc('save_cash_closure', args), /chaque boutique/);
  for (const w of await db.select('warehouses')) await db.rpc('save_shop_closure', { p_day: args.p_day, p_warehouse: w.id, p_count_usd: 0 });
  const result = await db.rpc('save_cash_closure', args);
  assert.equal(result.closure.expected_usd, result.cash_in - result.cash_out);
  assert.equal(result.closure.difference_usd, -result.closure.expected_usd);
  await db.rpc('save_cash_closure', args);
  assert.equal((await db.select('cash_closures')).length, 1);
});
test('démo : filtres dates, booléens, jointures, pagination et copies indépendantes', async () => {
  const { db } = fresh();
  const rows = await db.select('sales', 'sold_at=gte.2026-11-20&sold_at=lt.2026-11-21&payment=eq.cash&limit=1');
  assert.equal(rows.length, 1); assert.equal(rows[0].customers.name, 'Restaurant du Lac');
  rows[0].sale_lines[0].unit_price = -10;
  assert.notEqual((await db.select('sales', `id=eq.${rows[0].id}`))[0].sale_lines[0].unit_price, -10);
  assert.equal((await db.select('warehouses', 'active=eq.true')).length, 2);
  assert.equal((await db.select('sale_payments', 'paid_at=gte.2026-11-20T00:00:00&paid_at=lt.2026-11-21T00:00:00')).length, 1);
});
test('démo : les actions non implémentées ne renvoient jamais un faux succès', async () => {
  const { db } = fresh();
  await assert.rejects(db.rpc('delete_company'), /pas proposée/);
  await assert.rejects(db.insert('platform_admins', {}));
  await assert.rejects(db.upsert('organizations', {}));
});
