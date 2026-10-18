// Alertes et rappels : produits à réapprovisionner, crédits clients en retard, factures fournisseur à payer.
// Lecture seule. Les montants sont calculés à partir des pièces existantes.
import { db } from '../api.js';
import { esc, n, usdOnly } from '../ui.js';
import { can } from '../roles.js';

export const LATE_DAYS = 30;
const day = d => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR');
const daysSince = iso => Math.floor((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86400000);
const sum = (lines, key) => (lines || []).reduce((s, l) => s + Number(l.qty || 0) * Number(l[key] || 0), 0);
export const canSeeMoneyAlerts = role => can(role, 'rapports.view');

// Charge toutes les alertes. Utilisé par l'écran et par les notifications du menu.
export async function loadAlerts(role) {
  const canMoney = canSeeMoneyAlerts(role);
  const jobs = [db.select('articles', 'select=id,sku,name,unit,stock,min_stock&order=name')];
  if (canMoney) {
    jobs.push(db.select('sales', 'select=id,number,sold_at,customer_label,paid,customers(name),sale_lines(qty,unit_price)&payment=eq.credit&order=sold_at.asc'));
    jobs.push(db.select('purchase_payment_balances', 'select=purchase_id,opening_balance,purchases(number,bought_at,suppliers(name))'));
    jobs.push(db.select('purchase_payments', 'select=purchase_id,amount'));
  }
  const [articles, sales = [], balances = [], payments = []] = await Promise.all(jobs);

  const stock = articles
    .filter(a => Number(a.stock) <= 0 || (Number(a.min_stock) > 0 && Number(a.stock) <= Number(a.min_stock)))
    .map(a => ({ ...a, out: Number(a.stock) <= 0 }))
    .sort((x, y) => Number(y.out) - Number(x.out));

  const late = canMoney ? sales.map(s => {
    const total = sum(s.sale_lines, 'unit_price');
    const due = Math.max(total - Number(s.paid || 0), 0);
    return { ...s, due, age: daysSince(s.sold_at), name: s.customers?.name || s.customer_label || '—' };
  }).filter(s => s.due > 0.005 && s.age > LATE_DAYS) : [];

  const paidBy = {};
  for (const p of payments) paidBy[p.purchase_id] = (paidBy[p.purchase_id] || 0) + Number(p.amount || 0);
  const unpaid = canMoney ? balances.map(b => ({
    number: b.purchases?.number || '—', supplier: b.purchases?.suppliers?.name || '—',
    date: b.purchases?.bought_at, due: Math.max(Number(b.opening_balance) - (paidBy[b.purchase_id] || 0), 0)
  })).filter(b => b.due > 0.005).sort((x, y) => (x.date || '').localeCompare(y.date || '')) : [];

  return { stock, late, unpaid, canMoney };
}

export async function render(main, ctx) {
  main.innerHTML = `<div class="page-head"><div><h1>Alertes et rappels</h1><p class="sub">Ce qui demande une action aujourd’hui.</p></div></div>
    <div id="al-content" aria-live="polite"><div class="card empty">Chargement…</div></div>`;
  const content = main.querySelector('#al-content');
  try {
    const { stock, late, unpaid, canMoney } = await loadAlerts(ctx?.role);
    const section = (title, count, body) => `<section class="card al-card"><h2>${title} <span class="al-count">${count}</span></h2>${body}</section>`;
    const empty = '<p class="muted">Rien à signaler.</p>';
    content.innerHTML = `
      ${section('Produits à réapprovisionner', stock.length, stock.length
        ? `<div class="tw"><table class="lines"><thead><tr><th>Produit</th><th class="r">Stock</th><th class="r">Minimum</th><th>État</th></tr></thead><tbody>${stock.map(a => `<tr><td>${esc(a.sku)} — ${esc(a.name)}</td><td class="r">${n(a.stock)} ${esc(a.unit)}</td><td class="r">${n(a.min_stock)}</td><td><span class="pill ${a.out ? 'warn' : 'ok'}">${a.out ? 'Rupture' : 'Stock bas'}</span></td></tr>`).join('')}</tbody></table></div>`
        : empty)}
      ${canMoney ? section(`Crédits clients en retard (plus de ${LATE_DAYS} jours)`, late.length, late.length
        ? `<div class="tw"><table class="lines"><thead><tr><th>Facture</th><th>Client</th><th>Date</th><th class="r">Âge</th><th class="r">Reste dû</th></tr></thead><tbody>${late.map(s => `<tr><td>${esc(s.number || '—')}</td><td>${esc(s.name)}</td><td>${day(s.sold_at)}</td><td class="r">${s.age} j</td><td class="r"><b>${usdOnly(s.due)}</b></td></tr>`).join('')}</tbody></table></div>`
        : empty) : ''}
      ${canMoney ? section('Factures fournisseur à payer', unpaid.length, unpaid.length
        ? `<div class="tw"><table class="lines"><thead><tr><th>Achat</th><th>Fournisseur</th><th>Date</th><th class="r">Reste à payer</th></tr></thead><tbody>${unpaid.map(b => `<tr><td>${esc(b.number)}</td><td>${esc(b.supplier)}</td><td>${b.date ? day(b.date) : '—'}</td><td class="r"><b>${usdOnly(b.due)}</b></td></tr>`).join('')}</tbody></table></div>`
        : empty) : ''}
      ${canMoney ? '' : '<p class="muted">Les alertes sur les créances et les dettes fournisseur sont réservées au gérant, au responsable et au comptable.</p>'}`;
  } catch (error) {
    content.innerHTML = `<div class="card"><p class="err">Impossible de charger les alertes : ${esc(error.message)}.</p></div>`;
  }
}
