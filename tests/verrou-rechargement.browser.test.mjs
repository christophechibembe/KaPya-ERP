// Recharger la page ne doit pas lever le verrou : sans ce test, un simple F5
// affichait les données sans saisir le code.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

// Même dérivation que js/lock.js : PBKDF2-SHA256, 600 000 itérations, sel en texte.
const PIN = '4821';
const SALT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const HASH = pbkdf2Sync(PIN, SALT, 600000, 32, 'sha256').toString('hex');

test('Verrou : un rechargement redemande le code', { skip: !browserPath, timeout: 120000 }, async t => {
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Chemin interdit');
      res.setHeader('Content-Type', (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`, page = await openBrowser(t);
  await page.viewport(1280, 900);

  // Session et code déjà présents sur l'appareil, comme au retour d'une utilisation normale.
  await page.command('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      if (!localStorage.getItem('kp.session')) {
        localStorage.setItem('kp.session', JSON.stringify({
          access: 'test', refresh: 'test',
          uid: '00000000-0000-4000-8000-000000000001',
          exp: Date.now() + 3600000, updated: Date.now()
        }));
      }
      if (!localStorage.getItem('kp.lock')) {
        localStorage.setItem('kp.lock', JSON.stringify({
          v: 2, salt: ${JSON.stringify(SALT)}, iterations: 600000,
          hash: ${JSON.stringify(HASH)}, auto: 10, hideLock: true
        }));
      }
    })();`
  });

  const until = condition => page.evaluate(`new Promise((resolve, reject) => {
    const end = Date.now() + 15000;
    const check = () => { if (${condition}) resolve(true); else if (Date.now() > end) reject(new Error('Attente: ' + ${JSON.stringify(condition)})); else setTimeout(check, 30); };
    check();
  })`);
  const submit = pin => page.evaluate(`(() => {
    const input = document.querySelector('#lock-pin');
    input.value = ${JSON.stringify(pin)};
    input.form.requestSubmit();
    return true;
  })()`);

  await page.goto(origin + '/index.html');
  await until(`document.querySelector('#lock-screen')`);
  assert.match(await page.evaluate(`document.querySelector('#lock-screen').textContent`), /Application verrouillée/);

  // Mauvais code : l'écran reste, un message s'affiche.
  await submit('0000');
  await until(`document.querySelector('#lock-screen .err')?.textContent`);
  assert.equal(await page.evaluate(`!!document.querySelector('#lock-screen')`), true);

  // Bon code : l'écran disparaît.
  await submit(PIN);
  await until(`!document.querySelector('#lock-screen')`);

  // Rechargement : le verrou revient avant l'affichage des données.
  await page.goto(origin + '/index.html');
  await until(`document.querySelector('#lock-screen')`);
  assert.equal(await page.evaluate(`!!document.querySelector('#lock-screen')`), true);
});
