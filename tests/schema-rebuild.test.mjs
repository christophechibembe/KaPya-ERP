// sql/schema-production.sql sert de base de reconstruction pour un projet de test.
// Ce test vérifie les propriétés qui rendent le fichier exécutable dans l'ordre :
// dépendances créées avant usage, RLS sur chaque table, objets référencés existants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = await readFile(path.join(root, 'sql', 'schema-production.sql'), 'utf8');

const tables = new Set([...sql.matchAll(/^create table public\.(\w+) \(/gim)].map(m => m[1].toLowerCase()));
const fonctions = new Set([...sql.matchAll(/^create or replace function public\.(\w+)\(/gim)].map(m => m[1].toLowerCase()));
const vuesSysteme = new Set(['auth', 'storage', 'extensions', 'cron', 'net', 'vault', 'graphql', 'realtime', 'supabase_migrations']);

test('le fichier décrit tout le schéma attendu', () => {
  assert.ok(tables.size >= 66, `au moins 66 tables attendues, ${tables.size} trouvées`);
  assert.ok(fonctions.size >= 122, `au moins 122 fonctions attendues, ${fonctions.size} trouvées`);
  assert.match(sql, /^set check_function_bodies = false;/m, 'les corps de fonctions doivent être créés sans validation croisée');
});

test('les fonctions sont créées avant les valeurs par défaut qui les appellent', () => {
  const premierDefaut = sql.search(/^alter table public\.\w+ alter column \w+ set default /m);
  assert.ok(premierDefaut > 0, 'des valeurs par défaut doivent être posées après les fonctions');
  const finFonctions = sql.lastIndexOf('create or replace function public.');
  assert.ok(finFonctions < premierDefaut, 'une fonction est créée après les valeurs par défaut qui l’utilisent');
});

test('chaque clé étrangère pointe vers une table créée dans le fichier', () => {
  const manquantes = new Set();
  for (const m of sql.matchAll(/^alter table public\.\w+ add constraint \w+ foreign key \(([^)]+)\) references ([\w."]+)/gim)) {
    const [schema, table] = m[2].includes('.') ? m[2].split('.') : ['public', m[2]];
    const cible = table.replace(/"/g, '').toLowerCase();
    if (schema !== 'public' && vuesSysteme.has(schema)) continue;
    if (!tables.has(cible)) manquantes.add(`${schema}.${cible}`);
  }
  assert.deepEqual([...manquantes].sort(), [], 'clés étrangères vers des tables absentes du fichier');
});

test('chaque table active RLS et chaque politique vise une table existante', () => {
  const sansRls = [...tables].filter(t => !new RegExp(`^alter table public\\.${t} enable row level security;`, 'm').test(sql));
  assert.deepEqual(sansRls, [], 'tables sans activation de RLS');

  const politiques = [...sql.matchAll(/^create policy (?:"([^"]+)"|(\w+)) on public\.(\w+)/gim)];
  assert.ok(politiques.length >= 100, `au moins 100 politiques attendues, ${politiques.length} trouvées`);
  const orphelines = politiques.map(p => p[3].toLowerCase()).filter(t => !tables.has(t));
  assert.deepEqual([...new Set(orphelines)].sort(), [], 'politiques sur des tables absentes');
});

test('chaque trigger appelle une fonction du fichier', () => {
  const appels = [...sql.matchAll(/^create trigger \w+ [\s\S]{0,400}?execute function (?:public\.)?(\w+)\(\)/gim)].map(m => m[1].toLowerCase());
  assert.ok(appels.length >= 40, `au moins 40 triggers attendus, ${appels.length} trouvés`);
  const inconnues = [...new Set(appels)].filter(f => !fonctions.has(f));
  assert.deepEqual(inconnues.sort(), [], 'triggers appelant une fonction absente du fichier');
});

test('aucune fonction SECURITY DEFINER sans search_path', () => {
  const blocs = sql.split(/^-- fonction /m).slice(1);
  const sansSearchPath = blocs
    .filter(b => /security definer/i.test(b.slice(0, 500)) && !/set search_path\s*(?:=|to)\s*\S/i.test(b.slice(0, 500)))
    .map(b => b.slice(0, b.indexOf('(')).trim());
  assert.deepEqual(sansSearchPath, [], 'fonctions SECURITY DEFINER sans search_path');
});
