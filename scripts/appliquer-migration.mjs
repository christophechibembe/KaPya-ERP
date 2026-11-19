// Applique un fichier de migration sur la base de production.
// Opération d'écriture : exige le drapeau --confirmer et un fichier de supabase/migrations.
// Usage : node scripts/appliquer-migration.mjs supabase/migrations/xxx.sql --confirmer
// Sans jeton sbp_ (ou avec --psql), l'application passe par la connexion PostgreSQL
// directe de %USERPROFILE%\.kapya\db-url.txt, dans une transaction unique.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cible = process.argv[2];
if (!cible) throw new Error('Indiquez le fichier de migration à appliquer.');
if (!process.argv.includes('--confirmer')) throw new Error('Ajoutez --confirmer pour autoriser l’écriture en production.');

const chemin = path.resolve(root, cible);
if (!chemin.startsWith(path.join(root, 'supabase', 'migrations') + path.sep)) {
  throw new Error('Seuls les fichiers de supabase/migrations peuvent être appliqués.');
}
const requete = await readFile(chemin, 'utf8');

const config = await readFile(path.join(root, 'js', 'config.js'), 'utf8');
const projet = config.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const jeton = (process.env.SUPABASE_ACCESS_TOKEN
  || (await readFile(path.join(os.homedir(), '.kapya', 'supabase-token.txt'), 'utf8').catch(() => ''))).trim();
const parPsql = process.argv.includes('--psql') || !/^sbp_/.test(jeton);
if (!projet) throw new Error('Projet Supabase introuvable.');

const nomFichier = path.basename(chemin, '.sql');
const [version, ...reste] = nomFichier.split('_');
const nom = reste.join('_') || nomFichier;

if (parPsql) {
  const url = new URL((await readFile(path.join(os.homedir(), '.kapya', 'db-url.txt'), 'utf8')).trim());
  const psql = path.join(os.homedir(), '.kapya', 'pg', 'bin', 'psql.exe');
  const base = ['-h', url.hostname, '-p', url.port || '5432',
    '-U', decodeURIComponent(url.username), '-d', 'postgres', '-w', '-v', 'ON_ERROR_STOP=1'];
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  const execution = spawnSync(psql, [...base, '--single-transaction', '-f', chemin], { env, encoding: 'utf8' });
  if (execution.stdout) process.stdout.write(execution.stdout);
  if (execution.stderr) process.stderr.write(execution.stderr);
  if (execution.status !== 0) throw new Error(`Application impossible (code ${execution.status}).`);
  console.log('Migration appliquée par connexion directe :', path.relative(root, chemin));
  if (/^\d{14}$/.test(version)) {
    const sqlHistorique = `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${nom}') on conflict (version) do nothing;`;
    const historique = spawnSync(psql, [...base, '-q', '-c', sqlHistorique], { env, encoding: 'utf8' });
    console.log(historique.status === 0
      ? `Historique mis à jour : ${version} (${nom})`
      : `Historique non mis à jour (code ${historique.status}).`);
  }
} else {
  const reponse = await fetch(`https://api.supabase.com/v1/projects/${projet}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: requete }),
  });
  if (!reponse.ok) throw new Error(`API ${reponse.status}: ${(await reponse.text()).slice(0, 800)}`);
  console.log('Migration appliquée :', path.relative(root, chemin));

  if (/^\d{14}$/.test(version)) {
    const enregistrement = `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${nom}') on conflict (version) do nothing;`;
    const r2 = await fetch(`https://api.supabase.com/v1/projects/${projet}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: enregistrement }),
    });
    console.log(r2.ok ? `Historique mis à jour : ${version} (${nom})` : `Historique non mis à jour : ${r2.status}`);
  }
}

