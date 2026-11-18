// Sauvegarde hebdomadaire de la production : dump officiel (schéma + données)
// hors du dépôt, avec rotation, alerte d'échec et copie hors site chiffrée.
//
// L'URL de connexion n'est jamais affichée ni écrite dans le dépôt. Elle est lue dans
// KAPYA_DB_URL, sinon dans %USERPROFILE%\.kapya\db-url.txt.
//
// Usage : node scripts/sauvegarde-production.mjs [--garder 8]
// Variables : KAPYA_SAUVEGARDES, KAPYA_COPIE, KAPYA_WEBHOOK, PG_DUMP.
//
// En cas d'échec : écrit DERNIER-ECHEC.txt dans le dossier et prévient le webhook
// configuré (URL dans KAPYA_WEBHOOK ou %USERPROFILE%\.kapya\webhook-sauvegarde.txt).
// La copie hors site est chiffrée (AES-256-GCM) avec la clé
// %USERPROFILE%\.kapya\cle-sauvegarde.txt.
import { mkdir, copyFile, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = os.homedir();
const dossier = process.env.KAPYA_SAUVEGARDES || path.join(path.dirname(racine), 'kapya-sauvegardes');
const journal = path.join(dossier, 'sauvegarde.log');
const alerte = path.join(dossier, 'DERNIER-ECHEC.txt');
const cleFichier = path.join(home, '.kapya', 'cle-sauvegarde.txt');

async function lireFichier(chemin) {
  try {
    return (await readFile(chemin, 'utf8')).trim();
  } catch {
    return '';
  }
}

const copie = process.env.KAPYA_COPIE || await lireFichier(path.join(home, '.kapya', 'copie-sauvegarde.txt'));
const webhook = process.env.KAPYA_WEBHOOK || await lireFichier(path.join(home, '.kapya', 'webhook-sauvegarde.txt'));

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

async function alerter(message) {
  toastWindows(message);
  if (!webhook) return;
  // Compatible Slack (text) et Discord (content) : chaque service ignore l'autre champ.
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message, content: message }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (erreur) {
    console.error(`Notification non envoyée : ${erreur.message}`);
  }
}

function toastWindows(message) {
  if (process.platform !== 'win32') return;
  const texte = message.replace(/'/g, "''").replace(/[\r\n]+/g, ' ').slice(0, 250);
  const script = [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "$modele = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
    "$textes = $modele.GetElementsByTagName('text')",
    "$textes.Item(0).AppendChild($modele.CreateTextNode('Sauvegarde KaPya')) | Out-Null",
    `$textes.Item(1).AppendChild($modele.CreateTextNode('${texte}')) | Out-Null`,
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($modele)",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Windows PowerShell').Show($toast)",
  ].join('; ');
  try {
    spawnSync('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
      timeout: 15000,
      windowsHide: true,
    });
  } catch {
    // notification locale facultative : le fichier et le webhook restent la référence
  }
}

async function lireUrl() {
  if (process.env.KAPYA_DB_URL) return process.env.KAPYA_DB_URL.trim();
  const url = await lireFichier(path.join(home, '.kapya', 'db-url.txt'));
  if (url) return url;
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
  const options = ['--no-owner', '--schema=public', '--dbname', url, '--file', fichier];
  options.unshift(mode === 'schema' ? '--schema-only' : '--data-only');
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

async function cleChiffrement() {
  const depuisEnv = process.env.KAPYA_CLE;
  if (depuisEnv) return Buffer.from(depuisEnv, 'base64');
  const existante = await lireFichier(cleFichier);
  if (existante) return Buffer.from(existante, 'base64');
  const cle = crypto.randomBytes(32);
  await mkdir(path.dirname(cleFichier), { recursive: true });
  await writeFile(cleFichier, cle.toString('base64') + '\n', { mode: 0o600 });
  console.log(`Clé de chiffrement créée : ${cleFichier}`);
  console.log('Conservez-la dans un gestionnaire de mots de passe : sans elle, la copie hors site est illisible.');
  return cle;
}

async function chiffrer(fichier, sortie, cle) {
  const iv = crypto.randomBytes(12);
  const chiffreur = crypto.createCipheriv('aes-256-gcm', cle, iv);
  const clair = await readFile(fichier);
  const chiffre = Buffer.concat([chiffreur.update(clair), chiffreur.final()]);
  const contenu = Buffer.concat([
    Buffer.from('KAPYA1'),
    iv,
    chiffreur.getAuthTag(),
    chiffre,
  ]);
  await writeFile(sortie, contenu);
}

async function rotation() {
  const dates = new Map();
  const noterDate = (date, dossierCible) => {
    if (!date) return;
    if (!dates.has(date)) dates.set(date, new Set());
    dates.get(date).add(dossierCible);
  };

  for (const fichier of await readdir(dossier).catch(() => [])) {
    const date = fichier.match(/^kapya-(\d{4}-\d{2}-\d{2})-(?:schema|donnees)\.sql$/)?.[1];
    if (date) noterDate(date, dossier);
  }
  if (copie) {
    for (const fichier of await readdir(copie).catch(() => [])) {
      const date = fichier.match(/^kapya-(\d{4}-\d{2}-\d{2})-(?:schema|donnees)\.sql\.enc$/)?.[1];
      if (date) noterDate(date, copie);
    }
  }

  const anciennes = [...dates.keys()].sort().reverse().slice(garder);
  const supprimees = [];
  for (const date of anciennes) {
    for (const suffixe of ['schema', 'donnees']) {
      for (const fichier of [
        path.join(dossier, `kapya-${date}-${suffixe}.sql`),
        copie ? path.join(copie, `kapya-${date}-${suffixe}.sql.enc`) : '',
      ].filter(Boolean)) {
        try {
          await rm(fichier);
          supprimees.push(path.basename(fichier));
        } catch {
          // déjà absent
        }
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
  await mkdir(dossier, { recursive: true });
  const message = `ÉCHEC sauvegarde KaPya (${jour}) : ${erreur.message}`;
  await writeFile(alerte, `${new Date().toISOString()}\n${erreur.message}\n`);
  await alerter(message);
  await writeFile(journal, `[${new Date().toISOString()}] ${message}\n`, { flag: 'a' });
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
    const cle = await cleChiffrement();
    for (const fichier of [schema, donnees]) {
      await chiffrer(fichier, path.join(copie, `${path.basename(fichier)}.enc`), cle);
    }
    lignes.push(noter(`Copie hors site chiffrée : ${copie}`));
  }

  const supprimees = await rotation();
  lignes.push(noter(
    supprimees.length
      ? `Rotation : ${supprimees.length} fichier(s) ancien(s) supprimé(s).`
      : `Rotation : rien à supprimer (${garder} sauvegardes conservées).`
  ));

  const echecPrecedent = await lireFichier(alerte);
  if (echecPrecedent) {
    await rm(alerte, { force: true });
    await alerter(`Sauvegarde KaPya rétablie le ${jour}.`);
    lignes.push(noter('Alerte précédente levée.'));
  }

  lignes.push(noter(`Terminé en ${((Date.now() - debut) / 1000).toFixed(1)} s.`));
} catch (erreur) {
  const message = `ÉCHEC sauvegarde KaPya (${jour}) : ${erreur.message}`;
  lignes.push(noter(message));
  await writeFile(alerte, `${new Date().toISOString()}\n${erreur.message}\n`);
  await alerter(message);
  await writeFile(journal, lignes.join('\n') + '\n', { flag: 'a' });
  console.error(erreur.message);
  process.exit(1);
}

await writeFile(journal, lignes.join('\n') + '\n', { flag: 'a' });
