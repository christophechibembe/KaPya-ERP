// Comptabilité : TVA incluse dans les prix TTC, journal équilibré, balance et formules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitVat, buildJournal, buildBalance, summarize, journalTotals, ACCOUNTS } from '../js/accounting.js';
import { setPlan, planAllows, routeAllowed } from '../js/plans.js';

const sale = (over = {}) => ({
  id: 's1', number: 'F-001', sold_at: '2026-11-10', payment: 'cash',
  sale_lines: [{ qty: 2, unit_price: 58 }], ...over
});
const purchase = (over = {}) => ({
  id: 'p1', number: 'A-001', bought_at: '2026-11-11',
  purchase_lines: [{ qty: 1, unit_cost: 116 }], ...over
});
const account = (lines, code) => lines.filter(line => line.account === code);

test('TVA : la part est extraite d’un prix TTC', () => {
  assert.deepEqual(splitVat(116, 16), { total: 116, ht: 100, vat: 16, rate: 16 });
  assert.deepEqual(splitVat(116, 16, false), { total: 116, ht: 116, vat: 0, rate: 0 });
  assert.deepEqual(splitVat(116, 0), { total: 116, ht: 116, vat: 0, rate: 0 });
});

test('vente comptant avec TVA : caisse, produit et TVA collectée', () => {
  const lines = buildJournal({ sales: [sale()], vat: { enabled: true, rate: 16 } });
  assert.equal(account(lines, '571')[0].debit, 116);
  assert.equal(account(lines, '701')[0].credit, 100);
  assert.equal(account(lines, '443')[0].credit, 16);
  assert.equal(journalTotals(lines).difference, 0);
  const totals = summarize(lines);
  assert.equal(totals.revenue, 100);
  assert.equal(totals.vatCollected, 16);
  assert.equal(totals.cash, 116);
});

test('vente à crédit puis encaissement : la créance client se solde', () => {
  const credit = sale({ payment: 'credit' });
  const lines = buildJournal({
    sales: [credit],
    salePayments: [{ amount: 116, paid_at: '2026-11-20', kind: 'payment', sales: { number: 'F-001' } }],
    vat: { enabled: false, rate: 0 }
  });
  const client = account(lines, '411');
  assert.equal(client.find(line => line.debit > 0).debit, 116);
  assert.equal(client.find(line => line.credit > 0).credit, 116);
  const totals = summarize(lines);
  assert.equal(totals.receivable, 0);
  assert.equal(totals.cash, 116);
  assert.equal(totals.revenue, 116);
  assert.equal(journalTotals(lines).difference, 0);
});

test('achat avec TVA : charge, TVA récupérable et fournisseur', () => {
  const lines = buildJournal({
    purchases: [purchase()],
    purchasePayments: [{ amount: 116, paid_at: '2026-11-15', purchases: { number: 'A-001' } }],
    vat: { enabled: true, rate: 16 }
  });
  assert.equal(account(lines, '607')[0].debit, 100);
  assert.equal(account(lines, '445')[0].debit, 16);
  const supplier = account(lines, '401');
  assert.equal(supplier.find(line => line.credit > 0).credit, 116);
  assert.equal(supplier.find(line => line.debit > 0).debit, 116);
  const totals = summarize(lines);
  assert.equal(totals.purchases, 100);
  assert.equal(totals.vatDeductible, 16);
  assert.equal(totals.vatDue, -16);
  assert.equal(totals.payable, 0);
});

test('dépenses : résultat et caisse diminués', () => {
  const lines = buildJournal({
    sales: [sale()],
    expenses: [{ label: 'Transport', amount: 20, paid_at: '2026-11-12' }],
    vat: { enabled: false, rate: 0 }
  });
  const totals = summarize(lines);
  assert.equal(totals.expenses, 20);
  assert.equal(totals.result, 96);
  assert.equal(totals.cash, 96);
  assert.equal(journalTotals(lines).difference, 0);
});

test('retours et avoirs : le chiffre d’affaires et la TVA sont annulés', () => {
  const lines = buildJournal({
    sales: [sale()],
    returns: [{ total_usd: 58, date: '2026-11-13' }],
    creditNotes: [{ total_usd: 58, date: '2026-11-14' }],
    vat: { enabled: true, rate: 16 }
  });
  const totals = summarize(lines);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.vatCollected, 0);
  assert.equal(totals.result, 0);
  assert.equal(journalTotals(lines).difference, 0);
});

test('retour avec avoir automatique : une seule annulation (vente comptant)', () => {
  const lines = buildJournal({
    sales: [sale()],
    returns: [{ sale_id: 's1', total_usd: 116, returned_on: '2026-11-12' }],
    creditNotes: [{ sale_id: 's1', total_usd: 116, issued_on: '2026-11-12', note: 'Retour RET-0001. ' }],
    vat: { enabled: true, rate: 16 }
  });
  const totals = summarize(lines);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.vatCollected, 0);
  assert.equal(totals.cash, 0);
  assert.equal(totals.receivable, 0);
  assert.equal(journalTotals(lines).difference, 0);
});

test('retour avec avoir automatique : une seule annulation (vente à crédit)', () => {
  const lines = buildJournal({
    sales: [sale({ payment: 'credit' })],
    returns: [{ sale_id: 's1', total_usd: 116, returned_on: '2026-11-12' }],
    creditNotes: [{ sale_id: 's1', total_usd: 116, issued_on: '2026-11-12', note: 'Retour RET-0001. ' }],
    vat: { enabled: true, rate: 16 }
  });
  const totals = summarize(lines);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.receivable, 0);
  assert.equal(totals.cash, 0);
  assert.equal(journalTotals(lines).difference, 0);
});

