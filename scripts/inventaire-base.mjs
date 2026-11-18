// Inventaire de la base : liste les tables et RPC réellement utilisés par le code.
// Ce fichier ne remplace pas le schéma SQL : il sert de contrôle pour repérer ce qui
// doit être exporté depuis Supabase et versionné dans sql/.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'js');
const outFile = path.join(root, 'sql', 'SCHEMA.md');

async function listSources(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listSources(full));
    else if (/\.(?:js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const tables = new Map();
const rpcs = new Map();
const scripts = new Map();

function remember(map, name, file) {
  if (!map.has(name)) map.set(name, new Set());
  map.get(name).add(path.relative(root, file).replace(/\\/g, '/'));
}

for (const file of await listSources(sourceDir)) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:db|api)\.(?:select|insert|update|upsert|remove|delete)\(\s*'([a-z0-9_]+)'/g)) remember(tables, match[1], file);
  for (const match of source.matchAll(/(?:db|api)\.rpc\(\s*'([a-z0-9_]+)'/g)) remember(rpcs, match[1], file);
  for (const match of source.matchAll(/\/rest\/v1\/([a-z0-9_]+)/g)) {
    if (match[1] !== 'rpc') remember(tables, match[1], file);
  }
  for (const match of source.matchAll(/\/rest\/v1\/rpc\/([a-z0-9_]+)/g)) remember(rpcs, match[1], file);
  for (const match of source.matchAll(/([a-z0-9][a-z0-9-]*\.sql)/g)) remember(scripts, match[1], file);
}

const sorted = map => [...map.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
const lines = (map, name) => sorted(map).map(key => `| \`${key}\` | ${[...map.get(key)].sort().join(', ')} |`).join('\n');

const markdown = `# Inventaire de la base KaPya

> Fichier généré par \`npm run inventaire\`. **Ce n'est pas le schéma SQL** : c'est la liste de ce
> que le code appelle. Le schéma réel (colonnes, types, index, RLS, RPC) doit être exporté depuis
> Supabase et versionné dans \`sql/\` (voir \`sql/README.md\`).

Généré depuis ${await listSources(sourceDir).then(f => f.length)} fichiers JavaScript.

## Tables utilisées (${tables.size})

| Table | Utilisée dans |
|---|---|
${lines(tables)}

## Fonctions RPC utilisées (${rpcs.size})

| Fonction | Utilisée dans |
|---|---|
${lines(rpcs)}

## Scripts SQL cités par le code (${scripts.size})

Ces fichiers sont mentionnés dans les messages d'erreur ou les commentaires, mais **absents du projet** :
ils doivent être récupérés depuis Supabase (ou réécrits) et versionnés dans \`sql/\`.

| Script | Cité dans |
|---|---|
${lines(scripts) || '| — | — |'}

## À faire pour compléter ce dossier

1. Exporter le schéma complet depuis Supabase (SQL Editor) : tables, contraintes, index, vues,
   fonctions, triggers, politiques RLS, planifications (\`pg_cron\`).
2. Enregistrer chaque export dans \`sql/\` avec un numéro d'ordre (ex. \`001-init.sql\`).
3. Vérifier qu'aucune table ni RPC listée ci-dessus ne manque.
4. Tester une restauration complète sur un projet Supabase vide.
`;

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, markdown, 'utf8');
console.log(JSON.stringify({ file: path.relative(root, outFile), tables: tables.size, rpcs: rpcs.size, scripts: scripts.size }));
