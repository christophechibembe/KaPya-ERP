// Le schéma de référence doit couvrir tout ce que le code appelle : tables et RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const schema = await readFile(path.join(root, 'sql', 'schema-production.sql'), 'utf8');
const tables = new Set([...schema.matchAll(/^create table public\.(\w+)/gim)].map(m => m[1].toLowerCase()));
const fonctions = new Set([...schema.matchAll(/^create or replace function public\.(\w+)/gim)].map(m => m[1].toLowerCase()));

// Écarts connus entre le code et la production, relevés le 18 novembre 2026.
// L'inventaire physique a une interface complète mais ni table ni RPC en production.
// Toute nouvelle entrée ici doit être justifiée : ce test doit sinon rester vert.
const TABLES_A_IMPLEMENTER = new Set(['inventories', 'inventory_lines']);
const RPC_A_IMPLEMENTER = new Set(['create_inventory', 'set_inventory_count', 'validate_inventory', 'set_barcode_enabled']);

async function fichiersJs(dossier) {
  const sortie = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) sortie.push(...await fichiersJs(chemin));
    else if (entree.name.endsWith('.js') || entree.name.endsWith('.mjs')) sortie.push(chemin);
  }
  return sortie;
}

const sources = await Promise.all((await fichiersJs(path.join(root, 'js'))).map(async f => ({ f, texte: await readFile(f, 'utf8') })));

test('le schéma de référence contient des tables et des fonctions', () => {
  assert.ok(tables.size >= 60, `au moins 60 tables attendues, ${tables.size} trouvées`);
  assert.ok(fonctions.size >= 100, `au moins 100 fonctions attendues, ${fonctions.size} trouvées`);
});

test('chaque table appelée par le code existe dans le schéma de référence', () => {
  const appelees = new Set();
  for (const { texte } of sources) {
    for (const m of texte.matchAll(/\b(?:select|insert|update|upsert|delete|remove)\(\s*'([a-z_][a-z0-9_]*)'/g)) appelees.add(m[1]);
  }
  const manquantes = [...appelees].filter(t => !tables.has(t) && !TABLES_A_IMPLEMENTER.has(t)).sort();
  assert.deepEqual(manquantes, [], 'tables utilisées par le code mais absentes du schéma de production');
  assert.ok(appelees.size > 20, `au moins 20 tables appelées attendues, ${appelees.size} trouvées`);
});

test('chaque RPC appelée par le code existe dans le schéma de référence', () => {
  const appelees = new Set();
  for (const { texte } of sources) {
    for (const m of texte.matchAll(/\.rpc\(\s*'([a-z_][a-z0-9_]*)'/g)) appelees.add(m[1]);
  }
  const manquantes = [...appelees].filter(f => !fonctions.has(f) && !RPC_A_IMPLEMENTER.has(f)).sort();
  assert.deepEqual(manquantes, [], 'RPC utilisées par le code mais absentes du schéma de production');
  assert.ok(appelees.size > 20, `au moins 20 RPC appelées attendues, ${appelees.size} trouvées`);
});
