// Compare les politiques RLS de production (export daté) avec le SQL versionné.
// Écrit docs/POLITIQUES-RLS.md et sql/politiques-production.sql (les politiques
// absentes du dépôt, à l'identique, jamais appliquées automatiquement).
// Usage : node scripts/auditer-politiques.mjs [--markdown]
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportDir = path.join(root, 'sql', 'exports', '2026-11-18');
const fichierExport = path.join(exportDir, '03-politiques.sql');

const ident = s => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);

export function extraire(texte) {
  const politiques = [];
  const motif = /^create policy (?:"([^"]+)"|([a-z_][a-z0-9_]*)) on public\.(?:"([^"]+)"|([a-z_][a-z0-9_]*))\n?(?:[\s\S]*?);/gim;
  for (const m of texte.matchAll(motif)) {
    const nom = m[1] || m[2];
    const table = m[3] || m[4];
    const corpsBrut = m[0];
    const cmd = corpsBrut.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1]?.toLowerCase() || 'all';
    const rolesBruts = corpsBrut.match(/\bto\s+([^\n]+?)(?:\s+using|\s+with check|;)/i)?.[1]?.trim() || 'public';
    const roles = rolesBruts.replace(/^\{|\}$/g, '').split(',').map(r => r.trim()).filter(Boolean).join(', ') || 'public';
    const using = corpsBrut.match(/\busing\s*\(([\s\S]*?)\)\s*(?:with check|;)/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
    const withCheck = corpsBrut.match(/\bwith check\s*\(([\s\S]*)\)\s*;/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
    politiques.push({ nom, table, cmd, roles, rolesBruts, using, withCheck, corps: corpsBrut.trim() });
  }
  return politiques;
}

export async function lireVersionne() {
  const politiques = new Map();
  const fichiers = [];
  for (const dossier of ['sql', path.join('supabase', 'migrations')]) {
    const complet = path.join(root, dossier);
    for (const nom of (await readdir(complet)).filter(f => f.endsWith('.sql'))) {
      if (dossier === 'sql' && ['schema-production.sql', 'politiques-production.sql'].includes(nom)) continue;
      fichiers.push(path.join(complet, nom));
    }
  }
  for (const fichier of fichiers) {
    const texte = await readFile(fichier, 'utf8');
    for (const p of extraire(texte)) politiques.set(`${p.table.toLowerCase()}|${p.nom.toLowerCase()}`, { ...p, fichier: path.relative(root, fichier) });
    // Boucle dynamique de schema.sql : <table>_r/_i/_u/_d.
    for (const m of texte.matchAll(/foreach\s+\w+\s+in\s+array\s+array\s*\[([^\]]+)\][\s\S]{0,400}?create\s+policy\s+%I\s+on\s+public\.%I/gi)) {
      for (const nom of m[1].matchAll(/'(\w+)'/g)) {
        const t = nom[1].toLowerCase();
        for (const suffixe of ['_r', '_i', '_u', '_d']) politiques.set(`${t}|${t}${suffixe}`, { nom: `${t}${suffixe}`, table: t, fichier: 'sql/schema.sql (boucle)', dynamique: true });
      }
    }
  }
  return politiques;
}

