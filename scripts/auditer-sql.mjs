// Audit statique du SQL versionné : RLS, fonctions SECURITY DEFINER, collisions de migrations.
// Lecture seule : ne se connecte à aucune base et ne modifie aucun fichier.
// Usage : node scripts/auditer-sql.mjs [--markdown]
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Tables volontairement fermées : RLS active, aucune politique, accès uniquement
// par des fonctions SECURITY DEFINER (compteurs de numérotation, liste des super-admins).
export const SANS_POLITIQUE_VOLONTAIRE = new Set(['invoice_counters', 'customer_deposit_counters', 'platform_admins', 'document_counters']);

const sansCommentaires = s => s.replace(/--[^\n]*/g, '');

export async function auditer(base = root) {
  const sqlDir = path.join(base, 'sql');
  const migrationsDir = path.join(base, 'supabase', 'migrations');

  const fichiers = (await readdir(sqlDir))
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => (a === 'schema.sql' ? -1 : b === 'schema.sql' ? 1 : a.localeCompare(b)));

  const sources = [];
  for (const f of fichiers) sources.push({ fichier: f, texte: sansCommentaires(await readFile(path.join(sqlDir, f), 'utf8')) });
  const tout = sources.map(s => s.texte).join('\n');

  const tables = new Set();
  for (const m of tout.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(/gi)) tables.add(m[1].toLowerCase());

  const rls = new Set();
  for (const m of tout.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi)) rls.add(m[1].toLowerCase());

  const politiques = new Map();
  const ajouterPolitique = t => politiques.set(t, (politiques.get(t) || 0) + 1);
  for (const m of tout.matchAll(/create\s+policy\s+(?:"[^"]+"|\w+)\s+on\s+(?:public\.)?"?(\w+)"?/gi)) ajouterPolitique(m[1].toLowerCase());

  // Boucle dynamique de schema.sql : une activation RLS et 4 politiques par table listée.
  for (const m of tout.matchAll(/foreach\s+\w+\s+in\s+array\s+array\s*\[([^\]]+)\][\s\S]{0,400}?alter\s+table\s+public\.%I\s+enable\s+row\s+level\s+security/gi)) {
    for (const nom of m[1].matchAll(/'(\w+)'/g)) {
      const t = nom[1].toLowerCase();
      rls.add(t);
      for (let i = 0; i < 4; i++) ajouterPolitique(t);
    }
  }

  const fonctions = [];
  for (const { fichier, texte } of sources) {
    const marques = [...texte.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\(/gi)];
    marques.forEach((m, i) => {
      const fin = i + 1 < marques.length ? marques[i + 1].index : texte.length;
      const corps = texte.slice(m.index, fin);
      fonctions.push({
        fichier,
        nom: m[1].toLowerCase(),
        definer: /security\s+definer/i.test(corps),
        searchPath: /set\s+search_path\s*(?:=\s*|to\s+)\S/i.test(corps),
        grantAnon: /grant\s+execute[^;]*\bto\b[^;]*\banon\b/i.test(corps),
      });
    });
  }

  const migrations = (await readdir(migrationsDir))
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => ({ fichier: f, version: f.split('_')[0] }));

  const parVersion = new Map();
  for (const m of migrations) parVersion.set(m.version, [...(parVersion.get(m.version) || []), m.fichier]);

  const toutes = [...tables].sort();
  return {
    resume: {
      tables: tables.size,
      avecRls: rls.size,
      tablesAvecPolitique: politiques.size,
      fonctions: fonctions.length,
      definer: fonctions.filter(f => f.definer).length,
      migrations: migrations.length,
    },
    tables,
    sansRls: toutes.filter(t => !rls.has(t)),
    sansPolitique: toutes.filter(t => rls.has(t) && !politiques.has(t) && !SANS_POLITIQUE_VOLONTAIRE.has(t)),
    fermeesVolontairement: toutes.filter(t => SANS_POLITIQUE_VOLONTAIRE.has(t) && !politiques.has(t)),
    definerSansSearchPath: fonctions.filter(f => f.definer && !f.searchPath).map(f => `${f.nom} (${f.fichier})`).sort(),
    definerAnon: fonctions.filter(f => f.definer && f.grantAnon).map(f => `${f.nom} (${f.fichier})`).sort(),
    collisions: [...parVersion].filter(([, fs]) => fs.length > 1),
    nommageMigrations: migrations.filter(m => !/^\d{14}_[a-z0-9_-]+\.sql$/.test(m.fichier)).map(m => m.fichier),
    migrations,
  };
}

const lister = (items, prefixe = '- ') => (items.length ? items.map(i => prefixe + i).join('\n') : 'Aucune.');

export function rapportMarkdown(a) {
  return [
    '# Audit statique du SQL',
    '',
    'Généré par `node scripts/auditer-sql.mjs`. Analyse du SQL versionné uniquement :',
    'aucune connexion à la base, aucune garantie que ces fichiers sont appliqués en production.',
    '',
    `- Tables déclarées : **${a.resume.tables}**`,
    `- Tables avec RLS activée : **${a.resume.avecRls}**`,
    `- Tables avec au moins une politique : **${a.resume.tablesAvecPolitique}**`,
    `- Fonctions : **${a.resume.fonctions}**, dont **${a.resume.definer}** en \`SECURITY DEFINER\``,
    `- Migrations : **${a.resume.migrations}**`,
    '',
    `## Tables sans RLS (${a.sansRls.length})`,
    '',
    lister(a.sansRls.map(t => `\`${t}\``)),
    '',
    `## Tables avec RLS mais sans politique (${a.sansPolitique.length})`,
    '',
    lister(a.sansPolitique.map(t => `\`${t}\``)),
    '',
    `## Tables fermées volontairement (${a.fermeesVolontairement.length})`,
    '',
    "RLS active, aucune politique : seul un accès par fonction `SECURITY DEFINER` est possible.",
    '',
    lister(a.fermeesVolontairement.map(t => `\`${t}\``)),
    '',
    `## Fonctions SECURITY DEFINER sans SET search_path (${a.definerSansSearchPath.length})`,
    '',
    lister(a.definerSansSearchPath.map(f => `\`${f}\``)),
    '',
    `## Fonctions SECURITY DEFINER exécutables par anon (${a.definerAnon.length})`,
    '',
    lister(a.definerAnon.map(f => `\`${f}\``)),
    '',
    `## Versions de migration en collision (${a.collisions.length})`,
    '',
    lister(a.collisions.map(([v, fs]) => `\`${v}\` : ${fs.join(', ')}`)),
    '',
    '## Noms de migration non conformes',
    '',
    lister(a.nommageMigrations.map(f => `\`${f}\``)),
    '',
  ].join('\n');
}

const estLanceDirectement = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (estLanceDirectement) {
  const a = await auditer();
  const rapport = rapportMarkdown(a);
  if (process.argv.includes('--markdown')) {
    await writeFile(path.join(root, 'docs', 'AUDIT-STATIQUE-SQL.md'), rapport, 'utf8');
    console.log('Rapport écrit : docs/AUDIT-STATIQUE-SQL.md');
  } else {
    console.log(rapport);
  }
}
