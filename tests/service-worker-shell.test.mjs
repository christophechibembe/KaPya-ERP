import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('le cache hors ligne contient tous les modules importés au démarrage', async () => {
  const serviceWorker = await readFile(path.join(root, 'sw.js'), 'utf8');
  const shellMatch = serviceWorker.match(/const SHELL = \[(.*?)\];/s);
  assert.ok(shellMatch, 'la liste de préchargement SHELL existe');
  const cached = new Set([...shellMatch[1].matchAll(/['"](\.\/[^'"]+)['"]/g)].map(match => match[1]));
  const visited = new Set();
  const pending = ['js/app.js'];

  while (pending.length) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    visited.add(relative);
    const source = await readFile(path.join(root, relative), 'utf8');
    for (const [, specifier] of source.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const imported = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      if (!/\.m?js$/.test(imported)) continue;
      assert.ok(cached.has(`./${imported}`), `${imported} doit être préchargé pour l'ouverture hors ligne`);
      pending.push(imported);
    }
  }
});