test('retour sans avoir sur vente comptant : la caisse est créditée, pas la créance', () => {
  const lines = buildJournal({
    sales: [sale()],
    returns: [{ sale_id: 's1', total_usd: 116, returned_on: '2026-11-12' }],
    vat: { enabled: false, rate: 0 }
  });
  const totals = summarize(lines);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.cash, 0);
  assert.equal(totals.receivable, 0);
  assert.ok(account(lines, '571').some(line => line.credit === 116));
});

test('retour et avoir manuel distincts : les deux annulations sont comptées', () => {
  const lines = buildJournal({
    sales: [sale()],
    returns: [{ sale_id: 's1', total_usd: 58, returned_on: '2026-11-12' }],
    creditNotes: [{ sale_id: 's1', total_usd: 58, issued_on: '2026-11-13', note: 'Correction de prix' }],
    vat: { enabled: true, rate: 16 }
  });
  const totals = summarize(lines);
  assert.equal(totals.revenue, 0);
  assert.equal(journalTotals(lines).difference, 0);
});

test('acompte imputé sur une vente comptant : pas de double encaissement', () => {
  const lines = buildJournal({
    sales: [sale()],
    salePayments: [{ sale_id: 's1', amount: 50, paid_at: '2026-11-10', kind: 'advance', sales: { number: 'F-001' } }],
    vat: { enabled: false, rate: 0 }
  });
  const totals = summarize(lines);
  assert.equal(totals.cash, 116);
  assert.equal(totals.revenue, 116);
});

test('encaissement d’une vente à crédit : toujours compté en caisse', () => {
  const lines = buildJournal({
    sales: [sale({ payment: 'credit' })],
    salePayments: [{ sale_id: 's1', amount: 116, paid_at: '2026-11-20', kind: 'payment', sales: { number: 'F-001' } }],
    vat: { enabled: false, rate: 0 }
  });
  const totals = summarize(lines);
  assert.equal(totals.cash, 116);
  assert.equal(totals.receivable, 0);
});

test('TVA historisée : une vente garde le taux de sa date, pas le taux courant', () => {
  const stored = sale({ vat_rate: 10 });
  const lines = buildJournal({ sales: [stored], vat: { enabled: true, rate: 16 } });
  assert.equal(account(lines, '701')[0].credit, 105.45);
  assert.equal(account(lines, '443')[0].credit, 10.55);
  // Une vente enregistrée TVA désactivée le reste, même si la TVA est réactivée depuis.
  const noVat = sale({ id: 's2', number: 'F-002', vat_rate: 0 });
  const later = buildJournal({ sales: [noVat], vat: { enabled: true, rate: 16 } });
  assert.equal(account(later, '701')[0].credit, 116);
  assert.equal(account(later, '443').length, 0);
});

test('TVA historisée : un achat garde le taux de sa date', () => {
  const lines = buildJournal({
    purchases: [purchase({ vat_rate: 20 })],
    vat: { enabled: false, rate: 0 }
  });
  assert.equal(account(lines, '607')[0].debit, 96.67);
  assert.equal(account(lines, '445')[0].debit, 19.33);
  assert.equal(account(lines, '401')[0].credit, 116);
});

test('TVA historisée : retour et avoir reprennent le taux de la vente d’origine', () => {
  const lines = buildJournal({
    sales: [sale({ vat_rate: 16 })],
    returns: [{ id: 'r1', sale_id: 's1', total_usd: 58, returned_on: '2026-11-12' }],
    creditNotes: [{ id: 'c1', sale_id: 's1', total_usd: 58, issued_on: '2026-11-13', note: 'Correction' }],
    vat: { enabled: false, rate: 0 }
  });
  const totals = summarize(lines);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.vatCollected, 0);
  assert.ok(account(lines, '443').some(line => line.debit === 8));
});

test('retour lié à son avoir par return_id : une seule annulation, sans note « Retour »', () => {
  const lines = buildJournal({
    sales: [sale()],
    returns: [{ id: 'r1', sale_id: 's1', total_usd: 116, returned_on: '2026-11-12' }],
    creditNotes: [{ id: 'c1', sale_id: 's1', return_id: 'r1', total_usd: 116, issued_on: '2026-11-12', note: 'Avoir sur retour' }],
    vat: { enabled: true, rate: 16 }
  });
  const totals = summarize(lines);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.vatCollected, 0);
  assert.equal(totals.cash, 0);
  assert.equal(journalTotals(lines).difference, 0);
});

test('balance : chaque compte est agrégé avec un solde signé', () => {
  const lines = buildJournal({ sales: [sale()], purchases: [purchase()], vat: { enabled: true, rate: 16 } });
  const balance = buildBalance(lines);
  const cash = balance.find(row => row.account === '571');
  assert.equal(cash.debit, 116);
  assert.equal(cash.credit, 0);
  assert.equal(cash.balance, 116);
  assert.equal(balance.find(row => row.account === '401').balance, -116);
  assert.equal(balance.find(row => row.account === '701').balance, -100);
  assert.ok(balance.every(row => row.account in ACCOUNTS));
  assert.ok(balance.some(row => row.account === '443'));
  assert.ok(balance.some(row => row.account === '445'));
});

test('comptabilité : incluse dans Standard et Premium, pas dans Basique', () => {
  setPlan('basique');
  assert.equal(planAllows('comptabilite'), false);
  assert.equal(routeAllowed('comptabilite'), false);
  setPlan('standard');
  assert.equal(planAllows('comptabilite'), true);
  assert.equal(routeAllowed('comptabilite'), true);
  setPlan('premium');
  assert.equal(planAllows('comptabilite'), true);
  assert.equal(routeAllowed('comptabilite'), true);
  setPlan('standard');
});
