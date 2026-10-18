// Écran générique « pièces » (achats, ventes) : liste + saisie multi-lignes.
import { db } from '../api.js';
import { esc, n, fld, openDialog } from '../ui.js';
const today = () => new Date().toISOString().slice(0, 10);
const fr = d => d.split('-').reverse().join('/');

export async function render(main, c) {
  let parties = [], arts = [];
  main.innerHTML = `<div class="head"><h1>${c.title}</h1><div class="acts"><button class="ghost" id="par" type="button">${c.newParty}</button><button class="btn" id="new" type="button">${c.newDoc}</button></div></div>
    <div class="card tw" id="tbl" aria-live="polite">Chargement…</div><dialog id="dlg"></dialog>`;
  const $ = s => main.querySelector(s);

  async function load() {
    try {
      [parties, arts] = await Promise.all([db.select(c.partyTable, 'select=id,name&order=name'), db.select('articles', 'select=id,sku,name,unit,price_buy,price_sell,stock&order=name')]);
      const rows = await db.select(c.table, `select=id,number,${c.dateCol},${c.partyTable}(name),${c.linesTable}(qty,${c.priceCol})&order=${c.dateCol}.desc,created_at.desc`);
      $('#tbl').innerHTML = rows.length ? `<table><thead><tr><th>Date</th><th>N°</th><th>${c.partyLabel}</th><th class="r">Lignes</th><th class="r">Total</th></tr></thead><tbody>${rows.map(p => { const L = p[c.linesTable];
        return `<tr><td>${fr(p[c.dateCol])}</td><td>${esc(p.number || '—')}</td><td>${esc(p[c.partyTable]?.name || '—')}</td><td class="r">${L.length}</td><td class="r">${n(L.reduce((s, l) => s + l.qty * l[c.priceCol], 0))}</td></tr>`; }).join('')}</tbody></table>` : c.empty;
    } catch (e) { $('#tbl').textContent = 'Chargement impossible : ' + e.message; }
  }
  const line = () => `<div class="ln"><label class="c-art"><span class="lb">Article</span><select name="art" required><option value="">Choisir un article</option>${arts.map(a => `<option value="${a.id}" data-c="${a[c.artPrice]}">${esc(a.sku)} — ${esc(a.name)}</option>`).join('')}</select><small class="hint"></small></label>
    <label><span class="lb">Quantité</span><input name="qty" type="number" min="0.001" step="any" required></label>
    <label><span class="lb">${c.priceLabel}</span><input name="cost" type="number" min="0" step="any" required></label>
    <div class="lt"><span class="lb">Total</span><output>0</output></div>
    <button type="button" class="lnk rm" aria-label="Retirer la ligne">Retirer</button></div>`;

  $('#par').onclick = () => openDialog($('#dlg'), c.newParty, fld('name', 'Nom', 'text', 'required') + fld('phone', 'Téléphone', 'tel', 'autocomplete="tel"'),
    v => db.insert(c.partyTable, { name: v.name.trim(), phone: v.phone.trim() || null }), load);

  $('#new').onclick = () => {
    if (!parties.length) return openDialog($('#dlg'), `${c.partyLabel} requis`, `<p>Créez d’abord : ${c.newParty.toLowerCase()}.</p>`, async () => {}, load);
    if (!arts.length) return openDialog($('#dlg'), 'Article requis', '<p>Ajoutez d’abord des articles dans Stocks.</p>', async () => {}, load);
    const top = (l, h) => `<div><label for="${h}">${l}</label>`;
    openDialog($('#dlg'), c.newDoc,
      `<div class="top">${top(c.partyLabel, 'party')}<select id="party" name="party" required><option value="">Choisir…</option>${parties.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>` +
      `${top('Date', 'date')}<input id="date" name="date" type="date" required value="${today()}"></div>${top('Numéro de pièce (facultatif)', 'number')}<input id="number" name="number" type="text"></div></div>` +
      `<h3>Lignes</h3><div class="lh" aria-hidden="true"><span>Article</span><span>Quantité</span><span>${c.priceLabel}</span><span class="r">Total</span><span></span></div>` +
      `<div id="lines">${line()}</div><button type="button" class="lnk" id="add">Ajouter une ligne</button><p class="tot" aria-live="polite">Total : <b id="tot">0</b></p>`,
      (v, fd) => {
        const A = fd.getAll('art'), Q = fd.getAll('qty'), P = fd.getAll('cost');
        if (c.checkStock) {
          const need = {}; A.forEach((a, i) => need[a] = (need[a] || 0) + +Q[i]);
          for (const [id, q] of Object.entries(need)) { const a = arts.find(x => x.id === id); if (q > a.stock) throw new Error(`Stock insuffisant pour ${a.name} : ${n(a.stock)} ${a.unit} disponible(s).`); }
        }
        return db.rpc(c.rpc, { [c.rpcParty]: v.party, p_number: v.number.trim() || null, p_date: v.date, p_lines: A.map((a, i) => ({ article_id: a, qty: +Q[i], [c.priceCol]: +P[i] })) });
      }, load,
      f => {
        const box = f.querySelector('#lines');
        const refresh = () => {
          let sum = 0;
          for (const r of box.children) {
            const q = +r.querySelector('[name=qty]').value || 0, p = +r.querySelector('[name=cost]').value || 0, a = arts.find(x => x.id === r.querySelector('[name=art]').value), h = r.querySelector('.hint');
            r.querySelector('output').textContent = n(q * p); sum += q * p;
            h.className = 'hint'; h.textContent = a ? `Stock : ${n(a.stock)} ${a.unit}` : '';
            if (a && c.checkStock && q > a.stock) { h.className = 'hint bad'; h.textContent = `Stock insuffisant : ${n(a.stock)} ${a.unit} disponible(s)`; }
          }
          f.querySelector('#tot').textContent = n(sum);
        };
        f.querySelector('#add').onclick = () => box.insertAdjacentHTML('beforeend', line());
        box.addEventListener('input', refresh);
        box.addEventListener('change', e => { if (e.target.name === 'art') { const v = e.target.selectedOptions[0].dataset.c, r = e.target.closest('.ln').querySelector('[name=cost]'); if (v && !r.value) r.value = v; refresh(); } });
        box.addEventListener('click', e => { if (e.target.classList.contains('rm') && box.children.length > 1) { e.target.closest('.ln').remove(); refresh(); } });
      }, 'wide');
  };
  load();
}
