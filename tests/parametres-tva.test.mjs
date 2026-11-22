// TVA : réglable depuis les deux pages Paramètres (équipe et standard), par l'administrateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/modules/parametres.js', import.meta.url), 'utf8');

test('la TVA est proposée sur les deux pages Paramètres (équipe et standard)', () => {
  const cards = source.match(/\$\{section\('TVA', vatCard\(ctx\)\)\}/g) || [];
  const binds = source.match(/bindVat\(main\);/g) || [];
  assert.equal(cards.length, 2, 'la section TVA doit apparaître dans render() et renderTeam()');
  assert.equal(binds.length, 2, 'le réglage TVA doit être relié dans les deux cas');
});

test('la TVA reste réservée à l’administrateur', () => {
  assert.match(source, /function vatCard\(ctx\) \{\s*if \(ctx\?\.role !== 'admin'\) return '';/);
});

test('le réglage TVA est enregistré en base et sur l’appareil', async () => {
  const vat = await readFile(new URL('../js/vat.js', import.meta.url), 'utf8');
  assert.match(vat, /db\.rpc\('set_vat', \{ p_on: enabled, p_rate: rate \}\)/);
  assert.match(vat, /localStorage\.setItem\(K, JSON\.stringify\(\{ enabled, rate \}\)\)/);
});
