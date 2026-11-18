// Archive datée du projet, pour disposer d'un point de retour avant une publication
// tant que le projet n'est pas encore sous Git.
// Par défaut : D:\kapya-sauvegardes (ou KAPYA_SAUVEGARDES pour choisir un autre dossier).
import { cp, mkdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = process.env.KAPYA_SAUVEGARDES || path.join(path.dirname(root), 'kapya-sauvegardes');
const now = new Date();
const pad = value => String(value).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const base = `kapya-erp-${stamp}`;

await mkdir(targetDir, { recursive: true });
const exclusions = ['node_modules', '.wrangler', '*.log', '*.tar.gz', '*.zip', 'Thumbs.db', '.DS_Store'];
const archive = path.join(targetDir, `${base}.tar.gz`);

const tar = spawnSync('tar', ['--version'], { stdio: 'ignore' });
let created = archive;

if (tar.status === 0) {
  const args = ['-czf', archive, '-C', root];
  for (const item of exclusions) args.push(`--exclude=${item}`);
  args.push('.');
  const result = spawnSync('tar', args, { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || 'La création de l’archive a échoué.');
    process.exit(1);
  }
} else {
  // Repli sans tar : copie du dossier (plus lente, mais universelle).
  created = path.join(targetDir, base);
  await cp(root, created, {
    recursive: true,
    filter: source => !exclusions.some(pattern => {
      const name = path.basename(source);
      if (pattern.includes('*')) return name.endsWith(pattern.replace('*', ''));
      return name === pattern;
    })
  });
}

const info = await stat(created);
const size = created.endsWith('.tar.gz') ? (info.size / 1024 / 1024).toFixed(2) + ' Mo' : '(dossier copié)';
console.log(`Sauvegarde du code : ${created}`);
console.log(`Taille : ${size} · dossier : ${targetDir}`);
console.log('Sauvegarde datée créée. Le dépôt Git garde l’historique des changements ; cette archive protège le dossier complet.');
