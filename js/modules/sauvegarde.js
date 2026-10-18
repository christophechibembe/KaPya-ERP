// Sauvegarde : exporte toutes les données de l'entreprise dans un seul fichier JSON.
// Lecture seule : rien n'est modifié. La restauration sera un écran séparé.
import { db } from '../api.js';
import { esc, ico } from '../ui.js';

const APP_VERSION = '66';
const LAST_KEY = 'kp.lastBackup';
// Ordre d'export = ordre de restauration (les tables de référence avant les pièces).
const TABLES = [
  ['settings', ''],
  ['warehouses', 'order=id'],
  ['customers', 'order=id'],
  ['suppliers', 'order=id'],
  ['articles', 'order=id'],
  ['invoice_counters', ''],
  ['customer_deposit_counters', ''],
  ['sales', 'order=id'],
  ['sale_lines', 'order=id'],
  ['sale_payments', 'order=id'],
  ['sale_cost_snapshots', 'order=sale_line_id'],
  ['customer_deposits', 'order=id'],
  ['purchases', 'order=id'],
  ['purchase_lines', 'order=id'],
  ['purchase_payments', 'order=id'],
  ['purchase_payment_balances', 'order=purchase_id'],
  ['stock_moves', 'order=id'],
  ['business_expenses', 'order=id'],
  ['cash_closures', 'order=id'],
  ['transfers', 'order=id'],
  ['transfer_lines', 'order=id'],
  ['audit_log', 'order=id'],
];
const PAGE = 1000;
const LABEL = {
  settings: 'Paramètres et taux', warehouses: 'Dépôts', customers: 'Clients', suppliers: 'Fournisseurs', articles: 'Produits',
  invoice_counters: 'Numérotation des factures', customer_deposit_counters: 'Numérotation des acomptes',
  sales: 'Ventes', sale_lines: 'Lignes de vente', sale_payments: 'Paiements de crédit', sale_cost_snapshots: 'Coûts des ventes',
  customer_deposits: 'Acomptes clients', purchases: 'Achats', purchase_lines: 'Lignes d’achat',
  purchase_payments: 'Paiements fournisseurs', purchase_payment_balances: 'Soldes fournisseurs',
  stock_moves: 'Mouvements de stock', business_expenses: 'Dépenses', cash_closures: 'Clôtures de caisse',
  transfers: 'Transferts', transfer_lines: 'Lignes de transfert', audit_log: 'Historique des actions',
};

// Lit une table entière par pages, pour ne pas dépendre de la limite de lignes de l'API.
async function readTable(name, order) {
  if (!order) return db.select(name, 'select=*');
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await db.select(name, `select=*&${order}&limit=${PAGE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const stamp = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}`;
};

// Remplace les identifiants par de nouveaux, pour pouvoir restaurer dans une autre entreprise sans conflit.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
function remapIds(data) {
  const map = new Map();
  for (const rows of Object.values(data)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) if (r && typeof r.id === 'string' && UUID.test(r.id)) { UUID.lastIndex = 0; map.set(r.id, crypto.randomUUID()); }
  }
  UUID.lastIndex = 0;
  const text = JSON.stringify(data).replace(UUID, m => map.get(m) ?? m);
  return JSON.parse(text);
}

