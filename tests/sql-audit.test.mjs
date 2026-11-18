// Garde-fous sur le SQL versionné : versions de migration uniques, RLS par table,
// fonctions SECURITY DEFINER durcies, et références de scripts réellement présentes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditer } from '../scripts/auditer-sql.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('les migrations ont des versions uniques et un nom conforme', async () => {
  const a = await auditer(root);
  assert.deepEqual(a.collisions, [], 'deux migrations ne doivent pas partager la même version');
  assert.deepEqual(a.nommageMigrations, [], 'les migrations suivent AAAAJJJHHMMSS_nom.sql');
});

test('chaque table du SQL versionné est protégée par RLS', async () => {
  const a = await auditer(root);
  assert.deepEqual(a.sansRls, [], 'toute table doit activer row level security');
  assert.deepEqual(a.sansPolitique, [], 'toute table avec RLS doit avoir une politique, ou être fermée volontairement');
});

test('les fonctions SECURITY DEFINER fixent search_path et ne sont pas ouvertes à anon', async () => {
  const a = await auditer(root);
  assert.deepEqual(a.definerSansSearchPath, [], 'une fonction SECURITY DEFINER doit fixer search_path');
  assert.deepEqual(a.definerAnon, [], 'une fonction SECURITY DEFINER ne doit pas être exécutable par anon');
});

test('chaque script sql cité dans la documentation existe', async () => {
  const documents = ['README.md', 'sql/README.md', 'docs/USER_GUIDE.md', 'docs/INSTALLATION_AND_DEPLOYMENT.md'];
  const manquants = [];
  for (const doc of documents) {
    let texte;
    try { texte = await readFile(path.join(root, doc), 'utf8'); } catch { continue; }
    for (const [, reference] of texte.matchAll(/(?<![\w/])(sql\/[a-z0-9_-]+\.sql)/g)) {
      try { await stat(path.join(root, reference)); } catch { manquants.push(`${doc} → ${reference}`); }
    }
  }
  assert.deepEqual([...new Set(manquants)], [], 'un script cité doit exister dans sql/');
});

test('les migrations sont toutes non vides et lisibles', async () => {
  const dossier = path.join(root, 'supabase', 'migrations');
  const fichiers = (await readdir(dossier)).filter(f => f.endsWith('.sql'));
  assert.ok(fichiers.length > 0, 'le dossier de migrations contient des fichiers');
  for (const fichier of fichiers) {
    const contenu = await readFile(path.join(dossier, fichier), 'utf8');
    assert.ok(contenu.trim().length > 0, `${fichier} ne doit pas être vide`);
  }
});
