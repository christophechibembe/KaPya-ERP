// Vérifie que les trois sources de version restent alignées :
// js/version.js (affiché dans l'application), package.json et sw.js (cache du service worker).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const versionSource = await readFile(path.join(root, 'js', 'version.js'), 'utf8');
const APP_VERSION = versionSource.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1] || '';
const BUILD = versionSource.match(/BUILD\s*=\s*'([^']+)'/)?.[1] || '';

if (!/^\d+\.\d+\.\d+$/.test(APP_VERSION)) errors.push(`js/version.js : APP_VERSION invalide (« ${APP_VERSION} »).`);
if (!/^\d+$/.test(BUILD)) errors.push(`js/version.js : BUILD invalide (« ${BUILD} »).`);

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== APP_VERSION) {
  errors.push(`package.json (${pkg.version}) ne correspond pas à js/version.js (${APP_VERSION}).`);
}

const swSource = await readFile(path.join(root, 'sw.js'), 'utf8');
const swVersion = swSource.match(/const VERSION\s*=\s*'([^']+)'/)?.[1] || '';
const expected = `kapya-erp-${APP_VERSION}-build${BUILD}`;
if (swVersion !== expected) {
  errors.push(`sw.js (« ${swVersion} ») ne correspond pas à « ${expected} ».`);
}

if (errors.length) {
  console.error('Versions incohérentes :');
  for (const error of errors) console.error(' - ' + error);
  console.error('Corrigez js/version.js, package.json et sw.js avant de publier.');
  process.exit(1);
}

console.log(`Versions alignées : ${APP_VERSION} · build ${BUILD} (${expected}).`);
