// Retours : retour client (le stock revient dans la boutique de la facture) et retour fournisseur (le stock sort).
import { db, newId } from '../api.js';
import { esc, notify, usdOnly, selectCombo } from '../ui.js';
import { can } from '../roles.js';
import { loadShops } from '../shops.js';

export async function render(main, ctx) {
  const role = ctx?.role;
  const isManager = ['admin', 'manager'].includes(role);
  main.innerHTML = `<div class="page-head"><div><h1>Retours</h1><p class="sub">Retour client : le stock revient dans la boutique. Retour fournisseur : le stock sort du dépôt.</p></div></div>
    <section class="card"><h2>Retour client</h2>
      <label>Facture concernée<select id="rc-sale"><option value="">Chargement…</option></select></label>
      <div id="rc-lines"></div>
      <label>Motif (facultatif)<input id="rc-note" type="text" maxlength="500"></label>
      ${isManager ? '<label class="check"><input id="rc-credit" type="checkbox" checked> Établir un avoir pour ce retour (le client est crédité)</label>' : '<p class="muted">Le gérant établit l’avoir correspondant, dans la page Avoirs.</p>'}
      <div class="acts"><button class="btn" id="rc-save" type="button" disabled>Enregistrer le retour client</button></div>
      <p class="err" id="rc-err" role="alert"></p></section>
    ${isManager ? `<section class="card"><h2>Retour fournisseur</h2>
      <div class="grid-form">
        <label>Dépôt d'où sort le stock<select id="rf-wh"></select></label>
        <label>Fournisseur (facultatif)<select id="rf-sup"><option value="">— aucun —</option></select></label>
      </div>
      <div id="rf-lines"></div>
      <label>Motif (facultatif)<input id="rf-note" type="text" maxlength="500"></label>
      <div class="acts"><button class="btn" id="rf-save" type="button">Enregistrer le retour fournisseur</button></div>
      <p class="err" id="rf-err" role="alert"></p></section>` : ''}`;

  // Retour client
  const sales = await db.select('sales', 'select=id,number,sold_at,customers(name),sale_lines(article_id,qty,unit_price,articles(sku,name))&order=sold_at.desc&limit=100').catch(() => []);
  const saleSel = main.querySelector('#rc-sale'), rcLines = main.querySelector('#rc-lines'), rcSave = main.querySelector('#rc-save'), rcErr = main.querySelector('#rc-err');
  saleSel.innerHTML = '<option value="">— choisir une facture —</option>' + sales.map(s => `<option value="${esc(s.id)}">${esc(s.number || '—')} · ${esc(s.sold_at)} · ${esc(s.customers?.name || 'Client comptoir')}</option>`).join('');
  selectCombo(saleSel, () => sales.map(s => ({ value: s.id, label: `${s.number || '—'} · ${s.sold_at} · ${s.customers?.name || 'Client de passage'}`, keys: [s.number, s.customers?.name, s.sold_at] })));
  saleSel.addEventListener('change', () => {
    const sale = sales.find(s => s.id === saleSel.value);
    rcSave.disabled = !sale;
    rcLines.innerHTML = sale ? `<table><thead><tr><th>Article</th><th>Vendu</th><th>Retourné</th></tr></thead><tbody>${sale.sale_lines.map(l => `<tr data-art="${esc(l.article_id)}"><td>${esc(l.articles?.sku || '')} — ${esc(l.articles?.name || '')}</td><td>${l.qty}</td><td><input class="rc-qty" type="number" min="0" max="${l.qty}" step="any" value="0"></td></tr>`).join('')}</tbody></table>` : '';
  });
  rcSave.addEventListener('click', async () => {
    rcErr.textContent = '';
    const lines = [...rcLines.querySelectorAll('tr[data-art]')].map(tr => ({ article_id: tr.dataset.art, qty: Number(tr.querySelector('.rc-qty').value) || 0 })).filter(l => l.qty > 0);
    if (!lines.length) { rcErr.textContent = 'Indiquez au moins une quantité retournée.'; return; }
    rcSave.disabled = true;
    try {
      const credit = isManager && main.querySelector('#rc-credit')?.checked;
      await db.rpc('create_customer_return', { p_sale: saleSel.value, p_lines: lines, p_note: main.querySelector('#rc-note').value.trim(), p_credit: !!credit, p_id: newId() });
      notify(!navigator.onLine ? 'Retour enregistré hors ligne. Son numéro sera attribué à la synchronisation, et le stock sera mis à jour à ce moment-là.' : 'Retour enregistré. Le stock est revenu dans la boutique.' + (credit ? ' Un avoir a été établi.' : ''), 'Retour client');
      rcLines.innerHTML = ''; saleSel.value = ''; if (saleSel._combo) saleSel._combo.value = ''; main.querySelector('#rc-note').value = '';
    } catch (error) { rcErr.textContent = error.message || 'Retour impossible.'; }
    finally { rcSave.disabled = false; }
  });

  if (!isManager) return;

  // Retour fournisseur
  const [shops, suppliers, articles] = await Promise.all([loadShops(), db.select('suppliers', 'select=id,name&order=name').catch(() => []), db.select('articles', 'select=id,sku,name&order=name').catch(() => [])]);
  main.querySelector('#rf-wh').innerHTML = shops.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  main.querySelector('#rf-sup').insertAdjacentHTML('beforeend', suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join(''));
  selectCombo(main.querySelector('#rf-sup'), () => suppliers.map(s => ({ value: s.id, label: s.name, keys: [s.name] })));
  const rfLines = main.querySelector('#rf-lines');
  const addRow = () => {
    const row = document.createElement('div'); row.className = 'grid-form rf-line';
    row.innerHTML = `<label>Article<select class="rf-art"><option value="">— choisir —</option>${articles.map(a => `<option value="${esc(a.id)}">${esc(a.sku || '')} — ${esc(a.name)}</option>`).join('')}</select></label>
      <label>Quantité<input class="rf-qty" type="number" min="0" step="any" value="1"></label>`;
    rfLines.append(row);
  };
  addRow();
  main.querySelector('#rf-lines').insertAdjacentHTML('afterend', '<div class="acts"><button class="ghost" id="rf-add" type="button">Ajouter une ligne</button></div>');
  main.querySelector('#rf-add').addEventListener('click', addRow);
  main.querySelector('#rf-save').addEventListener('click', async () => {
    const err = main.querySelector('#rf-err'); err.textContent = '';
    const lines = [...rfLines.querySelectorAll('.rf-line')].map(row => ({ article_id: row.querySelector('.rf-art').value, qty: Number(row.querySelector('.rf-qty').value) || 0 })).filter(l => l.article_id && l.qty > 0);
    if (!lines.length) { err.textContent = 'Indiquez au moins un article et une quantité.'; return; }
    try {
      await db.rpc('create_supplier_return', { p_warehouse: main.querySelector('#rf-wh').value, p_supplier: main.querySelector('#rf-sup').value || null, p_lines: lines, p_note: main.querySelector('#rf-note').value.trim() });
      notify('Retour fournisseur enregistré. Le stock est sorti du dépôt.', 'Retour fournisseur');
      rfLines.innerHTML = ''; addRow();
    } catch (error) { err.textContent = error.message || 'Retour impossible.'; }
  });
}
