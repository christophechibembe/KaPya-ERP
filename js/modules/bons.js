// Bons de commande fournisseurs : une demande d'achat, sans effet sur le stock.
// À la réception, le bon devient un achat réel (et le stock entre dans le dépôt).
import { db } from '../api.js';
import { esc, notify, usdOnly, ico, articleLabel, attachCombo, unitLabel, selectCombo, findArticle, matchArticle } from '../ui.js';
import { loadShops } from '../shops.js';

const STATUS = { draft: 'En attente', received: 'Reçu', cancelled: 'Annulé' };
const label = articleLabel;

export async function render(main, ctx) {
  const canWrite = ['admin', 'manager'].includes(ctx?.role);
  let articles = [], lines = [];
  main.innerHTML = `<div class="page-head"><div><h1>Bons de commande</h1><p class="sub">Demande d’achat envoyée au fournisseur. Le stock ne change qu’à la réception.</p></div></div>
    ${canWrite ? `<section class="card facture">
      <div class="grid2">
        <div><label for="bc-sup">Fournisseur</label><select id="bc-sup"><option value="">— choisir —</option></select></div>
        <div><label for="bc-wh">Dépôt de réception</label><select id="bc-wh"></select></div>
      </div>
      <details class="fold"><summary>Plus d’options : date de livraison, note</summary>
        <label>Livraison attendue<input id="bc-exp" type="date"></label>
        <label>Note (facultatif)<input id="bc-note" type="text" maxlength="500"></label>
      </details>
      <div class="addline">
        <div class="grow"><label for="bc-prod">Produit</label><input id="bc-prod" placeholder="Rechercher un produit…" autocomplete="off"><datalist id="bc-arts"></datalist></div>
        <div class="qbox"><label for="bc-qty">Quantité</label><input id="bc-qty" type="number" min="0.001" step="any" value="1"></div>
        <div class="qbox"><label for="bc-cost">Prix USD</label><input id="bc-cost" type="number" min="0" step="any" value="0"></div>
        <button class="btn" id="bc-add" type="button">${ico('plus')}<span>Ajouter</span></button>
      </div>
      <p class="hint bad" id="bc-addErr" role="alert"></p>
      <div class="tw"><table class="lines"><thead><tr><th>Produit</th><th class="r">Qté</th><th class="r money">Prix</th><th class="r money">Total</th><th class="c">Actions</th></tr></thead><tbody id="bc-rows"></tbody></table></div>
      <div class="sumbox"><div class="srow big"><span>Total du bon</span><span id="bc-tot">0,00 $</span></div></div>
      <p class="err" id="bc-err" role="alert"></p>
      <div class="acts end"><button class="ghost" id="bc-reset" type="button">Vider</button><button class="btn" id="bc-save" type="button">${ico('check')}<span>Enregistrer le bon</span></button></div>
    </section>` : ''}
    <section class="card"><div id="bc-list"><p class="muted">Chargement…</p></div></section>`;

  const $ = s => main.querySelector(s);

  async function load() {
    const rows = await db.select('purchase_orders', 'select=id,number,issued_on,expected_on,total_usd,status,suppliers(name)&order=issued_on.desc,created_at.desc&limit=100').catch(() => null);
    const box = $('#bc-list');
    if (!rows) { box.innerHTML = '<p class="muted">Liste indisponible hors connexion.</p>'; return; }
    box.innerHTML = rows.length ? `<table><thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th>Livraison</th><th>Total</th><th>Statut</th><th></th></tr></thead><tbody>${rows.map(r => `<tr>
      <td>${esc(r.number)}</td><td>${esc(r.issued_on)}</td><td>${esc(r.suppliers?.name || '—')}</td><td>${esc(r.expected_on || '—')}</td>
      <td>${usdOnly(r.total_usd)}</td><td>${STATUS[r.status] || r.status}</td>
      <td>${r.status === 'draft' && canWrite ? `<button class="ghost" data-bc-recv="${esc(r.id)}" type="button">Recevoir (créer l’achat)</button> <button class="ghost" data-bc-cancel="${esc(r.id)}" type="button">Annuler</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun bon de commande pour l’instant.</p>';
    box.querySelectorAll('[data-bc-recv]').forEach(b => b.addEventListener('click', async () => {
      if (!(await askConfirm('Recevoir ce bon ? Un achat sera créé et le stock entrera dans le dépôt.'))) return;
      try { await db.rpc('receive_purchase_order', { p_id: b.dataset.bcRecv }); notify('Bon reçu : l’achat est enregistré et le stock est entré.', 'Bon de commande'); load(); }
      catch (error) { notify(error.message || 'Réception impossible.'); }
    }));
    box.querySelectorAll('[data-bc-cancel]').forEach(b => b.addEventListener('click', async () => {
      try { await db.rpc('cancel_purchase_order', { p_id: b.dataset.bcCancel }); load(); }
      catch (error) { notify(error.message || 'Annulation impossible.'); }
    }));
  }

  if (canWrite) {
    const [suppliers, shops, arts] = await Promise.all([
      db.select('suppliers', 'select=id,name&order=name').catch(() => []),
      loadShops(),
      db.select('articles', 'select=id,sku,name,price_buy&order=name').catch(() => [])
    ]);
    articles = arts;
    $('#bc-sup').insertAdjacentHTML('beforeend', suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join(''));
    selectCombo($('#bc-sup'), () => suppliers.map(s => ({ value: s.id, label: s.name, keys: [s.name] })));
    $('#bc-wh').innerHTML = shops.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    $('#bc-arts').innerHTML = articles.map(a => `<option value="${esc(label(a))}"></option>`).join('');

    const total = () => lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
    function draw() {
      $('#bc-rows').innerHTML = lines.map((l, i) => `<tr><td>${esc(l.label)}</td><td class="r">${l.qty}</td><td class="r">${usdOnly(l.unit_cost)}</td><td class="r">${usdOnly(l.qty * l.unit_cost)}</td><td class="c"><button class="iconbtn del" type="button" data-rm="${i}" aria-label="Supprimer la ligne">${ico('trash')}</button></td></tr>`).join('')
        || '<tr><td colspan="5" class="empty">Aucun produit pour l’instant.</td></tr>';
      $('#bc-tot').textContent = usdOnly(total());
    }
    async function addProduct() {
      $('#bc-addErr').textContent = '';
      const a = await findArticle(articles, $('#bc-prod').value);
      const q = Number($('#bc-qty').value), c = Number($('#bc-cost').value) || 0;
      if (!a) return ($('#bc-addErr').textContent = 'Choisissez un produit dans la liste.');
      if (!(q > 0)) return ($('#bc-addErr').textContent = 'La quantité doit être supérieure à 0.');
      const ex = lines.find(l => l.article_id === a.id);
      if (ex) { ex.qty += q; ex.unit_cost = c; } else lines.push({ article_id: a.id, label: label(a), qty: q, unit_cost: c });
      $('#bc-prod').value = ''; $('#bc-qty').value = 1; $('#bc-cost').value = 0;
      draw(); $('#bc-prod').focus();
    }
    // Prix d’achat proposé automatiquement à partir de la fiche article
    attachCombo($('#bc-prod'), () => articles.map(a => ({ label: articleLabel(a), keys: [a.sku, a.name, a.barcode, unitLabel(a.unit), articleLabel(a)] })));
    $('#bc-prod').addEventListener('change', () => {
      const a = matchArticle(articles, $('#bc-prod').value);
      if (a) $('#bc-cost').value = a.price_buy || 0;
    });
    $('#bc-prod').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addProduct(); } });
    $('#bc-add').onclick = addProduct;
    $('#bc-rows').onclick = e => { const b = e.target.closest('button[data-rm]'); if (b) { lines.splice(+b.dataset.rm, 1); draw(); } };
    $('#bc-reset').onclick = () => { lines = []; $('#bc-note').value = ''; $('#bc-err').textContent = ''; $('#bc-addErr').textContent = ''; draw(); };
    $('#bc-save').onclick = async () => {
      const err = $('#bc-err'); err.textContent = '';
      if (!lines.length) return (err.textContent = 'Ajoutez au moins un produit.');
      const btn = $('#bc-save'); btn.disabled = true;
      try {
        await db.rpc('create_purchase_order', { p_supplier: $('#bc-sup').value || null, p_warehouse: $('#bc-wh').value,
          p_lines: lines.map(l => ({ article_id: l.article_id, qty: l.qty, unit_cost: l.unit_cost })),
          p_note: $('#bc-note').value.trim(), p_expected: $('#bc-exp').value || null });
        notify('Bon de commande enregistré. Le stock n’a pas changé.', 'Bon de commande');
        lines = []; $('#bc-note').value = ''; draw(); load();
      } catch (error) { err.textContent = error.message || 'Enregistrement impossible.'; }
      finally { btn.disabled = false; }
    };
    draw();
  }
  load();
}
