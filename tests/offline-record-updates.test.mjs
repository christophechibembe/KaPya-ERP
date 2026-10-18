import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCachedRecordUpdate, restoreCachedRecord, setCachedRecordPending } from '../js/modules/offline-record-updates.mjs';

test('applique une modification optimiste sans effacer les relations déjà en cache', () => {
  const rows = [{ id: 'a1', name: 'Ancien', stock: 4, suppliers: { name: 'Fournisseur' } }, { id: 'a2', name: 'Autre' }];
  assert.equal(applyCachedRecordUpdate(rows, { id: 'a1', name: 'Nouveau' }), true);
  assert.deepEqual(rows[0], { id: 'a1', name: 'Nouveau', stock: 4, suppliers: { name: 'Fournisseur' }, _offline_pending: true });
  assert.equal(rows[1].name, 'Autre');
});

test('restaure la fiche précédente après un refus de synchronisation', () => {
  const rows = [{ id: 'a1', name: 'Modifié', extra: true, _offline_pending: true }];
  const previous = { id: 'a1', name: 'Original' };
  assert.equal(restoreCachedRecord(rows, 'a1', previous), true);
  assert.deepEqual(rows[0], previous);
  assert.notEqual(rows[0], previous);
});

test('garde le badge tant qu’une autre modification attend, puis le retire', () => {
  const rows = [{ id: 'a1', name: 'Produit', _offline_pending: true }];
  assert.equal(setCachedRecordPending(rows, 'a1', true), false);
  assert.equal(setCachedRecordPending(rows, 'a1', false), true);
  assert.equal('_offline_pending' in rows[0], false);
});
