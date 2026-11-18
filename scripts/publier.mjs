// Publication complète et contrôlée :
//   versions → tests → dossier public → déploiement Cloudflare Pages → vérification en ligne.
// S'arrête à la première étape en échec. Options :
//   --verifier   vérifie seulement la production, sans publier
//   --preparer   prépare et vérifie le dossier public, sans déployer
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
// Sous Windows, lancer le script npx évite les problèmes de shim .cmd et d'échappement.
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
const npxCommand = existsSync(npxCli) ? [node, [npxCli]] : [npx, []];
const onlyVerify = process.argv.includes('--verifier');
const prepareOnly = process.argv.includes('--preparer');

function run(label, command, args, options = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root, stdio: options.capture ? 'pipe' : 'inherit', encoding: 'utf8', shell: options.shell || false
  });
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) console.error(result.stdout);
      if (result.stderr) console.error(result.stderr);
    }
    console.error(`Échec : ${label}. Publication arrêtée.`);
    process.exit(result.status || 1);
  }
  return result.stdout || '';
}

if (onlyVerify) {
  run('Vérification de la production', node, ['scripts/verifier-production.mjs']);
  process.exit(0);
}

run('Contrôle des versions', node, ['scripts/verifier-version.mjs']);
run('Tests', node, ['--test', 'tests/*.test.mjs']);
run('Sauvegarde du code', node, ['scripts/instantane.mjs']);

const output = run('Préparation du dossier public', node, ['scripts/preparer-cloudflare.mjs'], { capture: true });
const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
let prepared;
try {
  prepared = JSON.parse(line);
} catch {
  console.error('Dossier de publication illisible :', output);
  process.exit(1);
}
console.log(`Dossier prêt : ${prepared.directory} (${prepared.files} fichiers).`);

if (prepareOnly) {
  console.log('Préparation terminée (aucun déploiement demandé).');
  process.exit(0);
}

run('Déploiement Cloudflare Pages', npxCommand[0], [
  ...npxCommand[1], '--yes', 'wrangler', 'pages', 'deploy', prepared.directory,
  '--project-name', 'kapya-erp', '--branch', 'main'
], npxCommand[0] === npx ? { shell: process.platform === 'win32' } : {});

run('Vérification de la production', node, ['scripts/verifier-production.mjs']);

console.log('\nPublication terminée et vérifiée.');
