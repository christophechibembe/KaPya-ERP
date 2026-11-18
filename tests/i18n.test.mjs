// Traduction anglaise : dictionnaire sain et page de connexion entièrement couverte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clesDictionnaire, candidat, rapport } from '../scripts/audit-i18n.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'js', 'i18n.js'), 'utf8');

const entrees = [...source.slice(source.indexOf('const EN = {'), source.indexOf('\n};', source.indexOf('const EN = {')))
  .matchAll(/'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)]
  .map(m => [m[1].replace(/\\'/g, "'"), m[2].replace(/\\'/g, "'")]);

test('le dictionnaire ne contient ni clé dupliquée ni traduction vide', () => {
  const cles = clesDictionnaire(source);
  assert.ok(cles.length >= 140, `au moins 140 entrées attendues, ${cles.length} trouvées`);
  assert.equal(new Set(cles).size, cles.length, 'clé présente deux fois dans le dictionnaire');
  const vides = entrees.filter(([, valeur]) => !valeur.trim());
  assert.deepEqual(vides, [], 'traduction vide');
});

test('la page de connexion est entièrement traduite', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const sansCode = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const textes = new Set();
  for (const m of sansCode.matchAll(/>([^<>]+)</g)) if (candidat(m[1])) textes.add(m[1].replace(/\s+/g, ' ').trim());
  for (const m of sansCode.matchAll(/(?:placeholder|aria-label|title)="([^"]+)"/g)) if (candidat(m[1])) textes.add(m[1].trim());
  // Le nom de la marque et le numéro de version ne se traduisent pas.
  const exceptes = new Set(['KaPya ERP', '© KaPya Digital']);
  const manquants = [...textes].filter(t => !clesDictionnaire(source).includes(t) && !exceptes.has(t) && !/^Version \d/.test(t));
  assert.deepEqual(manquants, [], 'textes non traduits sur la page de connexion');
});

test('la couverture de la traduction ne régresse pas', async () => {
  const { pourcentage } = await rapport();
  assert.ok(pourcentage >= 12, `couverture attendue au moins 12 %, obtenue ${pourcentage.toFixed(1)} %`);
});
