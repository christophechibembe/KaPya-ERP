// Les politiques RLS de production doivent toutes être versionnées, une seule fois.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraire, lireVersionne } from '../scripts/auditer-politiques.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exporte = await readFile(path.join(root, 'sql', 'exports', '2026-11-18', '03-politiques.sql'), 'utf8');
const production = extraire(exporte);
const complement = extraire(await readFile(path.join(root, 'sql', 'politiques-production.sql'), 'utf8'));
const versionne = await lireVersionne();
const schema = await readFile(path.join(root, 'sql', 'schema-production.sql'), 'utf8');
const tables = new Set([...schema.matchAll(/^create table public\.(\w+) \(/gim)].map(m => m[1].toLowerCase()));

const cle = p => `${p.table.toLowerCase()}|${p.nom.toLowerCase()}`;

test('l’export de production est lisible et complet', () => {
  assert.ok(production.length >= 110, `au moins 110 politiques attendues, ${production.length} trouvées`);
  const malFormees = production.filter(p => !p.nom || !p.table || !p.cmd || /\{|\}/.test(p.roles));
  assert.deepEqual(malFormees.map(p => p.nom), [], 'politiques mal analysées (rôles ou noms)');
});

test('chaque politique de production est versionnée une seule fois', () => {
  const doublons = new Set();
  const vues = new Set();
  for (const p of complement) {
    if (vues.has(cle(p))) doublons.add(cle(p));
    vues.add(cle(p));
  }
  assert.deepEqual([...doublons].sort(), [], 'politique définie deux fois dans sql/politiques-production.sql');

  const manquantes = production.filter(p => !versionne.has(cle(p)) && !vues.has(cle(p))).map(cle);
  assert.deepEqual(manquantes.sort(), [], 'politiques de production absentes du SQL versionné');
});

test('chaque politique complémentaire vise une table du schéma de référence', () => {
  assert.ok(complement.length >= 40, `au moins 40 politiques complémentaires attendues, ${complement.length} trouvées`);
  const inconnues = complement.filter(p => !tables.has(p.table.toLowerCase())).map(cle);
  assert.deepEqual([...new Set(inconnues)].sort(), [], 'politiques sur des tables absentes du schéma');
});

test('chaque politique complémentaire est rejouable', async () => {
  const contenu = await readFile(path.join(root, 'sql', 'politiques-production.sql'), 'utf8');
  const suppressions = (contenu.match(/^drop policy if exists /gim) || []).length;
  const creations = (contenu.match(/^create policy /gim) || []).length;
  assert.equal(suppressions, creations, 'chaque bloc doit commencer par drop policy if exists');
  assert.equal(creations, complement.length, 'une création par politique complémentaire');
});
