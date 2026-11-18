// Transfert de marchandise : sortie de stock vers un autre dépôt. Pas de prix, pas de montant, pas une vente.
import { db, pendingFor, newId } from '../api.js';
import { esc, n, ico, fmtDate, articleLabel, attachCombo, unitLabel, findArticle } from '../ui.js';
import { can } from '../roles.js';
const today = () => new Date().toLocaleDateString('sv-SE');
const fr = d => fmtDate(d);
const label = articleLabel;
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');

export async function render(main, ctx) {
  let arts = [], lines = [], whs = [], fromStock = {};
  const canWrite = can(ctx?.role, 'transferts.write');
  main.innerHTML = `<div class="page-head"><div><h1>Transfert de marchandise</h1><p class="sub">Sortie de stock vers un autre dépôt. Ce n’est pas une vente : aucun montant n’est indiqué.</p></div></div>
    ${canWrite ? `<div class="card facture">
      <div class="grid2">
        <div><label for="from">Depuis (dépôt d’origine)</label><select id="from"></select></div>
        <div><label for="to">Vers (dépôt de destination)</label><select id="to"></select></div>
      </div>
      <div class="grid2">
        <div><label for="date">Date</label><input id="date" type="date" value="${today()}"></div>
        <div></div>
      </div>
      <div class="addline">
        <div class="grow"><label for="prod">Produit</label><input id="prod" list="arts" placeholder="Rechercher un produit…" autocomplete="off"><datalist id="arts"></datalist></div>
        <div class="qbox"><label for="qty">Quantité</label><input id="qty" type="number" min="0.001" step="any" value="1"></div>
        <button class="btn" id="add" type="button">${ico('plus')}<span>Ajouter</span></button>
      </div>
      <p class="hint bad" id="addErr" role="alert"></p>
      <div class="tw"><table class="lines"><thead><tr><th>Produit</th><th class="r">Quantité</th><th class="c">Actions</th></tr></thead><tbody id="rows"></tbody></table></div>
      <div><label for="note">Note (facultatif)</label><input id="note" placeholder="Ex. ouverture de la journée"></div>
      <p class="err" id="err" role="alert"></p>
      <div class="acts end"><button class="ghost" id="reset" type="button">Vider</button><button class="btn" id="save" type="button">${ico('check')}<span>Enregistrer la sortie</span></button></div>
      <p class="done" id="done" hidden></p>
    </div>` : '<p class="card muted">Vous pouvez consulter les transferts. Seuls les gérants, responsables et facturiers peuvent en créer.</p>'}
    <div class="sec-head"><h2 class="sec">Historique des transferts</h2><label class="sr" for="transfer-q">Rechercher un transfert</label><input id="transfer-q" type="search" placeholder="Rechercher un numéro, une destination ou un article…" autocomplete="off"></div>
    <div class="card tw" id="hist" aria-live="polite">Chargement…</div>`;
  const $ = s => main.querySelector(s) || document.getElementById('top-search')?.querySelector(s);
  let historyItems = [];

  function drawHistory() {
    const query = norm($('#transfer-q').value.trim());
    const visible = historyItems.filter(t => !query || norm([
      t.number, t.destination, t.note, t.moved_at, ...(t.transfer_lines || []).flatMap(line => [line.articles?.sku, line.articles?.name, line.qty])
    ].join(' ')).includes(query));
    $('#hist').innerHTML = visible.length ? `<table><thead><tr><th>Date</th><th>N°</th><th>Vers</th><th>Produits sortis</th><th>Par</th></tr></thead><tbody>${visible.map(t => `<tr>
      <td>${fr(t.moved_at)}</td><td>${t.pending ? '<span class="pill warn">En attente</span>' : esc(t.number)}</td><td>${esc(t.destination)}${t.note ? `<br><small class="muted">${esc(t.note)}</small>` : ''}</td>
      <td>${t.transfer_lines.map(l => `${n(l.qty)} ${esc(l.articles?.unit || '')} — ${esc(l.articles?.name || '—')}`).join('<br>')}</td>
      <td>${t.created_by === ctx?.id ? 'Vous' : 'Membre'}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${historyItems.length ? 'Aucun transfert ne correspond à cette recherche.' : 'Aucun transfert pour l’instant.'}</p>`;
  }

  function drawLines() {
    if (!canWrite) return;
    $('#rows').innerHTML = lines.map((l, i) => `<tr>
      <td>${esc(l.sku)} — ${esc(l.name)}</td>
      <td class="r"><input class="cell" type="number" min="0.001" step="any" value="${l.qty}" data-i="${i}" aria-label="Quantité de ${esc(l.name)}"></td>
      <td class="c"><button class="iconbtn del" type="button" data-rm="${i}" aria-label="Supprimer la ligne">${ico('trash')}</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="empty">Aucun produit pour l’instant.</td></tr>';
  }
  function stockProblem() {
    const need = {}; lines.forEach(l => need[l.article_id] = (need[l.article_id] || 0) + l.qty);
    for (const [id, q] of Object.entries(need)) { const a = arts.find(x => x.id === id); const dispo = fromStock[id] ?? 0; if (a && q > dispo) return `Stock insuffisant dans le dépôt d’origine pour ${a.name} : ${n(dispo)} ${a.unit} disponible(s).`; }
    return '';
  }

  async function loadHist() {
    try {
      const rows = await db.select('transfers', 'select=id,number,destination,moved_at,note,created_by,transfer_lines(qty,articles(sku,name,unit))&order=moved_at.desc,created_at.desc');
      const pend = await pendingFor('transfers');
      historyItems = [...pend.map(it => ({ pending: true, number: 'En attente', destination: it.body.p_destination, moved_at: it.body.p_date || today(), note: it.body.p_note,
          created_by: ctx?.id, transfer_lines: it.body.p_lines.map(l => ({ qty: l.qty, articles: arts.find(a => a.id === l.article_id) })) })), ...rows];
      drawHistory();
    } catch (e) { $('#hist').textContent = 'Chargement impossible : ' + e.message; }
  }

  $('#transfer-q').addEventListener('input', drawHistory);

  if (canWrite) {
    async function addProduct() {
      $('#addErr').textContent = '';
      const q = +$('#qty').value;
      const a = await findArticle(arts, $('#prod').value);
      if (!a) return ($('#addErr').textContent = 'Choisissez un produit dans la liste.');
      if (!(q > 0)) return ($('#addErr').textContent = 'La quantité doit être supérieure à 0.');
      const ex = lines.find(l => l.article_id === a.id);
      if (ex) ex.qty += q; else lines.push({ article_id: a.id, sku: a.sku, name: a.name, unit: a.unit, qty: q });
      $('#prod').value = ''; $('#qty').value = 1; $('#addErr').textContent = stockProblem(); drawLines(); $('#prod').focus();
    }
    $('#add').onclick = addProduct;
    attachCombo($('#prod'), () => arts.map(a => ({ label: label(a), keys: [a.sku, a.name, a.barcode, unitLabel(a.unit), label(a)] })));
    $('#prod').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addProduct(); } };
    $('#rows').oninput = e => {
      const i = +e.target.dataset.i; if (isNaN(i)) return;
      lines[i].qty = +e.target.value || 0; $('#addErr').textContent = stockProblem();
    };
    $('#rows').onclick = e => { const b = e.target.closest('button[data-rm]'); if (b) { lines.splice(+b.dataset.rm, 1); $('#addErr').textContent = stockProblem(); drawLines(); } };
    $('#reset').onclick = () => { lines = []; $('#to').value = ''; $('#note').value = ''; $('#err').textContent = ''; $('#addErr').textContent = ''; drawLines(); };

    $('#save').onclick = async () => {
      $('#err').textContent = '';
      const from = $('#from').value, to = $('#to').value;
      if (!to) return ($('#err').textContent = 'Choisissez le dépôt de destination.');
      if (from === to) return ($('#err').textContent = 'Choisissez deux dépôts différents.');
      if (!lines.length) return ($('#err').textContent = 'Ajoutez au moins un produit.');
      const p = stockProblem(); if (p) return ($('#err').textContent = p);
      const destName = whs.find(w => w.id === to)?.name || 'dépôt';
      const btn = $('#save'); btn.disabled = true;
      try {
        await db.rpc('create_transfer', {
          p_from: from, p_to: to, p_destination: destName, p_date: $('#date').value || today(),
          p_lines: lines.map(l => ({ article_id: l.article_id, qty: l.qty })),
          p_id: newId(), p_note: $('#note').value.trim() || null });
        $('#done').hidden = false;
        $('#done').textContent = `Sortie enregistrée vers ${destName}. Le stock a été mis à jour.`;
        lines = []; $('#to').value = ''; $('#note').value = ''; drawLines();
        await loadHist();
      } catch (e) { $('#err').textContent = e.message; }
      finally { btn.disabled = false; }
    };
  }

  if (canWrite) {
    try {
      [arts, whs] = await Promise.all([
        db.select('articles', 'select=id,sku,name,unit&order=name'),
        db.select('warehouses', 'select=id,name,is_default&active=eq.true&order=name')
      ]);
      // Stock du dépôt d'origine (pas le total de toutes les boutiques)
      const stockOf = async wh => Object.fromEntries((await db.select('warehouse_stock', `select=article_id,qty&warehouse_id=eq.${wh}`).catch(() => [])).map(r => [r.article_id, Number(r.qty) || 0]));
      fromStock = await stockOf(whs.find(w => w.is_default)?.id || whs[0]?.id);
      const paintArts = () => { $('#arts').innerHTML = arts.map(a => `<option value="${esc(label(a))}">Stock ${n(fromStock[a.id] ?? 0)}</option>`).join(''); };
      paintArts();
      $('#from').innerHTML = whs.map(w => `<option value="${esc(w.id)}" ${w.is_default ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
      $('#from').addEventListener('change', async () => { fromStock = await stockOf($('#from').value); paintArts(); stockProblem() && ($('#addErr').textContent = stockProblem()); });
      $('#to').innerHTML = '<option value="">Choisir un dépôt…</option>' + whs.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');
    } catch (e) { $('#err').textContent = 'Chargement impossible : ' + e.message; }
  }
  loadHist();
}
