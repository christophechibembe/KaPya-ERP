// Traduction anglaise : dictionnaire sain et page de connexion entièrement couverte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clesDictionnaire, entreesDictionnaire, textesHtml, rapport } from '../scripts/audit-i18n.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'js', 'i18n.js'), 'utf8');

const entrees = entreesDictionnaire(source).map(entree => [entree.cle, entree.valeur]);

test('le dictionnaire ne contient ni clé dupliquée ni traduction vide', () => {
  const cles = clesDictionnaire(source);
  assert.ok(cles.length >= 140, `au moins 140 entrées attendues, ${cles.length} trouvées`);
  assert.equal(new Set(cles).size, cles.length, 'clé présente deux fois dans le dictionnaire');
  const vides = entrees.filter(([, valeur]) => !valeur.trim());
  assert.deepEqual(vides, [], 'traduction vide');
});

test('la page de connexion est entièrement traduite', async () => {
  // Le nom de la marque et le numéro de version ne se traduisent pas.
  const exceptes = new Set(['KaPya ERP', '© KaPya Digital']);
  const manquants = [...await textesHtml(path.join(root, 'index.html'))]
    .filter(t => !clesDictionnaire(source).includes(t) && !exceptes.has(t) && !/^Version \d/.test(t));
  assert.deepEqual(manquants, [], 'textes non traduits sur la page de connexion');
});

test('le guide et la page de confidentialité sont entièrement traduits', async () => {
  const cles = new Set(clesDictionnaire(source));
  for (const fichier of ['guide.html', 'confidentialite.html']) {
    const html = await readFile(path.join(root, fichier), 'utf8');
    const manquants = [...await textesHtml(path.join(root, fichier))].filter(t => !cles.has(t));
    assert.deepEqual(manquants, [], `textes non traduits dans ${fichier}`);
    assert.match(html, /import \{ watchLanguage \} from '\.\/js\/i18n\.js'/,
      `${fichier} doit charger le moteur de traduction`);
  }
});

test('la couverture de la traduction ne régresse pas', async () => {
  const { total, traduits, pourcentage } = await rapport();
  assert.equal(total - traduits, 0, `textes non traduits restants : ${total - traduits}`);
  assert.ok(pourcentage >= 100, `couverture attendue à 100 %, obtenue ${pourcentage.toFixed(1)} %`);
});
