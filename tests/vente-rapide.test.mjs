// Tests des règles de vente rapide : acomptes, paiements partiels et soldes. Sans navigateur ni Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settle, depositApplied, validateDeposit, validatePayment } from '../js/payment-rules.js';
import { netPrice, lineTotal, cartTotal, stockAllows } from '../js/sale-math.js';

test('vente entièrement réglée en espèces : reste 0', () => {
  const s = settle({ total: 100, mode: 'cash' });
  assert.equal(s.paidTotal, 100);
  assert.equal(s.rest, 0);
});

test('crédit avec encaissement partiel de 30 sur 100 : reste 70, sans doublon', () => {
  const s = settle({ total: 100, mode: 'credit', advance: 30 });
  assert.equal(s.paidNow, 30);
  assert.equal(s.paidTotal, 30);
  assert.equal(s.rest, 70);
});

test('acompte client de 20 appliqué, espèces : le reste à encaisser est 80, reste 0', () => {
  const s = settle({ total: 100, deposit: 20, mode: 'cash' });
  assert.equal(s.cashDue, 80);
  assert.equal(s.paidNow, 80);
  assert.equal(s.paidTotal, 100);
  assert.equal(s.rest, 0);
});

test('acompte de 20 appliqué, crédit avec 30 encaissés : reste 50', () => {
  const s = settle({ total: 100, deposit: 20, mode: 'credit', advance: 30 });
  assert.equal(s.paidNow, 30);
  assert.equal(s.paidTotal, 50);
  assert.equal(s.rest, 50);
});

test('l’acompte imputé ne dépasse ni le solde disponible ni le total', () => {
  assert.equal(depositApplied({ total: 100, requested: 150, available: 120 }), 100);
  assert.equal(depositApplied({ total: 100, requested: 150, available: 40 }), 40);
  assert.equal(depositApplied({ total: 100, requested: '', available: 40 }), 0);
  assert.equal(depositApplied({ total: 100, requested: -5, available: 40 }), 0);
});

test('après baisse du total, l’acompte déjà saisi est plafonné au nouveau total', () => {
  assert.equal(depositApplied({ total: 60, requested: 100, available: 100 }), 60);
});

test('crédit : l’encaissement ne peut pas couvrir tout le solde restant après acompte', () => {
  const base = { mode: 'credit', total: 100, deposit: 20, customer: 'c1', ref: '', aref: '', amode: 'cash' };
  assert.ok(validatePayment({ ...base, advance: 80 })); // 80 couvre tout le reste dû (80)
  assert.equal(validatePayment({ ...base, advance: 79 }), null);
});

test('crédit : un acompte qui couvre tout bloque le mode crédit', () => {
  assert.ok(validatePayment({ mode: 'credit', total: 100, deposit: 100, advance: 0, customer: 'c1' }));
});

test('crédit sans client : refusé (pas de paiement partiel anonyme)', () => {
  assert.ok(validatePayment({ mode: 'credit', total: 100, advance: 30, customer: null }));
});

test('acompte appliqué sans client enregistré : refusé', () => {
  assert.ok(validateDeposit({ total: 100, applied: 20, available: 50, customer: null }));
});

test('acompte appliqué au-delà du solde ou du total : refusé', () => {
  assert.ok(validateDeposit({ total: 100, applied: 60, available: 50, customer: 'c1' }));
  assert.ok(validateDeposit({ total: 100, applied: 120, available: 150, customer: 'c1' }));
  assert.equal(validateDeposit({ total: 100, applied: 50, available: 50, customer: 'c1' }), null);
  assert.equal(validateDeposit({ total: 100, applied: 0, available: 0, customer: null }), null);
});

test('calculs de ligne et de panier inchangés (remise, arrondi, quantité)', () => {
  assert.equal(netPrice(10, 10), 9);
  assert.equal(lineTotal(3, 2.5), 7.5);
  assert.equal(cartTotal([{ qty: 2, price: 1.1 }, { qty: 1, price: 0.2 }]), 2.4);
  assert.equal(stockAllows(3, 2), false);
  assert.equal(stockAllows(2, null), true);
});

test('acomptes invalides : négatif, non fini ou mode inconnu sont refusés', () => {
  const base = { total: 100, mode: 'credit', customer: 'c1' };
  for (const advance of [-1, NaN, Infinity]) assert.ok(validatePayment({ ...base, advance }));
  assert.ok(validatePayment({ ...base, mode: 'inconnu' }));
  assert.ok(validatePayment({ ...base, advance: 30, amode: 'inconnu' }));
  assert.ok(validateDeposit({ total: 100, applied: NaN, available: 50, customer: 'c1' }));
  assert.ok(validateDeposit({ total: 100, applied: -5, available: 50, customer: 'c1' }));
});

test('crédit : validation sur les mêmes centimes que l’encaissement réel', () => {
  assert.ok(validatePayment({ mode: 'credit', total: 100, advance: 99.999, customer: 'c1' }));
});

test('mobile money et virement : référence obligatoire seulement si un montant est encaissé', () => {
  assert.ok(validatePayment({ mode: 'bank', total: 100 }));
  assert.ok(validatePayment({ mode: 'mobile_money', total: 100, ref: 'TX-123' }));
  assert.equal(validatePayment({ mode: 'mobile_money', total: 100, ref: 'TX-123', operator: 'mpesa' }), null);
  assert.equal(validatePayment({ mode: 'bank', total: 100, deposit: 100 }), null);
  assert.equal(validatePayment({ mode: 'mobile_money', total: 100, deposit: 100 }), null);
});

test('répartition : acompte borné même si une source fournit un montant hors limites', () => {
  assert.deepEqual(settle({ total: 100, deposit: 150, mode: 'cash' }), { cashDue: 0, paidNow: 0, paidTotal: 100, rest: 0 });
  assert.deepEqual(settle({ total: 100, deposit: -20, mode: 'credit', advance: 30 }), { cashDue: 100, paidNow: 30, paidTotal: 30, rest: 70 });
});
