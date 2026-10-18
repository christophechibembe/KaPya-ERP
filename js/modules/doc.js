// Écran générique « pièces » (ventes, achats) : liste, détail, saisie multi-lignes, fonctionne hors ligne.
import { db, pendingFor, newId } from '../api.js';
import { esc, n, fld, openDialog, showDialog, money, usdOnly, ico, getRate } from '../ui.js';
import { downloadCsv, csvNumber } from '../export.js';
import { can } from '../roles.js';
const today = () => new Date().toLocaleDateString('sv-SE');
const fr = d => d.split('-').reverse().join('/');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const pill = p => p.pending === 'rejected' ? `<span class="pill bad" title="${esc(p.error || '')}">Refusée</span>`
  : p.pending || p._offline_pending ? '<span class="pill warn">En attente</span>' : esc(p.number || '—');

export async function render(main, c) {
  let parties = [], arts = [], warehouses = [], rows = [];
  main.innerHTML = `<div class="page-head"><div><h1>${c.title}</h1></div><div class="acts"><label class="sr" for="doc-q">Rechercher dans ${c.title.toLocaleLowerCase('fr')}</label><input id="doc-q" type="search" placeholder="Rechercher une date, un numéro, un client ou un article…" autocomplete="off"><button class="ghost" id="par" type="button">${ico('plus')}<span>${c.newParty}</span></button><button class="btn" id="new" type="button">${ico('plus')}<span>${c.newDoc}</span></button></div></div>
    <section class="card doc-filter-bar" aria-label="Filtres et export"><label>Du<input id="doc-from" type="date"></label><label>Au<input id="doc-to" type="date"></label><label>${c.partyLabel}<select id="doc-party"><option value="">Tous</option></select></label><label>Dépôt<select id="doc-warehouse"><option value="">Tous les dépôts</option></select></label><button class="ghost" id="doc-export" type="button">Exporter CSV</button></section>
    <div class="card tw" id="tbl" aria-live="polite">Chargement…</div><dialog id="dlg"></dialog>`;
  const $ = s => main.querySelector(s) || document.getElementById('top-search')?.querySelector(s);
  if (!can(c.role, c.newCap)) $('#new').style.display = 'none';
  if (!can(c.role, c.partyCap)) $('#par').style.display = 'none';
  const sumL = L => L.reduce((s, l) => s + l.qty * l[c.priceCol], 0);

  function drawList() {
    const query = normalize($('#doc-q').value.trim());
    const from = $('#doc-from').value, to = $('#doc-to').value, partyId = $('#doc-party').value, warehouseId = $('#doc-warehouse').value;
    const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      const lines = row[c.linesTable] || [];
      const total = sumL(lines), due = Math.max(total - Number(row[c.paidCol] || 0), 0);
      const balanceStatus = row[c.paymentCol] === 'credit' ? (due > .005 ? 'à payer' : 'soldée') : '';
      const date = String(row[c.dateCol] || '').slice(0, 10);
      const partyMatches = !partyId || row[c.partyIdCol]?.id === partyId || row[c.partyIdCol] === partyId;
      const whMatches = !warehouseId || row.warehouse_id === warehouseId || row.p_warehouse === warehouseId;
      return (!query || normalize([row[c.dateCol], row.number, row.customer_label, row[c.partyTable]?.name, row[c.paymentCol], balanceStatus, due, total, row.warehouses?.name, ...lines.flatMap(line => [line.articles?.sku, line.articles?.name])].join(' ')).includes(query))
        && (!from || date >= from) && (!to || date <= to) && partyMatches && whMatches;
    });
    if (!visible.length) {
      $('#tbl').innerHTML = `<p class="empty">${rows.length ? 'Aucun résultat pour cette recherche.' : esc(c.empty)}</p>`;
      return;
    }
    const paymentHeader = c.paymentCol ? '<th>Paiement</th>' : '';
    // Colonne Dépôt seulement si l'entreprise a réellement plusieurs dépôts utilisés.
    const showWarehouse = new Set(visible.map(v => v.row.warehouses?.name).filter(Boolean)).size > 1;
    const warehouseHeader = showWarehouse ? '<th>Dépôt</th>' : '';
    const balanceHeader = c.paidCol ? '<th class="r">Reste dû</th>' : '';
    $('#tbl').innerHTML = `<table class="document-list"><thead><tr><th>Date</th><th>N°</th><th>${c.partyLabel}</th>${warehouseHeader}${paymentHeader}<th class="r">Lignes</th><th class="r">Total</th>${balanceHeader}<th><span class="sr">Actions</span></th></tr></thead><tbody>${visible.map(({ row: p, index: i }) => {
      const L = p[c.linesTable] || [];
      const total = sumL(L);
      const paymentCell = c.paymentCol ? `<td><span class="pill ${p[c.paymentCol] === 'credit' ? 'warn' : 'ok'}">${p[c.paymentCol] === 'credit' ? 'Crédit' : 'Cash'}</span></td>` : '';
      const due = Math.max(total - Number(p[c.paidCol] || 0), 0);
      const balanceCell = c.paidCol ? `<td class="r">${p[c.paymentCol] !== 'credit' ? '<span class="muted">—</span>' : due > .005 ? `<div class="sale-balance"><b>${usdOnly(due)}</b><span class="pill warn">À payer</span></div>` : '<span class="pill ok">Soldée</span>'}</td>` : '';
      return `<tr><td>${fr(p[c.dateCol])}</td><td>${pill(p)}</td><td>${esc(p[c.partyTable]?.name || p.customer_label || '—')}</td>${showWarehouse ? `<td>${esc(p.warehouses?.name || '—')}</td>` : ''}${paymentCell}<td class="r">${L.length}</td><td class="r">${usdOnly(total)}</td>${balanceCell}<td><div class="table-actions"><button class="lnk action-detail" type="button" data-d="${i}">Voir le détail</button></div></td></tr>`;
    }).join('')}</tbody></table>`;
  }

  async function load() {
    try {
      [parties, arts, warehouses] = await Promise.all([
        db.select(c.partyTable, 'select=id,name&order=name'),
        db.select('articles', 'select=id,sku,name,unit,price_buy,price_sell,stock&order=name'),
        db.select('warehouses', 'select=id,name,is_default&active=eq.true&order=is_default.desc,name').catch(() => [])]);
      const partySelect = $('#doc-party');
      partySelect.innerHTML = `<option value="">Tous</option>${parties.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}`;
      $('#doc-warehouse').innerHTML = `<option value="">Tous les dépôts</option>${warehouses.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}`;
      const listQuery = `select=id,number,${c.dateCol},${c.partyIdCol},warehouse_id,${c.partyTable}(name),${c.extraSelect || ''}${c.paymentCol ? `${c.paymentCol},` : ''}${c.paidCol ? `${c.paidCol},` : ''}${c.linesTable}(qty,${c.priceCol},articles(sku,name,unit))&order=${c.dateCol}.desc,created_at.desc`;
      // Le dépôt est affiché si la fonctionnalité dépôts est installée ; sinon la liste reste identique.
      const remote = await db.select(c.table, listQuery.replace('select=', 'select=warehouses(name),')).catch(() => db.select(c.table, listQuery.replace('warehouse_id,', '')));
      // Pièces saisies hors ligne (pas encore synchronisées), affichées en tête
      const pend = (await pendingFor(c.table)).map(it => ({
        pending: it.status === 'rejected' ? 'rejected' : 'pending', error: it.error, number: null,
        [c.dateCol]: it.body.p_date || today(),
        [c.partyIdCol]: it.body[c.rpcParty] || null,
        warehouse_id: it.body.p_warehouse || null,
        [c.partyTable]: { name: parties.find(x => x.id === it.body[c.rpcParty])?.name || it.body.p_customer_label || '—' },
        ...(c.paymentCol ? { [c.paymentCol]: it.body.p_payment || 'cash' } : {}),
        ...(c.paidCol ? { [c.paidCol]: Number(it.body.p_paid || 0) } : {}),
        [c.linesTable]: it.body.p_lines.map(l => ({ qty: l.qty, [c.priceCol]: l[c.priceCol], articles: arts.find(a => a.id === l.article_id) })),
      }));
      rows = [...pend, ...remote];
      $('#tbl').setAttribute('aria-busy', 'false');
      drawList();
    } catch (e) { $('#tbl').textContent = 'Chargement impossible : ' + e.message; }
  }
  const line = () => `<div class="ln"><label class="c-art"><span class="lb">Article</span><input type="search" class="picker-search" data-picker="art" placeholder="Rechercher un article…" autocomplete="off"><select name="art" required><option value="">Choisir un article</option>${arts.map(a => `<option value="${a.id}" data-c="${a[c.artPrice]}">${esc(a.sku)} — ${esc(a.name)}</option>`).join('')}</select><small class="hint"></small></label>
    <label><span class="lb">Quantité</span><input name="qty" type="number" min="0.001" step="any" required></label>
    <label><span class="lb">${c.priceLabel}</span><input name="cost" type="number" min="0" step="any" required></label>
    <div class="lt"><span class="lb">Total</span><output>0</output></div>
    <button type="button" class="lnk rm" aria-label="Retirer la ligne">Retirer</button></div>`;

  $('#par').onclick = () => openDialog($('#dlg'), c.newParty, fld('name', 'Nom', 'text', 'required') + fld('phone', 'Téléphone', 'tel', 'autocomplete="tel"'),
    v => db.insert(c.partyTable, { name: v.name.trim(), phone: v.phone.trim() || null }), load);

  // Dépôts disponibles pour les achats et ventes (vide si la fonctionnalité n'est pas installée).
  const loadWarehouses = async () => (c.rpc === 'create_purchase' || c.rpc === 'create_sale')
    ? db.select('warehouses', 'select=id,name,is_default&active=eq.true&order=is_default.desc,name').catch(() => []) : [];
  $('#new').onclick = async () => {
    if (c.newHref) { location.hash = c.newHref; return; }
    const warehouses = await loadWarehouses();
    if (!parties.length) return openDialog($('#dlg'), `${c.partyLabel} requis`, `<p>Créez d’abord : ${c.newParty.toLowerCase()}.</p>`, async () => {}, load);
    if (!arts.length) return openDialog($('#dlg'), 'Article requis', '<p>Ajoutez d’abord des articles dans Produits &amp; Stocks.</p>', async () => {}, load);
    openDialog($('#dlg'), c.newDoc,
      `<div class="top"><div><label for="party-search">Rechercher ${c.partyLabel.toLocaleLowerCase('fr')}</label><input id="party-search" class="picker-search" data-picker="party" type="search" placeholder="Nom…" autocomplete="off"><label for="party">${c.partyLabel}</label><select id="party" name="party" required><option value="">Choisir…</option>${parties.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>` +
      `<div><label for="date">Date</label><input id="date" name="date" type="date" required value="${today()}"></div>` +
      `<div><label for="number">Numéro de pièce (facultatif)</label><input id="number" name="number" type="text"></div></div>` +
      (warehouses.length > 1 ? `<div><label for="wh">${c.rpc === 'create_purchase' ? 'Dépôt d’entrée' : 'Dépôt de sortie'}</label><select id="wh" name="wh">${warehouses.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>` : '') +
      `<h3>Lignes</h3><div class="lh" aria-hidden="true"><span>Article</span><span>Quantité</span><span>${c.priceLabel}</span><span class="r">Total</span><span></span></div>` +
      `<div id="lines">${line()}</div><button type="button" class="lnk" id="add">Ajouter une ligne</button><p class="tot" aria-live="polite">Total : <b id="tot">$ 0,00</b></p>`,
      (v, fd) => {
        const A = fd.getAll('art'), Q = fd.getAll('qty'), P = fd.getAll('cost');
        if (c.checkStock) {
          const need = {}; A.forEach((a, i) => need[a] = (need[a] || 0) + +Q[i]);
          for (const [id, q] of Object.entries(need)) { const a = arts.find(x => x.id === id); if (q > a.stock) throw new Error(`Stock insuffisant pour ${a.name} : ${n(a.stock)} ${a.unit} disponible(s).`); }
        }
        // p_id : identifiant unique (une pièce envoyée deux fois n'est enregistrée qu'une fois) ; p_usd_cdf : taux du moment de la saisie
        return db.rpc(c.rpc, { [c.rpcParty]: v.party, p_number: v.number.trim() || null, p_date: v.date,
          p_lines: A.map((a, i) => ({ article_id: a, qty: +Q[i], [c.priceCol]: +P[i] })),
          p_id: newId(), p_usd_cdf: getRate()?.usd_cdf ?? null, ...(fd.get('wh') ? { p_warehouse: fd.get('wh') } : {}) });
      }, load,
      f => {
        const box = f.querySelector('#lines');
        const normalizeSearch = value => normalize(value.trim());
        f.addEventListener('input', event => {
          const input = event.target.closest('.picker-search'); if (!input) return;
          const select = input.dataset.picker === 'party' ? f.querySelector('#party') : input.closest('.ln')?.querySelector('[name=art]');
          if (!select) return;
          const selected = select.value, query = normalizeSearch(input.value);
          [...select.options].forEach((option, index) => { option.hidden = index > 0 && !!query && !normalize(option.textContent).includes(query); });
          if (selected && select.selectedOptions[0]?.hidden) select.value = '';
        });
        const refresh = () => {
          let sum = 0;
          for (const r of box.children) {
            const q = +r.querySelector('[name=qty]').value || 0, p = +r.querySelector('[name=cost]').value || 0, a = arts.find(x => x.id === r.querySelector('[name=art]').value), h = r.querySelector('.hint');
            r.querySelector('output').textContent = money(q * p); sum += q * p;
            h.className = 'hint'; h.textContent = a ? `Stock : ${n(a.stock)} ${a.unit}` : '';
            if (a && c.checkStock && q > a.stock) { h.className = 'hint bad'; h.textContent = `Stock insuffisant : ${n(a.stock)} ${a.unit} disponible(s)`; }
          }
          f.querySelector('#tot').textContent = money(sum);
        };
        f.querySelector('#add').onclick = () => box.insertAdjacentHTML('beforeend', line());
        box.addEventListener('input', refresh);
        box.addEventListener('change', e => { if (e.target.name === 'art') { const v = e.target.selectedOptions[0].dataset.c, r = e.target.closest('.ln').querySelector('[name=cost]'); if (v && !r.value) r.value = v; refresh(); } });
        box.addEventListener('click', e => { if (e.target.classList.contains('rm') && box.children.length > 1) { e.target.closest('.ln').remove(); refresh(); } });
      }, 'wide');
  };

  $('#doc-q').addEventListener('input', drawList);
  ['#doc-from', '#doc-to', '#doc-party', '#doc-warehouse'].forEach(selector => $(selector).addEventListener('change', drawList));
  $('#doc-export').onclick = () => {
    const from = $('#doc-from').value, to = $('#doc-to').value, partyId = $('#doc-party').value, warehouseId = $('#doc-warehouse').value;
    const query = normalize($('#doc-q').value.trim());
    const selected = rows.filter(row => {
      const date = String(row[c.dateCol] || '').slice(0, 10);
      const lines = row[c.linesTable] || [];
      const due = Math.max(sumL(lines) - Number(row[c.paidCol] || 0), 0);
      const status = row[c.paymentCol] === 'credit' ? (due > .005 ? 'à payer' : 'soldée') : '';
      return (!from || date >= from) && (!to || date <= to)
        && (!partyId || row[c.partyIdCol]?.id === partyId || row[c.partyIdCol] === partyId)
        && (!warehouseId || row.warehouse_id === warehouseId || row.p_warehouse === warehouseId)
        && (!query || normalize([row[c.dateCol], row.number, row.customer_label, row[c.partyTable]?.name, row[c.paymentCol], status, due, ...lines.flatMap(line => [line.articles?.sku, line.articles?.name])].join(' ')).includes(query));
    });
    const output = [];
    selected.forEach(row => (row[c.linesTable] || []).forEach(line => {
      const qty = Number(line.qty || 0), unitPrice = Number(line[c.priceCol] || 0);
      output.push([row[c.dateCol] || '', row.number || '', row[c.partyTable]?.name || row.customer_label || '', row.warehouses?.name || warehouses.find(item => item.id === row.warehouse_id)?.name || '', c.paymentCol ? (row[c.paymentCol] === 'credit' ? 'Crédit' : 'Cash') : 'Achat', line.articles?.sku || '', line.articles?.name || '', qty, line.articles?.unit || '', csvNumber(unitPrice), csvNumber(qty * unitPrice), row.pending || row._offline_pending ? 'En attente de synchronisation' : 'Synchronisé']);
    }));
    const table = c.table === 'sales' ? 'ventes' : 'achats';
    downloadCsv(`kapya-${table}-${from || 'debut'}-${to || 'fin'}`, ['Date', 'N° pièce', c.partyLabel, 'Dépôt', 'Paiement', 'Référence article', 'Article', 'Quantité', 'Unité', 'Prix unitaire USD', 'Total ligne USD', 'Synchronisation'], output);
  };

  $('#tbl').onclick = async e => {
    const p = rows[e.target.dataset.d]; if (!p) return;
    const L = p[c.linesTable];
    const note = p.pending === 'rejected' ? `<p class="hint bad">Refusée à la synchronisation : ${esc(p.error || '')}</p>`
      : p.pending || p._offline_pending ? '<p class="muted">Pièce enregistrée sur cet appareil, en attente de synchronisation.</p>' : '';
    const paymentInfo = c.paymentCol ? `<p>Mode de paiement : <b>${p[c.paymentCol] === 'credit' ? 'Crédit' : 'Cash'}</b></p>` : '';
    const paidInfo = c.paidCol && p[c.paymentCol] === 'credit' ? `<p>Déjà versé : <b>${money(Number(p[c.paidCol] || 0))}</b> · Reste dû : <b>${money(Math.max(sumL(L) - Number(p[c.paidCol] || 0), 0))}</b></p>` : '';
    showDialog($('#dlg'), `${c.one} du ${fr(p[c.dateCol])}`, `<p>${c.partyLabel} : <b>${esc(p[c.partyTable]?.name || p.customer_label || '—')}</b>${p.number ? ` · N° ${esc(p.number)}` : ''}</p>${paymentInfo}${paidInfo}${note}
      <div class="tw"><table><thead><tr><th>Article</th><th class="r">Quantité</th><th class="r">${c.priceLabel}</th><th class="r">Total</th></tr></thead><tbody>${L.map(l =>
        `<tr><td>${esc(l.articles ? l.articles.sku + ' — ' + l.articles.name : '—')}</td><td class="r">${n(l.qty)} ${esc(l.articles?.unit || '')}</td><td class="r">${money(l[c.priceCol])}</td><td class="r">${money(l.qty * l[c.priceCol])}</td></tr>`).join('')}</tbody></table></div>
      <p class="tot">Total : <b>${money(sumL(L))}</b></p>`);
    if (c.editHref && !p.pending && p.id && can(c.role, c.editCap)) {
      const row = $('#dlg .row'), ed = document.createElement('a');
      ed.className = 'ghost'; ed.href = c.editHref + p.id; ed.textContent = 'Modifier'; row.insertBefore(ed, row.firstChild);
    }
    if (can(c.role, c.cancelCap) && !p.pending) {
      const row = $('#dlg .row'), del = document.createElement('button');
      del.type = 'button'; del.className = 'btn danger'; del.id = 'del'; del.textContent = 'Annuler la pièce';
      row.insertBefore(del, row.firstChild);
      del.onclick = async () => {
        if (!del.dataset.ok) { del.dataset.ok = 1; del.textContent = 'Confirmer l’annulation ?'; return; }
        del.disabled = true;
        try { await db.delete(c.table, p.id); $('#dlg').close(); await load(); }
        catch (x) { del.disabled = false; del.textContent = 'Annuler la pièce'; delete del.dataset.ok; alert('Annulation impossible : ' + x.message); }
      };
    }
  };
  load();
}
