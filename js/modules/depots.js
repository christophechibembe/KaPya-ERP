// Dépôts : liste des dépôts, stock par dépôt, création/désactivation, transfert entre dépôts.
// Les règles (dépôt principal, dépôt vide avant désactivation, stock suffisant) sont appliquées par la base.
import { db } from '../api.js';
import { downloadCsv } from '../export.js';
import { esc, n, ico } from '../ui.js';
import { can } from '../roles.js';

const today = () => new Date().toLocaleDateString('sv-SE');
const errorText = error => esc(error.message || 'Opération impossible.');

export async function render(main, ctx) {
  const role = ctx?.role;
  const canManage = can(role, 'depots.manage');
  const canTransfer = can(role, 'depots.transfer');
  main.innerHTML = `<div class="page-head"><div><h1>Dépôts</h1><p class="sub">Stock suivi séparément dans chaque dépôt. Le total reste la somme des dépôts.</p></div><div class="head-acts"><button class="ghost" type="button" id="dp-export">Exporter le stock (Excel)</button></div></div>
    <div id="dp-content" aria-live="polite"><div class="card empty">Chargement…</div></div>`;
  const content = main.querySelector('#dp-content');

  let warehouses, stocks;
  try {
    [warehouses, stocks] = await Promise.all([
      db.select('warehouses', 'select=id,name,address,is_default,active&order=is_default.desc,name'),
      db.select('warehouse_stock', 'select=warehouse_id,article_id,qty,articles(sku,name,unit,price_buy)&order=qty.desc')
    ]);
  } catch (error) {
    content.innerHTML = `<div class="card"><p class="err">Impossible de charger les dépôts : ${errorText(error)}.</p><p class="muted">Vérifiez que le script « depots.sql » a été exécuté dans Supabase.</p></div>`;
    return;
  }
  const active = warehouses.filter(w => w.active);
  const byWarehouse = id => stocks.filter(s => s.warehouse_id === id && Number(s.qty) !== 0);

  content.innerHTML = `
    <section class="dp-list">
      ${warehouses.map(w => {
        const rows = byWarehouse(w.id);
        const units = rows.reduce((sum, r) => sum + Number(r.qty), 0);
        return `<article class="card dp-card ${w.active ? '' : 'dp-off'}">
          <div class="sec-head"><div><h2>${esc(w.name)}</h2><p class="muted">${w.address ? esc(w.address) : 'Adresse non renseignée'}</p></div>
            <span class="dp-badges">${w.is_default ? '<span class="badge">Principal</span>' : ''}${w.active ? '' : '<span class="badge negative">Inactif</span>'}</span></div>
          <p class="muted">${rows.length} produit(s) en stock · ${n(units)} unité(s)</p>
          ${rows.length ? `<div class="tw"><table class="lines"><thead><tr><th>Produit</th><th class="r">Quantité</th></tr></thead><tbody>
            ${rows.map(r => `<tr><td>${esc(r.articles?.sku || '')} — ${esc(r.articles?.name || '')}</td><td class="r">${n(r.qty)} ${esc(r.articles?.unit || '')}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted">Aucun stock dans ce dépôt.</p>'}
          ${canManage ? `<div class="acts"><button class="ghost" type="button" data-rename="${w.id}" data-name="${esc(w.name)}">Renommer</button>${w.is_default ? '' : `<button class="ghost" type="button" data-toggle="${w.id}" data-active="${w.active}">${w.active ? 'Désactiver' : 'Réactiver'}</button>`}</div>` : ''}
        </article>`;
      }).join('')}
    </section>

    ${canManage ? `<section class="card"><h2>Ajouter un dépôt</h2>
      <div class="grid2"><div><label for="dp-name">Nom</label><input id="dp-name" maxlength="80" placeholder="Ex. Dépôt Goma"></div>
      <div><label for="dp-addr">Adresse (facultatif)</label><input id="dp-addr" maxlength="200"></div></div>
      <div class="acts"><button class="btn" type="button" id="dp-add">Ajouter le dépôt</button></div>
      <p class="err" id="dp-err" role="alert"></p></section>` : ''}

    ${canTransfer && active.length >= 2 ? transferForm(active) : ''}
    <p class="err" id="dp-global" role="alert"></p>`;

  const showError = (selector, error) => { content.querySelector(selector).textContent = error.message || 'Opération impossible.'; };

  content.querySelector('#dp-add')?.addEventListener('click', async () => {
    const name = content.querySelector('#dp-name').value.trim();
    if (!name) return showError('#dp-err', { message: 'Indiquez le nom du dépôt.' });
    try {
      await db.insert('warehouses', { name, address: content.querySelector('#dp-addr').value.trim() });
      await render(main, ctx);
    } catch (error) { showError('#dp-err', error); }
  });

  content.querySelectorAll('[data-rename]').forEach(button => button.addEventListener('click', async () => {
    const name = (window.prompt('Nouveau nom du dépôt :', button.dataset.name) || '').trim();
    if (!name || name === button.dataset.name) return;
    try {
      await db.update('warehouses', button.dataset.rename, { name });
      await render(main, ctx);
    } catch (error) { showError('#dp-global', error); }
  }));

  main.querySelector('#dp-export').addEventListener('click', () => {
    const rows = [['Dépôt', 'SKU', 'Produit', 'Unité', 'Quantité', 'Coût unitaire (USD)', 'Valeur (USD)']];
    for (const w of warehouses) {
      for (const r of byWarehouse(w.id)) {
        const cost = Number(r.articles?.price_buy || 0);
        rows.push([w.name, r.articles?.sku || '', r.articles?.name || '', r.articles?.unit || '', Number(r.qty), cost, Number(r.qty) * cost]);
      }
    }
    downloadCsv(`stock-par-depot-${today()}`, rows[0], rows.slice(1).map(r => r.map(v => typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : v)));
  });

  content.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', async () => {
    try {
      await db.update('warehouses', button.dataset.toggle, { active: button.dataset.active !== 'true' });
      await render(main, ctx);
    } catch (error) { showError('#dp-global', error); }
  }));

  if (canTransfer && active.length >= 2) wireTransfer(main, ctx, content, active, stocks, showError);
}

