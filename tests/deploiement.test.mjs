import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('publication Cloudflare : fichiers publics uniquement et entrée mobile identique', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/preparer-cloudflare.mjs'], { cwd: root });
  const { directory, files } = JSON.parse(stdout);
  try {
    assert.ok(files > 0);
    const html = await readFile(path.join(directory, 'index.html'), 'utf8');
    assert.equal(await readFile(path.join(directory, 'app', 'index.html'), 'utf8'), html);
    // La version affichée même sans JavaScript est réécrite depuis js/version.js à la préparation.
    const version = (await readFile(path.join(root, 'js', 'version.js'), 'utf8')).match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
    assert.ok(version, 'APP_VERSION introuvable');
    const safeVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(html, new RegExp(`id="splash-version">Version ${safeVersion}<`));
    assert.match(await readFile(path.join(directory, 'guide.html'), 'utf8'), new RegExp(`data-app-version>Version ${safeVersion}<`));
    assert.match(await readFile(path.join(directory, 'confidentialite.html'), 'utf8'), /Confidentialité et conditions d'utilisation/);
    assert.match(await readFile(path.join(directory, 'guide.html'), 'utf8'), /id="s14"/);
    for (const internal of ['tests', 'scripts', 'package.json', 'netlify.toml', '.env']) {
      await assert.rejects(access(path.join(directory, internal)), { code: 'ENOENT' });
    }
    assert.match(await readFile(path.join(directory, 'js', 'config.js'), 'utf8'), /demo:\s*false/);
    assert.match(await readFile(path.join(directory, '_redirects'), 'utf8'), /\/app\/js\/\* \/js\/:splat 200/);
  } finally {
    // Uniquement le dossier isolé créé par cette exécution.
    await rm(directory, { recursive: true, force: true });
  }
});
