// Génère sql/schema-production.sql : instantané de référence du schéma réel.
// Lecture seule sur la base. Le fichier produit n'est pas appliqué automatiquement.
// Usage : node scripts/generer-schema.mjs
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = await readFile(path.join(root, 'js', 'config.js'), 'utf8');
const projet = config.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const jeton = process.env.SUPABASE_ACCESS_TOKEN
  || (await readFile(path.join(os.homedir(), '.kapya', 'supabase-token.txt'), 'utf8')).trim();
if (!projet || !/^sbp_/.test(jeton)) throw new Error('Projet ou jeton Supabase introuvable.');

async function sql(requete) {
  const reponse = await fetch(`https://api.supabase.com/v1/projects/${projet}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: requete }),
  });
  if (!reponse.ok) throw new Error(`API ${reponse.status}: ${(await reponse.text()).slice(0, 300)}`);
  return reponse.json();
}

const ident = s => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`);

const tables = await sql(`
  select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by c.relname`);

const colonnes = await sql(`
  select c.relname as table_name, a.attname as column_name, format_type(a.atttypid, a.atttypmod) as type,
         a.attnotnull as not_null, pg_get_expr(d.adbin, d.adrelid) as default_expr,
         a.attidentity as identity, col.collation_name
  from pg_attribute a
  join pg_class c on c.oid=a.attrelid
  join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  left join information_schema.columns col
    on col.table_schema='public' and col.table_name=c.relname and col.column_name=a.attname
  where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped
  order by c.relname, a.attnum`);

const contraintes = await sql(`
  select c.relname as table_name, con.conname as name, con.contype as type,
         pg_get_constraintdef(con.oid) as definition
  from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and con.contype in ('p','u','c','f','x')
  order by case con.contype when 'f' then 2 else 1 end, c.relname, con.conname`);

const index = await sql(`
  select i.indexrelid::regclass::text as full_name, pg_get_indexdef(i.indexrelid) as definition
  from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and not exists (select 1 from pg_constraint con where con.conindid=i.indexrelid)
  order by 1`);

const fonctions = await sql(`
  select p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
         pg_get_functiondef(p.oid) as definition,
         has_function_privilege('anon', p.oid, 'execute') as anon_execute,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' order by p.proname`);

const triggers = await sql(`
  select c.relname as table_name, t.tgname as name, pg_get_triggerdef(t.oid) as definition
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal order by c.relname, t.tgname`);

const politiques = await sql(`
  select tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
  from pg_policies where schemaname='public' order by tablename, policyname`);

const droitsTables = await sql(`
  select table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
  group by table_name, grantee order by table_name, grantee`);

const nomRole = roles => {
  const liste = String(roles).replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  return liste.length ? liste.join(', ') : 'public';
};

// Les expressions de défaut et les contraintes peuvent appeler des fonctions public :
// on les qualifie pour qu'elles restent valides quel que soit le search_path.
const nomsFonctions = new Set(fonctions.map(f => f.name));
const qualifier = expr => (expr ? String(expr).replace(/\b([a-z_][a-z0-9_]*)\s*\(/gi, (tout, nom) =>
  nomsFonctions.has(nom.toLowerCase()) ? `public.${nom}(` : tout) : expr);

const renderColonne = c => {
  let ligne = `  ${ident(c.column_name)} ${c.type}`;
  if (c.collation_name && c.collation_name !== 'default') ligne += ` collate ${ident(c.collation_name)}`;
  if (c.identity === 'a') ligne += ' generated always as identity';
  else if (c.identity === 'd') ligne += ' generated by default as identity';
  if (c.not_null) ligne += ' not null';
  return ligne;
};

const blocs = [];
blocs.push(`-- KaPya ERP — schéma de production (instantané de référence)
-- Projet Supabase : ${projet}
-- Généré le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} par scripts/generer-schema.mjs
--
-- Ce fichier décrit la base telle qu'elle existe réellement. Il est destiné à la
-- documentation, à la comparaison et à la reconstruction d'un projet de test.
-- Il n'est jamais exécuté automatiquement et ne remplace pas une sauvegarde.
-- Une restauration réelle se fait avec supabase db dump puis psql.
set check_function_bodies = false;
set client_min_messages = warning;
`);

for (const t of tables) {
  const cols = colonnes.filter(c => c.table_name === t.name);
  blocs.push(`create table public.${ident(t.name)} (\n${cols.map(renderColonne).join(',\n')}\n);`);
}

for (const f of fonctions) blocs.push(`-- fonction ${f.name}(${f.args})\n${f.definition};`);

for (const c of colonnes.filter(c => c.default_expr && !c.identity)) {
  blocs.push(`alter table public.${ident(c.table_name)} alter column ${ident(c.column_name)} set default ${qualifier(c.default_expr)};`);
}

const cles = contraintes.filter(c => c.type !== 'f');
const etrangeres = contraintes.filter(c => c.type === 'f');
for (const c of cles) blocs.push(`alter table public.${ident(c.table_name)} add constraint ${ident(c.name)} ${c.definition};`);
for (const c of etrangeres) blocs.push(`alter table public.${ident(c.table_name)} add constraint ${ident(c.name)} ${c.definition};`);

for (const i of index) blocs.push(`${i.definition};`);

for (const t of triggers) blocs.push(`-- trigger ${t.name} sur ${t.table_name}\n${t.definition};`);

for (const t of tables) {
  if (t.rls) blocs.push(`alter table public.${ident(t.name)} enable row level security;`);
  if (t.force_rls) blocs.push(`alter table public.${ident(t.name)} force row level security;`);
}

for (const p of politiques) {
  const morceaux = [`create policy ${ident(p.policyname)} on public.${ident(p.tablename)}`];
  morceaux.push(`  as ${p.permissive === 'PERMISSIVE' ? 'permissive' : 'restrictive'}`);
  morceaux.push(`  for ${p.cmd.toLowerCase()}`);
  morceaux.push(`  to ${nomRole(p.roles)}`);
  if (p.qual) morceaux.push(`  using (${p.qual})`);
  if (p.with_check) morceaux.push(`  with check (${p.with_check})`);
  blocs.push(morceaux.join('\n') + ';');
}

for (const d of droitsTables) blocs.push(`grant ${d.privileges.toLowerCase()} on table public.${ident(d.table_name)} to ${d.grantee};`);

for (const f of fonctions) {
  if (f.auth_execute) blocs.push(`grant execute on function public.${ident(f.name)}(${f.args}) to authenticated;`);
  if (f.anon_execute) blocs.push(`-- à durcir : anon peut exécuter public.${f.name}(${f.args})`);
}

const entete = blocs[0];
const corps = blocs.slice(1).map(b => b.startsWith('--') ? b : b).join('\n\n');
const sortie = `${entete}\n${corps}\n`;
await writeFile(path.join(root, 'sql', 'schema-production.sql'), sortie, 'utf8');

console.log(`sql/schema-production.sql : ${tables.length} tables, ${fonctions.length} fonctions, ${politiques.length} politiques, ${index.length} index, ${triggers.length} triggers.`);
