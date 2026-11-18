import { db } from '../api.js';
import { esc, fld, openDialog, ico } from '../ui.js';
import { can } from '../roles.js';
import { parseCsv } from '../csv.js';
import { checkClientRows } from '../client-import.js';
import { notify } from '../ui.js';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');

export async function render(main, c) {
  main.innerHTML = `<div class="page-head"><div><h1>${esc(c.title)}</h1><p class="sub">${esc(c.sub)}</p></div><div class="acts">
    <label class="sr" for="party-q">Rechercher ${esc(c.title.toLocaleLowerCase('fr'))}</label><input id="party-q" type="search" placeholder="Rechercher…" autocomplete="off">
    <button class="btn" id="new" type="button">${ico('plus')}<span>${esc(c.add)}</span></button>${c.table === 'customers' ? '<label class="ghost csv-pick">Importer un fichier CSV<input type="file" id="csv-party" accept=".csv,text/csv" hidden></label>' : ''}</div></div>
    <div class="card tw" id="tbl" aria-live="polite" aria-busy="true">Chargement…</div><dialog id="dlg"></dialog>`;
  const $ = s => main.querySelector(s) || document.getElementById('top-search')?.querySelector(s);
  const writable = can(c.role, c.cap);
  if (!writable) $('#new').hidden = true;
  let rows = [];

  function draw() {
    const query = normalize($('#party-q').value.trim());
    const visible = rows.filter(r => !query || normalize([r.name, r.phone, r.email].join(' ')).includes(query));
    $('#tbl').setAttribute('aria-busy', 'false');
    if (!visible.length) {
      $('#tbl').innerHTML = `<p class="empty">${rows.length ? 'Aucun résultat pour cette recherche.' : esc(c.empty)}</p>`;
      return;
    }
    $('#tbl').innerHTML = `<table><thead><tr><th scope="col">Nom</th><th scope="col">Téléphone</th><th scope="col">E-mail</th>${(c.columns || []).map(col => `<th scope="col" class="${col.cls || ''}">${esc(col.head)}</th>`).join('')}${writable ? '<th scope="col"><span class="sr">Actions</span></th>' : ''}</tr></thead><tbody>${visible.map(r =>
      `<tr><td><span class="who"><span class="thumb" aria-hidden="true">${esc((r.name || '?')[0].toLocaleUpperCase('fr'))}</span>${esc(r.name)}${r._offline_pending ? ` <span class="pill warn" title="${r._offline_pending === 'rejected' ? esc(r._offline_error || 'Synchronisation refusée') : 'Synchronisation en attente'}">${r._offline_pending === 'rejected' ? 'À vérifier' : 'En attente'}</span>` : ''}</span></td><td>${esc(r.phone || '—')}</td><td>${esc(r.email || '—')}</td>${(c.columns || []).map(col => `<td class="${col.cls || ''}">${col.cell(r)}</td>`).join('')}${writable ? `<td><button class="iconbtn" type="button" data-edit="${esc(r.id)}" aria-label="Modifier ${esc(r.name)}" title="Modifier">${ico('edit')}</button><button class="lnk" type="button" data-archive="${esc(r.id)}" aria-label="Archiver ${esc(r.name)}" title="Archiver (masquer de la liste, l'historique est conservé)">Archiver</button></td>` : ''}</tr>`).join('')}</tbody></table>`;
    if (writable) $('#tbl').querySelectorAll('[data-archive]').forEach(button => {
      button.onclick = async () => {
        const r = rows.find(x => x.id === button.dataset.archive);
        if (!r || !(await askConfirm(`Archiver « ${r.name} » ? Elle ne sera plus proposée, mais l'historique reste.`))) return;
        try { await db.update(c.table, r.id, { archived_at: new Date().toISOString() }); notify('Fiche archivée.'); load(); }
        catch (x) { notify('Archivage impossible : ' + x.message); }
      };
    });
    if (writable) $('#tbl').querySelectorAll('[data-edit]').forEach(button => {
      button.onclick = () => edit(rows.find(r => r.id === button.dataset.edit));
    });
  }

  async function load() {
    $('#tbl').setAttribute('aria-busy', 'true');
    try {
      rows = await db.select(c.table, 'select=id,name,phone,email,version&order=name');
      if (c.enrich) rows = await c.enrich(rows);
      draw();
    } catch (e) {
      $('#tbl').setAttribute('aria-busy', 'false');
      $('#tbl').textContent = 'Chargement impossible : ' + e.message;
    }
  }

  function formBody(party = {}) {
    return fld('name', 'Nom', 'text', `required maxlength="160" autocomplete="organization" value="${esc(party.name || '')}"`)
      + fld('phone', 'Téléphone', 'tel', `maxlength="40" autocomplete="tel" value="${esc(party.phone || '')}"`)
      + fld('email', 'E-mail', 'email', `maxlength="254" autocomplete="email" value="${esc(party.email || '')}"`);
  }

  function edit(party) {
    if (!party || !writable) return;
    openDialog($('#dlg'), `Modifier ${esc(party.name)}`, formBody(party), v => {
      const name = v.name.trim();
      if (!name) throw new Error('Le nom est obligatoire.');
      return db.update(c.table, party.id, { name, phone: v.phone.trim() || null, email: v.email.trim() || null }, party.version);
    }, load);
  }

  $('#party-q').addEventListener('input', draw);
  main.querySelector('#csv-party')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const { records, headers } = parseCsv(await file.text());
      if (!records.length) return notify('Le fichier est vide ou son en-tête est incorrect.');
      if (!headers.some(h => h === 'nom' || h === 'name')) return notify('Le fichier doit avoir une colonne « nom ».');
      const existing = await db.select('customers', 'select=name').catch(() => []);
      const { ok, errors } = checkClientRows(records, existing.map(x => x.name));
      let imported = 0;
      for (const row of ok) {
        try { await db.insert('customers', row); imported++; }
        catch (error) { errors.push(`${row.name} : ${error.message || 'enregistrement refusé'}`); }
      }
      const detail = errors.length ? `\n\nÀ vérifier (${errors.length}) :\n` + errors.slice(0, 12).join('\n') : '';
      notify(`${imported} client(s) importé(s) sur ${records.length} ligne(s).${detail}`, 'Import des clients');
      if (imported) render(main, c);
    } catch (error) { notify('Import impossible : ' + (error.message || 'erreur')); }
  });
  $('#new').onclick = () => {
    if (!writable) return;
    openDialog($('#dlg'), c.add, formBody(), v => {
      const name = v.name.trim();
      if (!name) throw new Error('Le nom est obligatoire.');
      return db.insert(c.table, { name, phone: v.phone.trim() || null, email: v.email.trim() || null });
    }, load);
  };
  await load();
}
