// Lots et dates de péremption. Les sorties consomment d'abord les lots qui périment le plus tôt.
import { db } from '../api.js';
import { ownOrgRows } from '../own-org.js';
import { esc, notify, n } from '../ui.js';
import { loadShops } from '../shops.js';

const TYPES = [['commerce', 'Commerce général'], ['alimentation', 'Alimentation et boissons'], ['services', 'Services'], ['restauration', 'Restauration'], ['autre', 'Autre']];
const days = date => Math.ceil((new Date(date + 'T00:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')) / 86400000);

export async function render(main, ctx) {
  const isAdmin = ctx?.role === 'admin';
  const canWrite = ['admin', 'manager'].includes(ctx?.role);
  const [org, articles, shops] = await Promise.all([
    ownOrgRows('business_type').catch(() => []),
    db.select('articles', 'select=id,sku,name,track_expiry&order=name').catch(() => []),
    loadShops()
  ]);
  const current = org[0]?.business_type || 'commerce';
  main.innerHTML = `<div class="page-head"><div><h1>Lots et péremption</h1><p class="sub">Pour les produits qui ont une date limite. Les sorties partent d'abord des lots qui périment le plus tôt.</p></div></div>
    <section class="card"><h2>Alertes de péremption</h2><div id="lot-alerts"><p class="muted">Chargement…</p></div></section>
    ${canWrite ? `<section class="card"><h2>Entrer un lot</h2>
      <div class="grid-form">
        <label>Article<select id="lt-art">${articles.map(a => `<option value="${esc(a.id)}">${esc(a.sku || '')} — ${esc(a.name)}</option>`).join('')}</select></label>
        <label>Dépôt<select id="lt-wh">${shops.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
        <label>Numéro de lot<input id="lt-lot" type="text" maxlength="60"></label>
        <label>Date de péremption<input id="lt-exp" type="date"></label>
        <label>Quantité<input id="lt-qty" type="number" min="0" step="any" value="1"></label>
      </div>
      <div class="acts"><button class="btn" id="lt-save" type="button">Enregistrer le lot</button></div>
      <p class="err" id="lt-err" role="alert"></p></section>` : ''}`;

  async function loadAlerts() {
    const rows = await db.select('stock_lots', 'select=lot_number,expiry_date,qty_left,warehouse_id,articles(sku,name)&qty_left=gt.0&expiry_date=lte.' + new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) + '&order=expiry_date.asc').catch(() => null);
    const box = main.querySelector('#lot-alerts');
    if (!rows) { box.innerHTML = '<p class="muted">Liste indisponible hors connexion.</p>'; return; }
    box.innerHTML = rows.length ? `<ul class="lot-cards">${rows.map(r => {
      const d = days(r.expiry_date);
      const tag = d < 0 ? `<b style="color:#b91c1c">Périmé (${-d} j)</b>` : `dans ${d} j`;
      return `<li class="lot-card"><div class="lot-top"><b>${esc(r.articles?.name || 'Article')}</b><span class="muted">${esc(r.articles?.sku || '')}</span></div><div class="lot-mid"><span>Lot ${esc(r.lot_number)}</span><span>${esc(r.expiry_date)} · ${tag}</span></div><div class="lot-qty"><span>Reste</span><b>${n(r.qty_left)}</b></div></li>`;
    }).join('')}</ul>` : '<p class="muted">Aucun lot ne périme dans les 30 prochains jours.</p>';
  }
  loadAlerts();

  // Lots d'un achat : saisie des numéros et dates pour les articles suivis (les quantités viennent de l'achat).
  if (canWrite) {
    const purchases = await db.select('purchases', 'select=id,number,bought_at,purchase_lines(qty,article_id,articles(sku,name,track_expiry))&order=bought_at.desc&limit=300').catch(() => []);
    const withTracked = purchases.filter(pu => pu.purchase_lines.some(l => l.articles?.track_expiry));
    const pending = withTracked.length;
    const box = document.createElement('section');
    box.className = 'card';
    box.innerHTML = `<h2>Lots d'un achat</h2><p class="muted">Pour un achat déjà enregistré : indiquez le numéro de lot et la date pour chaque produit suivi. Pensez-y dès la réception : un achat sans lot ne sera pas suivi par date.</p>
      ${withTracked.length ? `<label>Achat<select id="pl-purchase"><option value="">— choisir —</option>${withTracked.map(pu => `<option value="${esc(pu.id)}">${esc(pu.number || '—')} · ${esc(pu.bought_at)}</option>`).join('')}</select></label><div id="pl-lines"></div><div class="acts"><button class="btn" id="pl-save" type="button" disabled>Enregistrer les lots</button></div><p class="err" id="pl-err" role="alert"></p>` : '<p class="muted">Aucun achat de produit suivi par date de péremption.</p>'}`;
    main.append(box);
    if (withTracked.length) {
      const sel = box.querySelector('#pl-purchase'), linesBox = box.querySelector('#pl-lines'), saveBtn = box.querySelector('#pl-save');
      sel.addEventListener('change', () => {
        const pu = withTracked.find(x => x.id === sel.value);
        saveBtn.disabled = !pu;
        linesBox.innerHTML = pu ? `<table><thead><tr><th>Article</th><th>Acheté</th><th>N° de lot</th><th>Péremption</th></tr></thead><tbody>${pu.purchase_lines.filter(l => l.articles?.track_expiry).map(l => `<tr data-art="${esc(l.article_id)}" data-qty="${l.qty}"><td>${esc(l.articles?.sku || '')} — ${esc(l.articles?.name || '')}</td><td>${l.qty}</td><td><input class="pl-lot" type="text" maxlength="60"></td><td><input class="pl-exp" type="date"></td></tr>`).join('')}</tbody></table>` : '';
      });
      saveBtn.addEventListener('click', async () => {
        const err = box.querySelector('#pl-err'); err.textContent = '';
        const lots = [...linesBox.querySelectorAll('tr[data-art]')].map(tr => ({ article_id: tr.dataset.art, qty: Number(tr.dataset.qty), lot_number: tr.querySelector('.pl-lot').value.trim(), expiry_date: tr.querySelector('.pl-exp').value || null }));
        try {
          await db.rpc('register_purchase_lots', { p_purchase: sel.value, p_lots: lots });
          notify('Lots enregistrés pour cet achat.', 'Lots');
          sel.value = ''; linesBox.innerHTML = ''; saveBtn.disabled = true;
          loadAlerts();
        } catch (error) { err.textContent = error.message || 'Enregistrement impossible.'; }
      });
    }
  }

  main.querySelector('#lt-save')?.addEventListener('click', async () => {
    const err = main.querySelector('#lt-err'); err.textContent = '';
    try {
      const articleId = main.querySelector('#lt-art').value;
      await db.rpc('create_stock_lot', { p_warehouse: main.querySelector('#lt-wh').value, p_article: articleId,
        p_lot: main.querySelector('#lt-lot').value.trim(), p_expiry: main.querySelector('#lt-exp').value || null, p_qty: Number(main.querySelector('#lt-qty').value) || 0, p_note: '' });
      await db.update('articles', articleId, { track_expiry: true }).catch(() => {});
      notify('Lot enregistré. Le stock du dépôt a été augmenté.', 'Lots');
      main.querySelector('#lt-lot').value = ''; main.querySelector('#lt-exp').value = '';
      loadAlerts();
    } catch (error) { err.textContent = error.message || 'Enregistrement impossible.'; }
  });
}
