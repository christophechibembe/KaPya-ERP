// Déchiffre une copie hors site produite par scripts/sauvegarde-production.mjs.
// Usage : node scripts/dechiffrer-sauvegarde.mjs <fichier.sql.enc> <sortie.sql>
// La clé est lue dans KAPYA_CLE (base64) ou %USERPROFILE%\.kapya\cle-sauvegarde.txt.
import { readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const [entree, sortie] = process.argv.slice(2);
if (!entree || !sortie) {
  console.error('Usage : node scripts/dechiffrer-sauvegarde.mjs <fichier.sql.enc> <sortie.sql>');
  process.exit(1);
}

async function lireCle() {
  if (process.env.KAPYA_CLE) return Buffer.from(process.env.KAPYA_CLE, 'base64');
  const fichier = path.join(os.homedir(), '.kapya', 'cle-sauvegarde.txt');
  try {
    return Buffer.from((await readFile(fichier, 'utf8')).trim(), 'base64');
  } catch {
    throw new Error(`Clé absente : définissez KAPYA_CLE ou écrivez-la dans ${fichier}.`);
  }
}

const cle = await lireCle();
const contenu = await readFile(entree);
if (contenu.subarray(0, 6).toString() !== 'KAPYA1') {
  throw new Error('Fichier non reconnu : en-tête KAPYA1 absent.');
}

const iv = contenu.subarray(6, 18);
const tag = contenu.subarray(18, 34);
const chiffre = contenu.subarray(34);
const dechiffreur = crypto.createDecipheriv('aes-256-gcm', cle, iv);
dechiffreur.setAuthTag(tag);
const clair = Buffer.concat([dechiffreur.update(chiffre), dechiffreur.final()]);
await writeFile(sortie, clair);
console.log(`Écrit : ${sortie} (${(clair.length / 1024 / 1024).toFixed(1)} Mo)`);
