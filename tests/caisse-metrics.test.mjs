import test from 'node:test';
import assert from 'node:assert/strict';
import { hasNewCashMovements } from '../js/modules/caisse-metrics.mjs';

test('detecte des mouvements nouveaux même si le total net reste identique', () => {
  const snapshot = {
    cash_sales: 100,
    credit_payments: 20,
    customer_deposits: 0,
    supplier_payments: 10,
    expenses: 5,
    cash_in: 120,
    cash_out: 15,
  };
  const current = {
    ...snapshot,
    supplier_payments: 5,
    expenses: 10,
  };

  assert.equal(hasNewCashMovements(current, snapshot), true);
});

test('ne signale pas de changement quand les montants sont identiques', () => {
  const summary = { cash_sales: 12.5, cash_in: 12.5, cash_out: 0 };

  assert.equal(hasNewCashMovements(summary, summary), false);
});

test('ignore les fractions de centime et compare les champs manquants à zéro', () => {
  assert.equal(hasNewCashMovements({ cash_sales: 10.004 }, { cash_sales: 10 }), false);
  assert.equal(hasNewCashMovements({ cash_sales: 0.01 }, {}), true);
});

test('ne signale aucun changement sans clôture de référence', () => {
  assert.equal(hasNewCashMovements({ cash_sales: 30 }, null), false);
});
