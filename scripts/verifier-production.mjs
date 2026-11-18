// Vérifie la production en ligne : fichiers servis, version publiée, logos des documents,
// entrée mobile et absence de débordement horizontal sur l'écran de connexion.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from '../tests/browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.KAPYA_BASE_URL || 'https://kapya-erp.pages.dev';
const versionSource = await readFile(path.join(root, 'js', 'version.js'), 'utf8');
const build = versionSource.match(/BUILD\s*=\s*'(\d+)'/)?.[1];
const appVersion = versionSource.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!build || !appVersion) throw new Error('js/version.js illisible : BUILD ou APP_VERSION introuvable.');

const checks = [
  {
    url: '/', status: 200, match: /KaPya ERP/, headers: {
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': /camera=\(\)/,
      'strict-transport-security': /max-age=\d+/,
      'content-security-policy': /frame-ancestors 'self'/
    }
  },
  { url: '/js/version.js', status: 200, match: new RegExp(`BUILD = '${build}'`) },
  { url: '/js/modules/vente-rapide.js', status: 200, match: /updateZeroWarning/ },
  { url: '/js/modules/vente-rapide.js', status: 200, match: /printAfter/ },
  { url: '/js/print.js', status: 200, match: /companyLogo/ },
  { url: '/js/print.js', status: 200, match: /rasterizeLogo/ },
  { url: '/js/thermal-usb.js', status: 200, match: /rasterizeLogo/ },
  { url: '/js/receipt.js', status: 200, absent: /@media screen\s*\{\s*\.c img/ },
  { url: '/css/theme.css', status: 200, match: /--vr-detail-height:104px/ },
  { url: '/sw.js', status: 200, match: new RegExp(`build${build}`) },
  { url: '/guide.html', status: 200, match: new RegExp(`data-app-version>Version ${appVersion.replace(/\./g, '\\.')}<`) },
  { url: '/confidentialite.html', status: 200, match: /Confidentialité et conditions d'utilisation/ },
  { url: '/app/confidentialite.html', status: 200, match: /KaPya Digital/ },
  { url: '/app/', status: 200, match: new RegExp(`id="splash-version">Version ${appVersion.replace(/\./g, '\\.')}<`) },
  { url: '/app/js/print.js', status: 200, match: /companyLogo/ },
  { url: '/tests/fixtures/vente-api.mjs', status: 404 },
  { url: '/scripts/lancer.mjs', status: 404 },
  { url: '/package.json', status: 404 },
  { url: '/sql/README.md', status: 404 }
];

for (const check of checks) {
  let response;
  try {
    response = await fetch(base + check.url, { signal: AbortSignal.timeout(20000) });
  } catch {
    response = await fetch(base + check.url, { signal: AbortSignal.timeout(20000) });
  }
  const text = await response.text();
  assert.equal(response.status, check.status, `${check.url} → ${response.status} au lieu de ${check.status}`);
  if (check.match) assert.match(text, check.match, check.url);
  if (check.absent) assert.doesNotMatch(text, check.absent, check.url);
  for (const [header, expected] of Object.entries(check.headers || {})) {
    const value = response.headers.get(header) || '';
    if (expected instanceof RegExp) assert.match(value, expected, `${check.url} → en-tête ${header}`);
    else assert.equal(value, expected, `${check.url} → en-tête ${header}`);
  }
  if (check.url === '/sw.js') assert.equal(response.headers.get('cache-control'), 'no-cache');
  console.log(`${response.status} ${check.url}`);
}

if (!browserPath) {
  console.log('Navigateur absent : contrôle visuel ignoré.');
} else {
  const cleanup = [];
  try {
    const page = await openBrowser({ after: fn => cleanup.push(fn) });
    await page.viewport(1440, 900);
    await page.goto(base);
    const state = await page.evaluate(`(() => ({
      title: document.title,
      loginForm: !!document.querySelector('form'),
      legalLinks: document.querySelectorAll('.auth-legal a').length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
    }))()`);
    assert.equal(state.title, 'KaPya ERP');
    assert.ok(state.loginForm, 'Formulaire de connexion absent.');
    assert.equal(state.legalLinks, 2, 'Liens guide et confidentialité absents de l’écran de connexion.');
    assert.equal(state.horizontalOverflow, false, 'Débordement horizontal sur l’écran de connexion.');
    console.log('Écran de connexion vérifié (titre, formulaire, liens légaux, largeur).');
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
}

console.log(`Production vérifiée : ${base} · ${appVersion} · build ${build}`);
