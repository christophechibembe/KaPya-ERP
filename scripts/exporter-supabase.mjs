// Export en lecture seule du schéma de production Supabase vers sql/exports/.
// Le jeton est lu dans SUPABASE_ACCESS_TOKEN ou dans %USERPROFILE%\.kapya\supabase-token.txt
// et n'est jamais affiché.
// Usage : node scripts/exporter-supabase.mjs
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = await readFile(path.join(root, 'js', 'config.js'), 'utf8');
const projet = config.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!projet) throw new Error('Référence du projet Supabase introuvable dans js/config.js.');

const jeton = process.env.SUPABASE_ACCESS_TOKEN
  || (await readFile(path.join(os.homedir(), '.kapya', 'supabase-token.txt'), 'utf8')).trim();
if (!/^sbp_/.test(jeton)) throw new Error('Jeton Supabase absent ou invalide.');

const dossier = path.join(root, 'sql', 'exports', new Date().toISOString().slice(0, 10));
await mkdir(dossier, { recursive: true });

async function sql(requete) {
  const reponse = await fetch(`https://api.supabase.com/v1/projects/${projet}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: requete }),
  });
  if (!reponse.ok) {
    const texte = await reponse.text();
    throw new Error(`API ${reponse.status}: ${texte.slice(0, 300)}`);
  }
  const donnees = await reponse.json();
  return Array.isArray(donnees) ? donnees : [];
}

const ident = s => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);
const litt = s => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

const ecrire = async (nom, contenu) => {
  await writeFile(path.join(dossier, nom), contenu.endsWith('\n') ? contenu : contenu + '\n', 'utf8');
  console.log('écrit :', path.relative(root, path.join(dossier, nom)));
};

// 1. Tables : RLS, nombre de politiques, nombre de colonnes.
const tables = await sql(`
  select c.relname as table_name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
         (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)::int as policies,
         (select count(*) from information_schema.columns col
           where col.table_schema='public' and col.table_name=c.relname)::int as columns
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
  order by c.relname`);

const colonnes = await sql(`
  select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
  from information_schema.columns where table_schema='public'
  order by table_name, ordinal_position`);

const politiques = await sql(`
  select tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
  from pg_policies where schemaname='public' order by tablename, policyname`);

const fonctions = await sql(`
  select p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
         pg_get_functiondef(p.oid) as definition,
         p.prosecdef as security_definer, coalesce(array_to_string(p.proconfig, ','), '') as config,
         has_function_privilege('anon', p.oid, 'execute') as anon_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' order by p.proname`);

const triggers = await sql(`
  select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as definition
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal order by c.relname, t.tgname`);

const index = await sql(`select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by tablename, indexname`);

const contraintes = await sql(`
  select c.relname as table_name, con.conname, con.contype as type, pg_get_constraintdef(con.oid) as definition
  from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' order by c.relname, con.conname`);

const droits = await sql(`
  select table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants where table_schema='public'
  group by table_name, grantee order by table_name, grantee`);

let planifications = [];
try {
  planifications = await sql(`select jobid, schedule, command, active from cron.job order by jobid`);
} catch { planifications = []; }

const storage = await sql(`select policyname, tablename, roles::text as roles, cmd, qual, with_check from pg_policies where schemaname='storage' order by tablename, policyname`).catch(() => []);

// --- Fichiers d'inventaire -------------------------------------------------
const maintenant = new Date().toISOString().slice(0, 16).replace('T', ' ');
const entete = `-- KaPya ERP — export de production (lecture seule)
-- Projet Supabase : ${projet}
-- Export : ${maintenant}
-- Généré par scripts/exporter-supabase.mjs. Ne contient aucun secret.
`;

await ecrire('01-tables.md', [
  '# Tables de production',
  '',
  `Projet \`${projet}\` — export du ${maintenant}.`,
  '',
  '| Table | Colonnes | RLS | Force RLS | Politiques |',
  '| --- | --- | --- | --- | --- |',
  ...tables.map(t => `| \`${t.table_name}\` | ${t.columns} | ${t.rls ? 'oui' : '**non**'} | ${t.force_rls ? 'oui' : 'non'} | ${t.policies} |`),
  '',
].join('\n'));

await ecrire('02-colonnes.csv', ['table_name,position,column_name,data_type,nullable,default',
  ...colonnes.map(c => [c.table_name, c.ordinal_position, c.column_name, c.data_type, c.is_nullable, (c.column_default ?? '').replace(/"/g, '""')].map(v => `"${v}"`).join(','))].join('\n'));

await ecrire('03-politiques.sql', entete + politiques.map(p => `
-- ${p.tablename} · ${p.policyname} (${p.cmd}, ${p.permissive})
create policy ${ident(p.policyname)} on public.${ident(p.tablename)}
  as ${p.permissive === 'PERMISSIVE' ? 'permissive' : 'restrictive'}
  for ${p.cmd.toLowerCase()}
  to ${p.roles}
  ${p.qual ? `using (${p.qual})` : ''}
  ${p.with_check ? `with check (${p.with_check})` : ''};`).join('\n'));

await ecrire('04-fonctions.sql', entete + fonctions.map(f => `\n-- ${f.name}${f.security_definer ? ' [SECURITY DEFINER]' : ''}${f.config ? ` [${f.config}]` : ''}${f.anon_execute ? ' [ANON EXECUTE]' : ''}\n${f.definition};`).join('\n'));

await ecrire('05-triggers.sql', entete + triggers.map(t => `\n-- ${t.table_name} · ${t.tgname}\n${t.definition};`).join('\n'));

await ecrire('06-index.sql', entete + index.map(i => `\n-- ${i.tablename} · ${i.indexname}\n${i.indexdef};`).join('\n'));

await ecrire('07-contraintes.sql', entete + contraintes.map(c => `\n-- ${c.table_name} · ${c.conname} (${c.type})\nalter table public.${ident(c.table_name)} add constraint ${ident(c.conname)} ${c.definition};`).join('\n'));

await ecrire('08-droits.md', [
  '# Droits sur les tables (production)',
  '',
  '| Table | Rôle | Privilèges |',
  '| --- | --- | --- |',
  ...droits.map(d => `| \`${d.table_name}\` | ${d.grantee} | ${d.privileges} |`),
  '',
].join('\n'));

await ecrire('09-planifications.sql', entete + (planifications.length
  ? planifications.map(p => `-- job ${p.jobid} (${p.active ? 'actif' : 'inactif'}) ${p.schedule}\n${p.command};`).join('\n')
  : '-- Aucune tâche cron lisible (extension pg_cron peut être absente).\n'));

await ecrire('10-storage.sql', entete + (storage.length
  ? storage.map(p => `-- storage.${p.tablename} · ${p.policyname} (${p.cmd})\ncreate policy ${ident(p.policyname)} on storage.${ident(p.tablename)} for ${p.cmd.toLowerCase()} to ${p.roles} ${p.qual ? `using (${p.qual})` : ''} ${p.with_check ? `with check (${p.with_check})` : ''};`).join('\n')
  : '-- Aucune politique Storage.\n'));

const aDurcir = fonctions.filter(f => f.security_definer && f.anon_execute);
await ecrire('11-durcissement-propose.sql', aDurcir.length ? `${entete}
-- PROPOSITION — fichier non appliqué.
-- Les fonctions SECURITY DEFINER ci-dessous sont exécutables par le rôle anon
-- parce qu'elles héritent du droit PUBLIC par défaut. Elles vérifient toutes
-- auth.uid() ou le rôle en interne, mais il vaut mieux fermer l'accès public
-- et n'autoriser que les comptes connectés.
-- À relire, tester sur un projet de test, puis appliquer en une transaction.

${aDurcir.map(f => `revoke all on function public.${ident(f.name)}(${f.args}) from public, anon;
grant execute on function public.${ident(f.name)}(${f.args}) to authenticated;`).join('\n\n')}
` : `${entete}
-- Aucune fonction SECURITY DEFINER exécutable par le rôle anon.
-- Le durcissement a été appliqué par supabase/migrations/20261118000001_durcissement_anon.sql.
`);

// --- Synthèse --------------------------------------------------------------
const sansRls = tables.filter(t => !t.rls).map(t => t.table_name);
const rlsSansPolitique = tables.filter(t => t.rls && t.policies === 0).map(t => t.table_name);
const definerSansSearchPath = fonctions.filter(f => f.security_definer && !/search_path/.test(f.config)).map(f => f.name);
const anonExecutable = fonctions.filter(f => f.anon_execute && f.security_definer).map(f => f.name);
const tablesRepo = new Set();
const fonctionsRepo = new Set();
const politiquesRepo = new Set();
{
  const { readdir } = await import('node:fs/promises');
  // Le SQL versionné = sql/*.sql (sauf l'instantané de référence, qui décrit la
  // production et fausserait la comparaison) + supabase/migrations/*.sql.
  const fichiers = [];
  for (const dossierSrc of ['sql', path.join('supabase', 'migrations')]) {
    const dossierComplet = path.join(root, dossierSrc);
    let noms = [];
    try { noms = await readdir(dossierComplet); } catch { noms = []; }
    for (const nom of noms.filter(n => n.endsWith('.sql'))) {
      if (dossierSrc === 'sql' && nom === 'schema-production.sql') continue;
      fichiers.push(path.join(dossierComplet, nom));
    }
  }
  for (const fichier of fichiers) {
    const texte = await readFile(fichier, 'utf8');
    for (const m of texte.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(/gi)) tablesRepo.add(m[1].toLowerCase());
    for (const m of texte.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\(/gi)) fonctionsRepo.add(m[1].toLowerCase());
    for (const m of texte.matchAll(/create\s+policy\s+(?:"([^"]+)"|(\w+))\s+on\s+(?:public\.)?"?(\w+)"?/gi)) politiquesRepo.add(`${m[3].toLowerCase()}|${(m[1] || m[2]).toLowerCase()}`);
    // Boucle dynamique de schema.sql : quatre politiques nommées <table>_r/_i/_u/_d.
    for (const m of texte.matchAll(/foreach\s+\w+\s+in\s+array\s+array\s*\[([^\]]+)\][\s\S]{0,400}?create\s+policy\s+%I\s+on\s+public\.%I/gi)) {
      for (const nom of m[1].matchAll(/'(\w+)'/g)) {
        const t = nom[1].toLowerCase();
        for (const suffixe of ['_r', '_i', '_u', '_d']) politiquesRepo.add(`${t}|${t}${suffixe}`);
      }
    }
  }
}
const tablesProduction = new Set(tables.map(t => t.table_name));
const absentesDuDepot = [...tablesProduction].filter(t => !tablesRepo.has(t)).sort();
const absentesDeProduction = [...tablesRepo].filter(t => !tablesProduction.has(t)).sort();

// Fonctions et politiques versionnées, pour repérer les écarts réels.
const fonctionsProduction = new Set(fonctions.map(f => f.name.toLowerCase()));
const fonctionsAbsentesDuDepot = [...fonctionsProduction].filter(f => !fonctionsRepo.has(f)).sort();
const fonctionsAbsentesDeProduction = [...fonctionsRepo].filter(f => !fonctionsProduction.has(f)).sort();
const politiquesAbsentesDuDepot = politiques.filter(p => !politiquesRepo.has(`${p.tablename}|${p.policyname}`.toLowerCase()));
const tablesSansPolitiqueEnProd = tables.filter(t => t.rls && t.policies === 0).map(t => t.table_name);

await ecrire('00-synthese.md', [
  '# Synthèse production',
  '',
  `Projet \`${projet}\` — ${maintenant}.`,
  '',
  `- Tables : **${tables.length}**`,
  `- Tables sans RLS : **${sansRls.length}**${sansRls.length ? ` → ${sansRls.map(t => `\`${t}\``).join(', ')}` : ''}`,
  `- Tables RLS sans politique : **${rlsSansPolitique.length}**${rlsSansPolitique.length ? ` → ${rlsSansPolitique.map(t => `\`${t}\``).join(', ')}` : ''}`,
  `- Fonctions : **${fonctions.length}**, dont **${fonctions.filter(f => f.security_definer).length}** SECURITY DEFINER`,
  `- SECURITY DEFINER sans search_path : **${definerSansSearchPath.length}**${definerSansSearchPath.length ? ` → ${definerSansSearchPath.map(f => `\`${f}\``).join(', ')}` : ''}`,
  `- SECURITY DEFINER exécutables par anon : **${anonExecutable.length}**${anonExecutable.length ? ` → ${anonExecutable.map(f => `\`${f}\``).join(', ')}` : ''}`,
  `- Politiques Storage : **${storage.length}**`,
  `- Tâches planifiées : **${planifications.length}**`,
  '',
  `## Tables présentes en production mais absentes du SQL versionné (${absentesDuDepot.length})`,
  '',
  absentesDuDepot.length ? absentesDuDepot.map(t => `- \`${t}\``).join('\n') : 'Aucune.',
  '',
  `## Tables du SQL versionné absentes en production (${absentesDeProduction.length})`,
  '',
  absentesDeProduction.length ? absentesDeProduction.map(t => `- \`${t}\``).join('\n') : 'Aucune.',
  '',
  `## Fonctions de production absentes du SQL versionné (${fonctionsAbsentesDuDepot.length})`,
  '',
  fonctionsAbsentesDuDepot.length ? fonctionsAbsentesDuDepot.map(f => `- \`${f}\``).join('\n') : 'Aucune.',
  '',
  `## Fonctions du SQL versionné absentes en production (${fonctionsAbsentesDeProduction.length})`,
  '',
  fonctionsAbsentesDeProduction.length ? fonctionsAbsentesDeProduction.map(f => `- \`${f}\``).join('\n') : 'Aucune.',
  '',
  `## Politiques de production absentes du SQL versionné (${politiquesAbsentesDuDepot.length})`,
  '',
  politiquesAbsentesDuDepot.length ? politiquesAbsentesDuDepot.map(p => `- \`${p.tablename}\` · ${p.policyname}`).join('\n') : 'Aucune.',
  '',
].join('\n'));

console.log('\nExport terminé dans', path.relative(root, dossier));