export async function render(main, ctx) {
  const last = localStorage.getItem(LAST_KEY);
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  const reminder = last === null
    ? '<p class="err">Aucune sauvegarde n’a encore été faite sur cet appareil.</p>'
    : days >= 7 ? `<p class="err">Dernière sauvegarde il y a ${days} jours.</p>`
    : `<p class="muted">Dernière sauvegarde : ${new Date(last).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.</p>`;

  main.innerHTML = `<div class="page-head"><div><h1>Sauvegarde</h1><p class="sub">Téléchargez une copie complète des données de l’entreprise.</p></div></div>
    <section class="card">
      ${reminder}
      <p>Le fichier contient toutes les ventes, achats, paiements, clients, fournisseurs, produits, mouvements de stock, clôtures et l’historique des actions. Conservez-le hors de cet appareil (clé USB, disque externe ou messagerie de confiance) : il contient des données personnelles de vos clients.</p>
      <p class="muted">Les comptes utilisateurs et leurs mots de passe ne sont pas inclus. Ils restent gérés par Supabase.</p>
      <div class="acts"><button class="btn" id="bk-go" type="button">Préparer la sauvegarde</button></div>
      <div id="bk-status" aria-live="polite"></div>
    </section>
    <section class="card" id="rs-card">
      <h2>Restaurer une sauvegarde</h2>
      <p class="muted">Possible uniquement dans une entreprise vide (aucune vente, achat, client ni produit). Les stocks, coûts et historique sont restaurés tels quels. Les identifiants sont renouvelés pour éviter tout conflit.</p>
      <input type="file" id="rs-file" accept="application/json,.json" aria-label="Fichier de sauvegarde">
      <div id="rs-preview" aria-live="polite"></div>
      <label class="rs-ack"><input type="checkbox" id="rs-ack"> Je comprends que toutes les données du fichier seront ajoutées à cette entreprise.</label>
      <div class="acts"><button class="btn" id="rs-go" type="button" disabled>Restaurer</button></div>
      <div id="rs-status" aria-live="polite"></div>
    </section>`;
  const go = main.querySelector('#bk-go');
  const status = main.querySelector('#bk-status');

  go.addEventListener('click', async () => {
    go.disabled = true;
    const counts = {};
    const data = {};
    try {
      const [org] = await db.select('organizations', 'select=name').catch(() => [{}]);
      for (let i = 0; i < TABLES.length; i++) {
        const [name, order] = TABLES[i];
        status.innerHTML = `<p class="muted">Lecture : ${esc(LABEL[name] || name)} (${i + 1}/${TABLES.length})…</p>`;
        try {
          data[name] = await readTable(name, order);
        } catch (error) {
          // Une table absente (script non installé) ne doit pas bloquer les autres.
          data[name] = [];
          counts[name] = `ignorée (${error.message})`;
          continue;
        }
        counts[name] = data[name].length;
      }
      status.innerHTML = '<p class="muted">Vérification et création du fichier…</p>';
      const payload = JSON.stringify(data);
      const file = {
        app: 'KaPya ERP',
        format: 1,
        app_version: APP_VERSION,
        exported_at: new Date().toISOString(),
        organization: org?.name || '',
        counts,
        complete: Object.values(counts).every(v => typeof v === 'number'),
        checksum_sha256: await sha256(payload),
        data,
      };
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `kapya-sauvegarde-${stamp()}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      localStorage.setItem(LAST_KEY, new Date().toISOString());

      const total = Object.values(counts).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
      const failed = Object.entries(counts).filter(([, v]) => typeof v !== 'number');
      status.innerHTML = `<div class="card"><p><b>${failed.length ? 'Sauvegarde téléchargée, mais INCOMPLÈTE.' : 'Sauvegarde téléchargée.'}</b> ${total.toLocaleString('fr-FR')} enregistrements.</p>
        ${failed.length ? `<p class="err">Tables non incluses : ${failed.map(([k, v]) => `${esc(LABEL[k] || k)} ${esc(v)}`).join(' ; ')}. Ne pas considérer ce fichier comme une sauvegarde complète tant que ces tables ne sont pas incluses.</p>` : ''}
        <table class="lines"><tbody>${Object.entries(counts).filter(([, v]) => typeof v === 'number').map(([k, v]) => `<tr><td>${esc(LABEL[k] || k)}</td><td class="r">${v.toLocaleString('fr-FR')}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (error) {
      status.innerHTML = `<p class="err">La sauvegarde a échoué : ${esc(error.message)}. Vérifiez la connexion et réessayez.</p>`;
    } finally {
      go.disabled = false;
    }
  });

  // ---- Restauration ----
  const rsFile = main.querySelector('#rs-file');
  const rsAck = main.querySelector('#rs-ack');
  const rsGo = main.querySelector('#rs-go');
  const rsPreview = main.querySelector('#rs-preview');
  const rsStatus = main.querySelector('#rs-status');
  let backup = null;

  const refreshGo = () => { rsGo.disabled = !(backup && rsAck.checked); };
  rsAck.addEventListener('change', refreshGo);

  rsFile.addEventListener('change', async () => {
    backup = null; refreshGo(); rsStatus.innerHTML = '';
    const file = rsFile.files?.[0];
    if (!file) { rsPreview.innerHTML = ''; return; }
    rsPreview.innerHTML = '<p class="muted">Lecture du fichier…</p>';
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.app !== 'KaPya ERP' || parsed.format !== 1 || !parsed.data || typeof parsed.data !== 'object') {
        throw new Error('ce fichier n’est pas une sauvegarde KaPya reconnue');
      }
      if (await sha256(JSON.stringify(parsed.data)) !== parsed.checksum_sha256) {
        throw new Error('le fichier est incomplet ou a été modifié (empreinte invalide)');
      }
      backup = parsed;
      const missing = Object.entries(parsed.counts || {}).filter(([, v]) => typeof v !== 'number').map(([k]) => LABEL[k] || k);
      const total = Object.values(parsed.counts || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
      rsPreview.innerHTML = `${missing.length || parsed.complete === false ? `<p class="err">Sauvegarde incomplète : ${missing.map(esc).join(', ')} ne sont pas dans ce fichier et resteront vides après restauration.</p>` : ''}<div class="card"><p><b>${esc(parsed.organization || 'Entreprise sans nom')}</b> · sauvegarde du ${new Date(parsed.exported_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${total.toLocaleString('fr-FR')} enregistrements</p>
        <table class="lines"><tbody>${Object.entries(parsed.counts || {}).filter(([, v]) => typeof v === 'number').map(([k, v]) => `<tr><td>${esc(LABEL[k] || k)}</td><td class="r">${v.toLocaleString('fr-FR')}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (error) {
      rsPreview.innerHTML = `<p class="err">Fichier refusé : ${esc(error.message)}.</p>`;
    }
    refreshGo();
  });

  rsGo.addEventListener('click', async () => {
    if (!backup || !rsAck.checked) return;
    if (!confirm('Restaurer ce fichier dans l’entreprise actuelle ? Cette opération est vérifiée, mais elle ne doit être faite que dans une entreprise vide.')) return;
    rsGo.disabled = true;
    rsStatus.innerHTML = '<p class="muted">Restauration en cours… ne fermez pas cette page.</p>';
    try {
      const remapped = remapIds(backup.data);
      const result = await db.rpc('restore_backup', { p_data: remapped });
      const counts = result?.counts || {};
      const warnings = result?.warnings || [];
      const total = Object.values(counts).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
      rsStatus.innerHTML = `<div class="card"><p><b>Restauration terminée.</b> ${total.toLocaleString('fr-FR')} enregistrements ajoutés.</p>
        ${warnings.length ? `<p class="err">Attention : le stock de ${warnings.length} produit(s) ne correspond pas à ses mouvements. Vérifiez ces produits dans Stocks.</p>` : ''}
        <p class="muted">Les comptes utilisateurs ne sont pas restaurés : réinvitez l’équipe si nécessaire.</p></div>`;
      backup = null; rsAck.checked = false; rsFile.value = ''; rsPreview.innerHTML = '';
    } catch (error) {
      rsStatus.innerHTML = `<p class="err">La restauration a été annulée, rien n’a été enregistré : ${esc(error.message)}.</p>`;
      refreshGo();
    }
  });
}
