// Impression : facture (avec montants) ou bon de sortie (sans montant), en A4, ticket 85 mm ou 55 mm.
import { esc, money, n, usdOnly, getRate, fmtDate } from './ui.js';
const usdAfter = v => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
import { receiptHtml } from './receipt.js';
import { isDemo, demoMark } from './demo-mode.js';
const SIZES = {
  a4: { css: '@page{size:A4;margin:14mm}', cls: 'a4' },
  '85': { css: '@page{size:85mm auto;margin:3mm}', cls: 't85' },
  '55': { css: '@page{size:55mm auto;margin:2mm}', cls: 't55' },
  '80': { css: '@page{size:80mm auto;margin:2mm}', cls: 't80' },
};
function companyHeader(d, i) {
  const details = [
    i.address && `<div class="small">${esc(i.address)}</div>`,
    (i.phone || i.email) && `<div class="small head-pair"><span>${i.phone ? `Tél. : ${esc(i.phone)}` : ''}</span><span>${i.email ? `E-mail : ${esc(i.email)}` : ''}</span></div>`,
    (i.tax_id || i.rc) && `<div class="small head-pair"><span>${i.tax_id ? `NIF : ${esc(i.tax_id)}` : ''}</span><span>${i.rc ? `RC : ${esc(i.rc)}` : ''}</span></div>`,
  ].filter(Boolean).join('');
  return `${logoImg(i.logo)}<b>${esc(d.org)}</b>${details}`;
}
// Logo de l'entreprise, avec le logo KaPya en secours : un document imprimé ne doit jamais être sans logo.
export const FALLBACK_LOGO = 'assets/logo-k.png';
export const companyLogo = logo => (/^(data:image\/|https?:\/\/|\.?\/?assets\/|blob:)/.test(String(logo || '')) ? logo : FALLBACK_LOGO);
const logoImg = logo => `<img class="plogo" src="${esc(companyLogo(logo))}" alt="">`;
export function invoiceHtml(d, fmt) {
  const sortie = d.transfer;
  const rows = d.lines.map(l => sortie
    ? `<tr><td>${esc(l.name)}</td><td class="r">${n(l.qty)} ${esc(l.unit || '')}</td></tr>`
    : `<tr class="art"><td colspan="4"><b>${esc(l.name)}</b></td></tr><tr class="det"><td class="kg">${l.unit_weight ? esc(n(Number(l.qty) * Number(l.unit_weight)) + ' kg') : ''}</td><td class="r" style="font-size:14px;font-weight:bold">${n(l.qty)} ${esc((() => { const s = String(l.unit || ''); const m = s.match(/\(([^)]+)\)\s*$/); return m ? m[1].trim() : s; })())}</td><td class="r" style="font-size:14px;font-weight:bold">${usdAfter(l.price)}</td><td class="r" style="font-size:16px;font-weight:bold">${usdAfter(l.qty * l.price)}</td></tr>`).join('');
  const head = sortie ? '<th>Désignation</th><th class="r">Qté</th>' : '<th>Poids</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Montant</th>';
  const rate = Number(d.rate || getRate()?.usd_cdf || 0);
  const amount = value => { const sign = Number(value) < 0 ? '− ' : ''; const absolute = Math.abs(Number(value)); return `<div class="amount-pair"><b>${sign}${usdAfter(absolute)}</b>${rate ? `<span>${sign}${Math.round(absolute * rate).toLocaleString('fr-FR')} FC</span>` : ''}</div>`; };
  const creditSumForDue = Array.isArray(d.credits) ? d.credits.reduce((t, c) => t + (Number(c.total) || 0), 0) : 0;
  const due = Math.max(Number(d.total || 0) - creditSumForDue - Number(d.paid || 0), 0);
  const hasAdvance = Number(d.advance || 0) > 0;
  const creditsList = Array.isArray(d.credits) ? d.credits : [];
  const creditedSum = creditsList.reduce((t, c) => t + (Number(c.total) || 0), 0);
  const creditsHtml = creditsList.length ? creditsList.map(c => `<div class="row"><span>${esc(c.label || 'Avoir N° ' + c.number)}</span>− ${amount(c.total)}</div>`).join('') + `<div class="tot"><span>Total net</span>${amount(Math.max((Number(d.total) || 0) - creditedSum, 0))}</div>` : '';
  const isProforma = d.title === 'PROFORMA';
  const bas = sortie ? '' : isProforma ? `<div class="tot"><span>Total estimé</span>${amount(d.total)}</div>` : `${creditsHtml}${d.credit || hasAdvance ? `<div class="tot"><span>Total facture</span>${amount(d.total)}</div>` : ''}
      ${!isProforma && hasAdvance ? `<div class="row payline"><span>Acompte déduit${d.advanceNumber ? ` · reçu ${esc(d.advanceNumber)}` : ''}</span>${amount(-d.advance)}</div>` : ''}
      ${!isProforma && d.credit ? `${d.paidNow > 0 ? `<div class="row payline"><span>Versé à la création</span>${amount(d.paidNow)}</div>` : ''}${due > 0.005 ? `<div class="tot due"><span>Reste à payer</span>${amount(due)}</div>` : `<div class="tot settled"><span>Reste à payer</span>${amount(0)}</div><div class="row settled-label">Facture soldée</div>`}` : `<div class="tot due"><span>Net à payer</span>${amount(Math.max(Number(d.total || 0) - Number(d.advance || 0), 0))}</div>`}`;
  const i = d.info || {};
  const entete = companyHeader(d, i);
  return `<div class="doc ${SIZES[fmt].cls}">${isDemo ? demoMark : ''}
    <div class="hd"><div class="company-head">${entete}</div><div class="doc-title">${d.title || (sortie ? 'BON DE SORTIE' : 'FACTURE')}</div></div>
    ${d.pickup && !sortie ? '<div class="pickup-banner">À RETIRER</div>' : ''}
    <div class="meta"><div><b>${isProforma ? 'Proforma N°' : 'Facture N°'}</b><span>${esc(d.number)}</span></div>${!sortie ? `<div><b>Nom</b><span>${esc(d.client || 'Client particulier')}</span></div><div><b>Paiement</b><span>${esc(d.paymentLabel || (d.credit ? 'Crédit' : 'Cash'))}</span></div>` : `<div><b>Vers</b><span>${esc(d.dest)}</span></div>`}<div><b>Date</b><span>${esc(fmtDate(String(d.date)))}${d.issueTime ? ` · ${esc(d.issueTime)}` : ''}</span></div></div>
    <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    ${bas}
    ${i.receipt_footer ? `<div class="small" style="margin-top:6px;white-space:pre-line">${esc(i.receipt_footer)}</div>` : ''}
    <div class="ft">${d.note ? esc(d.note) : (sortie ? 'Sortie de marchandise' : 'Merci pour votre confiance')}<div class="copyright">© KaPya Digital</div></div></div>`;
}
// Ticket 80 mm (85 ou 55) d'une facture de vente : même mise en page que le reçu de la vente rapide.
function ticketViaReceipt(d, fmt = '80') {
  const i = d.info || {};
  const paid = Number(d.paidNow || 0) + Number(d.advance || 0);
  return receiptHtml({
    paper: fmt,
    org: { name: d.org, address: i.address, phone: i.phone, tax_id: i.tax_id, rc: i.rc },
    logo: companyLogo(i.logo), number: d.number || '', date: fmtDate(d.date), title: d.title === 'PROFORMA' ? 'PROFORMA' : '',
    client: d.client || 'Client particulier', method: d.credit ? 'credit' : 'cash', ref: '',
    lines: (d.lines || []).map(l => ({ name: l.name, unit: l.unit || '', unit_weight: l.unit_weight || 0, qty: l.qty, price: l.price, sub: Number(l.qty) * Number(l.price) })),
    total: Number(d.total || 0), paid, kind: d.credit ? 'credit' : 'cash', footer: i.receipt_footer || '',
    money: v => usdAfter(v)
  });
}
// Document complet (HTML) pour un format donné : ticket (85/55 mm) ou A4
function fullDocHtml(d, fmt) {
  if ((fmt === '80' || fmt === '85' || fmt === '55') && !d.transfer) return ticketViaReceipt(d, fmt).replace('<body onload="window.print()">', '<body>');
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Facture</title><style>' + SIZES[fmt].css +
    '.plogo{display:block;max-width:34mm;max-height:18mm;object-fit:contain;margin:0 0 2mm}' +
    '</style></head><body>' + invoiceHtml(d, fmt) + '</body></html>';
}

