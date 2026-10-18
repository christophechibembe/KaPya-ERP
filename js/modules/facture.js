// Facturation : nouvelle facture, modification, transfert (sortie sans montant), impression (85 mm par défaut).
import { db, newId } from '../api.js';
import { esc, n, money, ico, getRate } from '../ui.js';
import { printDoc } from '../print.js';
import { cget, ckeys } from '../cache.js';
import { planAllows } from '../plans.js';
const today = () => new Date().toLocaleDateString('sv-SE');
const label = a => `${a.sku} — ${a.name}`;

export async function render(main, ctx, params) {
  const editId = params?.get('edit') || null;
  let arts = [], customers = [], lines = [], orig = {}, editing = null, lastSnap = null, orgName = 'KaPya ERP', orgInfo = {};
  main.innerHTML = `<div class="page-head"><div><h1>${editId ? 'Modifier la facture' : 'Facturation'}</h1><p class="sub" id="psub">${editId ? '' : 'Numéro attribué automatiquement.'}</p></div>
      <div class="head-acts">${editId ? '<a class="ghost" href="#/ventes">Retour aux ventes</a>' : '<a class="ghost" href="#/ventes">Voir les ventes</a>'}
        <label class="datebox"><span class="sr">Date de la facture</span><input id="date" type="date" value="${today()}"></label></div></div>
    <div class="facture card" id="fcard">
      <label class="opt trf"><input type="checkbox" id="trf"> <b>Transférer</b> <span class="muted">— sortie de marchandise vers un vendeur, sans montant ni vente</span></label>
    <div class="wh-row" id="wh-row" hidden><label for="wh">Dépôt de sortie</label><select id="wh"></select></div>
      <div class="grid2" id="saleFields">
        <div id="cash-client-field"><label for="cli">Client</label><input id="cli" list="clis" placeholder="Client particulier" autocomplete="off"><datalist id="clis"></datalist><small class="hint">Écrivez le nom, ou laissez vide : « Client particulier ».</small></div>
        <div><label for="pay">Mode de paiement</label><select id="pay"><option value="cash">Cash</option><option value="credit">Crédit</option></select><small class="hint" id="payment-mode-hint">Cette vente sera enregistrée comme une vente cash.</small></div>
        <div id="credit-client-field" hidden><label for="credit-client-search">Rechercher un client</label><input id="credit-client-search" type="search" placeholder="Nom du client…" autocomplete="off"><label for="credit-client">Client à crédit</label><select id="credit-client"><option value="">Choisir un client…</option></select><small class="hint">Une fiche client est obligatoire pour une vente à crédit.</small></div>
      </div>
      <div class="grid2" id="transferFields" hidden>
        <div><label for="dest">Vers (vendeur ou point de vente)</label><input id="dest" placeholder="Ex. Vendeur Jean" autocomplete="off"></div>
        <div><label for="note">Note (facultatif)</label><input id="note" placeholder="Ex. ouverture de la journée"></div>
      </div>
      <div class="addline">
        <div class="grow"><label for="prod">Produit</label><input id="prod" list="arts" placeholder="Rechercher un produit…" autocomplete="off"><datalist id="arts"></datalist></div>
        <div class="qbox"><label for="qty">Quantité</label><input id="qty" type="number" min="0.001" step="any" value="1"></div>
        <button class="btn" id="add" type="button">${ico('plus')}<span>Ajouter</span></button>
      </div>
      <p class="hint bad" id="addErr" role="alert"></p>
      <div class="tw"><table class="lines"><thead><tr><th>Produit</th><th class="r">Qté</th><th class="r money">Prix unitaire</th><th class="r money">Total</th><th class="c">Actions</th></tr></thead>
        <tbody id="rows"></tbody></table></div>
      <div class="sumbox">
        <div class="srow"><span>Articles (<span id="cnt">0</span>)</span><span id="sub">$ 0,00</span></div>
        <div class="srow big"><span>Total à payer</span><span id="tot">$ 0,00</span></div>
        <small id="fc" class="muted"></small>
        <div id="creditbox" hidden>
          <div class="srow"><label for="paid">Montant versé maintenant</label><input id="paid" type="number" min="0" step="any" value="0"></div>
          <div class="srow"><span>Reste à payer</span><b id="rest">$ 0,00</b></div>
        </div>
        <div id="advance-fields" hidden>
          <div class="srow"><label for="deposit">Acompte déjà déposé</label><select id="deposit"><option value="">Aucun acompte utilisé</option></select></div>
          <div class="srow"><label for="advance-amount">Montant de l’acompte à imputer</label><input id="advance-amount" type="number" min="0" step="0.01" value="0"></div>
          <small id="advancehint" class="muted">Choisissez d’abord un client ayant un acompte disponible.</small>
          <div class="srow"><span>Reste après acompte et paiement</span><b id="advance-rest">$ 0,00</b></div>
        </div>
      </div>
      <p class="err" id="err" role="alert"></p>
      <div class="acts end">
        <button class="ghost" id="reset" type="button">${editId ? 'Annuler' : 'Vider'}</button>
        <span class="printgroup"><select id="fmt" aria-label="Format d’impression"><option value="85" selected>Ticket 85 mm</option><option value="a4">A4</option><option value="55">Ticket 55 mm</option></select>
          <button class="ghost" id="print" type="button">${ico('edit')}<span>Imprimer et enregistrer</span></button></span>
        <button class="btn" id="save" type="button">${ico('check')}<span>${editId ? 'Enregistrer les modifications' : 'Enregistrer la facture'}</span></button>
      </div>
      <p class="done" id="done" hidden></p>
    </div>`;
  const $ = s => main.querySelector(s);
  const isTransfer = () => $('#trf').checked;
  // Dépôt de sortie : affiché seulement si l'entreprise a plusieurs dépôts actifs. Vide = dépôt principal.
  const warehouseChoice = () => (editing || $('#wh-row').hidden) ? null : ($('#wh').value || null);
  db.select('warehouses', 'select=id,name,is_default&active=eq.true&order=is_default.desc,name').then(list => {
    if (list.length < 2) return;
    $('#wh').innerHTML = list.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
    $('#wh-row').hidden = false;
  }).catch(() => {});
  const total = () => lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  // Nom du client saisi librement ; vide = « Client particulier » ; lié à une fiche si le nom correspond
  const clientName = () => $('#pay').value === 'credit' ? (customers.find(c => c.id === $('#credit-client').value)?.name || '') : ($('#cli').value.trim() || 'Client particulier');
  const customerIdFor = name => $('#pay').value === 'credit' ? ($('#credit-client').value || null) : (name === 'Client particulier' ? null : (customers.find(c => c.name.toLowerCase() === name.toLowerCase())?.id || null));
  if (editId) $('.opt.trf').hidden = true;
  if (!planAllows('transferts')) $('.opt.trf').hidden = true;

  function draw() {
    const tr = isTransfer();
    $('#fcard').classList.toggle('is-transfer', tr);
    $('#saleFields').hidden = tr; $('#transferFields').hidden = !tr;
    $('#advance-fields').hidden = tr || !!editing;
    const creditMode = $('#pay').value === 'credit';
    $('#payment-mode-hint').textContent = creditMode ? 'Cette vente sera enregistrée comme un crédit client.' : 'Cette vente sera enregistrée comme une vente cash.';
    $('#cash-client-field').hidden = creditMode;
    $('#credit-client-field').hidden = !creditMode;
    $('#credit-client').required = creditMode;
    $('#save').querySelector('span').textContent = editing ? 'Enregistrer les modifications' : (tr ? 'Enregistrer la sortie' : 'Enregistrer la facture');
    $('#rows').innerHTML = lines.map((l, i) => `<tr>
      <td>${esc(l.sku)} — ${esc(l.name)}</td>
      <td class="r"><input class="cell" type="number" min="0.001" step="any" value="${l.qty}" data-i="${i}" data-k="qty" aria-label="Quantité de ${esc(l.name)}"></td>
      <td class="r money"><input class="cell" type="number" min="0" step="any" value="${l.unit_price}" data-i="${i}" data-k="unit_price" aria-label="Prix de ${esc(l.name)}"></td>
      <td class="r money">${money(l.qty * l.unit_price)}</td>
      <td class="c"><button class="iconbtn del" type="button" data-rm="${i}" aria-label="Supprimer la ligne">${ico('trash')}</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">Aucun produit pour l’instant.</td></tr>';
    const t = total(), r = getRate(), paid = Math.min(Math.max(+$('#paid').value || 0, 0), t), advance = Math.max(+$('#advance-amount').value || 0, 0);
    $('#cnt').textContent = lines.length; $('#sub').textContent = money(t); $('#tot').textContent = money(t);
    $('#fc').textContent = r ? `≈ ${Math.round(t * r.usd_cdf).toLocaleString('fr-FR')} FC` : '';
    $('#rest').textContent = money(t - paid - advance);
    const paidNow = $('#pay').value === 'credit' ? paid : Math.max(t - advance, 0);
    $('#advance-rest').textContent = money(Math.max(t - paidNow - advance, 0));
  }
  // Stock disponible : pour une modification, les quantités déjà sorties de cette facture sont comptées comme disponibles
  function stockProblem() {
    const need = {}; lines.forEach(l => need[l.article_id] = (need[l.article_id] || 0) + l.qty);
    for (const [id, q] of Object.entries(need)) {
      const a = arts.find(x => x.id === id); if (!a) continue;
      const avail = +a.stock + (orig[id] || 0);
      if (q > avail) return `Stock insuffisant pour ${a.name} : ${n(avail)} ${a.unit} disponible(s).`;
    }
    return '';
  }
  function snapshot() {
    const tr = isTransfer(), t = total(), credit = $('#pay').value === 'credit';
    const advance = editing ? 0 : Math.max(+$('#advance-amount').value || 0, 0);
    const paidNow = credit ? Math.min(Math.max(+$('#paid').value || 0, 0), Math.max(t - advance, 0)) : Math.max(t - advance, 0);
    return { org: orgName, info: orgInfo, date: $('#date').value || today(), transfer: tr, dest: $('#dest').value.trim(), number: editing?.number || '—',
      client: clientName(), credit, paymentLabel: tr ? 'Transfert' : (credit ? 'Crédit' : 'Cash'), issueTime: new Date().toLocaleTimeString('fr-FR'), advance, advanceNumber: editing ? '' : ($('#deposit').selectedOptions[0]?.textContent.split(' · ')[0] || ''),
      paidNow, paid: Math.min(paidNow + advance, t), rate: getRate()?.usd_cdf || null, total: t,
      lines: lines.map(l => ({ name: l.name, unit: l.unit, qty: l.qty, price: l.unit_price })) };
  }
  function reset() {
    lines = []; $('#dest').value = ''; $('#note').value = ''; $('#cli').value = ''; $('#credit-client').value = ''; $('#pay').value = 'cash'; $('#paid').value = 0; $('#advance-amount').value = 0; $('#deposit').innerHTML = '<option value="">Aucun acompte utilisé</option>'; $('#creditbox').hidden = true; $('#advance-fields').hidden = true;
    $('#err').textContent = ''; $('#addErr').textContent = ''; $('#prod').value = ''; $('#qty').value = 1; draw();
  }
  function showDone(msg) {
    const d = $('#done'); d.hidden = false;
    d.innerHTML = `${msg} <div class="doneacts"><button class="lnk" id="again" type="button">${editing ? 'Retour aux ventes' : 'Nouvelle facture'}</button></div>`;
    d.querySelector('#again').onclick = () => { if (editing) location.hash = '#/ventes'; else { d.hidden = true; } };
  }

  async function load() {
    try {
      [arts, customers] = await Promise.all([
        db.select('articles', 'select=id,sku,name,unit,price_sell,stock&order=name'),
        db.select('customers', 'select=id,name&order=name')]);
      $('#arts').innerHTML = arts.map(a => `<option value="${esc(label(a))}">Stock ${n(a.stock)}</option>`).join('');
      $('#clis').innerHTML = customers.map(c => `<option value="${esc(c.name)}">`).join('');
      $('#credit-client').insertAdjacentHTML('beforeend', customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join(''));
      if (editId) await loadEdit();
      draw();
    } catch (e) { $('#err').textContent = 'Chargement impossible : ' + e.message; }
  }
  async function loadEdit() {
    let s;
    try { [s] = await db.select('sales', `id=eq.${editId}&select=id,number,customer_id,customer_label,payment,paid,sold_at,sale_lines(article_id,qty,unit_price)`); }
    catch (error) {
      if (navigator.onLine) throw error;
      for (const key of (await ckeys()).filter(value => typeof value === 'string' && value.startsWith('/rest/v1/sales?'))) {
        const cached = await cget(key);
        if (Array.isArray(cached)) s = cached.find(row => row.id === editId);
        if (s) break;
      }
      if (s) {
        s.customer_id ||= customers.find(customer => customer.name === s.customers?.name)?.id || null;
        s.sale_lines = (s.sale_lines || []).map(line => ({ ...line, article_id: line.article_id || arts.find(article => article.sku === line.articles?.sku)?.id }));
      }
    }
    if (!s) throw new Error('Facture introuvable.');
    editing = { id: s.id, number: s.number };
    $('#psub').textContent = `N° ${s.number} — modification`;
    $('#date').value = s.sold_at; $('#pay').value = s.payment || 'cash';
    $('#cli').value = s.customer_id ? (customers.find(c => c.id === s.customer_id)?.name || '') : (s.customer_label && s.customer_label !== 'Client particulier' ? s.customer_label : '');
    $('#credit-client').value = s.customer_id || '';
    $('#paid').value = s.paid || 0; $('#creditbox').hidden = s.payment !== 'credit';
    $('#advance-fields').hidden = true;
    lines = []; orig = {};
    (s.sale_lines || []).forEach(l => {
      const a = arts.find(x => x.id === l.article_id); if (!a) return;
      orig[a.id] = (orig[a.id] || 0) + +l.qty;
      lines.push({ article_id: a.id, sku: a.sku, name: a.name, unit: a.unit, qty: +l.qty, unit_price: +l.unit_price });
    });
  }

  function addProduct() {
    $('#addErr').textContent = '';
    const a = arts.find(x => label(x) === $('#prod').value.trim()), q = +$('#qty').value;
    if (!a) return ($('#addErr').textContent = 'Choisissez un produit dans la liste.');
    if (!(q > 0)) return ($('#addErr').textContent = 'La quantité doit être supérieure à 0.');
    const ex = lines.find(l => l.article_id === a.id);
    if (ex) ex.qty += q; else lines.push({ article_id: a.id, sku: a.sku, name: a.name, unit: a.unit, qty: q, unit_price: +a.price_sell || 0 });
    $('#prod').value = ''; $('#qty').value = 1; $('#addErr').textContent = stockProblem(); draw(); $('#prod').focus();
  }
  $('#add').onclick = addProduct;
  $('#prod').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addProduct(); } };
  $('#rows').oninput = e => {
    const i = +e.target.dataset.i, k = e.target.dataset.k; if (isNaN(i) || !k) return;
    lines[i][k] = +e.target.value || 0; $('#addErr').textContent = stockProblem(); draw();
    const again = $('#rows').querySelector(`[data-i="${i}"][data-k="${k}"]`); if (again) { again.focus(); again.select(); }
  };
  $('#rows').onclick = e => { const b = e.target.closest('button[data-rm]'); if (b) { lines.splice(+b.dataset.rm, 1); $('#addErr').textContent = stockProblem(); draw(); } };
  $('#trf').onchange = () => { $('#err').textContent = ''; draw(); };
  $('#pay').onchange = () => {
    const credit = $('#pay').value === 'credit';
    if (credit && !$('#credit-client').value) {
      const match = customers.find(c => c.name.toLowerCase() === $('#cli').value.trim().toLowerCase());
      if (match) $('#credit-client').value = match.id;
    } else if (!credit && $('#credit-client').value) $('#cli').value = customers.find(c => c.id === $('#credit-client').value)?.name || '';
    $('#creditbox').hidden = !credit; draw();
    if (credit && $('#credit-client').value) refreshDeposits();
  };
  $('#paid').oninput = draw;
  $('#advance-amount').oninput = draw;
  async function refreshDeposits() {
    const customerId = customerIdFor(clientName());
    $('#deposit').innerHTML = '<option value="">Aucun acompte utilisé</option>';
    $('#advance-amount').value = 0;
    if (!customerId || editing) { $('#advancehint').textContent = 'Sélectionnez un client enregistré pour utiliser ses acomptes.'; draw(); return; }
    try {
      const deposits = await db.select('customer_deposits', `select=id,receipt_number,amount,remaining,received_at&customer_id=eq.${customerId}&remaining=gt.0&order=received_at.asc`);
      for (const deposit of deposits) $('#deposit').insertAdjacentHTML('beforeend', `<option value="${esc(deposit.id)}" data-remaining="${Number(deposit.remaining)}">${esc(deposit.receipt_number)} · disponible ${money(deposit.remaining)} · ${esc(deposit.received_at)}</option>`);
      $('#advancehint').textContent = deposits.length ? 'Choisissez un reçu et saisissez la part à utiliser sur cette facture.' : 'Ce client n’a pas d’acompte disponible.';
    } catch (error) { $('#advancehint').textContent = 'Impossible de charger les acomptes : ' + error.message; }
    draw();
  }
  $('#cli').addEventListener('change', refreshDeposits);
  $('#cli').addEventListener('blur', refreshDeposits);
  $('#credit-client').addEventListener('change', refreshDeposits);
  $('#credit-client-search').addEventListener('input', () => {
    const select = $('#credit-client'), query = $('#credit-client-search').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
    const selected = select.value;
    [...select.options].forEach((option, index) => { option.hidden = index > 0 && !!query && !option.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').includes(query); });
    if (selected && select.selectedOptions[0]?.hidden) select.value = '';
  });
  $('#deposit').onchange = () => {
    const remaining = Number($('#deposit').selectedOptions[0]?.dataset.remaining || 0);
    $('#advance-amount').max = remaining;
    $('#advance-amount').value = remaining ? Math.min(remaining, Math.max(total() - (+$('#paid').value || 0), 0)).toFixed(2) : '0';
    draw();
  };

  // Enregistre la pièce (facture, modification ou sortie de transfert) et renvoie sa fiche
  async function persist() {
    const p = stockProblem(); if (p) throw new Error(p);
    return isTransfer() ? saveTransfer() : saveSale();
  }
  async function saveSale() {
    const credit = $('#pay').value === 'credit', t = total();
    if (credit && !$('#credit-client').value) throw new Error('Choisissez le client à crédit dans la liste.');
    const advanceAmount = !editing ? Math.max(+$('#advance-amount').value || 0, 0) : 0;
    const depositId = !editing ? $('#deposit').value || null : null;
    const paidNow = credit ? Math.min(Math.max(+$('#paid').value || 0, 0), t) : Math.max(t - advanceAmount, 0);
    if (advanceAmount > 0 && !depositId) throw new Error('Choisissez le reçu d’acompte à utiliser.');
    if (paidNow + advanceAmount > t + 0.005) throw new Error('Le montant versé et l’acompte imputé dépassent le total de la facture.');
    const paid = credit ? paidNow + advanceAmount : null;
    const cname = clientName(), cid = customerIdFor(cname);
    const payload = { p_date: $('#date').value || today(), p_lines: lines.map(l => ({ article_id: l.article_id, qty: l.qty, unit_price: l.unit_price })),
      p_customer: cid, p_customer_label: cname, p_payment: credit ? 'credit' : 'cash', p_paid: paidNow, p_deposit_id: depositId, p_advance_amount: advanceAmount };
    const base = { ...snapshot(), saved: true, client: cname, paid: paid || 0, credit };
    if (editing) {
      await db.rpc('update_sale', { p_id: editing.id, ...payload });
      orig = {}; lines.forEach(l => orig[l.article_id] = l.qty);
      return { ...base, number: editing.number, edited: true };
    }
    const sid = await db.rpc('create_sale', { p_number: null, p_id: newId(), p_usd_cdf: getRate()?.usd_cdf ?? null, ...payload, ...(warehouseChoice() ? { p_warehouse: warehouseChoice() } : {}) });
    let numero = 'attribué à la synchronisation';
    if (navigator.onLine && typeof sid === 'string') {
      const [row] = await db.select('sales', `id=eq.${sid}&select=number`).catch(() => []);
      if (row?.number) numero = row.number;
    }
    return { ...base, number: numero };
  }
  async function saveTransfer() {
    const dest = $('#dest').value.trim();
    if (!dest) throw new Error('Indiquez le vendeur ou le point de vente.');
    const snap = { ...snapshot(), saved: true, transfer: true, dest, number: '—' };
    await db.rpc('create_transfer', { p_destination: dest, p_date: $('#date').value || today(),
      p_lines: lines.map(l => ({ article_id: l.article_id, qty: l.qty })), p_id: newId(), p_note: $('#note').value.trim() || null });
    return snap;
  }
  // Après enregistrement : nouvelle facture prête (ou retour aux ventes après une modification imprimée)
  function finish(snap, printed) {
    if (editing) {
      if (printed) { location.hash = '#/facture'; return; }
      draw(); showDone(`Facture <b>${esc(editing.number)}</b> modifiée. Le stock a été ajusté.`); return;
    }
    reset();
    if (snap.transfer) { $('#trf').checked = false; draw(); }
    const msg = snap.transfer ? `Sortie de marchandise enregistrée vers <b>${esc(snap.dest)}</b>. Le stock a été mis à jour.`
      : `Facture <b>${esc(snap.number)}</b> ${printed ? 'enregistrée et imprimée' : 'enregistrée'} · ${esc(snap.client)} · ${snap.credit ? `à crédit, versé ${money(snap.paid)}` : 'payée en espèces'}.`;
    showDone(msg);
  }
  // Enregistrer, ou enregistrer puis imprimer (le format est celui choisi à côté du bouton)
  async function act(print) {
    $('#err').textContent = '';
    if (!lines.length) {
      if (print && lastSnap) { printDoc(lastSnap, $('#fmt').value); return; }
      return ($('#err').textContent = 'Ajoutez au moins un produit.');
    }
    const btn = $('#save'), pb = $('#print'); btn.disabled = pb.disabled = true;
    try {
      const snap = await persist();
      lastSnap = snap;
      if (print) printDoc(snap, $('#fmt').value);
      finish(snap, print);
    } catch (e) { $('#err').textContent = e.message; }
    finally { btn.disabled = pb.disabled = false; }
  }
  $('#save').onclick = () => act(false);
  $('#print').onclick = () => act(true);
  $('#reset').onclick = () => { if (editing) { location.hash = '#/ventes'; return; } reset(); };
  load();
  db.select('organizations', 'select=name,address,phone,email,tax_id,rc,logo').then(r => { orgName = r[0]?.name || orgName; orgInfo = r[0] || {}; }).catch(() => {});
}
