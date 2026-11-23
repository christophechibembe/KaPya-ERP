import { db, newId } from '../api.js';
import { ownOrgRows } from '../own-org.js';
import { esc, n, usdOnly, fld, openDialog, showDialog, ico, getRate, notify, askConfirm } from '../ui.js';
import { can } from '../roles.js';
import { printCreditPaymentReceipt } from '../print.js';
import { planAllows } from '../plans.js';
import { isDemo } from '../demo-mode.js';
import { creditReminder, whatsappLink } from '../credit-reminder.mjs';

const today = () => new Date().toLocaleDateString('sv-SE');
const fr = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '—';
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const totalOf = sale => Math.round((sale.sale_lines || []).reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_price), 0) * 100) / 100;

const waButton = row => planAllows('whatsapp') && row.balance > .005
  ? ` <button class="lnk" type="button" data-remind="${esc(row.id)}">Préparer un rappel WhatsApp</button>` : '';
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
      const [sales, notes, organizations] = await Promise.all([
        // Liste complète des crédits de l'entreprise (toutes boutiques), même pour un facturier ; repli sur la requête normale hors ligne.
         db.rpc('credit_sales_all').catch(() => db.select('sales', 'select=id,customer_id,number,sold_at,customer_label,payment,paid,usd_cdf,customers(name,phone),sale_lines(qty,unit_price,articles(sku,name)),sale_payments(id,amount,paid_at,kind,created_at,customer_deposit_id,customer_deposits(receipt_number))&payment=eq.credit&order=sold_at.desc,created_at.desc')),
        // Le repli hors ligne ne renvoie pas credit_notes_total : les avoirs viennent de la copie locale.
        db.select('credit_notes', 'select=sale_id,total_usd').catch(() => []),
        ownOrgRows('name,address,phone,email,tax_id,rc,logo,receipt_footer').catch(() => [])
      ]);
      org = organizations[0] || {};
      const creditedBySale = new Map();
      (Array.isArray(notes) ? notes : []).forEach(note => creditedBySale.set(note.sale_id, (creditedBySale.get(note.sale_id) || 0) + Number(note.total_usd || 0)));
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
        const credited = sale.credit_notes_total !== undefined && sale.credit_notes_total !== null
          ? Number(sale.credit_notes_total) : (creditedBySale.get(sale.id) || 0);
        return { ...sale, total, paid, credited, balance: Math.max(total - paid - credited, 0), customer: sale.customers?.name || sale.customer_label || 'Client comptoir', phone: sale.customers?.phone || '', sale_payments: events };
      });
      draw();
    } catch (error) {
      $('#credit-table').setAttribute('aria-busy', 'false');
      $('#credit-table').textContent = 'Chargement impossible : ' + error.message;
    }
  }

  function reminder(sale) {
    const dialog = $('#credit-dlg');
    showDialog(dialog, 'Préparer un rappel WhatsApp',
      `<p>Vérifiez le destinataire et le solde avant de partager. Aucun message n’est envoyé automatiquement.</p>
      ${isDemo ? '<p class="notice">Démonstration : l’ouverture de WhatsApp est désactivée. Vous pouvez seulement essayer la préparation du message.</p>' : ''}
      <label for="reminder-phone">Téléphone avec indicatif pays (ex. +243…)</label><input id="reminder-phone" type="tel" maxlength="30" value="${esc(sale.phone || '')}">
      <label for="reminder-text">Message modifiable</label><textarea id="reminder-text" rows="9" maxlength="3500">${esc(creditReminder(sale, rows, org.name, getRate()?.usd_cdf))}</textarea>
      <label><input id="reminder-checked" type="checkbox"> J’ai vérifié le destinataire et le solde.</label>
      <p class="muted">WhatsApp s’ouvrira avec ce texte. Vous devrez encore appuyer sur Envoyer dans WhatsApp.</p>
      <p id="reminder-error" class="err" role="alert"></p><div class="acts"><button class="ghost" id="reminder-copy" type="button">Copier le message</button><a id="reminder-open" class="btn" aria-disabled="true" target="_blank" rel="noopener noreferrer">Ouvrir WhatsApp</a></div>`);
    const phone = dialog.querySelector('#reminder-phone'), text = dialog.querySelector('#reminder-text');
    const checked = dialog.querySelector('#reminder-checked'), link = dialog.querySelector('#reminder-open'), error = dialog.querySelector('#reminder-error');
    const refresh = () => {
      const url = whatsappLink(phone.value, text.value);
      const enabled = !isDemo && checked.checked && !!url;
      link.setAttribute('aria-disabled', String(!enabled));
      if (enabled) link.href = url; else link.removeAttribute('href');
      error.textContent = phone.value && !url ? 'Numéro international invalide ou message vide. Ajoutez l’indicatif pays.' : '';
    };
    for (const field of [phone, text, checked]) field.addEventListener('input', refresh);
    link.onclick = event => { if (link.getAttribute('aria-disabled') === 'true') event.preventDefault(); };
    dialog.querySelector('#reminder-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(text.value); notify('Message copié. Aucun envoi effectué.'); }
      catch { error.textContent = 'Copie indisponible. Sélectionnez le texte puis copiez-le manuellement.'; }
    };
    refresh();
  }

  function details(sale) {
    const payments = [...sale.sale_payments].sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    let paidThroughEvent = 0;
    const paymentRows = payments.length ? payments.map(payment => {
      paidThroughEvent += Number(payment.amount || 0);
      const remainingAfter = Math.max(sale.total - sale.credited - paidThroughEvent, 0);
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
        if (payment) printCreditPaymentReceipt({ org: org.name || 'KaPya ERP', info: org, number: paymentReceiptNumber(sale, payment), invoiceNumber: sale.number || '—', client: sale.customer, date: payment.paid_at, amount: Number(payment.amount), total: sale.total, paid: Number(print.dataset.paidAfter), remaining: Math.max(sale.total - sale.credited - Number(print.dataset.paidAfter), 0), rate: sale.usd_cdf }, '85');
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
    if (!(await askConfirm(`Annuler ${label} de ${usdOnly(payment.amount)} du ${fr(payment.paid_at)} ? Le solde de la facture sera recalculé.`))) return;
    try {
      await db.rpc('cancel_credit_payment', { p_payment_id: payment.id });
      await load();
      const updated = rows.find(row => row.id === sale.id);
      if (updated) details(updated);
    } catch (error) { notify('Annulation impossible : ' + error.message); }
  }

  function collect(sale) {
    const body = fld('amount', 'Montant reçu', 'number', `min="0.01" max="${sale.balance.toFixed(2)}" step="0.01" required value="${sale.balance.toFixed(2)}"`)
      + fld('paid_at', 'Date du paiement', 'date', `required value="${today()}"`)
      + `<label>Mode de paiement<select id="pay-method"><option value="cash">Espèces</option><option value="mobile_money">Mobile money</option><option value="bank">Virement bancaire</option></select></label>`
      + `<label>Référence de la transaction (mobile money ou virement)<input id="pay-ref" type="text" maxlength="80"></label>`
      + `<p class="muted">Reste dû avant ce paiement : ${usdOnly(sale.balance)}</p>`;
    let paymentId = '';
    openDialog($('#credit-dlg'), `Paiement · ${esc(sale.number || 'Facture')}`, body, async values => {
      const amount = Number(values.amount);
      if (!(amount > 0) || amount > sale.balance + 0.005) throw new Error('Le montant doit être positif et ne peut pas dépasser le solde dû.');
      const method = document.getElementById('pay-method')?.value || 'cash';
      if (method === 'cash') paymentId = await db.rpc('record_credit_payment', { p_sale_id: sale.id, p_amount: amount, p_paid_at: values.paid_at, p_id: newId() });
      else paymentId = await db.rpc('record_credit_payment_method', { p_sale_id: sale.id, p_amount: amount, p_paid_at: values.paid_at, p_id: newId(), p_method: method, p_reference: document.getElementById('pay-ref')?.value || '' });
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
    const remind = event.target.closest('[data-remind]');
    if (detail) { const sale = rows.find(row => row.id === detail.dataset.detail); if (sale) details(sale); }
    else if (pay && writable) { const sale = rows.find(row => row.id === pay.dataset.pay); if (sale) collect(sale); }
    else if (remind && planAllows('whatsapp')) { const sale = rows.find(row => row.id === remind.dataset.remind); if (sale) reminder(sale); }
  });
  await load();
}
