// Exports comptables : ventes, achats et inventaire par dépôt, en CSV (Excel) ou en PDF (impression).
import { db } from '../api.js';
import { ico, esc } from '../ui.js';
import { downloadCsv } from '../export.js';
import { planAllows } from '../plans.js';

const iso = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const today = () => iso(new Date());
const monthStart = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
const sum = (lines, f) => (lines || []).reduce((t, l) => t + f(l), 0);
const r2 = v => Math.round(v * 100) / 100;
const fr = v => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : v);
const withWarehouse = (table, cols, filter) =>
  db.select(table, `select=${cols},warehouses(name)&${filter}`).catch(() => db.select(table, `select=${cols}&${filter}`));

// Chaque fonction renvoie la liste (en-tête inclus) ; CSV et PDF en sont deux sorties.
async function salesRows(from, to) {
  const sales = await withWarehouse('sales', 'id,number,sold_at,payment,paid,customer_label,customers(name),sale_lines(qty,unit_price)',
    `and=(sold_at.gte.${from},sold_at.lte.${to})&order=sold_at.asc,number.asc`);
  const rows = [['Numéro', 'Date', 'Client', 'Dépôt', 'Mode de paiement', 'Total (USD)', 'Versé (USD)', 'Reste dû (USD)']];
  for (const s of sales) {
    const total = r2(sum(s.sale_lines, l => Number(l.qty) * Number(l.unit_price)));
    const paid = r2(Number(s.paid || 0));
    rows.push([s.number || '', s.sold_at, s.customers?.name || s.customer_label || 'Client particulier', s.warehouses?.name || '',
      s.payment === 'credit' ? 'Crédit' : 'Cash', total, paid, r2(Math.max(total - paid, 0))]);
  }
  return rows;
}

async function purchasesRows(from, to) {
  const buys = await withWarehouse('purchases', 'id,number,bought_at,suppliers(name),purchase_lines(qty,unit_cost)',
    `and=(bought_at.gte.${from},bought_at.lte.${to})&order=bought_at.asc,number.asc`);
  const rows = [['Numéro', 'Date', 'Fournisseur', 'Dépôt', 'Total (USD)']];
  for (const p of buys) {
    rows.push([p.number || '', p.bought_at, p.suppliers?.name || '', p.warehouses?.name || '',
      r2(sum(p.purchase_lines, l => Number(l.qty) * Number(l.unit_cost)))]);
  }
  return rows;
}

async function stockRows() {
  const stock = await db.select('warehouse_stock', 'select=warehouse_id,article_id,qty,warehouses(name),articles(sku,name,unit,price_buy)&order=qty.desc');
  const sorted = [...stock].sort((a, b) => (a.warehouses?.name || '').localeCompare(b.warehouses?.name || '', 'fr') || (a.articles?.name || '').localeCompare(b.articles?.name || '', 'fr'));
  const rows = [['Dépôt', 'SKU', 'Produit', 'Unité', 'Quantité', 'Coût unitaire (USD)', 'Valeur (USD)']];
  let valeur = 0;
  for (const r of sorted) {
    const cost = Number(r.articles?.price_buy || 0), qty = Number(r.qty || 0), value = r2(qty * cost);
    valeur += value;
    rows.push([r.warehouses?.name || '', r.articles?.sku || '', r.articles?.name || '', r.articles?.unit || '', qty, r2(cost), value]);
  }
  rows.push(['Total', '', '', '', '', '', r2(valeur)]);
  return rows;
}

// PDF : tableau mis en forme dans #print-area, puis boîte d'impression (« Enregistrer au format PDF »).
function printPdf(title, period, rows) {
  const style = document.getElementById('pagesize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesize' }));
  style.textContent = '@page{size:A4;margin:12mm}';
  const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
  const [head, ...body] = rows;
  const numeric = v => typeof v === 'number';
  area.innerHTML = `<div class="report-print"><h1>${esc(title)}</h1><p>${esc(period)}</p>
    <section class="report-section"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${body.map(r => `<tr>${r.map(v => `<td${numeric(v) ? ' class="r"' : ''}>${esc(numeric(v) ? fr(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>
    <footer>KaPya ERP · édité le ${esc(today())}</footer></div>`;
  window.print();
}

export async function render(main) {
  main.innerHTML = `<div class="page-head"><div><h1>Exports comptables</h1><p class="sub">Téléchargez vos données en CSV (Excel) ou en PDF (impression).</p></div></div>
    <div class="card">
      <div class="grid2">
        <div><label for="ex-from">Du</label><input id="ex-from" type="date" value="${monthStart()}"></div>
        <div><label for="ex-to">Au</label><input id="ex-to" type="date" value="${today()}"></div>
      </div>
      <p class="hint">La période s’applique aux ventes et aux achats. L’inventaire est pris à la date du jour.</p>
      <div class="acts">
        <button class="btn" id="ex-sales" type="button">${ico('sales')}<span>Ventes (CSV)</span></button>
        <button class="btn" id="ex-purchases" type="button">${ico('purchases')}<span>Achats (CSV)</span></button>
        <button class="btn" id="ex-stock" type="button">${ico('stock')}<span>Inventaire (CSV)</span></button>
      </div>
      <div class="acts">
        <button class="ghost" id="ex-sales-pdf" type="button">Ventes (PDF)</button>
        <button class="ghost" id="ex-purchases-pdf" type="button">Achats (PDF)</button>
        <button class="ghost" id="ex-stock-pdf" type="button">Inventaire (PDF)</button>
      </div>
      <p id="ex-msg" role="status" aria-live="polite"></p>
    </div>`;

  if (!planAllows('exports_pdf')) main.querySelectorAll('[id$="-pdf"]').forEach(b => { b.hidden = true; });
  const $ = s => main.querySelector(s);
  const period = () => {
    const from = $('#ex-from').value, to = $('#ex-to').value;
    if (!from || !to || from > to) throw new Error('choisissez une période valide (la date de début doit précéder la date de fin).');
    return { from, to };
  };
  const run = async fn => {
    $('#ex-msg').textContent = 'Préparation de l’export…';
    try { await fn(); $('#ex-msg').textContent = 'Export prêt.'; }
    catch (e) { $('#ex-msg').textContent = 'Export impossible : ' + e.message; }
  };

  // Chaque export : une fonction pour les lignes, une sortie CSV, une sortie PDF.
  const jobs = {
    sales: { rows: () => { const { from, to } = period(); return salesRows(from, to); },
      name: () => { const { from, to } = period(); return `ventes-${from}-au-${to}`; },
      title: 'Ventes', period: () => { const { from, to } = period(); return `Du ${from} au ${to}`; } },
    purchases: { rows: () => { const { from, to } = period(); return purchasesRows(from, to); },
      name: () => { const { from, to } = period(); return `achats-${from}-au-${to}`; },
      title: 'Achats', period: () => { const { from, to } = period(); return `Du ${from} au ${to}`; } },
    stock: { rows: () => stockRows(), name: () => `inventaire-par-depot-${today()}`,
      title: 'Inventaire par dépôt', period: () => `Au ${today()}` },
  };
  for (const [key, job] of Object.entries(jobs)) {
    const csvButton = { sales: '#ex-sales', purchases: '#ex-purchases', stock: '#ex-stock' }[key];
    $(csvButton).onclick = () => run(async () => { const rows = await job.rows(); downloadCsv(job.name(), rows[0], rows.slice(1).map(r => r.map(fr))); });
    $(`${csvButton}-pdf`).onclick = () => run(async () => printPdf(job.title, job.period(), await job.rows()));
  }
}
