// Vérification avant téléversement : déchiffre en mémoire et compare au dump original.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodeKey, decryptBackup } from './crypto-sauvegarde.mjs';
const clearDir = process.env.KAPYA_SAUVEGARDES, encryptedDir = process.env.KAPYA_COPIE;
if (!clearDir || !encryptedDir) throw new Error('Dossiers de sauvegarde non configurés.');
const key = decodeKey(process.env.KAPYA_CLE);
const files = (await readdir(encryptedDir)).filter(file => /^kapya-\d{4}-\d{2}-\d{2}-(schema|donnees)\.sql\.enc$/.test(file)).sort();
if (files.length !== 2) throw new Error('Deux fichiers chiffrés exactement sont attendus.');
const manifest = [];
for (const file of files) {
  const content = await readFile(path.join(encryptedDir, file));
  const decrypted = decryptBackup(content, key);
  const original = await readFile(path.join(clearDir, file.slice(0, -4)));
  if (!decrypted.equals(original)) throw new Error('La copie chiffrée ne correspond pas au dump original.');
  manifest.push({ file, size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') });
}
await writeFile(path.join(encryptedDir, 'manifest.json'), JSON.stringify({ format: 'KAPYA1', verified_at: new Date().toISOString(), files: manifest }, null, 2));
console.log('Les deux copies chiffrées sont authentifiées et identiques aux dumps originaux.');
