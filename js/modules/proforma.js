// Proformas (devis) : créés sans toucher au stock. Transformés en facture en un clic.
import { db, newId, session, takeInvoiceNumber } from '../api.js';
import { n, esc, usdOnly, fld, notify, getRate, articleLabel, attachCombo, unitLabel, matchArticle } from '../ui.js';
import { can } from '../roles.js';
import { printDoc, previewDoc } from '../print.js';
import { localDay } from '../dates.js';
import { vatRateForDocument } from '../vat.js';

const today = () => localDay();

export async function render(main, ctx) {
  const role = ctx?.role;
  const canWrite = can(role, 'ventes.write');
  main.innerHTML = `<div class="page-head"><div><h1>Proformas</h1><p class="sub">Devis envoyés au client avant la vente. Ils ne modifient pas le stock.</p></div><div class="acts">${canWrite ? '<button class="btn" id="pf-new" type="button">Nouveau proforma</button>' : ''}</div></div>
    <section class="card" id="pf-form" hidden></section>
    <section class="card"><div id="pf-list" aria-live="polite"><p class="muted">Chargement…</p></div><p class="err" id="pf-err" role="alert"></p></section>`;
  const list = main.querySelector('#pf-list');
  const err = main.querySelector('#pf-err');

  // Données du proforma et de l'entreprise (pour l'impression et le partage).
  async function proformaData(id) {
    const [pf] = await db.select('proformas', `select=id,number,issued_on,valid_until,total_usd,note,customer_label,customers(name)&id=eq.${id}`);
    const lines = await db.select('proforma_lines', `select=qty,unit_price,articles(sku,name,unit,unit_weight)&proforma_id=eq.${id}`);
    const profile = await db.select('profiles', `select=org_id&id=eq.${session().uid}`).catch(() => []);
    const [org] = await db.select('organizations', `select=name,address,phone,email,tax_id,rc,logo,receipt_footer&id=eq.${profile[0]?.org_id}`).catch(() => []);
    return { pf, lines, org: org || {} };
  }
  async function buildProformaDoc(id) {
    const { pf, lines, org } = await proformaData(id);
    return {
      title: 'PROFORMA',
      number: pf.number,
      date: pf.issued_on,
      client: pf.customers?.name || pf.customer_label || 'Client',
      paymentLabel: pf.valid_until ? 'Valable jusqu’au ' + pf.valid_until : '—',
      credit: false, paid: 0, total: Number(pf.total_usd || 0), advance: 0,
      rate: getRate()?.usd_cdf || 0,
      note: 'Document proforma : il ne vaut pas facture. Le stock n’est pas réservé.',
      info: org || {}, org: (org && org.name) || 'Entreprise',
      lines: lines.map(l => ({ name: l.articles?.name || '', unit: l.articles?.unit || '', unit_weight: Number(l.articles?.unit_weight) || 0, qty: Number(l.qty), price: Number(l.unit_price) }))
    };
  }
  async function printProforma(id) {
    const fmt = main.querySelector('#pf-fmt')?.value || '85';
    printDoc(await buildProformaDoc(id), fmt);
  }
  async function previewProforma(id) {
    const fmt = main.querySelector('#pf-fmt')?.value || '85';
    previewDoc(await buildProformaDoc(id), fmt);
  }
  async function shareProforma(id) {
    const { pf, lines, org } = await proformaData(id);
    const detail = lines.map(l => `- ${l.articles?.name || ''} x${l.qty} = ${usdOnly(l.qty * l.unit_price)}`).join('\n');
    const text = `Proforma ${pf.number} — ${org.name || ''}\nClient : ${pf.customers?.name || pf.customer_label || ''}\n${detail}\nTotal : ${usdOnly(pf.total_usd)}${pf.valid_until ? '\nValable jusqu’au ' + pf.valid_until : ''}\nCe document est un proforma, il ne vaut pas facture.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  async function load() {
    const rows = await db.select('proformas', 'select=id,number,issued_on,valid_until,total_usd,status,customer_label,converted_sale_id,customers(name)&order=issued_on.desc,created_at.desc&limit=100').catch(() => null);
    if (!rows) { list.innerHTML = '<p class="muted">Liste indisponible hors connexion.</p>'; return; }
    list.innerHTML = rows.length ? `<table><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Valable jusqu'au</th><th>Total</th><th>Statut</th><th></th></tr></thead><tbody>${rows.map(r => `<tr>
      <td>${esc(r.number)}</td><td>${esc(r.issued_on)}</td><td>${esc(r.customers?.name || r.customer_label || '—')}</td><td>${esc(r.valid_until || '—')}</td>
      <td>${usdOnly(r.total_usd)}</td><td>${r.status === 'draft' ? 'En attente' : r.status === 'converted' ? 'Facturé' : 'Annulé'}</td>
      <td class="pf-acts"><button class="ghost" data-pf-preview="${esc(r.id)}" type="button">Aperçu</button> <button class="ghost" data-pf-print="${esc(r.id)}" type="button">Imprimer</button> <button class="ghost" data-pf-wa="${esc(r.id)}" type="button">WhatsApp</button>${r.status === 'draft' && canWrite ? ` <button class="ghost" data-pf-convert="${esc(r.id)}" type="button">Facturer comptant</button> <button class="ghost" data-pf-credit="${esc(r.id)}" type="button">Facturer à crédit</button> <button class="ghost" data-pf-cancel="${esc(r.id)}" type="button">Annuler</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun proforma pour l’instant.</p>';
    list.querySelectorAll('[data-pf-convert], [data-pf-credit]').forEach(btn => btn.addEventListener('click', () => convert(btn.dataset.pfConvert || btn.dataset.pfCredit, btn.dataset.pfCredit ? 'credit' : 'cash', btn)));
    list.querySelectorAll('[data-pf-print]').forEach(btn => btn.addEventListener('click', () => printProforma(btn.dataset.pfPrint)));
    list.querySelectorAll('[data-pf-preview]').forEach(btn => btn.addEventListener('click', () => previewProforma(btn.dataset.pfPreview)));
    list.querySelectorAll('[data-pf-wa]').forEach(btn => btn.addEventListener('click', () => shareProforma(btn.dataset.pfWa)));
    list.querySelectorAll('[data-pf-cancel]').forEach(btn => btn.addEventListener('click', async () => {
      if (!(await askConfirm('Annuler ce proforma ? Il restera visible dans la liste, marqué « Annulé ».'))) return;
      try { await db.rpc('cancel_proforma', { p_id: btn.dataset.pfCancel }); load(); }
      catch (error) { err.textContent = error.message || 'Annulation impossible.'; }
    }));
  }

  async function convert(id, payment, button) {
    err.textContent = '';
    if (!navigator.onLine) { err.textContent = 'La transformation en facture demande une connexion.'; return; }
    button.disabled = true;
    try {
      const [pf] = await db.select('proformas', `select=id,customer_id,customer_label,total_usd&id=eq.${id}`);
      const lines = await db.select('proforma_lines', `select=article_id,qty,unit_price&proforma_id=eq.${id}`);
      if (!pf || !lines.length) throw new Error('Proforma introuvable.');
      const paid = payment === 'cash' ? Number(pf.total_usd) : 0;
      const sid = await db.rpc('create_sale', { p_number: takeInvoiceNumber(), p_id: newId(), p_usd_cdf: getRate()?.usd_cdf ?? null, p_date: today(), p_vat_rate: vatRateForDocument(),
        p_lines: lines, p_customer: pf.customer_id, p_customer_label: pf.customer_label, p_payment: payment, p_paid: paid, p_deposit_id: null, p_advance_amount: 0 });
      await db.rpc('mark_proforma_converted', { p_id: id, p_sale: sid });
      notify(payment === 'cash' ? 'Facture créée et encaissée. Consultez-la dans Ventes.' : 'Facture créée à crédit. Consultez-la dans Crédits.', 'Proforma transformé');
      load();
    } catch (error) { err.textContent = error.message || 'Transformation impossible.'; button.disabled = false; }
  }

  main.querySelector('#pf-new')?.addEventListener('click', async () => {
    const box = main.querySelector('#pf-form');
    const [customers, articles] = await Promise.all([db.select('customers', 'select=id,name&order=name'), db.select('articles', 'select=id,sku,name,price_sell&order=name')]);
    box.hidden = false;
    // Formulaire simple, sur le même modèle que la vente rapide.
    const validDefault = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();
    box.innerHTML = `<div class="pf-top">
        <label class="pf-client">Client<input id="pf-label" type="text" maxlength="120" placeholder="Nom du client" autocomplete="off"></label>
        <label class="pf-custsel">Client enregistré<select id="pf-cust"><option value="">— aucun —</option>${customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
      </div>
      <div class="pf-add">
        <label class="pf-prod">Produit<input id="pf-prod" placeholder="Rechercher un produit" autocomplete="off"></label>
        <label class="pf-q">Qté<input id="pf-qty-new" type="number" min="0.001" step="any" value="1" inputmode="decimal"></label>
        <button class="btn pf-addbtn" id="pf-add" type="button">Ajouter</button>
      </div>
      <datalist id="pf-arts">${articles.map(a => `<option value="${esc(articleLabel(a))}"></option>`).join('')}</datalist>
      <p class="err" id="pf-line-err" role="alert"></p>
      <div id="pf-lines" class="pf-cart"></div>
      <div class="pf-foot">
        <div class="pf-total"><span>Total</span><b id="pf-total">0,00 $</b></div>
        <div class="pf-btns">
          <select id="pf-fmt" aria-label="Format d’impression"><option value="80">80 mm</option><option value="85" selected>85 mm</option><option value="55">55 mm</option><option value="a4">A4</option></select>
          <button class="ghost" id="pf-save" type="button">Enregistrer</button>
          <button class="btn" id="pf-save-print" type="button">Enregistrer et imprimer</button>
        </div>
      </div>
      <details class="fold pf-opt"><summary>Validité et note</summary>${fld('pf-valid', 'Valable jusqu’au', 'date', `value="${validDefault}"`)}${fld('pf-note', 'Note (facultatif)', 'text', 'maxlength="500"')}</details>
      <p class="err" id="pf-form-err" role="alert"></p>
      <button class="lnk pf-cancel" id="pf-cancel" type="button">Annuler</button>`;
    const linesBox = box.querySelector('#pf-lines');
    const findArt = text => { const t = text.trim(); return articles.find(a => `${a.sku || ''} — ${a.name}` === t) || matchArticle(articles, t); };
    const refresh = () => {
      const total = [...linesBox.querySelectorAll('.pf-line')].reduce((t, r) => t + (Number(r.querySelector('.pf-qty').value) || 0) * (Number(r.querySelector('.pf-price').value) || 0), 0);
      box.querySelector('#pf-total').textContent = usdOnly(total);
    };
    const addLine = () => {
      const perr = box.querySelector('#pf-line-err'); perr.textContent = '';
      const field = box.querySelector('#pf-prod');
      const a = findArt(field.value);
      if (!a) { perr.textContent = 'Produit introuvable. Choisissez-le dans la liste.'; return; }
      const q = Math.round(Math.max(0.001, Number(box.querySelector('#pf-qty-new').value) || 1) * 1000) / 1000;
      field.value = ''; box.querySelector('#pf-qty-new').value = 1;
      const existing = [...linesBox.querySelectorAll('.pf-line')].find(r => r.querySelector('.pf-art').value === a.id);
      if (existing) { const qi = existing.querySelector('.pf-qty'); qi.value = Number(qi.value) + q; refresh(); field.focus(); return; }
      const row = document.createElement('div');
      row.className = 'vr-line pf-line';
      row.innerHTML = `<div class="vr-name"><b>${esc(a.name)}</b><span class="muted">${esc(a.sku || '')}</span></div>
        <div class="vr-qty"><button class="ghost" type="button" data-minus aria-label="Retirer une unité">−</button><input class="pf-qty" type="number" min="1" step="any" value="${q}" aria-label="Quantité"><button class="ghost" type="button" data-plus aria-label="Ajouter une unité">+</button></div>
        <div class="vr-sub"><input class="pf-price" type="number" min="0" step="any" value="${Number(a.price_sell) || 0}" aria-label="Prix unitaire USD"></div>
        <button class="lnk" type="button" data-del aria-label="Supprimer">×</button>
        <input class="pf-art" type="hidden" value="${esc(a.id)}">`;
      row.querySelector('[data-minus]').onclick = () => { const qi = row.querySelector('.pf-qty'); qi.value = Math.max(1, Number(qi.value) - 1); refresh(); };
      row.querySelector('[data-plus]').onclick = () => { const qi = row.querySelector('.pf-qty'); qi.value = Number(qi.value) + 1; refresh(); };
      row.querySelector('[data-del]').onclick = () => { row.remove(); refresh(); };
      row.querySelector('.pf-qty').addEventListener('input', refresh);
      row.querySelector('.pf-price').addEventListener('input', refresh);
      linesBox.append(row);
      refresh();
      field.focus();
    };
    attachCombo(box.querySelector('#pf-prod'), () => articles.map(a => ({ label: articleLabel(a), keys: [a.sku, a.name, a.barcode, unitLabel(a.unit), articleLabel(a)] })));
    box.querySelector('#pf-add').addEventListener('click', addLine);
    box.querySelector('#pf-prod').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLine(); } });
    box.querySelector('#pf-qty-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLine(); } });
    box.querySelector('#pf-cancel').addEventListener('click', () => { box.hidden = true; });
    const doSave = async (print) => {
      const ferr = box.querySelector('#pf-form-err');
      ferr.textContent = '';
      const lines = [...linesBox.querySelectorAll('.pf-line')].map(row => ({ article_id: row.querySelector('.pf-art').value, qty: Number(row.querySelector('.pf-qty').value), unit_price: Number(row.querySelector('.pf-price').value) }));
      if (lines.some(l => !l.article_id)) { ferr.textContent = 'Choisissez un article sur chaque ligne.'; return; }
      try {
        const warehouse = null;
        await db.rpc('create_proforma', { p_customer: box.querySelector('#pf-cust').value || null, p_customer_label: box.querySelector('#pf-label').value.trim(),
          p_lines: lines, p_note: box.querySelector('#pf-note').value.trim(), p_valid_until: box.querySelector('#pf-valid').value || null, p_warehouse: warehouse });
        box.hidden = true;
        notify('Proforma enregistré. Le stock n’a pas été modifié.', 'Proforma');
        load();
        if (print) { const [last] = await db.select('proformas', 'select=id&order=created_at.desc&limit=1').catch(() => []); if (last) printProforma(last.id); }
      } catch (error) { ferr.textContent = error.message || 'Enregistrement impossible.'; }
    };
    box.querySelector('#pf-save').addEventListener('click', () => doSave(false));
    box.querySelector('#pf-save-print').addEventListener('click', () => doSave(true));
  });

  load();
}
