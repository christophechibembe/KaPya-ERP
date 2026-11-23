import test from 'node:test';
import assert from 'node:assert/strict';
import { previousPeriod, relativeChange, periodFigures, modernDetails } from '../js/dashboard-insights.mjs';

test('comparaison : période immédiatement précédente de même durée, sans effet de fuseau', () => {
  assert.deepEqual(previousPeriod('2026-11-21', '2026-11-21'), { from: '2026-11-20', to: '2026-11-20' });
  assert.deepEqual(previousPeriod('2026-11-15', '2026-11-21'), { from: '2026-11-08', to: '2026-11-14' });
  assert.deepEqual(previousPeriod('2024-03-01', '2024-03-07'), { from: '2024-02-23', to: '2024-02-29' });
  assert.deepEqual(previousPeriod('2026-03-27', '2026-03-30'), { from: '2026-03-23', to: '2026-03-26' });
  assert.throws(() => previousPeriod('2026-02-30', '2026-03-01'), /invalide/);
  assert.throws(() => previousPeriod('2026-11-22', '2026-11-21'), /invalide/);
});

test('variations : hausse, baisse, résultat négatif et base nulle sans pourcentage inventé', () => {
  assert.deepEqual(relativeChange(120, 100), { kind: 'change', delta: 20, percent: 20 });
  assert.deepEqual(relativeChange(80, 100), { kind: 'change', delta: -20, percent: -20 });
  assert.deepEqual(relativeChange(-50, -100), { kind: 'change', delta: 50, percent: 50 });
  assert.deepEqual(relativeChange(0, 0), { kind: 'stable', delta: 0, percent: 0 });
  assert.deepEqual(relativeChange(12, 0), { kind: 'zero-base', delta: 12 });
  assert.deepEqual(relativeChange(12, null), { kind: 'unavailable' });
  assert.deepEqual(relativeChange(NaN, 10), { kind: 'unavailable' });
});

const source = () => ({
  sales: [
    { id: 'cash', number: 'CASH-1', sold_at: '2026-11-21', payment: 'cash', sale_lines: [{ id: 'cash-line', qty: 1, unit_price: 100 }] },
    { id: 'credit', number: 'CREDIT-1', sold_at: '2026-11-21', payment: 'credit', sale_lines: [{ id: 'credit-line', qty: 2, unit_price: 100 }] }
  ],
  payments: [
    { sale_id: 'credit', kind: 'initial', amount: 50, paid_at: '2026-11-21' },
    { sale_id: 'old-credit', kind: 'payment', amount: 20, paid_at: '2026-11-21' },
    { sale_id: 'cash', kind: 'advance', amount: 10, paid_at: '2026-11-21' },
    { sale_id: 'credit', kind: 'advance', amount: 20, paid_at: '2026-11-21' }
  ],
  deposits: [{ amount: 40, received_at: '2026-11-21' }],
  expenses: [{ amount: 5, label: 'Transport', paid_at: '2026-11-21' }],
  supplierPayments: [{ amount: 30, paid_at: '2026-11-21' }],
  creditIds: new Set(['credit', 'old-credit']),
  costs: new Map([['cash-line', { unit_cost_at_sale: 60 }], ['credit-line', { unit_cost_at_sale: 70 }]]),
  costsAvailable: true,
  canSeeCosts: true
});

test('comparaison : mêmes définitions réelles des ventes, bénéfices et flux', () => {
  assert.deepEqual(periodFigures(source()), {
    revenue: 300, cashSales: 100, creditSales: 200, paymentsReceived: 70,
    gross: 100, netProfit: 95, cashIn: 200, cashOut: 35, cashNet: 165
  });
});

test('comparaison : une source indisponible ne devient pas un faux zéro', () => {
  const values = periodFigures({ ...source(), payments: null, costsAvailable: false });
  assert.equal(values.revenue, 300);
  assert.equal(values.paymentsReceived, null);
  assert.equal(values.cashIn, null);
  assert.equal(values.cashNet, null);
  assert.equal(values.gross, null);
  assert.equal(values.netProfit, null);
});

test('comparaison : aucun coût, bénéfice ni trésorerie révélé à un rôle non autorisé', () => {
  const values = periodFigures({ ...source(), canSeeCosts: false });
  assert.deepEqual(Object.keys(values), ['revenue', 'cashSales', 'creditSales', 'paymentsReceived']);
});

