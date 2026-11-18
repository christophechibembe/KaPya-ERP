// Exécute une requête de lecture sur le projet Supabase de production.
// Le jeton est lu dans SUPABASE_ACCESS_TOKEN ou %USERPROFILE%\.kapya\supabase-token.txt.
// Seules les requêtes commençant par select ou with sont acceptées.
// Usage : node scripts/requete-supabase.mjs <fichier.sql>
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const fichier = process.argv[2];
if (!fichier) throw new Error('Indiquez un fichier .sql contenant la requête.');

const requete = (await readFile(fichier, 'utf8')).trim();
if (!/^(select|with)\b/i.test(requete)) throw new Error('Seules les requêtes select/with sont autorisées.');

const jeton = process.env.SUPABASE_ACCESS_TOKEN
  || (await readFile(path.join(os.homedir(), '.kapya', 'supabase-token.txt'), 'utf8')).trim();
if (!/^sbp_/.test(jeton)) throw new Error('Jeton Supabase absent ou invalide.');

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..');
const config = await readFile(path.join(racine, 'js', 'config.js'), 'utf8');
const projet = config.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!projet) throw new Error('Référence du projet introuvable dans js/config.js.');

const reponse = await fetch(`https://api.supabase.com/v1/projects/${projet}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: requete }),
});
if (!reponse.ok) throw new Error(`API ${reponse.status}: ${(await reponse.text()).slice(0, 400)}`);
console.log(JSON.stringify(await reponse.json(), null, 2));
