import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappNumber, whatsappLink, customerCredits, creditReminder } from '../js/credit-reminder.mjs';
test('rappels : numéro international normalisé et entrées invalides refusées', () => {
  assert.equal(whatsappNumber('+243 999 123 456'), '243999123456');
  assert.equal(whatsappNumber('00243 999 123 456'), '243999123456');
  for (const phone of ['0999123456', '123', 'javascript:alert(1)', '+1234567890123456', '']) assert.equal(whatsappNumber(phone), '');
  assert.equal(whatsappLink('', 'test'), '');
  assert.equal(whatsappLink('+243999123456', ' '), '');
  assert.match(whatsappLink('+243999123456', 'Bonjour & merci'), /text=Bonjour%20%26%20merci$/);
});
test('rappels : deux clients homonymes ne partagent jamais leur solde', () => {
  const all = [
    { id: 'v1', customer_id: 'c1', customer: 'Amani', balance: 10, number: 'FAC-1', sold_at: '2026-11-20' },
    { id: 'v2', customer_id: 'c2', customer: 'Amani', balance: 200, number: 'FAC-2' },
    { id: 'v3', customer_id: 'c1', customer: 'Amani', balance: 5, number: 'FAC-3' },
    { id: 'v4', customer_id: 'c1', customer: 'Amani', balance: 0, number: 'FAC-4' }
  ];
  assert.equal(customerCredits(all[0], all).length, 2);
  const text = creditReminder(all[0], all, 'Commerce', 2300);
  assert.match(text, /15,00 \$/); assert.match(text, /FAC-1/); assert.match(text, /FAC-3/);
  assert.doesNotMatch(text, /FAC-2|FAC-4|200,00/);
});
test('rappels : sans identifiant client on ne regroupe pas les clients de passage', () => {
  const a = { id: '1', customer: 'Client comptoir', balance: 10 };
  assert.deepEqual(customerCredits(a, [a, { id: '2', customer: 'Client comptoir', balance: 20 }]), [a]);
});
