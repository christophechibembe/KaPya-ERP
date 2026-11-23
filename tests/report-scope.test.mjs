import test from 'node:test';
import assert from 'node:assert/strict';
import { shopReturnFilter, shopCreditNoteSelect, shopCreditNoteFilter } from '../js/report-scope.mjs';

test('retours clients : la boutique choisie filtre sur warehouse_id', () => {
  assert.equal(shopReturnFilter('w1'), '&warehouse_id=eq.w1');
  assert.equal(shopReturnFilter(''), '');
});

test('avoirs : sans boutique, la requête reste exactement celle d’origine', () => {
  const select = 'select=sale_id,total_usd,issued_on';
  assert.equal(shopCreditNoteSelect(select, ''), select);
  assert.equal(shopCreditNoteSelect(select, ''), `${select}`);
  assert.equal(shopCreditNoteFilter(''), '');
});

test('avoirs : avec une boutique, la jointure interne et le filtre portent sur la vente', () => {
  const select = 'select=sale_id,total_usd,issued_on';
  assert.equal(shopCreditNoteSelect(select, 'w1'), `${select},sales!inner(warehouse_id)`);
  assert.equal(shopCreditNoteFilter('w1'), '&sales.warehouse_id=eq.w1');
});

test('les filtres produits sont concaténables dans une requête PostgREST', () => {
  const query = `${shopCreditNoteSelect('select=sale_id,total_usd', 'w1')}&issued_on=gte.2026-11-01${shopCreditNoteFilter('w1')}`;
  assert.equal(query, 'select=sale_id,total_usd,sales!inner(warehouse_id)&issued_on=gte.2026-11-01&sales.warehouse_id=eq.w1');
  assert.ok(!/[\s&]{2}/.test(query), 'aucun double séparateur');
});