// Imprime un document HTML via un cadre caché : aucune nouvelle fenêtre ni nouvel onglet n'est ouvert
// Impression : cadre caché (ordinateurs, Chrome, Edge, Safari sur Mac).
// Repli : si le cadre ne peut pas imprimer (certains navigateurs mobiles et iPhone),
// le document s'ouvre dans un onglet et lance la boîte d'impression une fois chargé.
export function printHtml(html) {
  if (isDemo && !html.includes('SANS VALEUR COMMERCIALE')) html = html.replace(/<body([^>]*)>/i, `<body$1>${demoMark}`);
  const fallback = () => {
    const w = window.open('', '_blank', 'noopener');
    if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer, puis réessayez.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* l'utilisateur peut imprimer depuis l'onglet */ } }, 500);
  };
  try {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentDocument;
    if (!doc || !f.contentWindow || typeof f.contentWindow.print !== 'function') { f.remove(); return fallback(); }
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { f.contentWindow.focus(); f.contentWindow.print(); }
      catch { f.remove(); return fallback(); }
      setTimeout(() => f.remove(), 3000);
    }, 400);
  } catch {
    fallback();
  }
}

// Aperçu dans l'application : s'affiche dans une fenêtre de la même application, avec les boutons Imprimer et Fermer
export function previewDoc(d, fmt) {
  const html = fullDocHtml(d, fmt);
  const ov = document.createElement('div');
  ov.className = 'doc-preview-overlay';
  ov.innerHTML = '<div class="doc-preview-box" role="dialog" aria-label="Aperçu de la facture">' +
    '<div class="doc-preview-bar"><b>Aperçu</b><span class="doc-preview-btns"><button class="btn" type="button" data-pp>Imprimer</button><button class="ghost" type="button" data-pc>Fermer</button></span></div>' +
    '<iframe class="doc-preview-frame" title="Aperçu"></iframe></div>';
  document.body.appendChild(ov);
  const fr = ov.querySelector('iframe');
  const doc = fr.contentDocument;
  doc.open(); doc.write(html); doc.close();
  ov.querySelector('[data-pp]').onclick = () => printHtml(html);
  ov.querySelector('[data-pc]').onclick = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  // Échap ferme l'aperçu ; le bouton Fermer reçoit le focus pour un usage au clavier
  const onKey = e => { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  ov.querySelector('[data-pc]').focus();
}

export function printDoc(d, fmt) {
  if (d.transfer && fmt !== 'a4') fmt = 'a4';
  // Ticket : d'abord l'imprimante USB enregistrée (ESC/POS), sinon la boîte d'impression du navigateur
  if (!isDemo && (fmt === '80' || fmt === '85' || fmt === '55') && !d.transfer) {
    import('./thermal-usb.js').then(async m => {
      // Le logo est envoyé en image 1 bit : sans cela, le ticket USB sortait sans logo.
      const logo = await m.rasterizeLogo(companyLogo(d.info?.logo));
      const sent = await m.printRawUsb(m.buildTicketBytes(d, fmt === '55' ? 32 : 42, logo)).catch(() => false);
      if (!sent) printHtml(fullDocHtml(d, fmt));
    }).catch(() => printHtml(fullDocHtml(d, fmt)));
    return;
  }
  printHtml(fullDocHtml(d, fmt));
}

export function printDepositReceipt(d, fmt = '85') {
  const style = document.getElementById('pagesize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesize' }));
  style.textContent = SIZES[fmt].css;
  const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
  const i = d.info || {};
  const entete = companyHeader(d, i);
  area.innerHTML = `<div class="doc ${SIZES[fmt].cls}"><div class="hd"><div class="company-head">${entete}</div><div class="doc-title">${d.pending ? 'REÇU PROVISOIRE — DÉPÔT HORS LIGNE' : 'REÇU DE DÉPÔT / ACOMPTE'}</div></div>
    <div class="meta"><div><b>Reçu N°</b><span>${esc(d.number)}</span></div><div><b>Client</b><span>${esc(d.client)}</span></div><div><b>Date</b><span>${esc(fmtDate(String(d.date)))}</span></div></div>
    <div class="tot"><span>Montant déposé</span><b>${money(d.amount)}</b></div>
    <div class="row">Ce dépôt est conservé sur le compte du client et pourra être imputé à une prochaine facture.</div>
    <div class="tot"><span>Solde disponible</span><b>${money(d.remaining)}</b></div>
    <div class="ft">${d.pending ? 'Reçu provisoire : le numéro définitif sera attribué après synchronisation.' : 'Reçu remis au client comme preuve de dépôt'}<div class="copyright">© KaPya Digital</div></div></div>`;
  window.print();
}

