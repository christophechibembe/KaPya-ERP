// Copie de publication statique : ne publie ni outils locaux, ni tests, ni fichiers privés.
// Le dossier source reste intact ; chaque exécution crée son propre dossier temporaire.
import { cp, mkdir, mkdtemp, readdir, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Temp', 'opencode')
  : path.join(os.tmpdir(), 'kapya-deploy');
const publicFiles = [
  'index.html', '404.html', 'guide.html', 'confidentialite.html', 'sw.js', '_headers', '_redirects',
  'manifest.webmanifest', 'manifest-app.webmanifest'
];
const publicDirectories = ['assets', 'css', 'icons', 'js'];

await mkdir(temp, { recursive: true });
const out = await mkdtemp(path.join(temp, 'kapya-cloudflare-'));
for (const entry of [...publicFiles, ...publicDirectories]) {
  await cp(path.join(root, entry), path.join(out, entry), {
    recursive: true,
    filter: file => !/(?:^|[\\/])(?:\.git|node_modules|\.env(?:\.[^\\/]*)?)(?:[\\/]|$)/i.test(file)
      && !/\.(?:sql|bak|zip|log|map)$/i.test(file)
  });
}
// Pages normalise les chemins HTML : un vrai point d'entrée évite les boucles de réécriture.
// La version affichée (sans JavaScript) est réécrite ici : une seule source, js/version.js.
const { APP_VERSION } = await import(pathToFileURL(path.join(root, 'js', 'version.js')).href);
for (const name of ['index.html', 'guide.html']) {
  const file = path.join(out, name);
  const source = await readFile(file, 'utf8');
  // Le HTML peut contenir « Version » seule : la préparation ajoute le numéro.
  const patched = source.replace(/((?:id="splash-version"|data-app-version)>)(?:Version(?:\s+[\d.]+)?|[\d.]+)/g, `$1Version ${APP_VERSION}`);
  if (patched !== source) await writeFile(file, patched, 'utf8');
}
await mkdir(path.join(out, 'app'));
await cp(path.join(out, 'index.html'), path.join(out, 'app', 'index.html'));
const config = await readFile(path.join(out, 'js', 'config.js'), 'utf8');
const settings = config.match(/export\s+const\s+CFG\s*=\s*(\{[^\n]+\})/)?.[1];
if (!settings) throw new Error('Configuration publique introuvable : publication arrêtée.');
if (/\bsb_secret_|\bservice_role\b/.test(settings)) throw new Error('Clé privée détectée : publication arrêtée.');
if (!/\bdemo:\s*false\b/.test(settings)) throw new Error('Le mode démo doit être désactivé pour cette publication.');

async function verify(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await verify(file);
    else {
      if ((await stat(file)).size > 25 * 1024 * 1024) throw new Error(`Fichier trop volumineux pour Pages : ${path.relative(out, file)}`);
      count++;
    }
  }
  return count;
}
console.log(JSON.stringify({ directory: out, files: await verify(out) }));
