// Applique un fichier de migration sur la base de production.
// Opération d'écriture : exige le drapeau --confirmer et un fichier de supabase/migrations.
// Usage : node scripts/appliquer-migration.mjs supabase/migrations/xxx.sql --confirmer
import { readFile } from 'node:fs/promises';
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
const jeton = process.env.SUPABASE_ACCESS_TOKEN
  || (await readFile(path.join(os.homedir(), '.kapya', 'supabase-token.txt'), 'utf8')).trim();
if (!projet || !/^sbp_/.test(jeton)) throw new Error('Projet ou jeton Supabase introuvable.');

const reponse = await fetch(`https://api.supabase.com/v1/projects/${projet}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: requete }),
});
if (!reponse.ok) throw new Error(`API ${reponse.status}: ${(await reponse.text()).slice(0, 800)}`);
console.log('Migration appliquée :', path.relative(root, chemin));

const nomFichier = path.basename(chemin, '.sql');
const [version, ...reste] = nomFichier.split('_');
const nom = reste.join('_') || nomFichier;
if (/^\d{14}$/.test(version)) {
  const enregistrement = `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${nom}') on conflict (version) do nothing;`;
  const r2 = await fetch(`https://api.supabase.com/v1/projects/${projet}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: enregistrement }),
  });
  console.log(r2.ok ? `Historique mis à jour : ${version} (${nom})` : `Historique non mis à jour : ${r2.status}`);
}