export async function rapport() {
const production = extraire(await readFile(fichierExport, 'utf8'));
const versionne = await lireVersionne();
const absentes = production.filter(p => !versionne.has(`${p.table.toLowerCase()}|${p.nom.toLowerCase()}`));
const orphelines = [...versionne.values()].filter(p => !p.dynamique && !production.some(q => q.table.toLowerCase() === p.table.toLowerCase() && q.nom.toLowerCase() === p.nom.toLowerCase()));
const publiques = production.filter(p => p.roles === 'public');

const parTable = new Map();
for (const p of absentes) {
  if (!parTable.has(p.table)) parTable.set(p.table, []);
  parTable.get(p.table).push(p);
}

const sensibles = new Set(['paiements_abonnement', 'platform_audit', 'platform_admins', 'commercial_accounts', 'commercial_dues', 'commercial_payments', 'reseller_commissions', 'audit_log', 'app_errors']);
const lecture = absentes.filter(p => p.cmd === 'select').length;
const ecriture = absentes.filter(p => p.cmd !== 'select').length;

console.log(`Politiques en production : ${production.length}`);
console.log(`Politiques versionnées    : ${versionne.size}`);
console.log(`Absentes du dépôt         : ${absentes.length}`);
console.log(`Versionnées sans équivalent en production : ${orphelines.length}`);

const rendu = p => p.corps.replace(`to ${p.rolesBruts}`, `to ${p.roles}`);

const sql = `-- KaPya ERP — politiques RLS de production absentes du SQL versionné.
-- Généré le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} depuis sql/exports/2026-11-18/03-politiques.sql.
--
-- Ces politiques existent DÉJÀ en production : ce fichier sert à versionner leur
-- définition exacte, à la relire et à reconstruire un projet de test. Il n'est pas
-- appliqué automatiquement. Chaque bloc est rejouable (drop if exists puis create).
-- Toute modification doit passer par une migration datée, jamais par ce fichier.

${absentes.map(p => `-- ${p.table} · ${p.nom} (${p.cmd}, ${p.roles})
drop policy if exists ${ident(p.nom)} on public.${ident(p.table)};
${rendu(p)}`).join('\n\n')}
`;
await writeFile(path.join(root, 'sql', 'politiques-production.sql'), sql, 'utf8');

const lignesTable = [...parTable.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
const rapport = [
  '# Politiques RLS de production',
  '',
  `Comparaison entre \`sql/exports/2026-11-18/03-politiques.sql\` et le SQL versionné`,
  `(\`sql/*.sql\` hors instantané, \`supabase/migrations/\`). Généré par \`scripts/auditer-politiques.mjs\`.`,
  '',
  `- Politiques en production : **${production.length}**`,
  `- Politiques versionnées : **${versionne.size}**`,
  `- Absentes du dépôt : **${absentes.length}** (${lecture} de lecture, ${ecriture} d'écriture)`,
  `- Versionnées sans équivalent en production : **${orphelines.length}**`,
  '',
  'Les définitions exactes sont désormais dans [`../sql/politiques-production.sql`](../sql/politiques-production.sql).',
  'Ce fichier est une référence : les politiques existent déjà en production et ne sont pas',
  'réappliquées. Toute évolution passe par une migration datée.',
  '',
  '## Répartition par table',
  '',
  '| Table | Politiques | Lecture | Écriture |',
  '| --- | --- | --- | --- |',
  ...lignesTable.map(([table, liste]) => `| \`${table}\` | ${liste.length} | ${liste.filter(p => p.cmd === 'select').length} | ${liste.filter(p => p.cmd !== 'select').length} |`),
  '',
  '## Relecture de sécurité',
  '',
  '| Table | Politique | Commande | Rôles | Condition |',
  '| --- | --- | --- | --- | --- |',
  ...absentes.map(p => `| \`${p.table}\` | ${p.nom} | ${p.cmd} | ${p.roles} | ${p.using ? `\`${p.using.slice(0, 90)}\`` : '—'}${p.withCheck ? ` · check \`${p.withCheck.slice(0, 60)}\`` : ''} |`),
  '',
  '### Points à vérifier en priorité',
  '',
  ...(absentes.some(p => sensibles.has(p.table))
    ? [`- Tables sensibles concernées : ${[...new Set(absentes.filter(p => sensibles.has(p.table)).map(p => `\`${p.table}\``))].join(', ')}. Vérifier que la condition isole bien l'entreprise (\`org_id = my_org()\`) ou le rôle plateforme.`]
    : ['- Aucune politique de table sensible dans les absentes.']),
  ...(absentes.some(p => /auth\.uid\(\)/.test(p.using + p.withCheck))
    ? [`- Plusieurs politiques reposent sur \`auth.uid()\` : vérifier qu'elles ne permettent pas de lire les données d'un autre utilisateur.`]
    : []),
  ...(absentes.some(p => /\btrue\b/i.test(p.using) && p.cmd !== 'select')
    ? [`- Attention : au moins une politique d'écriture utilise \`true\` comme condition.`]
    : []),
  '',
  '## Politiques ouvertes au rôle public',
  '',
  publiques.length
    ? [
        `${publiques.length} politiques accordées à \`public\` (tous les rôles). \`anon\` reste bloqué`,
        'en pratique : `my_org()` renvoie `null` sans session, donc aucune ligne ne passe. Il vaut',
        'mieux néanmoins les restreindre à `authenticated`. Proposition non appliquée :',
        '[`../sql/exports/2026-11-18/13-politiques-publiques-propose.sql`](../sql/exports/2026-11-18/13-politiques-publiques-propose.sql).',
        '',
        '| Table | Politique |',
        '| --- | --- |',
        ...publiques.map(p => `| \`${p.table}\` | ${p.nom} |`)
      ].join('\n')
    : 'Aucune politique accordée à `public`.',
  '',
  '## Politiques versionnées sans équivalent en production',
  '',
  orphelines.length ? orphelines.map(p => `- \`${p.table}\` · ${p.nom} (${p.fichier})`).join('\n') : 'Aucune.',
  '',
];
await writeFile(path.join(root, 'docs', 'POLITIQUES-RLS.md'), rapport.join('\n'), 'utf8');

const proposition = `-- KaPya ERP — restriction des politiques accordées au rôle public.
-- PROPOSITION — fichier non appliqué.
-- Ces ${publiques.length} politiques visent \`public\` (tous les rôles). anon ne peut rien lire
-- ni écrire : my_org() et auth.uid() renvoient null sans session. Les restreindre à
-- authenticated ferme proprement la porte, sans changer le comportement des comptes
-- connectés ni de service_role (qui contourne RLS).
-- À relire, tester sur un projet de test, puis appliquer en une transaction.

${publiques.map(p => `alter policy ${ident(p.nom)} on public.${ident(p.table)} to authenticated;`).join('\n')}
`;
await writeFile(path.join(exportDir, '13-politiques-publiques-propose.sql'), proposition, 'utf8');

console.log('Écrit : sql/politiques-production.sql, docs/POLITIQUES-RLS.md et la proposition 13.');
return { production, versionne, absentes, orphelines, publiques };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await rapport();
}
