import { db, selectArticlesWithTotal, ART_COLS } from '../api.js';
import { esc, n, fld, openDialog, money, usdOnly, fcOnly, ico, notify } from '../ui.js';
import { can } from '../roles.js';
import { parseCsv } from '../csv.js';
import { checkArticleRows } from '../article-import.js';
import { newId } from '../api.js';
const state = a => a.stock <= 0 ? ['Rupture', 'bad'] : a.stock <= a.min_stock ? ['Stock bas', 'warn'] : ['Disponible', 'ok'];
// Unités proposées par défaut ; les unités ajoutées par l'entreprise sont enregistrées dans unit_options.
const DEFAULT_UNITS = [
  // Général
  ['pce', 'Pièce'], ['lot', 'Lot'], ['jeu', 'Jeu'], ['paire', 'Paire'], ['ensemble', 'Ensemble'], ['kit', 'Kit'], ['pack', 'Pack'], ['douzaine', 'Douzaine'], ['service', 'Service'], ['heure', 'Heure'], ['jour', 'Jour'],
  // Emballages
  ['carton', 'Carton'], ['caisse', 'Caisse'], ['paquet', 'Paquet'], ['sachet', 'Sachet'], ['boite', 'Boîte'], ['bidon', 'Bidon'], ['jerrycan', 'Jerrycan'], ['fut', 'Fût'], ['seau', 'Seau'], ['pot', 'Pot'], ['tube', 'Tube'], ['flacon', 'Flacon'], ['bouteille', 'Bouteille'], ['canette', 'Canette'], ['barquette', 'Barquette'], ['cagette', 'Cagette'], ['palette', 'Palette'], ['sac', 'Sac'], ['ballot', 'Ballot'], ['rouleau', 'Rouleau'], ['bobine', 'Bobine'], ['rame', 'Rame'], ['botte', 'Botte'], ['bloc', 'Bloc'], ['feuille', 'Feuille'], ['plaque', 'Plaque'], ['barre', 'Barre'],
  // Poids
  ['g', 'Gramme'], ['kg', 'Kilogramme'], ['livre', 'Livre'], ['quintal', 'Quintal'], ['tonne', 'Tonne'],
  // Volume
  ['ml', 'Millilitre'], ['cl', 'Centilitre'], ['litre', 'Litre'], ['m3', 'Mètre cube'],
  // Longueur et surface
  ['mm', 'Millimètre'], ['cm', 'Centimètre'], ['m', 'Mètre'], ['m2', 'Mètre carré'],
  // Alimentation et restauration
  ['portion', 'Portion'], ['plat', 'Plat'], ['pain', 'Pain'], ['vrac', 'Vrac']
];
let customUnits = [];
const unitField = (current = 'pce') => {
  const list = [...DEFAULT_UNITS, ...customUnits.filter(l => !DEFAULT_UNITS.some(([v]) => v === l)).map(l => [l, l])];
  if (current && !list.some(([v]) => v === current)) list.push([current, current]);
  return `<label for="unit">Unité</label><select id="unit" name="unit" required>${list.map(([v, l]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(l)}${l !== v ? ` (${esc(v)})` : ''}</option>`).join('')}<option value="__new__">+ Ajouter une unité…</option></select><input id="unit_new" name="unit_new" type="text" maxlength="30" placeholder="Nom de la nouvelle unité" hidden>`;
};
const unitSetup = f => {
  const sel = f.querySelector('#unit'), inp = f.querySelector('#unit_new');
  sel.onchange = () => { const add = sel.value === '__new__'; inp.hidden = !add; inp.required = add; if (add) inp.focus(); };
};
const readUnit = async x => {
  if (x.unit !== '__new__') return String(x.unit).trim();
  const label = String(x.unit_new || '').trim();
  if (!label) throw new Error('Saisissez le nom de la nouvelle unité.');
  try { await db.insert('unit_options', { label }); } catch (e) { if (!/duplicate|unique/i.test(e.message)) throw e; }
  return label;
};
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');

// Champs moins utilisés : repliés pour garder la fiche courte.
const foldFld = html => `<details class="fold"><summary>Plus d’options (code-barres, prix d’achat, seuil d’alerte)</summary>${html}</details>`;
export async function render(main, ctx) {
  const canAdj = can(ctx.role, 'stock.write');
  const pre = sessionStorage.getItem('kp.q') || ''; sessionStorage.removeItem('kp.q');
  let rows = [], q = normalize(pre.trim());
  main.innerHTML = `<div class="head"><h1>Produits &amp; Stocks</h1><button class="btn" id="new" type="button">${ico('plus')}<span>Nouvel article</span></button>${['admin', 'manager'].includes(ctx?.role) ? '<label class="ghost csv-pick">Importer un fichier CSV<input type="file" id="csv-articles" accept=".csv,text/csv" hidden></label>' : ''}</div>
    <div class="kpis" id="kpis"></div>
    <label for="q" class="sr">Rechercher un article</label>
    <input id="q" type="search" value="${esc(pre)}" placeholder="Rechercher par référence ou désignation">
    <div class="card tw" id="tbl" aria-live="polite">Chargement…</div><dialog id="dlg"></dialog>`;
  const $ = s => main.querySelector(s);
  if (!canAdj) $('#new').style.display = 'none';

  async function load() {
    customUnits = await db.select('unit_options', 'select=label&order=label').then(r => r.map(x => x.label)).catch(() => []);
    try { rows = (await selectArticlesWithTotal(`select=${ART_COLS}&order=name`)).map(a => ({ ...a, stock: +a.stock, min_stock: +a.min_stock, price_buy: +a.price_buy })); draw(); }
    catch (e) { $('#tbl').textContent = 'Chargement impossible : ' + e.message; }
  }
  function draw() {
    const f = rows.filter(a => normalize([a.sku, a.name, a.unit, a.stock, a.min_stock, state(a)[0]].join(' ')).includes(q));
    $('#kpis').innerHTML = [['Articles', rows.length, '', 'stock', 't-green'], ['À réapprovisionner', rows.filter(a => a.stock <= a.min_stock).length, '', 'alert', 't-rose'],
      ['Valeur du stock (prix d’achat)', usdOnly(rows.reduce((s, a) => s + a.stock * a.price_buy, 0)), fcOnly(rows.reduce((s, a) => s + a.stock * a.price_buy, 0)), 'coins', 't-teal']]
      .filter(([l]) => !l.startsWith('Valeur') || can(ctx.role, 'achats.view'))
      .map(([l, v, sub, icon, tone]) => `<div class="card kpi ${tone}"><div class="kh"><span class="kbub">${ico(icon)}</span><span>${l}</span></div><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`).join('');
    $('#tbl').innerHTML = f.length ? `<table class="product-list"><thead><tr><th>Référence</th><th>Désignation</th><th class="r">Stock</th><th class="r">Seuil</th><th>État</th>${canAdj ? '<th><span class="sr">Actions</span></th>' : ''}</tr></thead><tbody>${
      f.map(a => { const [t, c] = state(a); return `<tr><td>${esc(a.sku)}</td><td>${esc(a.name)}${a._offline_pending ? ' <span class="pill warn">À synchroniser</span>' : ''}</td><td class="r">${n(a.stock)} ${esc(a.unit)}${a.unit_weight ? `<br><small class="muted">${n(a.stock * a.unit_weight)} kg</small>` : ''}</td><td class="r">${n(a.min_stock)}</td><td><span class="pill ${c}">${t}</span></td>${canAdj ? `<td><div class="table-actions"><button class="lnk action-primary" type="button" data-adj="${a.id}">Ajuster</button><button class="lnk action-detail" type="button" data-edit="${a.id}">Modifier</button><button class="lnk" type="button" data-archive="${a.id}" title="Archiver (masquer, l'historique est conservé)">Archiver</button></div></td>` : ''}</tr>`; }).join('')}</tbody></table>`
      : rows.length ? 'Aucun article ne correspond à la recherche.' : 'Aucun article. Ajoutez votre premier article pour suivre son stock.';
  }
  const open = (t, b, o, setup) => openDialog($('#dlg'), t, b, o, load, setup);

  $('#q').oninput = e => { q = normalize(e.target.value.trim()); draw(); };
  // Import CSV des articles : contrôle ligne par ligne, puis enregistrement des lignes valides.
  main.querySelector('#csv-articles')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const { records, headers } = parseCsv(await file.text());
      if (!records.length) return notify('Le fichier est vide ou son en-tête est incorrect.');
      if (!headers.some(h => h === 'reference' || h === 'sku')) return notify('Le fichier doit avoir une colonne « reference » (ou « sku »).');
      const existing = await db.select('articles', 'select=sku').catch(() => []);
      const { ok, errors } = checkArticleRows(records, existing.map(a => a.sku));
      let imported = 0;
      for (const row of ok) {
        try { await db.insert('articles', { sku: row.sku, name: row.name, unit: row.unit, price_buy: row.price_buy, price_sell: row.price_sell, min_stock: row.min_stock }); imported++; }
        catch (error) { errors.push(`${row.sku} : ${error.message || 'enregistrement refusé'}`); }
      }
      const detail = errors.length ? `\n\nÀ vérifier (${errors.length}) :\n` + errors.slice(0, 12).join('\n') + (errors.length > 12 ? '\n…' : '') : '';
      notify(`${imported} article(s) importé(s) sur ${records.length} ligne(s).${detail}`, 'Import des articles');
      if (imported) render(main, ctx);
    } catch (error) { notify('Import impossible : ' + (error.message || 'erreur')); }
  });
  $('#new').onclick = () => open('Nouvel article',
    fld('sku', 'Référence', 'text', 'required') + fld('name', 'Désignation', 'text', 'required') + unitField('pce') + fld('price_sell', 'Prix de vente (USD)', 'number', 'min="0" step="any" value="0"') +
    foldFld(fld('barcode', 'Code-barres (facultatif)', 'text', 'maxlength="32"') + fld('unit_weight', 'Poids par unité en kg (facultatif)', 'number', 'min="0" step="any"') + fld('price_buy', 'Prix d’achat (USD)', 'number', 'min="0" step="any" value="0"') + fld('min_stock', 'Seuil d’alerte', 'number', 'min="0" step="any" value="0"')),
    async v => { const id = newId(); await db.insert('articles', { id,  sku: v.sku.trim(), name: v.name.trim(), unit: await readUnit(v), price_buy: +v.price_buy, price_sell: +v.price_sell, min_stock: +v.min_stock, unit_weight: +v.unit_weight || null  }); const code = (v.barcode || '').trim(); if (code) { try { await db.update('articles', id, { barcode: code }); } catch (e) { notify('Article créé, mais ce code-barres est déjà utilisé par un autre article : ' + code); } } }, unitSetup);
  $('#tbl').onclick = async e => {
    const aid = e.target.dataset.archive;
    if (aid) {
      const a = rows.find(r => r.id === aid);
      if (!a || !(await askConfirm(`Archiver « ${a.name} » ? Il ne sera plus proposé, mais l'historique reste.`))) return;
      try { await db.update('articles', a.id, { archived_at: new Date().toISOString() }); notify('Article archivé.'); load(); }
      catch (x) { notify('Archivage impossible : ' + x.message); }
      return;
    }
    const eid = e.target.dataset.edit;
    if (eid) {
      const a = rows.find(r => r.id === eid), v = x => `value="${esc(x)}"`;
      return open(`Modifier : ${esc(a.name)}`, fld('sku', 'Référence', 'text', 'required ' + v(a.sku)) + fld('name', 'Désignation', 'text', 'required ' + v(a.name)) + unitField(a.unit) + fld('price_sell', 'Prix de vente (USD)', 'number', 'min="0" step="any" ' + v(a.price_sell ?? 0)) +
        foldFld(fld('barcode', 'Code-barres (facultatif)', 'text', 'maxlength="32" value="' + esc(a.barcode || '') + '"') + fld('unit_weight', 'Poids par unité en kg (facultatif)', 'number', 'min="0" step="any" ' + v(a.unit_weight)) + fld('price_buy', 'Prix d’achat (USD)', 'number', 'min="0" step="any" ' + v(a.price_buy)) + fld('min_stock', 'Seuil d’alerte', 'number', 'min="0" step="any" ' + v(a.min_stock))),
        async x => db.update('articles', eid, { sku: x.sku.trim(), name: x.name.trim(), unit: await readUnit(x), price_buy: +x.price_buy, price_sell: +x.price_sell, min_stock: +x.min_stock , barcode: (x.barcode || '').trim() || null, unit_weight: +x.unit_weight || null }, a.version), unitSetup);
    }
    const id = e.target.dataset.adj; if (!id) return;
    const a = rows.find(r => r.id === id);
    open(`Ajuster : ${esc(a.name)}`, `<p>Stock actuel : ${n(a.stock)} ${esc(a.unit)}</p>` + fld('qty', 'Variation (positive = entrée, négative = sortie)', 'number', 'step="any" required'),
      v => { if (!+v.qty) throw new Error('Saisissez une variation différente de zéro.'); return db.insert('stock_moves', { article_id: id, qty: +v.qty, reason: 'adjustment' }); });
  };
  load();
}
