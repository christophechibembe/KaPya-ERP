// La date métier envoyée au serveur doit être la date locale, jamais la date UTC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay } from '../js/dates.js';

test('localDay formate une date locale en AAAA-MM-JJ', () => {
  assert.equal(localDay(new Date(2026, 10, 7, 9, 30)), '2026-11-07');
  assert.equal(localDay(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
  assert.equal(localDay(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('localDay utilise le jour local, pas le jour UTC', () => {
  // 23 h 30 UTC le 16 = 00 h 30 le 17 à Paris ; la vente doit compter le 17.
  const late = new Date('2026-11-16T23:30:00Z');
  const pad = value => String(value).padStart(2, '0');
  const expected = `${late.getFullYear()}-${pad(late.getMonth() + 1)}-${pad(late.getDate())}`;
  assert.equal(localDay(late), expected);
  if (late.getTimezoneOffset() < 0) assert.equal(localDay(late), '2026-11-17');
});
