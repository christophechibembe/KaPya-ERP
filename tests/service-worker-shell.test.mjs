import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MODULE = /\.m?js$/;

// Tous les modules JavaScript de l'application, y compris ceux chargés à la demande.
async function modulesIn(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await modulesIn(relative));
    else if (MODULE.test(entry.name)) files.push(relative);
  }
  return files;
}

// Imports statiques, ré-exports, imports à effet de bord et imports dynamiques littéraux.
function importedPaths(source) {
  return [
    ...source.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s+['"](\.{1,2}\/[^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)
  ].map(match => match[1]);
}

async function shellOf() {
  const serviceWorker = await readFile(path.join(root, 'sw.js'), 'utf8');
  const match = serviceWorker.match(/const SHELL = \[(.*?)\];/s);
  assert.ok(match, 'la liste de préchargement SHELL existe');
  return new Set([...match[1].matchAll(/['"](\.\/[^'"]+)['"]/g)].map(hit => hit[1]));
}

test('le cache hors ligne contient tous les modules JavaScript de l’application', async () => {
  const cached = await shellOf();
  const modules = await modulesIn('js');
  assert.ok(modules.length > 0);
  for (const module of modules) {
    assert.ok(cached.has(`./${module}`), `${module} doit être préchargé pour l’ouverture hors ligne`);
  }
});

test('chaque import atteignable par l’application existe et est préchargé', async () => {
  const cached = await shellOf();
  const index = await readFile(path.join(root, 'index.html'), 'utf8');
  const pending = ['js/app.js',
    ...[...index.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(match => match[1])];
  const visited = new Set();

  while (pending.length) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    visited.add(relative);
    assert.ok(cached.has(`./${relative}`), `${relative} doit être préchargé pour l’ouverture hors ligne`);
    const source = await readFile(path.join(root, relative), 'utf8');
    for (const specifier of importedPaths(source)) {
      const imported = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      if (MODULE.test(imported)) pending.push(imported);
    }
  }

  // Ces modules ne sont atteignables que par un import dynamique ou depuis un écran :
  // le parcours doit malgré tout les avoir rencontrés.
  for (const relative of ['js/offline-pending.mjs', 'js/notif-centre.js', 'js/thermal-usb.js', 'js/dates.js']) {
    assert.ok(visited.has(relative), `${relative} doit être atteignable depuis l’application`);
  }
});
