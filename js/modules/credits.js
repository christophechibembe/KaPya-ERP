import { db, newId } from '../api.js';
import { esc, n, usdOnly, fld, openDialog, showDialog, ico, getRate } from '../ui.js';
import { can } from '../roles.js';
import { printCreditPaymentReceipt } from '../print.js';
import { planAllows } from '../plans.js';

const today = () => new Date().toLocaleDateString('sv-SE');
const fr = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '—';
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const totalOf = sale => Math.round((sale.sale_lines || []).reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_price), 0) * 100) / 100;

// WhatsApp : numéro en chiffres seulement (avec indicatif pays, ex. 243…)
const waNumber = phone => String(phone || '').replace(/\D/g, '');
const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
// Bouton d'envoi du rappel : solde TOTAL du client (toutes ses factures à crédit impayées)
function waButton(row, all, org) {
  if (!planAllows('whatsapp')) return '';
  const debt = all.filter(r => r.customer === row.customer && r.balance > 0.005).reduce((sum, r) => sum + r.balance, 0);
  if (debt <= 0.005) return '';
  if (!waNumber(row.phone)) return ` <span class="wa" aria-disabled="true" title="Ajoutez le numéro du client">WhatsApp</span>`;
  const rate = getRate();
  const fc = rate ? ` (≈ ${Math.round(debt * rate.usd_cdf).toLocaleString('fr-FR')} FC)` : '';
  const text = `Bonjour ${row.customer}, votre solde impayé chez ${org.name || 'notre entreprise'} est de ${usdOnly(debt)}${fc}. Dernière facture ${row.number || ''}, reste à payer ${usdOnly(row.balance)}. Merci de bien vouloir régulariser. Merci.`;
  return ` <a class="wa" href="${waLink(row.phone, text)}" target="_blank" rel="noopener">WhatsApp</a>`;
}
export async function render(main, ctx) {
  const writable = can(ctx?.role, 'credits.write');
  let rows = [], org = {};
  main.innerHTML = `<div class="page-head"><div><h1>Crédits clients</h1><p class="sub">Suivi des factures à crédit, des versements et des soldes à recouvrer.</p></div>
    <div class="acts"><label class="sr" for="credit-q">Rechercher une facture ou un client</label><input id="credit-q" type="search" placeholder="Rechercher…" autocomplete="off">
      <label class="sr" for="credit-filter">Filtrer les factures</label><select id="credit-filter"><option value="open">À recouvrer</option><option value="all">Toutes les factures à crédit</option></select></div></div>
    <div id="summary" class="kpis" aria-live="polite"></div>
    <div class="card tw" id="credit-table" aria-live="polite" aria-busy="true">Chargement…</div><dialog id="credit-dlg"></dialog>`;
  const $ = selector => main.querySelector(selector) || document.getElementById('top-search')?.querySelector(selector);

  function draw() {
    const query = norm($('#credit-q').value.trim());
    const all = $('#credit-filter').value === 'all';
    const visible = rows.filter(row => (all || row.balance > 0.005)
      && (!query || norm([
        row.number, row.customer, row.phone, row.sold_at, fr(row.sold_at), row.payment,
        row.total, row.paid, row.balance,
        ...(row.sale_lines || []).flatMap(line => [line.articles?.sku, line.articles?.name])
      ].join(' ')).includes(query)));
    const outstanding = rows.reduce((sum, row) => sum + row.balance, 0);
    const openCount = rows.filter(row => row.balance > 0.005).length;
    $('#summary').innerHTML = `<div class="card kpi t-orange"><div class="kh"><span>Solde total à recouvrer</span></div><b>${usdOnly(outstanding)}</b><span>${openCount} facture(s) en attente</span></div>
      <div class="card kpi t-blue"><div class="kh"><span>Factures à crédit</span></div><b>${rows.length}</b><span>${rows.filter(row => row.balance <= 0.005).length} soldée(s)</span></div>`;
    $('#credit-table').setAttribute('aria-busy', 'false');
    if (!visible.length) {
      $('#credit-table').innerHTML = `<p class="empty">${rows.length ? 'Aucun résultat pour ce filtre ou cette recherche.' : 'Aucune facture à crédit pour le moment.'}</p>`;
      return;
    }
    $('#credit-table').innerHTML = `<table class="credit-list"><thead><tr><th>Facture</th><th>Date</th><th>Client</th><th class="r">Total</th><th class="r">Versé</th><th class="r">Reste</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${visible.map(row =>
      `<tr><td>${esc(row.number || '—')}</td><td>${fr(row.sold_at)}</td><td>${esc(row.customer)}</td><td class="r">${usdOnly(row.total)}</td><td class="r">${usdOnly(row.paid)}</td><td class="r"><b>${usdOnly(row.balance)}</b></td><td><div class="table-actions"><button class="lnk action-detail" type="button" data-detail="${esc(row.id)}">Détail</button>${writable && row.balance > 0.005 ? ` <button class="lnk action-primary" type="button" data-pay="${esc(row.id)}">Encaisser</button>` : ''}${waButton(row, rows, org)}</div></td></tr>`).join('')}</tbody></table>`;
  }

  async function load() {
    $('#credit-table').setAttribute('aria-busy', 'true');
    try {
      const [sales, organizations] = await Promise.all([
        db.select('sales', 'select=id,number,sold_at,customer_label,payment,paid,usd_cdf,customers(name,phone),sale_lines(qty,unit_price,articles(sku,name)),sale_payments(id,amount,paid_at,kind,created_at,customer_deposit_id,customer_deposits(receipt_number))&payment=eq.credit&order=sold_at.desc,created_at.desc'),
        db.select('organizations', 'select=name,address,phone,email,tax_id,rc,logo').catch(() => [])
      ]);
      org = organizations[0] || {};
      const creditSales = sales.filter(sale => sale.payment === 'credit');
      rows = creditSales.map(sale => {
        const events = sale.sale_payments || [];
        const paid = Number(sale.paid) || 0;
        const recorded = events.reduce((sum, event) => sum + Number(event.amount || 0), 0);
        // Les acomptes déjà saisis lors de la création d'une facture ne sont pas des paiements ultérieurs.
        // Les afficher séparément conserve leur visibilité dans l'historique.
        const initial = Math.max(paid - recorded, 0);
        if (initial > 0.005) events.push({ id: `opening-${sale.id}`, amount: initial, paid_at: sale.sold_at, kind: 'initial' });
        const total = totalOf(sale);
        return { ...sale, total, paid, balance: Math.max(total - paid, 0), customer: sale.customers?.name || sale.customer_label || 'Client comptoir', phone: sale.customers?.phone || '', sale_payments: events };
      });
      draw();
    } catch (error) {
      $('#credit-table').setAttribute('aria-busy', 'false');
      $('#credit-table').textContent = 'Chargement impossible : ' + error.message;
    }
  }

  function details(sale) {
    const payments = [...sale.sale_payments].sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    let paidThroughEvent = 0;
    const paymentRows = payments.length ? payments.map(payment => {
      paidThroughEvent += Number(payment.amount || 0);
      const remainingAfter = Math.max(sale.total - paidThroughEvent, 0);
      const label = payment.offline_pending ? 'Paiement en attente de synchronisation' : payment.kind === 'initial' ? 'Acompte à la facture' : payment.kind === 'advance' ? `Acompte client imputé${payment.customer_deposits?.receipt_number ? ` · ${esc(payment.customer_deposits.receipt_number)}` : ''}` : 'Paiement reçu';
      const editable = writable && !payment.offline_pending && ['payment', 'initial'].includes(payment.kind) && !String(payment.id).startsWith('opening-');
      return `<tr><td>${label}</td><td>${fr(payment.paid_at)}</td><td class="r">${usdOnly(payment.amount)}</td><td><div class="table-actions">${payment.kind === 'payment' && !payment.offline_pending ? `<button class="lnk action-detail" type="button" data-print-payment="${esc(payment.id)}" data-paid-after="${paidThroughEvent}">Réimprimer reçu</button>` : ''}${editable ? `<button class="lnk action-detail" type="button" data-edit-payment="${esc(payment.id)}">Modifier</button> <button class="lnk action-danger" type="button" data-cancel-payment="${esc(payment.id)}">Annuler</button>` : payment.kind === 'initial' ? 'Acompte historique' : ''}</div></td></tr>`;
    }).join('')
      : '<tr><td colspan="4" class="empty">Aucun versement enregistré.</td></tr>';
    const lines = (sale.sale_lines || []).map(line => `<tr><td>${n(line.qty)}</td><td class="r">${usdOnly(line.unit_price)}</td><td class="r">${usdOnly(Number(line.qty) * Number(line.unit_price))}</td></tr>`).join('');
    showDialog($('#credit-dlg'), `Crédit · ${esc(sale.number || 'Facture')}`, `<p>Client : <b>${esc(sale.customer)}</b>${sale.phone ? ` · ${esc(sale.phone)}` : ''}</p>
      <p>Date : ${fr(sale.sold_at)}</p><div class="tw"><table><thead><tr><th>Qté</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr></thead><tbody>${lines || '<tr><td colspan="3">Aucune ligne</td></tr>'}</tbody></table></div>
      <p class="tot">Total : <b>${usdOnly(sale.total)}</b></p><p class="tot">Versé : <b>${usdOnly(sale.paid)}</b></p><p class="tot">Reste à payer : <b>${usdOnly(sale.balance)}</b></p>
      <h3>Historique des versements</h3><div class="tw"><table><thead><tr><th>Type</th><th>Date</th><th class="r">Montant</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${paymentRows}</tbody></table></div>`);
    if (writable && sale.balance > 0.005) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn'; button.textContent = 'Enregistrer un paiement';
      button.onclick = () => { $('#credit-dlg').close(); collect(sale); };
      $('#credit-dlg .row').insertBefore(button, $('#credit-dlg .row').firstChild);
    }
    $('#credit-dlg').onclick = event => {
      const print = event.target.closest('[data-print-payment]');
      const edit = event.target.closest('[data-edit-payment]');
      const cancel = event.target.closest('[data-cancel-payment]');
      if (print) {
        const payment = payments.find(item => item.id === print.dataset.printPayment);
        if (payment) printCreditPaymentReceipt({ org: org.name || 'KaPya ERP', info: org, number: paymentReceiptNumber(sale, payment), invoiceNumber: sale.number || '—', client: sale.customer, date: payment.paid_at, amount: Number(payment.amount), total: sale.total, paid: Number(print.dataset.paidAfter), remaining: Math.max(sale.total - Number(print.dataset.paidAfter), 0), rate: sale.usd_cdf }, '85');
      } else if (edit && writable) {
        const payment = payments.find(item => item.id === edit.dataset.editPayment);
        if (payment) { $('#credit-dlg').close(); editPayment(sale, payment); }
      } else if (cancel && writable) {
        const payment = payments.find(item => item.id === cancel.dataset.cancelPayment);
        if (payment) cancelPayment(sale, payment);
      }
    };
  }

  function editPayment(sale, payment) {
    const max = sale.balance + Number(payment.amount);
    const body = fld('amount', 'Montant reçu', 'number', `min="0.01" max="${max.toFixed(2)}" step="0.01" required value="${Number(payment.amount).toFixed(2)}"`)
      + fld('paid_at', 'Date du paiement', 'date', `required value="${payment.paid_at || today()}"`)
      + `<p class="muted">Le nouveau montant ne peut pas dépasser le solde restant, augmenté de ce paiement.</p>`;
    const label = payment.kind === 'initial' ? 'l’acompte' : 'le paiement';
    openDialog($('#credit-dlg'), `Modifier ${label} · ${esc(sale.number || 'Facture')}`, body, async values => {
      const amount = Number(values.amount);
      if (!(amount > 0) || amount > max + 0.005) throw new Error('Montant invalide ou supérieur au solde dû.');
      await db.rpc('update_credit_payment', { p_payment_id: payment.id, p_amount: amount, p_paid_at: values.paid_at });
    }, () => { load().then(() => { const updated = rows.find(row => row.id === sale.id); if (updated) details(updated); }); });
  }

  async function cancelPayment(sale, payment) {
    const label = payment.kind === 'initial' ? 'l’acompte' : 'le paiement';
    if (!confirm(`Annuler ${label} de ${usdOnly(payment.amount)} du ${fr(payment.paid_at)} ? Le solde de la facture sera recalculé.`)) return;
    try {
      await db.rpc('cancel_credit_payment', { p_payment_id: payment.id });
      await load();
      const updated = rows.find(row => row.id === sale.id);
      if (updated) details(updated);
    } catch (error) { alert('Annulation impossible : ' + error.message); }
  }

  function collect(sale) {
    const body = fld('amount', 'Montant reçu', 'number', `min="0.01" max="${sale.balance.toFixed(2)}" step="0.01" required value="${sale.balance.toFixed(2)}"`)
      + fld('paid_at', 'Date du paiement', 'date', `required value="${today()}"`)
      + `<p class="muted">Reste dû avant ce paiement : ${usdOnly(sale.balance)}</p>`;
    let paymentId = '';
    openDialog($('#credit-dlg'), `Paiement · ${esc(sale.number || 'Facture')}`, body, async values => {
      const amount = Number(values.amount);
      if (!(amount > 0) || amount > sale.balance + 0.005) throw new Error('Le montant doit être positif et ne peut pas dépasser le solde dû.');
      paymentId = await db.rpc('record_credit_payment', { p_sale_id: sale.id, p_amount: amount, p_paid_at: values.paid_at, p_id: newId() });
    }, async () => {
      await load();
      const updated = rows.find(row => row.id === sale.id);
      const payment = updated?.sale_payments.find(item => item.id === paymentId);
      if (updated && payment?.offline_pending) details(updated);
      else if (updated && payment) printCreditPaymentReceipt({ org: org.name || 'KaPya ERP', info: org, number: paymentReceiptNumber(updated, payment), invoiceNumber: updated.number || '—', client: updated.customer, date: payment.paid_at, amount: Number(payment.amount), total: updated.total, paid: updated.paid, remaining: updated.balance, rate: updated.usd_cdf }, '85');
    });
  }

  function paymentReceiptNumber(sale, payment) {
    return `RGT-${sale.number || 'FACTURE'}-${String(payment.id).slice(-6).toUpperCase()}`;
  }

  $('#credit-q').addEventListener('input', draw);
  $('#credit-filter').addEventListener('change', draw);
  $('#credit-table').addEventListener('click', event => {
    const detail = event.target.closest('[data-detail]');
    const pay = event.target.closest('[data-pay]');
    if (detail) { const sale = rows.find(row => row.id === detail.dataset.detail); if (sale) details(sale); }
    else if (pay && writable) { const sale = rows.find(row => row.id === pay.dataset.pay); if (sale) collect(sale); }
  });
  await load();
}

