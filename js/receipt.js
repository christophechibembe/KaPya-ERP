import { getVat } from './vat.js';
import { isDemo, demoMark } from './demo-mode.js';
// Reçu de vente au format ticket 80 mm. Une seule mise en page, utilisée partout.
// Pure : ne lit ni le réseau ni le DOM. Tous les textes saisis sont échappés.
import { esc } from './escape.js';
const n = v => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const usdAfter = v => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
// Garde seulement l'abréviation entre parenthèses : « Pièce (pce) » devient « pce » ; « kg » reste « kg »
const shortUnit = u => { const s = String(u || ''); const m = s.match(/\(([^)]+)\)\s*$/); return m ? m[1].trim() : s; };

const PAY = { cash: 'Espèces', mobile_money: 'Mobile money', bank: 'Virement', credit: 'À crédit' };
const OP = { airtel: 'Airtel Money', mpesa: 'M-Pesa', orange: 'Orange Money', autre: 'Autre' };

// Largeur du papier : page (mm) et zone imprimable (mm)
export const PAPER = { '80': { page: '80mm', body: 74 }, '85': { page: '85mm', body: 79 }, '55': { page: '55mm', body: 51 } };

export function receiptHtml({ org = {}, number = '', date = '', client = 'Client comptoir', method = 'cash', operator = null, ref = '', lines = [], total = 0, paid = 0, kind = 'cash', footer = '', pickup = false, rate = null, title = '', paper = '80', money = v => String(v), logo = '', paidNow, deposit = 0, depositNumber = '', initialPayment = null, draft = false }) {
  const payLabel = kind === 'credit' ? PAY.credit : (method === 'mobile_money' && operator ? `${PAY.mobile_money} (${OP[operator] || operator})` : (PAY[method] || PAY.cash));
  const rows = lines.map(l => {
    const kg = l.unit_weight ? `${n(Number(l.qty) * Number(l.unit_weight))} kg` : '';
    return `<tr><td class="n">${esc(l.name)}</td><td class="q">${esc(n(l.qty))}${l.unit ? ' ' + esc(shortUnit(l.unit)) : ''}</td><td class="p">${esc(usdAfter(l.price))}</td><td class="t">${esc(usdAfter(l.sub))}</td></tr>`;
  }).join('');
  const reste = Math.max(0, Number(total) - Number(paid));
  const detailedPayment = paidNow != null;
  const initialLabel = initialPayment ? (initialPayment.method === 'mobile_money' && initialPayment.operator ? `${PAY.mobile_money} (${OP[initialPayment.operator] || initialPayment.operator})` : PAY[initialPayment.method] || PAY.cash) : '';
  const paymentHtml = detailedPayment && (kind === 'credit' || deposit > 0)
    ? `${deposit > 0 ? `<div>Acompte client imputé${depositNumber ? ` (${esc(depositNumber)})` : ''} : ${esc(usdAfter(deposit))}</div>` : ''}
      <div>${kind === 'credit' ? 'Acompte reçu maintenant' : 'Paiement de cette vente'} : ${esc(usdAfter(paidNow))}
      ${initialPayment && Number(paidNow) > 0 ? `<br>Mode : ${esc(initialLabel)}${initialPayment.ref ? ` · Réf. : ${esc(initialPayment.ref)}` : ''}` : ''}
      <br><b>Reste dû : ${esc(usdAfter(reste))}</b></div>`
    : kind === 'credit' ? `<div>Acompte reçu : ${esc(usdAfter(paid))}<br><b>Reste dû : ${esc(usdAfter(reste))}</b></div>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu ${esc(number)}</title>
<style>
  @page { size: ${PAPER[paper].page} auto; margin: 3mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; width: ${PAPER[paper].body}mm; margin: 0 auto; font-size: 14px; font-weight: 600; }
  .c { text-align: center; }
  h1 { font-size: 18px; margin: 4px 0; font-weight: 900; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 3px 0; font-size: 13px; vertical-align: top; font-weight: 600; }
  th { text-align: left; border-bottom: 1px solid #000; }
  table { table-layout: fixed; width: 100%; }
  th.n, td.n { width: 40%; }
  th.q, td.q { width: 19%; }
  th.p, td.p { width: 19%; }
  th.t, td.t { width: 22%; }
  .q, .p, .t { text-align: right; white-space: nowrap; padding-left: 4px; }
  td.n { white-space: normal; font-weight: 700; }
  td.q, td.p, td.t { font-size: 13px; font-weight: 700; padding: 4px 0; }
  .n { width: auto; padding-right: 4px; }
  td.n { white-space: normal; font-weight: bold; padding-top: 6px; }
  tr.det td { padding-bottom: 5px; }
  tr.det td.q, tr.det td.p { font-size: 14px; font-weight: 900; }
  tr.det td.t { font-size: 15px; font-weight: 900; }
  td.kg { text-align: left; font-size: 10px; color: #000; white-space: nowrap; }
  .tot { display: flex; justify-content: space-between; font-weight: 900; font-size: 17px; margin-top: 6px; }
  .small { font-size: 12px; color: #000; font-weight: 600; }
  .pickup-banner { background:#000; color:#fff; text-align:center; font-weight:900; font-size:17px; letter-spacing:.08em; padding:5px 0; margin:6px 0; }
  .copy { margin-top: 12px; font-size: 9px; font-weight: 400; color: #000; }
  .tot-stack { display: flex; flex-direction: column; align-items: flex-end; }
  .tot-stack small { font-size: 13px; font-weight: 700; }
  img { max-width: 24mm; max-height: 10mm; }
</style></head>
<body>
  ${isDemo ? demoMark : ''}
  ${logo ? `<div class="c"><img src="${esc(logo)}" alt=""></div>` : ''}
  <h1 class="c">${esc(org.name || 'Entreprise')}</h1>
  <div class="c small">${esc(org.address || '')}${org.phone ? '<br>Tél. ' + esc(org.phone) : ''}${org.tax_id ? '<br>NIF : ' + esc(org.tax_id) : ''}${org.rc ? ' · RC : ' + esc(org.rc) : ''}</div>
  <div class="sep"></div>
  ${draft ? '<div class="c"><b>APERÇU — VENTE NON ENREGISTRÉE</b></div><div class="sep"></div>' : ''}
  ${pickup ? '<div class="pickup-banner">À RETIRER</div>' : ''}
  ${title ? `<div class="c"><b style="font-size:17px">${esc(title)}</b></div>` : ''}
  <div>${number ? `<b>${title ? 'N°' : 'Facture'}</b> : ${esc(number)}<br>` : ''}<b>Date</b> : ${esc(date)}<br><b>Client</b> : ${esc(client)}${title ? '' : `<br><b>Paiement</b> : ${esc(payLabel)}`}${ref ? `<br><b>Réf.</b> : ${esc(ref)}` : ''}</div>
  <div class="sep"></div>
  <table><thead><tr><th class="n">Désignation</th><th class="q">Qté</th><th class="p">P.U</th><th class="t">Total</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sep"></div>
  <div class="tot total-block"><span>${title ? 'TOTAL ESTIMÉ' : 'TOTAL'}</span><span class="tot-stack"><b>${esc(usdAfter(total))}</b>${rate ? `<small>${esc(Math.round(Number(total) * Number(rate)).toLocaleString('fr-FR'))} FC</small>` : ''}</span></div>
  ${vatLineHtml(total, usdAfter)}
  ${paymentHtml}
  <div class="sep"></div>
  ${footer ? `<div class="c small">${esc(footer)}</div>` : ''}
  <div class="c copy">© KaPya Digital</div>
  <div class="c small">Merci de votre confiance.</div>
</body></html>`;
}

// Part de TVA contenue dans le total TTC (affichée seulement si la TVA est activée par l'entreprise)
function vatLineHtml(total, fmt) {
  const v = getVat();
  if (!v.enabled || !(v.rate > 0)) return '';
  const tva = Number(total) - Number(total) / (1 + v.rate / 100);
  return `<div class="tot-vat">dont TVA ${v.rate} % : ${esc(fmt(tva))}</div>`;
}
