// Impression : facture (avec montants) ou bon de sortie (sans montant), en A4, ticket 85 mm ou 55 mm.
import { esc, money, n, usdOnly, getRate } from './ui.js';
const SIZES = {
  a4: { css: '@page{size:A4;margin:14mm}', cls: 'a4' },
  '85': { css: '@page{size:85mm auto;margin:3mm}', cls: 't85' },
  '55': { css: '@page{size:55mm auto;margin:2mm}', cls: 't55' },
};
function companyHeader(d, i) {
  const details = [
    i.address && `<div class="small">${esc(i.address)}</div>`,
    (i.phone || i.email) && `<div class="small head-pair"><span>${i.phone ? `Tél. : ${esc(i.phone)}` : ''}</span><span>${i.email ? `E-mail : ${esc(i.email)}` : ''}</span></div>`,
    (i.tax_id || i.rc) && `<div class="small head-pair"><span>${i.tax_id ? `NIF : ${esc(i.tax_id)}` : ''}</span><span>${i.rc ? `RC : ${esc(i.rc)}` : ''}</span></div>`,
  ].filter(Boolean).join('');
  return `${i.logo ? `<img class="plogo" src="${i.logo}" alt="">` : ''}<b>${esc(d.org)}</b>${details}`;
}
export function invoiceHtml(d, fmt) {
  const sortie = d.transfer;
  const rows = d.lines.map(l => sortie
    ? `<tr><td>${esc(l.name)}</td><td class="r">${n(l.qty)} ${esc(l.unit || '')}</td></tr>`
    : `<tr><td>${esc(l.name)}</td><td class="r">${n(l.qty)} ${esc(l.unit || '')}</td><td class="r">${usdOnly(l.price)}</td><td class="r">${usdOnly(l.qty * l.price)}</td></tr>`).join('');
  const head = sortie ? '<th>Désignation</th><th class="r">Qté</th>' : '<th>Désignation</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Total</th>';
  const rate = Number(d.rate || getRate()?.usd_cdf || 0);
  const amount = value => { const sign = Number(value) < 0 ? '− ' : ''; const absolute = Math.abs(Number(value)); return `<div class="amount-pair"><b>${sign}${usdOnly(absolute)}</b>${rate ? `<span>${sign}${Math.round(absolute * rate).toLocaleString('fr-FR')} FC</span>` : ''}</div>`; };
  const due = Math.max(Number(d.total || 0) - Number(d.paid || 0), 0);
  const hasAdvance = Number(d.advance || 0) > 0;
  const bas = sortie ? '' : `${d.credit || hasAdvance ? `<div class="tot"><span>Total facture</span>${amount(d.total)}</div>` : ''}
      ${hasAdvance ? `<div class="row payline"><span>Acompte déduit${d.advanceNumber ? ` · reçu ${esc(d.advanceNumber)}` : ''}</span>${amount(-d.advance)}</div>` : ''}
      ${d.credit ? `${d.paidNow > 0 ? `<div class="row payline"><span>Versé à la création</span>${amount(d.paidNow)}</div>` : ''}${due > 0.005 ? `<div class="tot due"><span>Reste à payer</span>${amount(due)}</div>` : `<div class="tot settled"><span>Reste à payer</span>${amount(0)}</div><div class="row settled-label">Facture soldée</div>`}` : `<div class="tot due"><span>Net à payer</span>${amount(Math.max(Number(d.total || 0) - Number(d.advance || 0), 0))}</div>`}`;
  const i = d.info || {};
  const entete = companyHeader(d, i);
  return `<div class="doc ${SIZES[fmt].cls}">
    <div class="hd"><div class="company-head">${entete}</div><div class="doc-title">${sortie ? 'BON DE SORTIE' : 'FACTURE'}</div></div>
    <div class="meta"><div><b>Facture N°</b><span>${esc(d.number)}</span></div>${!sortie ? `<div><b>Nom</b><span>${esc(d.client || 'Client particulier')}</span></div><div><b>Paiement</b><span>${esc(d.paymentLabel || (d.credit ? 'Crédit' : 'Cash'))}</span></div>` : `<div><b>Vers</b><span>${esc(d.dest)}</span></div>`}<div><b>Date</b><span>${esc(String(d.date).split('-').reverse().join('/'))}${d.issueTime ? ` · ${esc(d.issueTime)}` : ''}</span></div></div>
    <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    ${bas}
    <div class="ft">${sortie ? 'Sortie de marchandise' : 'Merci pour votre confiance'}<div class="copyright">Copyright © KaPya Digital</div></div></div>`;
}
export function printDoc(d, fmt) {
  const style = document.getElementById('pagesize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesize' }));
  style.textContent = SIZES[fmt].css;
  const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
  area.innerHTML = invoiceHtml(d, fmt);
  window.print();
}

