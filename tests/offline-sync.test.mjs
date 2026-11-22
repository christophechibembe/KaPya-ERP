// Hors-ligne : rythme de reprise, résumé pour l'écran et interrogation de la copie locale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDelay, syncDecision, formatAge, offlineSummary, SYNC_INTERVAL_MS, BACKOFF_MAX_MS } from '../js/offline.js';
import { localSelect } from '../js/offline-query.mjs';

test('reprise : le délai double à chaque échec puis plafonne', () => {
  assert.equal(retryDelay(0), 15000);
  assert.equal(retryDelay(1), 30000);
  assert.equal(retryDelay(2), 60000);
  assert.equal(retryDelay(3), 120000);
  assert.equal(retryDelay(20), BACKOFF_MAX_MS);
  assert.equal(retryDelay(-4), 15000);
});

test('décision : jamais hors ligne, immédiate sans attente, puis backoff', () => {
  assert.deepEqual(syncDecision({ online: false }), { run: false, reason: 'offline' });

  const first = syncDecision({ online: true, pending: 2, lastAttempt: 0 });
  assert.equal(first.run, true);
  assert.equal(first.reason, 'pending');

  const backoff = syncDecision({ online: true, pending: 2, lastAttempt: 1000, attempts: 2, now: 1000 + 30000 });
  assert.equal(backoff.run, false);
  assert.equal(backoff.reason, 'backoff');
  assert.equal(backoff.retryIn, 30000);

  const ready = syncDecision({ online: true, pending: 2, lastAttempt: 1000, attempts: 2, now: 1000 + 60000 });
  assert.equal(ready.run, true);
});

test('décision : rafraîchissement périodique seulement quand la file est vide', () => {
  const now = 10_000_000;
  assert.equal(syncDecision({ online: true, lastSync: 0, now }).reason, 'periodic');
  assert.equal(syncDecision({ online: true, lastSync: now - 1000, now }).reason, 'idle');
  assert.equal(syncDecision({ online: true, lastSync: now - SYNC_INTERVAL_MS, now }).reason, 'periodic');
});

test('résumé : statut, libellés et âge de la copie locale', () => {
  const now = Date.UTC(2026, 10, 22, 12, 0, 0);
  const summary = offlineSummary({ online: false, pending: 3, rejected: 1, lastSync: now - 3600000, cacheCount: 12, cacheOldest: now - 7200000, cacheDays: 30, now });
  assert.equal(summary.status, 'rejected');
  assert.equal(summary.pending, 3);
  assert.equal(summary.rejected, 1);
  assert.equal(summary.cacheCount, 12);
  assert.equal(summary.cacheDays, 30);
  assert.equal(summary.cacheAgeLabel, 'il y a 2 h');
  assert.match(summary.lastSyncLabel, /\d{2}\/\d{2}/);
  assert.equal(offlineSummary({ online: true, now }).status, 'synced');
  assert.equal(offlineSummary({ online: true, pending: 1, now }).status, 'pending');
  assert.equal(offlineSummary({ online: false, now }).status, 'offline');
});

test('âge lisible : minutes, heures et jours', () => {
  assert.equal(formatAge(30000), 'à l’instant');
  assert.equal(formatAge(5 * 60000), 'il y a 5 min');
  assert.equal(formatAge(3 * 3600000), 'il y a 3 h');
  assert.equal(formatAge(2 * 86400000), 'il y a 2 j');
  assert.equal(formatAge(-1), '');
});

const payments = [
  { id: 'p2', amount: 50, paid_at: '2026-11-20', kind: 'payment', sales: { number: 'F-2' } },
  { id: 'p1', amount: 116, paid_at: '2026-11-10', kind: 'payment', sales: { number: 'F-1' } },
  { id: 'p3', amount: 20, paid_at: '2026-10-31', kind: 'initial', sales: { number: 'F-0' } }
];

test('copie locale : filtres de date, tri et relations conservées', () => {
  const rows = localSelect('/rest/v1/sale_payments?select=id,amount,paid_at,sales(number)&paid_at=gte.2026-11-01&paid_at=lte.2026-11-30&order=paid_at.asc', payments);
  assert.deepEqual(rows.map(row => row.id), ['p1', 'p2']);
  assert.deepEqual(rows[0], { id: 'p1', amount: 116, paid_at: '2026-11-10', sales: { number: 'F-1' } });
});

test('copie locale : égalité, limites et projection complète', () => {
  assert.deepEqual(localSelect('/rest/v1/sale_payments?select=*&kind=eq.initial', payments).map(row => row.id), ['p3']);
  assert.deepEqual(localSelect('/rest/v1/sale_payments?select=id&order=paid_at.desc&limit=2', payments).map(row => row.id), ['p2', 'p1']);
  assert.deepEqual(localSelect('/rest/v1/sale_payments?select=id,amount&id=eq.p2', payments), [{ id: 'p2', amount: 50 }]);
});

test('copie locale : une requête non simulable renvoie undefined', () => {
  assert.equal(localSelect('/rest/v1/sale_payments?select=id&sales.number=eq.F-1', payments), undefined);
  assert.equal(localSelect('/rest/v1/sale_payments?select=id&paid_at=is.null', payments), undefined);
  assert.equal(localSelect('/rest/v1/sale_payments?select=id&offset=2', payments), undefined);
  assert.equal(localSelect('/rest/v1/sale_payments?select=id&order=sales.number.asc', payments), undefined);
});
