// Rapport complet en texte, construit à partir des données (et non du texte affiché à l'écran).
// Il couvre toutes les ventes, les encaissements par mode, le détail par article et les paiements reçus.
import { db } from './api.js';
import { usdOnly } from './ui.js';

const MODE = { cash: 'Espèces', mobile_money: 'Mobile money', bank: 'Virement' };
const OP = { airtel: 'Airtel', mpesa: 'M-Pesa', orange: 'Orange', autre: 'Autre' };
const modeLabel = (method, operator) => (MODE[method] || 'Espèces') + (method === 'mobile_money' && operator ? ` (${OP[operator] || operator})` : '');
const num = v => Number(v) || 0;
const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n, ' ');

export async function buildFullReport({ from, to, title, company, warehouse = null }) {
  const shopSale = warehouse ? `&warehouse_id=eq.${warehouse}` : '';
  const sales = await db.select('sales', `select=id,number,sold_at,payment,payment_method,payment_operator,customer_label,warehouse_id,customers(name),sale_lines(qty,unit_price,articles(sku,name))&sold_at=gte.${from}&sold_at=lte.${to}${shopSale}&order=sold_at.asc,number.asc&limit=5000`).catch(() => []);
  const saleIds = new Set(sales.map(s => s.id));
  const payments = await db.select('sale_payments', `select=amount,paid_at,kind,method,operator,reference,sale_id,sales(number,customer_label,customers(name),warehouse_id)&paid_at=gte.${from}&paid_at=lte.${to}&kind=in.(initial,payment,advance)&order=paid_at.asc&limit=5000`).catch(() => []);
  const shopPayments = warehouse ? payments.filter(p => p.sales?.warehouse_id === warehouse) : payments;

  // Totaux des ventes
  const saleTotal = s => (s.sale_lines || []).reduce((t, l) => t + num(l.qty) * num(l.unit_price), 0);
  let totalVentes = 0, comptant = { cash: 0, mobile_money: 0, bank: 0 }, credit = 0;
  const byArticle = new Map();
  for (const s of sales) {
    const t = saleTotal(s);
    totalVentes += t;
    if (s.payment === 'credit') credit += t;
    else comptant[s.payment_method || 'cash'] = (comptant[s.payment_method || 'cash'] || 0) + t;
    for (const l of s.sale_lines || []) {
      const key = l.articles?.sku || '?';
      const cur = byArticle.get(key) || { name: l.articles?.name || '', qty: 0, amount: 0 };
      cur.qty += num(l.qty); cur.amount += num(l.qty) * num(l.unit_price);
      byArticle.set(key, cur);
    }
  }
  // Encaissements (versements de crédit et acomptes), par mode
  const encaisse = { cash: 0, mobile_money: 0, bank: 0 };
  const mmByOp = {};
  for (const p of shopPayments) {
    const m = p.method || 'cash';
    encaisse[m] = (encaisse[m] || 0) + num(p.amount);
    if (m === 'mobile_money') { const o = p.operator || 'non renseigné'; mmByOp[o] = (mmByOp[o] || 0) + num(p.amount); }
  }
  const totalEncaisse = Object.values(encaisse).reduce((a, b) => a + b, 0);

  const L = [];
  L.push(`${title} - ${company}`);
  L.push(`Période : du ${from} au ${to}${warehouse ? ' (boutique sélectionnée)' : ' (toutes les boutiques)'}`);
  L.push('');
  L.push('SYNTHÈSE');
  L.push(`  Total des ventes .............. ${usdOnly(totalVentes)}  (${sales.length} facture(s))`);
  L.push(`    dont espèces ................ ${usdOnly(comptant.cash || 0)}`);
  L.push(`    dont mobile money ........... ${usdOnly(comptant.mobile_money || 0)}`);
  L.push(`    dont virement ............... ${usdOnly(comptant.bank || 0)}`);
  L.push(`    dont à crédit ............... ${usdOnly(credit)}`);
  L.push(`  Total encaissé ................ ${usdOnly(totalEncaisse)}`);
  L.push(`    en espèces ................. ${usdOnly(encaisse.cash || 0)}`);
  L.push(`    en mobile money ............ ${usdOnly(encaisse.mobile_money || 0)}`);
  for (const [o, v] of Object.entries(mmByOp)) L.push(`      dont ${(OP[o] || o).padEnd(20, ' ')}... ${usdOnly(v)}`);
  L.push(`    par virement ............... ${usdOnly(encaisse.bank || 0)}`);
  L.push('');
  L.push('VENTES DÉTAILLÉES');
  L.push(`${pad('Date', 11)}${pad('Facture', 13)}${pad('Client', 22)}${pad('Mode', 14)}Total`);
  for (const s of sales) {
    const client = s.customers?.name || s.customer_label || 'Client comptoir';
    const mode = s.payment === 'credit' ? 'Crédit' : modeLabel(s.payment_method, s.payment_operator);
    L.push(`${pad(s.sold_at, 11)}${pad(s.number, 13)}${pad(client, 22)}${pad(mode, 14)}${usdOnly(saleTotal(s))}`);
  }
  if (!sales.length) L.push('  Aucune vente sur cette période.');
  L.push('');
  L.push('PAIEMENTS REÇUS');
  L.push(`${pad('Date', 11)}${pad('Facture', 13)}${pad('Client', 22)}${pad('Mode', 14)}${pad('Référence', 16)}Montant`);
  for (const p of shopPayments) {
    const client = p.sales?.customers?.name || p.sales?.customer_label || '';
    const kind = p.kind === 'initial' ? 'acompte' : p.kind === 'advance' ? 'avance' : '';
    L.push(`${pad(p.paid_at, 11)}${pad(p.sales?.number, 13)}${pad(client, 22)}${pad(modeLabel(p.method, p.operator) + (kind ? ' ' + kind : ''), 14)}${pad(p.reference || '—', 16)}${usdOnly(p.amount)}`);
  }
  if (!shopPayments.length) L.push('  Aucun paiement reçu sur cette période.');
  L.push('');
  L.push('DÉTAIL PAR ARTICLE');
  L.push(`${pad('Réf.', 12)}${pad('Désignation', 28)}${pad('Qté', 8)}Montant`);
  for (const [sku, a] of [...byArticle.entries()].sort((x, y) => y[1].amount - x[1].amount)) {
    L.push(`${pad(sku, 12)}${pad(a.name, 28)}${pad(a.qty, 8)}${usdOnly(a.amount)}`);
  }
  if (!byArticle.size) L.push('  Aucun article vendu sur cette période.');
  L.push('');
  L.push('Montants en dollars US. Le mobile money et le virement ne sont pas compris dans le total des espèces.');
  return L;
}
