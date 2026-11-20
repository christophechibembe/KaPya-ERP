import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { decodeKey, encryptBackup, decryptBackup } from '../scripts/crypto-sauvegarde.mjs';
import { oldBackupArtifacts } from '../scripts/rotation-sauvegardes-cloud.mjs';
test('sauvegarde : format historique KAPYA1, authentification AES-256-GCM et clé inchangée', () => {
  const key = decodeKey(crypto.randomBytes(32).toString('base64'));
  const content = Buffer.from('CREATE TABLE public.exemple(id uuid);\n-- PostgreSQL database dump complete');
  const encrypted = encryptBackup(content, key);
  assert.equal(encrypted.subarray(0, 6).toString(), 'KAPYA1');
  assert.equal(encrypted.length, content.length + 34);
  assert.deepEqual(decryptBackup(encrypted, key), content);
  assert.notDeepEqual(encryptBackup(content, key), encrypted);
  const damaged = Buffer.from(encrypted); damaged[damaged.length - 1] ^= 1;
  assert.throws(() => decryptBackup(damaged, key));
  assert.throws(() => decryptBackup(encrypted, crypto.randomBytes(32)));
  for (const invalid of ['', 'secret', 'a'.repeat(44), crypto.randomBytes(16).toString('base64')]) assert.throws(() => decodeKey(invalid));
});
test('sauvegarde cloud : pas de secrets dans le workflow, seulement les copies chiffrées publiées', async () => {
  const workflow = await readFile(new URL('../.github/workflows/sauvegarde.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '17 2 \* \* 0'/);
  assert.match(workflow, /retention-days: 56/);
  assert.match(workflow, /kapya-chiffre\/\*\.sql\.enc/);
  assert.doesNotMatch(workflow, /kapya-clair\/\*|sbp_|postgresql:\/\/|https:\/\/hooks/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /verifier-copie-chiffree/);
  // Le contexte `runner` n'existe qu'à l'intérieur d'une étape : au niveau du job
  // il rend le fichier invalide et la sauvegarde planifiée ne démarre jamais.
  const jobEnv = workflow.match(/^ {4}env:\n((?: {6}.*\n)+)/m)?.[1] || '';
  assert.doesNotMatch(jobEnv, /runner\./);
});
test('rotation cloud : huit sauvegardes, aucun artefact étranger ni archive supprimé', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `kapya-sauvegarde-${i + 1}`, created_at: `2026-11-${String(i + 1).padStart(2, '0')}`, expired: false }));
  const foreign = [{ id: 100, name: 'kapya-archive-18nov', created_at: '2020-01-01' }, { id: 101, name: 'test-report', created_at: '2020-01-01' }];
  assert.deepEqual(oldBackupArtifacts([...rows, ...foreign]).map(a => a.id), [2, 1]);
  assert.equal(rows[0].id, 1);
  assert.throws(() => oldBackupArtifacts(rows, 0));
});
