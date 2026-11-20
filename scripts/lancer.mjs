// Lancement local de KaPya ERP pour tester.
// - Copie le projet dans un dossier temporaire (le projet original n'est pas modifié).
// - Passe en mode démo (données dans le navigateur, sans Supabase) dans la copie seulement.
// - Lance un serveur local sur http://localhost:8080 (ou un autre port : node scripts/lancer.mjs 9000).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : os.tmpdir();
const out = fs.mkdtempSync(path.join(temp, 'kapya-erp-local-'));
const port = Number(process.argv[2]) || 8080;

fs.cpSync(root, out, {
  recursive: true,
  filter: src => {
    const rel = path.relative(root, src);
    return !(rel === 'node_modules' || rel.startsWith('node_modules' + path.sep) || rel === 'tests' || rel.startsWith('tests' + path.sep) || rel.startsWith('.git'));
  }
});

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/demo') { res.writeHead(302, { Location: '/demo/' }); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(out, p);
  if (!file.startsWith(out)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable : ' + p); }
    // Cache léger : le navigateur ne retélécharge un fichier que s'il a changé (réponse 304 sinon)
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'ETag': etag, 'Cache-Control': 'no-cache' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    fs.readFile(file, (e2, data) => {
      if (e2) { res.writeHead(500); return res.end(); }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
}).listen(port, () => {
  console.log('KaPya ERP lancé en local (mode démo, données dans le navigateur).');
  console.log('Ouvrez : http://localhost:' + port + '/demo/');
  console.log('Pour arrêter : Ctrl+C');
});
