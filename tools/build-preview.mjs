// Génère un aperçu autonome (un seul HTML, données fictives) : node tools/build-preview.mjs sortie.html
import { readFileSync, writeFileSync } from 'node:fs';
const r = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const order = ['config', 'demo', 'cache', 'api', 'ui', 'roles', 'rate', 'modules/stocks', 'modules/doc', 'modules/parties', 'modules/achats', 'modules/ventes', 'modules/accueil', 'modules/fournisseurs', 'modules/clients', 'modules/rapports', 'modules/parametres', 'modules/plus', 'modules/facture', 'modules/abonnes', 'auth', 'app'];
const wrap = (f, src) => {
  const ex = [], name = f.split('/').pop();
  src = src.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+'\.\.?\/(?:modules\/)?(\w+)\.js';?$/gm, (_, a, m) => `const ${a}=__m.${m};`)
    .replace(/^import\s+\{([^}]+)\}\s+from\s+'\.\.?\/(?:modules\/)?(\w+)\.js';?$/gm, (_, a, m) => `const {${a.replace(/(\w+)\s+as\s+(\w+)/g, '$1:$2')}}=__m.${m};`)
    .replace(/^export\s+((?:async\s+)?(?:const|function)\s+(\w+))/gm, (_, d, n) => (ex.push(n), d));
  return `__m.${name}=(()=>{${src}\nreturn {${ex}};})();`;
};
const js = 'const __m={};\n' + order.map(f => wrap(f, r(`js/${f}.js`).replace('demo: false', 'demo: true'))).join('\n');
writeFileSync(process.argv[2], r('index.html').replace(/<script>if\(location\.protocol.*?<\/script>/s, '').replace('<link rel="stylesheet" href="css/theme.css">', `<style>${r('css/theme.css')}</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>${js}</script>`));

// Images intégrées en data URI : l'aperçu reste un fichier unique
import { readFileSync as rf, writeFileSync as wf } from 'node:fs';
let out = rf(process.argv[2], 'utf8');
for (const f of ['assets/logo.png', 'assets/logo-k.png'])
  out = out.split(f).join('data:image/png;base64,' + rf(new URL('../' + f, import.meta.url)).toString('base64'));
out = out.replace(/<script>if\('serviceWorker'.*?<\/script>/s, '').replace('<link rel="manifest" href="manifest.webmanifest">', '');
wf(process.argv[2], out);
