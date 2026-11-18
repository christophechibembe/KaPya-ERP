// Sauvegarde hebdomadaire de la production : dump officiel (schéma + données)
// hors du dépôt, avec rotation et copie hors site facultative.
//
// L'URL de connexion n'est jamais affichée ni écrite dans le dépôt. Elle est lue dans
// KAPYA_DB_URL, sinon dans %USERPROFILE%\.kapya\db-url.txt.
//
// Usage : node scripts/sauvegarde-production.mjs [--garder 8]
// Variables : KAPYA_SAUVEGARDES (dossier), KAPYA_COPIE (copie hors site), PG_DUMP.
import { mkdir, copyFile, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = os.homedir();
const dossier = process.env.KAPYA_SAUVEGARDES || path.join(path.dirname(racine), 'kapya-sauvegardes');
const journal = path.join(dossier, 'sauvegarde.log');

async function dossierCopie() {
  if (process.env.KAPYA_COPIE) return process.env.KAPYA_COPIE;
  try {
    return (await readFile(path.join(home, '.kapya', 'copie-sauvegarde.txt'), 'utf8')).trim();
  } catch {
    return '';
  }
}

const copie = await dossierCopie();

const args = process.argv.slice(2);
const indiceGarder = args.indexOf('--garder');
const garder = Math.max(1, Number(indiceGarder >= 0 ? args[indiceGarder + 1] : 8) || 8);

const maintenant = new Date();
const pad = n => String(n).padStart(2, '0');
const jour = `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}`;
const base = `kapya-${jour}`;

function noter(message) {
  const ligne = `[${maintenant.toISOString()}] ${message}`;
  console.log(message);
  return ligne;
}

async function lireUrl() {
  if (process.env.KAPYA_DB_URL) return process.env.KAPYA_DB_URL.trim();
  const fichier = path.join(home, '.kapya', 'db-url.txt');
  try {
    const url = (await readFile(fichier, 'utf8')).trim();
    if (url) return url;
  } catch {
    // absent : message ci-dessous
  }
  throw new Error(
    `URL de connexion absente. Définissez KAPYA_DB_URL ou écrivez-la dans ${path.join(home, '.kapya', 'db-url.txt')}.`
  );
}

async function trouverPgDump() {
  if (process.env.PG_DUMP) {
    const essaye = spawnSync(process.env.PG_DUMP, ['--version'], { encoding: 'utf8' });
    if (essaye.status === 0) return process.env.PG_DUMP;
    throw new Error(`PG_DUMP ne fonctionne pas : ${process.env.PG_DUMP}`);
  }
  const nom = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
  const candidats = [];
  if (process.platform === 'win32') {
    candidats.push(path.join(home, '.kapya', 'pg', 'bin', nom));
    for (const racineProgrammes of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]) {
      if (!racineProgrammes) continue;
      const pg = path.join(racineProgrammes, 'PostgreSQL');
      try {
        for (const version of await readdir(pg)) candidats.push(path.join(pg, version, 'bin', nom));
      } catch {
        // pas de PostgreSQL installé à cet endroit
      }
    }
  }
  candidats.push(nom);

  for (const candidat of candidats) {
    const essaye = spawnSync(candidat, ['--version'], { encoding: 'utf8' });
    if (essaye.status === 0) return candidat;
  }
  throw new Error(
    'pg_dump introuvable. Installez le client PostgreSQL, ou copiez son dossier bin dans ' +
      `${path.join(home, '.kapya', 'pg', 'bin')}, ou définissez PG_DUMP.`
  );
}

function dump(pgDump, url, mode, fichier) {
  const options = ['--no-owner', '--schema=public', '--dbname', url];
  if (mode === 'schema') options.unshift('--schema-only');
  else options.unshift('--data-only');
  options.push('--file', fichier);
  const r = spawnSync(pgDump, options, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`pg_dump (${mode}) a échoué : ${(r.stderr || '').split('\n').slice(-3).join(' ')}`);
  }
}

async function verifier(fichier, motif) {
  const taille = (await stat(fichier)).size;
  if (taille === 0) throw new Error(`${path.basename(fichier)} est vide.`);
  const contenu = await readFile(fichier, 'utf8');
  if (!contenu.includes('PostgreSQL database dump complete')) {
    throw new Error(`${path.basename(fichier)} est incomplet.`);
  }
  const nombre = (contenu.match(motif) || []).length;
  return { taille, nombre };
}

async function rotation() {
  const fichiers = await readdir(dossier);
  const dates = [...new Set(
    fichiers
      .map(f => f.match(/^kapya-(\d{4}-\d{2}-\d{2})-(?:schema|donnees)\.sql$/)?.[1])
      .filter(Boolean)
  )].sort().reverse();
  const supprimees = [];
  for (const date of dates.slice(garder)) {
    for (const suffixe of ['schema', 'donnees']) {
      const fichier = path.join(dossier, `kapya-${date}-${suffixe}.sql`);
      try {
        await rm(fichier);
        supprimees.push(path.basename(fichier));
      } catch {
        // déjà absent
      }
    }
  }
  return supprimees;
}

let url;
let pgDump;
try {
  url = await lireUrl();
  pgDump = await trouverPgDump();
} catch (erreur) {
  console.error(erreur.message);
  process.exit(1);
}

const version = spawnSync(pgDump, ['--version'], { encoding: 'utf8' }).stdout.trim();
await mkdir(dossier, { recursive: true });

const debut = Date.now();
const lignes = [];
lignes.push(noter(`Sauvegarde ${jour} — ${version}`));

const schema = path.join(dossier, `${base}-schema.sql`);
const donnees = path.join(dossier, `${base}-donnees.sql`);

try {
  dump(pgDump, url, 'schema', schema);
  const s = await verifier(schema, /^CREATE TABLE public\./gm);
  lignes.push(noter(`Schéma : ${(s.taille / 1024).toFixed(0)} Ko, ${s.nombre} tables.`));

  dump(pgDump, url, 'data', donnees);
  const d = await verifier(donnees, /^COPY public\./gm);
  lignes.push(noter(`Données : ${(d.taille / 1024 / 1024).toFixed(1)} Mo, ${d.nombre} tables.`));

  if (copie) {
    await mkdir(copie, { recursive: true });
    await copyFile(schema, path.join(copie, path.basename(schema)));
    await copyFile(donnees, path.join(copie, path.basename(donnees)));
    lignes.push(noter(`Copie hors site : ${copie}`));
  }

  const supprimees = await rotation();
  lignes.push(noter(
    supprimees.length
      ? `Rotation : ${supprimees.length} fichier(s) ancien(s) supprimé(s).`
      : `Rotation : rien à supprimer (${garder} sauvegardes conservées).`
  ));

  lignes.push(noter(`Terminé en ${((Date.now() - debut) / 1000).toFixed(1)} s.`));
} catch (erreur) {
  lignes.push(noter(`ÉCHEC : ${erreur.message}`));
  await writeFile(journal, lignes.join('\n') + '\n', { flag: 'a' });
  console.error(erreur.message);
  process.exit(1);
}

await writeFile(journal, lignes.join('\n') + '\n', { flag: 'a' });
