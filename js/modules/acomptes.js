import { db, pendingFor, newId } from '../api.js';
import { can } from '../roles.js';
import { esc, money, usdOnly, fld, openDialog, showDialog, ico } from '../ui.js';
import { printDepositReceipt } from '../print.js';
import { cget } from '../cache.js';

const today = () => new Date().toLocaleDateString('sv-SE');
const fr = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR') : '—';
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const DEBT_QUERY = 'select=id,payment,paid,customer_id,sale_lines(qty,unit_price)&payment=eq.credit';

export async function render(main, ctx, params) {
  const writable = can(ctx?.role, 'credits.write');
  let rows = [], customers = [], org = {};
  main.innerHTML = `<div class="page-head"><div><h1>Acomptes clients</h1><p class="sub">Enregistrez un dépôt avant la facture, imprimez son reçu, puis utilisez le solde sur une facture ultérieure.</p></div><div class="acts"><label class="sr" for="deposit-q">Rechercher un acompte ou un client</label><input id="deposit-q" type="search" placeholder="Rechercher un reçu ou un client…" autocomplete="off">${writable ? `<button class="btn" id="new-deposit" type="button">${ico('plus')}<span>Enregistrer un dépôt</span></button>` : ''}</div></div>
    <div class="card tw" id="deposit-table" aria-live="polite">Chargement…</div><dialog id="deposit-dlg"></dialog>`;
  const $ = s => main.querySelector(s) || document.getElementById('top-search')?.querySelector(s);

  function drawDeposits() {
    const query = norm($('#deposit-q').value.trim());
    const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) => !query || norm([
      row.receipt_number, row.received_at, row.customers?.name, row.customers?.phone, row.amount, row.remaining,
      Number(row.remaining) > 0.005 ? 'disponible' : 'utilisé'
    ].join(' ')).includes(query));
    $('#deposit-table').innerHTML = visible.length ? `<table class="deposit-list"><thead><tr><th>Reçu</th><th>Date</th><th>Client</th><th class="r">Déposé</th><th class="r">Disponible</th><th>État</th><th></th></tr></thead><tbody>${visible.map(({ row: r, index: i }) => `<tr><td>${esc(r.receipt_number)}</td><td>${fr(r.received_at)}</td><td>${esc(r.customers?.name || '—')}</td><td class="r">${usdOnly(r.amount)}</td><td class="r"><b>${usdOnly(r.remaining)}</b></td><td>${r._offline_pending ? '<span class="pill warn">À synchroniser</span>' : Number(r.remaining) > 0.005 ? 'Disponible' : 'Utilisé'}</td><td><div class="table-actions"><button class="lnk action-detail" type="button" data-receipt="${i}">Voir le reçu</button></div></td></tr>`).join('')}</tbody></table>` : `<p class="empty">${rows.length ? 'Aucun acompte ne correspond à cette recherche.' : 'Aucun acompte enregistré.'}</p>`;
  }

  async function load() {
    try {
      [customers, rows, org] = await Promise.all([
        db.select('customers', 'select=id,name,phone&order=name'),
        db.select('customer_deposits', 'select=id,receipt_number,customer_id,amount,remaining,received_at,created_at,customers(name,phone)&order=received_at.desc,created_at.desc'),
        db.select('organizations', 'select=name,address,phone,email,tax_id,rc,logo').then(r => r[0] || {})
      ]);
      drawDeposits();
    } catch (error) { $('#deposit-table').textContent = 'Chargement impossible : ' + error.message; }
  }

  async function debtFor(customerId) {
    let sales;
    try { sales = await db.select('sales', DEBT_QUERY); }
    catch (error) {
      const cached = await cget(`/rest/v1/sales?${DEBT_QUERY}`).catch(() => undefined);
      if (!Array.isArray(cached)) throw new Error('Connectez-vous une fois pour charger les dettes avant de saisir un dépôt hors ligne.');
      sales = cached;
    }
    const recorded = sales.filter(sale => sale.customer_id === customerId).reduce((sum, sale) => {
      const total = (sale.sale_lines || []).reduce((amount, line) => amount + Number(line.qty) * Number(line.unit_price), 0);
      return sum + Math.max(total - Number(sale.paid || 0), 0);
    }, 0);
    const pendingSales = (await pendingFor('sales')).filter(item => item.status !== 'rejected' && item.body.p_payment === 'credit' && item.body.p_customer === customerId);
    return recorded + pendingSales.reduce((sum, item) => {
      const total = (item.body.p_lines || []).reduce((amount, line) => amount + Number(line.qty) * Number(line.unit_price), 0);
      return sum + Math.max(total - Number(item.body.p_paid || 0) - Number(item.body.p_advance_amount || 0), 0);
    }, 0);
  }

  function receipt(row) {
    showDialog($('#deposit-dlg'), `${row._offline_pending ? 'Reçu provisoire hors ligne' : 'Reçu d’acompte'} · ${esc(row.receipt_number)}`, `<p>Client : <b>${esc(row.customers?.name || '—')}</b></p><p>Date : ${fr(row.received_at)}</p><p class="tot">Montant déposé : <b>${money(row.amount)}</b></p><p>Solde disponible : <b>${money(row.remaining)}</b></p>${row._offline_pending ? '<p class="hint">Reçu provisoire : le numéro définitif sera attribué après synchronisation.</p>' : '<p class="muted">Ce reçu confirme le dépôt d’argent avant l’établissement de la facture.</p>'}`);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn action-primary'; button.textContent = 'Imprimer le reçu';
    button.onclick = () => printDepositReceipt({ org: org.name || 'KaPya ERP', info: org, number: row.receipt_number, date: row.received_at, client: row.customers?.name || '—', amount: Number(row.amount), remaining: Number(row.remaining), pending: !!row._offline_pending }, '85');
    $('#deposit-dlg .row').insertBefore(button, $('#deposit-dlg .row').firstChild);
  }

  if (writable) $('#new-deposit').onclick = () => {
    const body = `<div><label for="deposit-customer-search">Rechercher un client</label><input id="deposit-customer-search" class="picker-search" type="search" placeholder="Nom ou téléphone…" autocomplete="off"><label for="deposit-customer">Client</label><select id="deposit-customer" name="customer" required><option value="">Choisir un client…</option>${customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.phone ? ` · ${esc(c.phone)}` : ''}</option>`).join('')}</select></div>`
      + fld('amount', 'Montant reçu', 'number', 'min="0.01" step="0.01" required')
      + fld('received_at', 'Date du dépôt', 'date', `required value="${today()}"`)
      + '<p class="muted">Après enregistrement, vous pourrez imprimer le reçu à remettre au client.</p><p class="hint bad" id="deposit-debt" role="alert"></p>';
    let createdId;
    openDialog($('#deposit-dlg'), 'Enregistrer un dépôt client', body, async values => {
      if (!values.customer) throw new Error('Choisissez un client.');
      const due = await debtFor(values.customer);
      if (due > 0.005) throw new Error(`Ce client a encore une dette de ${money(due)}. Il faut la régler avant d’enregistrer un nouveau dépôt.`);
      const amount = Number(values.amount);
      if (!(amount > 0)) throw new Error('Le montant doit être supérieur à zéro.');
      createdId = await db.rpc('create_customer_deposit', { p_customer_id: values.customer, p_amount: amount, p_received_at: values.received_at, p_id: newId() });
    }, async () => {
      await load();
      const created = rows.find(r => r.id === createdId);
      if (created) receipt(created);
    }, async form => {
      const customerSelect = form.querySelector('#deposit-customer');
      const customerSearch = form.querySelector('#deposit-customer-search');
      const customerOptions = [...customerSelect.options].map(option => option.cloneNode(true));
      customerSearch.addEventListener('input', () => {
        const query = norm(customerSearch.value.trim());
        customerSelect.replaceChildren(...customerOptions.filter((option, index) => index === 0 || !query || norm(option.textContent).includes(query)).map(option => option.cloneNode(true)));
      });
      const submit = form.querySelector('.row .btn');
      customerSelect.addEventListener('change', async () => {
        const customerId = customerSelect.value;
        const warning = form.querySelector('#deposit-debt');
        warning.textContent = ''; submit.disabled = false;
        if (!customerId) return;
        try {
          const due = await debtFor(customerId);
          if (due > 0.005) { warning.textContent = `Dépôt bloqué : dette restante de ${money(due)}. Le client doit d’abord la régler.`; submit.disabled = true; }
        } catch (error) { warning.textContent = 'Impossible de vérifier la dette : ' + error.message; submit.disabled = true; }
      });
    });
  };
  if (writable && params?.get('nouveau') === '1') $('#new-deposit').click();
  $('#deposit-q').addEventListener('input', drawDeposits);
  $('#deposit-table').onclick = event => { const button = event.target.closest('[data-receipt]'); if (button) receipt(rows[Number(button.dataset.receipt)]); };
  await load();
}