test('détails : les lignes expliquent les totaux, sans nouveau calcul depuis du HTML', () => {
  const data = source();
  const model = { ...periodFigures(data), stockValue: 100, outstanding: 250, canSeeCosts: true, paymentsAvailable: true, saleCostsAvailable: true };
  const details = modernDetails(model, {
    ...data,
    credits: [{ id: 'credit', number: 'CREDIT-1' }, { id: 'old-credit', number: 'OLD-1' }],
    articles: [{ name: '<article>', stock: 20, price_buy: 5 }],
    pending: { cash: 0, receipts: 0 }
  });
  for (const key of ['revenue', 'cashSales', 'creditSales', 'paymentsReceived', 'gross', 'netProfit', 'cashIn', 'cashOut', 'cashNet', 'stockValue']) {
    assert.equal(details[key].rows.reduce((sum, row) => sum + row.amount, 0), details[key].total, key);
  }
  assert.equal(details.stockValue.current, true);
});

test('détails : les indicateurs protégés sont absents et une panne de paiements est signalée', () => {
  const data = source();
  const details = modernDetails({ ...periodFigures(data), canSeeCosts: false, paymentsAvailable: false }, {
    ...data, credits: [], articles: [], pending: { cash: 0, receipts: 0 }
  });
  assert.equal(details.gross, undefined);
  assert.equal(details.cashIn, undefined);
  assert.equal(details.stockValue, undefined);
  assert.equal(details.paymentsReceived.available, false);
});

test('créances : les avoirs réduisent le solde, le détail et son total', () => {
  const credits = [
    { id: 'a', number: 'CREDIT-A', sold_at: '2026-11-21', paid: 30, credit_notes_total: 20, sale_lines: [{ qty: 1, unit_price: 100 }] },
    { id: 'b', number: 'CREDIT-B', sold_at: '2026-11-20', paid: 0, credit_notes_total: 150, sale_lines: [{ qty: 1, unit_price: 100 }] }
  ];
  // Créance réelle : 100 - 30 - 20 = 50. La seconde facture est soldée par son avoir.
  const model = { outstanding: 50, canSeeCosts: false, paymentsAvailable: true, saleCostsAvailable: true };
  const details = modernDetails(model, {
    sales: [], credits, payments: [], deposits: [], supplierPayments: [], expenses: [],
    articles: [], costs: new Map(), pending: { cash: 0, receipts: 0 }
  });
  assert.deepEqual(details.outstanding.rows.map(row => row.amount), [50]);
  assert.equal(details.outstanding.rows.reduce((sum, row) => sum + row.amount, 0), details.outstanding.total);
});

test('créances : les ventes à crédit en attente s’ajoutent au total et à leur détail', () => {
  const credits = [
    { id: 'a', number: 'CREDIT-A', sold_at: '2026-11-21', paid: 30, credit_notes_total: 20, sale_lines: [{ qty: 1, unit_price: 100 }] }
  ];
  const pendingCredits = [
    { id: 'p1', number: 'ATT-1', sold_at: '2026-11-22', total: 60, paid: 10, balance: 50 },
    { id: 'p2', number: 'ATT-2', sold_at: '2026-11-23', total: 40, paid: 0, balance: 40 }
  ];
  // 50 du serveur + 90 nés hors ligne.
  const model = { outstanding: 140, canSeeCosts: false, paymentsAvailable: true, saleCostsAvailable: true };
  const details = modernDetails(model, {
    sales: [], credits, payments: [], deposits: [], supplierPayments: [], expenses: [],
    articles: [], costs: new Map(), pending: { cash: 0, receipts: 0 }, pendingCredits
  });
  assert.deepEqual(details.outstanding.rows.map(row => row.amount), [50, 50, 40]);
  assert.ok(details.outstanding.rows.some(row => /ATT-1/.test(row.label) && /En attente/.test(row.label)));
  assert.equal(details.outstanding.rows.reduce((sum, row) => sum + row.amount, 0), details.outstanding.total);
});

test('créances : un détail sans créance en attente reste cohérent', () => {
  const details = modernDetails({ outstanding: 0, canSeeCosts: false, paymentsAvailable: true, saleCostsAvailable: true }, {
    sales: [], credits: [], payments: [], deposits: [], supplierPayments: [], expenses: [],
    articles: [], costs: new Map(), pending: { cash: 0, receipts: 0 }
  });
  assert.deepEqual(details.outstanding.rows, []);
});