export function printDepositReceipt(d, fmt = '85') {
  const style = document.getElementById('pagesize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesize' }));
  style.textContent = SIZES[fmt].css;
  const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
  const i = d.info || {};
  const entete = companyHeader(d, i);
  area.innerHTML = `<div class="doc ${SIZES[fmt].cls}"><div class="hd"><div class="company-head">${entete}</div><div class="doc-title">${d.pending ? 'REÇU PROVISOIRE — DÉPÔT HORS LIGNE' : 'REÇU DE DÉPÔT / ACOMPTE'}</div></div>
    <div class="meta"><div><b>Reçu N°</b><span>${esc(d.number)}</span></div><div><b>Client</b><span>${esc(d.client)}</span></div><div><b>Date</b><span>${esc(String(d.date).split('-').reverse().join('/'))}</span></div></div>
    <div class="tot"><span>Montant déposé</span><b>${money(d.amount)}</b></div>
    <div class="row">Ce dépôt est conservé sur le compte du client et pourra être imputé à une prochaine facture.</div>
    <div class="tot"><span>Solde disponible</span><b>${money(d.remaining)}</b></div>
    <div class="ft">${d.pending ? 'Reçu provisoire : le numéro définitif sera attribué après synchronisation.' : 'Reçu remis au client comme preuve de dépôt'}<div class="copyright">Copyright © KaPya Digital</div></div></div>`;
  window.print();
}

export function printCreditPaymentReceipt(d, fmt = '85') {
  const style = document.getElementById('pagesize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesize' }));
  style.textContent = SIZES[fmt].css;
  const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
  const i = d.info || {};
  const amount = value => {
    const rate = Number(d.rate || getRate()?.usd_cdf || 0);
    return `<div class="amount-pair"><b>${usdOnly(value)}</b>${rate ? `<span>${Math.round(Number(value) * rate).toLocaleString('fr-FR')} FC</span>` : ''}</div>`;
  };
  area.innerHTML = `<div class="doc ${SIZES[fmt].cls}"><div class="hd"><div class="company-head">${companyHeader(d, i)}</div><div class="doc-title">REÇU DE PAIEMENT DE DETTE</div></div>
    <div class="meta"><div><b>Reçu N°</b><span>${esc(d.number)}</span></div><div><b>Facture N°</b><span>${esc(d.invoiceNumber)}</span></div><div><b>Client</b><span>${esc(d.client)}</span></div><div><b>Date</b><span>${esc(String(d.date).split('-').reverse().join('/'))}</span></div></div>
    <div class="tot"><span>Total de la facture</span>${amount(d.total)}</div>
    <div class="tot due"><span>Versement reçu aujourd’hui</span>${amount(d.amount)}</div>
    <div class="tot"><span>Solde restant après ce versement</span>${amount(d.remaining)}</div>
    <div class="ft">Reçu remis au client comme preuve de paiement<div class="copyright">Copyright © KaPya Digital</div></div></div>`;
  window.print();
}
