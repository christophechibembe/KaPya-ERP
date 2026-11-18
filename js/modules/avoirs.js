// Avoirs (notes de crédit) : corrigent le montant dû sur une facture, sans la supprimer et sans toucher au stock.
import { db, newId } from '../api.js';
import { esc, usdOnly, notify, selectCombo } from '../ui.js';

export async function render(main, ctx) {
  main.innerHTML = `<div class="page-head"><div><h1>Avoirs</h1><p class="sub">Corrigent une facture (erreur de prix, remise, reprise financière). La facture reste visible, son solde est corrigé. Le stock n'est pas modifié.</p></div></div>
    <section class="card"><h2>Nouvel avoir</h2>
      <label>Facture à corriger<select id="av-sale"><option value="">Chargement…</option></select></label>
      <div id="av-lines"></div>
      <details class="fold"><summary>Plus d’options : motif</summary><label>Motif (facultatif)<input id="av-note" type="text" maxlength="500"></label></details>
      <div class="acts"><button class="btn" id="av-save" type="button" disabled>Créer l'avoir</button></div>
      <p class="err" id="av-err" role="alert"></p>
    </section>
    <section class="card"><h2>Avoirs émis</h2><div id="av-list"><p class="muted">Chargement…</p></div></section>`;
  const saleSel = main.querySelector('#av-sale'), linesBox = main.querySelector('#av-lines'), saveBtn = main.querySelector('#av-save'), err = main.querySelector('#av-err');
  let sales = [];

  async function loadSales() {
    sales = await db.select('sales', 'select=id,number,sold_at,payment,customer_label,customers(name),sale_lines(article_id,qty,unit_price,articles(sku,name))&order=sold_at.desc,created_at.desc&limit=100').catch(() => []);
    saleSel.innerHTML = '<option value="">— choisir une facture —</option>' + sales.map(s => `<option value="${esc(s.id)}">${esc(s.number || '—')} · ${esc(s.sold_at)} · ${esc(s.customers?.name || s.customer_label || 'Client comptoir')}</option>`).join('');
  }
  selectCombo(saleSel, () => sales.map(s => ({ value: s.id, label: `${s.number || '—'} · ${s.sold_at} · ${s.customers?.name || 'Client de passage'}`, keys: [s.number, s.customers?.name, s.sold_at] })));
  saleSel.addEventListener('change', () => {
    const sale = sales.find(s => s.id === saleSel.value);
    saveBtn.disabled = !sale;
    linesBox.innerHTML = sale ? `<table><thead><tr><th>Article</th><th>Vendu</th><th>Prix</th><th>Quantité à corriger</th></tr></thead><tbody>${sale.sale_lines.map(l => `<tr data-art="${esc(l.article_id)}" data-price="${l.unit_price}"><td>${esc(l.articles?.sku || '')} — ${esc(l.articles?.name || '')}</td><td>${l.qty}</td><td>${usdOnly(l.unit_price)}</td><td><input class="av-qty" type="number" min="0" max="${l.qty}" step="any" value="0"></td></tr>`).join('')}</tbody></table>` : '';
  });
  saveBtn.addEventListener('click', async () => {
    err.textContent = '';
    const lines = [...linesBox.querySelectorAll('tr[data-art]')].map(tr => ({ article_id: tr.dataset.art, qty: Number(tr.querySelector('.av-qty').value) || 0 })).filter(l => l.qty > 0);
    if (!lines.length) { err.textContent = 'Indiquez au moins une quantité à corriger.'; return; }
    saveBtn.disabled = true;
    try {
      const number = await db.rpc('create_credit_note', { p_sale: saleSel.value, p_lines: lines, p_note: main.querySelector('#av-note').value.trim(), p_id: newId() });
      notify(!navigator.onLine ? 'Avoir enregistré hors ligne. Son numéro sera attribué à la synchronisation.' : 'Avoir créé. La facture reste visible, son solde est corrigé.', 'Avoir');
      linesBox.innerHTML = ''; main.querySelector('#av-note').value = ''; saleSel.value = ''; if (saleSel._combo) saleSel._combo.value = '';
      loadList();
    } catch (error) { err.textContent = error.message || 'Avoir impossible.'; }
    finally { saveBtn.disabled = false; }
  });

  async function loadList() {
    const rows = await db.select('credit_notes', 'select=number,issued_on,total_usd,note,sales(number)&order=issued_on.desc,created_at.desc&limit=100').catch(() => null);
    const box = main.querySelector('#av-list');
    if (!rows) { box.innerHTML = '<p class="muted">Liste indisponible hors connexion.</p>'; return; }
    box.innerHTML = rows.length ? `<table><thead><tr><th>N°</th><th>Date</th><th>Facture</th><th>Montant</th><th>Motif</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.number)}</td><td>${esc(r.issued_on)}</td><td>${esc(r.sales?.number || '—')}</td><td>${usdOnly(r.total_usd)}</td><td>${esc(r.note || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun avoir pour l’instant.</p>';
  }
  await loadSales();
  loadList();
}
