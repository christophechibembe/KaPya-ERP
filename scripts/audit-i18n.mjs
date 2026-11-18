// Mesure la couverture de la traduction anglaise de l'interface.
// Le dictionnaire est dans js/i18n.js ; ce script liste les textes visibles qui
// n'y figurent pas encore, page par page, et écrit le rapport en Markdown.
// Usage : node scripts/audit-i18n.mjs [--markdown]
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function clesDictionnaire(source) {
  const debut = source.indexOf('const EN = {');
  if (debut < 0) return [];
  const fin = source.indexOf('\n};', debut);
  const bloc = source.slice(debut, fin);
  return [...bloc.matchAll(/'((?:[^'\\]|\\.)*)'\s*:/g)].map(m => m[1].replace(/\\'/g, "'"));
}

const propre = texte => texte.replace(/\s+/g, ' ').trim();

// Un texte est candidat s'il ressemble à du contenu affiché, pas à du code.
export function candidat(texte) {
  const t = propre(texte);
  if (t.length < 3 || t.length > 180) return false;
  if (!/[a-zA-ZàâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/.test(t)) return false;
  if (/^[\d\s.,;:%$€+()/-]+$/.test(t)) return false;
  if (/[<>{}]|=>|\$\{|\b(function|const|let|var|return|import|export|await|async)\b/.test(t)) return false;
  if (/^(https?:|mailto:|\/|\.\/|#)/.test(t)) return false;
  return true;
}

async function textesHtml(fichier) {
  const html = await readFile(fichier, 'utf8');
  const sansCode = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const trouves = new Set();
  for (const m of sansCode.matchAll(/>([^<>]+)</g)) if (candidat(m[1])) trouves.add(propre(m[1]));
  for (const m of sansCode.matchAll(/(?:placeholder|aria-label|title)="([^"]+)"/g)) if (candidat(m[1])) trouves.add(propre(m[1]));
  return trouves;
}

async function textesModule(fichier) {
  const source = await readFile(fichier, 'utf8');
  const trouves = new Set();
  for (const m of source.matchAll(/>([^<>{}]+)</g)) if (candidat(m[1])) trouves.add(propre(m[1]));
  for (const m of source.matchAll(/(?:notify|kpi|metric|watchRow|section|confirm|alert)\('([^']{3,180})'/g)) if (candidat(m[1])) trouves.add(propre(m[1]));
  return trouves;
}

async function parcourir(dossier, sortie) {
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) { await parcourir(chemin, sortie); continue; }
    if (!entree.name.endsWith('.js') || entree.name === 'i18n.js' || chemin.includes(`${path.sep}vendor${path.sep}`)) continue;
    const textes = await textesModule(chemin);
    if (textes.size) sortie.set(path.relative(root, chemin), textes);
  }
  return sortie;
}

const dictionnaire = new Set(clesDictionnaire(await readFile(path.join(root, 'js', 'i18n.js'), 'utf8')));

export async function rapport({ markdown = false } = {}) {
const parFichier = new Map();
for (const nom of (await readdir(root)).filter(f => f.endsWith('.html')).sort()) {
  parFichier.set(nom, await textesHtml(path.join(root, nom)));
}
await parcourir(path.join(root, 'js'), parFichier);

let total = 0, traduits = 0;
const lignes = [];
for (const [fichier, textes] of parFichier) {
  const manquants = [...textes].filter(t => !dictionnaire.has(t));
  total += textes.size;
  traduits += textes.size - manquants.length;
  lignes.push({ fichier, total: textes.size, manquants: manquants.length, liste: manquants.sort((a, b) => a.localeCompare(b, 'fr')) });
}
lignes.sort((a, b) => b.manquants - a.manquants);

const pourcentage = total ? (traduits / total * 100) : 100;
console.log(`Dictionnaire : ${dictionnaire.size} entrées`);
console.log(`Textes repérés : ${total}`);
console.log(`Traduits : ${traduits} (${pourcentage.toFixed(1)} %)`);
console.log(`À traduire : ${total - traduits}`);
for (const l of lignes.slice(0, 15)) console.log(`  ${String(l.manquants).padStart(4)} / ${String(l.total).padStart(4)}  ${l.fichier}`);

if (markdown) {
  const contenu = [
    '# Traduction anglaise',
    '',
    `Rapport généré par \`scripts/audit-i18n.mjs\` le ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.`,
    '',
    `- Entrées du dictionnaire : **${dictionnaire.size}**`,
    `- Textes visibles repérés : **${total}**`,
    `- Traduits : **${traduits}** (${pourcentage.toFixed(1)} %)`,
    `- Restant à traduire : **${total - traduits}**`,
    '',
    'La traduction fonctionne par correspondance exacte : un texte absent du dictionnaire',
    'reste en français. Le mécanisme est dans `js/i18n.js` (aucune dépendance).',
    '',
    '| Fichier | Textes | À traduire |',
    '| --- | --- | --- |',
    ...lignes.map(l => `| \`${l.fichier}\` | ${l.total} | ${l.manquants} |`),
    '',
    '## Priorités',
    '',
    'Les écrans les plus utilisés d’abord : connexion, tableau de bord, vente, clients,',
    'stock. Le guide (`guide.html`) représente à lui seul la majorité des textes restants',
    'et peut être traité séparément.',
    ''
  ].join('\n');
  await writeFile(path.join(root, 'docs', 'TRADUCTION.md'), contenu, 'utf8');
  console.log('Rapport écrit : docs/TRADUCTION.md');
}

return { total, traduits, pourcentage, lignes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await rapport({ markdown: process.argv.includes('--markdown') });
}