function transferForm(active) {
  const options = active.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
  return `<section class="card" id="tr-card"><h2>Transfert entre dépôts</h2>
    <p class="muted">Sort le stock du dépôt source et l’ajoute au dépôt cible. Ce n’est pas une vente.</p>
    <div class="grid2">
      <div><label for="tr-from">Depuis</label><select id="tr-from">${options}</select></div>
      <div><label for="tr-to">Vers</label><select id="tr-to">${options}</select></div>
    </div>
    <div class="grid2">
      <div><label for="tr-art">Produit (stock du dépôt source)</label><select id="tr-art"></select></div>
      <div><label for="tr-qty">Quantité</label><input id="tr-qty" type="number" min="0" step="0.001" inputmode="decimal"></div>
    </div>
    <div class="acts"><button class="ghost" type="button" id="tr-add">Ajouter la ligne</button></div>
    <div class="tw"><table class="lines"><thead><tr><th>Produit</th><th class="r">Quantité</th><th></th></tr></thead><tbody id="tr-rows"></tbody></table></div>
    <div class="grid2"><div><label for="tr-date">Date</label><input id="tr-date" type="date" value="${today()}"></div>
    <div><label for="tr-note">Note (facultatif)</label><input id="tr-note" maxlength="200"></div></div>
    <div class="acts"><button class="btn" type="button" id="tr-go">Enregistrer le transfert</button></div>
    <p class="err" id="tr-err" role="alert"></p></section>`;
}

function wireTransfer(main, ctx, content, active, stocks, showError) {
  const from = content.querySelector('#tr-from');
  const to = content.querySelector('#tr-to');
  const art = content.querySelector('#tr-art');
  const rowsEl = content.querySelector('#tr-rows');
  let lines = [];
  to.selectedIndex = 1;

  const fillArticles = () => {
    const items = stocks.filter(s => s.warehouse_id === from.value && Number(s.qty) > 0);
    art.innerHTML = items.length
      ? items.map(s => `<option value="${s.article_id}" data-max="${s.qty}">${esc(s.articles?.sku || '')} — ${esc(s.articles?.name || '')} (${n(s.qty)} dispo)</option>`).join('')
      : '<option value="">Aucun stock dans ce dépôt</option>';
    lines = lines.filter(l => l.from === from.value);
    drawLines();
  };
  const drawLines = () => {
    rowsEl.innerHTML = lines.map((l, i) => `<tr><td>${esc(l.label)}</td><td class="r">${n(l.qty)}</td><td><button class="ghost" type="button" data-rm="${i}">Retirer</button></td></tr>`).join('');
    rowsEl.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { lines.splice(Number(b.dataset.rm), 1); drawLines(); }));
  };
  from.addEventListener('change', fillArticles);
  fillArticles();

  content.querySelector('#tr-add').addEventListener('click', () => {
    const article = art.value;
    const qty = Number(content.querySelector('#tr-qty').value);
    const max = Number(art.selectedOptions[0]?.dataset.max || 0);
    if (!article) return showError('#tr-err', { message: 'Choisissez un produit disponible.' });
    if (!(qty > 0)) return showError('#tr-err', { message: 'Indiquez une quantité positive.' });
    if (qty > max) return showError('#tr-err', { message: `Stock insuffisant dans le dépôt source : ${n(max)} disponible(s).` });
    const existing = lines.find(l => l.article_id === article);
    if (existing) existing.qty += qty; else lines.push({ from: from.value, article_id: article, qty, label: art.selectedOptions[0].textContent.replace(/ \(.*\)$/, '') });
    content.querySelector('#tr-err').textContent = '';
    content.querySelector('#tr-qty').value = '';
    drawLines();
  });

  content.querySelector('#tr-go').addEventListener('click', async () => {
    if (from.value === to.value) return showError('#tr-err', { message: 'Choisissez deux dépôts différents.' });
    if (!lines.length) return showError('#tr-err', { message: 'Ajoutez au moins un produit.' });
    try {
      await db.rpc('create_warehouse_transfer', {
        p_from: from.value, p_to: to.value,
        p_date: content.querySelector('#tr-date').value || today(),
        p_lines: lines.map(l => ({ article_id: l.article_id, qty: l.qty })),
        p_note: content.querySelector('#tr-note').value.trim() || null
      });
      await render(main, ctx);
    } catch (error) { showError('#tr-err', error); }
  });
}
