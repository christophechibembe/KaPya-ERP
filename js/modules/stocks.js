import { db } from '../api.js';
import { esc, n, fld, openDialog, money, usdOnly, fcOnly, ico } from '../ui.js';
import { can } from '../roles.js';
const state = a => a.stock <= 0 ? ['Rupture', 'bad'] : a.stock <= a.min_stock ? ['Stock bas', 'warn'] : ['Disponible', 'ok'];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');

export async function render(main, ctx) {
  const canAdj = can(ctx.role, 'stock.write');
  const pre = sessionStorage.getItem('kp.q') || ''; sessionStorage.removeItem('kp.q');
  let rows = [], q = normalize(pre.trim());
  main.innerHTML = `<div class="head"><h1>Produits &amp; Stocks</h1><button class="btn" id="new" type="button">${ico('plus')}<span>Nouvel article</span></button></div>
    <div class="kpis" id="kpis"></div>
    <label for="q" class="sr">Rechercher un article</label>
    <input id="q" type="search" value="${esc(pre)}" placeholder="Rechercher par référence ou désignation">
    <div class="card tw" id="tbl" aria-live="polite">Chargement…</div><dialog id="dlg"></dialog>`;
  const $ = s => main.querySelector(s);
  if (!canAdj) $('#new').style.display = 'none';

  async function load() {
    try { rows = (await db.select('articles', 'select=*&order=name')).map(a => ({ ...a, stock: +a.stock, min_stock: +a.min_stock, price_buy: +a.price_buy })); draw(); }
    catch (e) { $('#tbl').textContent = 'Chargement impossible : ' + e.message; }
  }
  function draw() {
    const f = rows.filter(a => normalize([a.sku, a.name, a.unit, a.stock, a.min_stock, state(a)[0]].join(' ')).includes(q));
    $('#kpis').innerHTML = [['Articles', rows.length, '', 'stock', 't-green'], ['À réapprovisionner', rows.filter(a => a.stock <= a.min_stock).length, '', 'alert', 't-rose'],
      ['Valeur du stock (prix d’achat)', usdOnly(rows.reduce((s, a) => s + a.stock * a.price_buy, 0)), fcOnly(rows.reduce((s, a) => s + a.stock * a.price_buy, 0)), 'coins', 't-teal']]
      .filter(([l]) => !l.startsWith('Valeur') || can(ctx.role, 'achats.view'))
      .map(([l, v, sub, icon, tone]) => `<div class="card kpi ${tone}"><div class="kh"><span class="kbub">${ico(icon)}</span><span>${l}</span></div><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`).join('');
    $('#tbl').innerHTML = f.length ? `<table class="product-list"><thead><tr><th>Référence</th><th>Désignation</th><th class="r">Stock</th><th class="r">Seuil</th><th>État</th>${canAdj ? '<th><span class="sr">Actions</span></th>' : ''}</tr></thead><tbody>${
      f.map(a => { const [t, c] = state(a); return `<tr><td>${esc(a.sku)}</td><td>${esc(a.name)}${a._offline_pending ? ' <span class="pill warn">À synchroniser</span>' : ''}</td><td class="r">${n(a.stock)} ${esc(a.unit)}</td><td class="r">${n(a.min_stock)}</td><td><span class="pill ${c}">${t}</span></td>${canAdj ? `<td><div class="table-actions"><button class="lnk action-primary" type="button" data-adj="${a.id}">Ajuster</button><button class="lnk action-detail" type="button" data-edit="${a.id}">Modifier</button></div></td>` : ''}</tr>`; }).join('')}</tbody></table>`
      : rows.length ? 'Aucun article ne correspond à la recherche.' : 'Aucun article. Ajoutez votre premier article pour suivre son stock.';
  }
  const open = (t, b, o) => openDialog($('#dlg'), t, b, o, load);

  $('#q').oninput = e => { q = normalize(e.target.value.trim()); draw(); };
  $('#new').onclick = () => open('Nouvel article',
    fld('sku', 'Référence', 'text', 'required') + fld('name', 'Désignation', 'text', 'required') + fld('unit', 'Unité', 'text', 'required value="pce"') +
    fld('price_buy', 'Prix d’achat (USD)', 'number', 'min="0" step="any" value="0"') + fld('price_sell', 'Prix de vente (USD)', 'number', 'min="0" step="any" value="0"') +
    fld('min_stock', 'Seuil d’alerte', 'number', 'min="0" step="any" value="0"'),
    v => db.insert('articles', { sku: v.sku.trim(), name: v.name.trim(), unit: v.unit.trim(), price_buy: +v.price_buy, price_sell: +v.price_sell, min_stock: +v.min_stock }));
  $('#tbl').onclick = e => {
    const eid = e.target.dataset.edit;
    if (eid) {
      const a = rows.find(r => r.id === eid), v = x => `value="${esc(x)}"`;
      return open(`Modifier : ${esc(a.name)}`, fld('sku', 'Référence', 'text', 'required ' + v(a.sku)) + fld('name', 'Désignation', 'text', 'required ' + v(a.name)) + fld('unit', 'Unité', 'text', 'required ' + v(a.unit)) +
        fld('price_buy', 'Prix d’achat (USD)', 'number', 'min="0" step="any" ' + v(a.price_buy)) + fld('price_sell', 'Prix de vente (USD)', 'number', 'min="0" step="any" ' + v(a.price_sell ?? 0)) + fld('min_stock', 'Seuil d’alerte', 'number', 'min="0" step="any" ' + v(a.min_stock)),
        x => db.update('articles', eid, { sku: x.sku.trim(), name: x.name.trim(), unit: x.unit.trim(), price_buy: +x.price_buy, price_sell: +x.price_sell, min_stock: +x.min_stock }));
    }
    const id = e.target.dataset.adj; if (!id) return;
    const a = rows.find(r => r.id === id);
    open(`Ajuster : ${esc(a.name)}`, `<p>Stock actuel : ${n(a.stock)} ${esc(a.unit)}</p>` + fld('qty', 'Variation (positive = entrée, négative = sortie)', 'number', 'step="any" required'),
      v => { if (!+v.qty) throw new Error('Saisissez une variation différente de zéro.'); return db.insert('stock_moves', { article_id: id, qty: +v.qty, reason: 'adjustment' }); });
  };
  load();
}