export function printCreditPaymentReceipt(d, fmt = '85') {
  const style = document.getElementById('pagesize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesize' }));
  style.textContent = SIZES[fmt].css;
  const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
  const i = d.info || {};
  const amount = value => {
    const rate = Number(d.rate || getRate()?.usd_cdf || 0);
    return `<div class="amount-pair"><b>${usdAfter(value)}</b>${rate ? `<span>${Math.round(Number(value) * rate).toLocaleString('fr-FR')} FC</span>` : ''}</div>`;
  };
  area.innerHTML = `<div class="doc ${SIZES[fmt].cls}"><div class="hd"><div class="company-head">${companyHeader(d, i)}</div><div class="doc-title">REÇU DE PAIEMENT DE DETTE</div></div>
    <div class="meta"><div><b>Reçu N°</b><span>${esc(d.number)}</span></div><div><b>Facture N°</b><span>${esc(d.invoiceNumber)}</span></div><div><b>Client</b><span>${esc(d.client)}</span></div><div><b>Date</b><span>${esc(fmtDate(String(d.date)))}</span></div></div>
    <div class="tot"><span>Total de la facture</span>${amount(d.total)}</div>
    <div class="tot due"><span>Versement reçu aujourd’hui</span>${amount(d.amount)}</div>
    <div class="tot"><span>Solde restant après ce versement</span>${amount(d.remaining)}</div>
    <div class="ft">Reçu remis au client comme preuve de paiement<div class="copyright">© KaPya Digital</div></div></div>`;
  window.print();
}
