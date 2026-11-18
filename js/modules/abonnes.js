// Super administrateur : toutes les entreprises (statut, échéance), codes d'activation pour les nouveaux abonnés.
import { db } from '../api.js';
import { esc, ico, notify, fmtDate } from '../ui.js';
import { PLANS } from '../plans.js';
import { downloadCsv } from '../export.js';
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
export async function render(main) {
  main.innerHTML = `<div class="page-head"><div><h1>Abonnés</h1><p class="sub">Toutes les entreprises de la plateforme. Une entreprise suspendue ou expirée n’a plus accès à ses données.</p></div></div>
    <h2 class="sec">Vue d’ensemble</h2><div id="kpi" class="kpi-grid"><p class="muted">Calcul en cours…</p></div>
    <h2 class="sec">Paiements à valider (Airtel Money)</h2><div id="pay-list" class="card"><p class="muted">Chargement…</p></div>
    <h2 class="sec">Entreprises</h2>
    <div class="card list-search" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label for="org-q" style="flex:1;min-width:220px">Rechercher une entreprise<input id="org-q" type="search" placeholder="Nom, statut ou échéance…" autocomplete="off"></label>
      <div id="chips" class="chips" role="group" aria-label="Filtrer par statut"><button class="chip-f on" data-f="all" type="button">Toutes</button><button class="chip-f" data-f="active" type="button">Actives</button><button class="chip-f" data-f="suspended" type="button">Suspendues</button><button class="chip-f" data-f="soon" type="button">Échéance ≤ 7 j</button></div>
      <button class="ghost" id="exp-csv" type="button">Exporter (CSV)</button></div><div class="card tw" id="orgs">Chargement…</div>
    <h2 class="sec">Nouvel abonné</h2>
    <section class="card set"><div class="set-main"><p class="muted">Créez un code pour une nouvelle entreprise. L’abonné crée son compte, puis saisit ce code.</p></div>
      <form class="rf" id="f"><label for="name" class="sr">Nom de l’entreprise</label><input id="name" placeholder="Nom de l’entreprise" autocomplete="off"><button class="btn" type="submit">${ico('plus')}<span>Créer le code</span></button><p class="err" id="err" role="alert"></p></form>
      <div id="new" class="code-out"></div></section>
    <h2 class="sec">Codes créés</h2><div class="card list-search"><label for="code-q">Rechercher un code<input id="code-q" type="search" placeholder="Entreprise, code ou statut…" autocomplete="off"></label></div><div class="card tw" id="list">Chargement…</div>`;
  const $ = s => main.querySelector(s);
  const dstr = d => d ? fmtDate(d) : '—';
  let organizations = [], activationCodes = [], lastErr = 0;

  let filtre = 'all';
  const dans7j = d => d && (new Date(d) - Date.now()) / 86400000 <= 7;
  function drawKpi(errors24h) {
    const actives = organizations.filter(o => o.status === 'active').length;
    const suspendues = organizations.filter(o => o.status !== 'active').length;
    const bientot = organizations.filter(o => o.status === 'active' && dans7j(o.expires_at)).length;
    const expirees = organizations.filter(o => o.expires_at && new Date(o.expires_at) < new Date()).length;
    const enAttente = activationCodes.filter(c => !c.used_at).length;
    const k = (v, l, cls = '') => `<div class="kpi ${cls}"><b>${v}</b><span>${l}</span></div>`;
    $('#kpi').innerHTML = [k(organizations.length, 'Entreprises'), k(actives, 'Actives'), k(suspendues, 'Suspendues'),
      k(bientot, 'Échéance dans 7 jours', bientot ? 'warn' : ''), k(expirees, 'Échéance dépassée', expirees ? 'bad' : ''),
      k(enAttente, 'Codes en attente'), k(errors24h, 'Erreurs (24 h)', errors24h ? 'bad' : '')].join('');
  }
  async function errorsLast24h() {
    const since = new Date(Date.now() - 86400000).toISOString();
    const rows = await db.select('app_errors', `select=id&created_at=gte.${encodeURIComponent(since)}&limit=1000`).catch(() => []);
    return rows.length;
  }

  function drawOrgs() {
    const query = norm($('#org-q').value.trim());
    const visible = organizations.filter(o => {
      if (filtre === 'active' && o.status !== 'active') return false;
      if (filtre === 'suspended' && o.status === 'active') return false;
      if (filtre === 'soon' && !(o.status === 'active' && dans7j(o.expires_at))) return false;
      return !query || norm([o.name, o.status, o.expires_at, o.plan].join(' ')).includes(query);
    });
    $('#orgs').innerHTML = visible.length ? `<table><thead><tr><th>Entreprise</th><th>Formule</th><th>Statut</th><th>Échéance</th><th class="c">Actions</th></tr></thead><tbody>${visible.map(o => `<tr>
      <td>${esc(o.name)}${o.expires_at && new Date(o.expires_at) < new Date() ? ' <span class="pill warn">Expirée</span>' : (o.status === 'active' && dans7j(o.expires_at) ? ' <span class="pill warn">Bientôt</span>' : '')}</td><td><select class="cell" data-plan="${o.id}" aria-label="Formule de ${esc(o.name)}">${PLANS.map(p => `<option value="${p}"${o.plan === p ? ' selected' : ''}>${p}</option>`).join('')}</select></td><td>${o.status === 'active' ? '<span class="pill ok">Actif</span>' : '<span class="pill bad">Suspendu</span>'}</td>
      <td><input type="date" class="cell date" value="${o.expires_at || ''}" data-exp="${o.id}" aria-label="Échéance de ${esc(o.name)}"></td>
      <td class="c"><button class="lnk" type="button" data-ext="${o.id}" data-base="${o.expires_at || ''}">+30 j</button> <button class="lnk" type="button" data-st="${o.id}" data-next="${o.status === 'active' ? 'suspended' : 'active'}">${o.status === 'active' ? 'Suspendre' : 'Réactiver'}</button> <button class="lnk danger" type="button" data-del="${o.id}" data-name="${esc(o.name)}">Supprimer</button></td></tr>`).join('')}</tbody></table>` : `<p class="empty">${organizations.length ? 'Aucune entreprise ne correspond à cette recherche.' : 'Aucune entreprise.'}</p>`;
  }

  function drawCodes() {
    const query = norm($('#code-q').value.trim());
    const visible = activationCodes.filter(r => !query || norm([r.company_name, r.code, r.created_at, r.used_at ? 'activé' : 'en attente'].join(' ')).includes(query));
    $('#list').innerHTML = visible.length ? `<table><thead><tr><th>Entreprise</th><th>Code</th><th>Créé le</th><th>Statut</th></tr></thead><tbody>${visible.map(r => `<tr>
      <td>${esc(r.company_name)}</td><td><b>${esc(r.code)}</b></td><td>${new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
      <td>${r.used_at ? '<span class="pill ok">Activé</span>' : '<span class="pill warn">En attente</span>'}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${activationCodes.length ? 'Aucun code ne correspond à cette recherche.' : 'Aucun code pour l’instant.'}</p>`;
  }

  async function orgs() {
    try {
      organizations = await db.select('organizations', 'select=id,name,status,expires_at,plan,created_at&order=created_at.desc');
      drawOrgs();
      lastErr = await errorsLast24h(); drawKpi(lastErr);
    } catch (e) { $('#orgs').textContent = 'Chargement impossible : ' + e.message; }
  }
  async function paiements() {
    const box = $('#pay-list');
    try {
      const rows = await db.rpc('paiements_en_attente');
      box.innerHTML = rows.length ? `<table><thead><tr><th>Entreprise</th><th>Formule</th><th>Montant</th><th>Référence</th><th>Reçu le</th><th class="c">Action</th></tr></thead><tbody>${rows.map(r => `<tr>
        <td>${esc(r.org_name)}</td><td>${esc(r.plan)}</td><td>${esc(String(r.montant))} $</td><td><b>${esc(r.reference)}</b></td><td>${esc(fmtDate(r.created_at))}</td>
        <td class="c"><button class="lnk" type="button" data-pv="${esc(r.id)}">Valider (+30 j)</button> <button class="lnk dang" type="button" data-pr="${esc(r.id)}">Refuser</button></td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">Aucun paiement en attente.</p>';
    } catch (e) { box.textContent = 'Chargement impossible : ' + e.message; }
  }
  $('#pay-list').addEventListener('click', async e => {
    const v = e.target.closest('button[data-pv]'), r = e.target.closest('button[data-pr]');
    if (!v && !r) return;
    try {
      if (v) { await db.rpc('valider_paiement', { p_id: v.dataset.pv }); notify('Paiement validé : abonnement prolongé de 30 jours.'); }
      else { await db.rpc('rejeter_paiement', { p_id: r.dataset.pr }); notify('Paiement refusé.'); }
      paiements(); orgs();
    } catch (x) { notify('Action impossible : ' + x.message); }
  });
  $('#chips').onclick = e => {
    const b = e.target.closest('button[data-f]'); if (!b) return;
    filtre = b.dataset.f;
    main.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b));
    drawOrgs();
  };
  $('#exp-csv').onclick = () => {
    const rows = organizations.map(o => [o.name, o.plan, o.status, o.expires_at || '', o.created_at ? o.created_at.slice(0, 10) : '']);
    downloadCsv('entreprises-kapya.csv', ['Entreprise', 'Formule', 'Statut', 'Échéance', 'Créée le'], rows);
  };
  $('#orgs').addEventListener('click', async e => {
    const x = e.target.closest('button[data-ext]'); if (!x) return;
    const base = x.dataset.base && new Date(x.dataset.base) > new Date() ? new Date(x.dataset.base) : new Date();
    base.setDate(base.getDate() + 30);
    const iso = base.toISOString().slice(0, 10);
    try { await db.update('organizations', x.dataset.ext, { expires_at: iso }); notify(`Échéance prolongée jusqu’au ${fmtDate(iso)}.`); orgs(); }
    catch (err) { notify('Prolongation impossible : ' + err.message); }
  });
  $('#orgs').onclick = async e => {
    const d = e.target.closest('button[data-del]');
    if (d) {
      const name = d.dataset.name;
      const typed = window.prompt(`Supprimer définitivement « ${name} » et toutes ses données (ventes, clients, articles, sauvegardes) ?\n\nLes membres de cette entreprise perdront leur accès. Cette action est irréversible.\n\nPour confirmer, tapez le nom exact de l’entreprise :`);
      if (typed === null) return;
      if (typed.trim() !== name) { notify('Le nom ne correspond pas. Rien n’a été supprimé.'); return; }
      try {
        const removed = await db.rpc('delete_company', { p_org: d.dataset.del, p_confirm: typed.trim() });
        notify(`Entreprise « ${name} » supprimée (${removed} ligne(s) effacée(s)).`);
        orgs();
      } catch (x) { notify('Suppression impossible : ' + x.message); }
      return;
    }
    const b = e.target.closest('button[data-st]'); if (!b) return;
    try { await db.update('organizations', b.dataset.st, { status: b.dataset.next }); orgs(); } catch (x) { notify('Action impossible : ' + x.message); }
  };
  $('#orgs').onchange = async e => {
    const pl = e.target.closest('select[data-plan]');
    if (pl) { try { await db.update('organizations', pl.dataset.plan, { plan: pl.value }); } catch (x) { notify('Formule impossible : ' + x.message); } orgs(); return; }
    const i = e.target.closest('input[data-exp]'); if (!i) return;
    try { await db.update('organizations', i.dataset.exp, { expires_at: i.value || null }); } catch (x) { notify('Échéance impossible : ' + x.message); }
  };
  async function codes() {
    try {
      activationCodes = await db.select('company_codes', 'select=code,company_name,created_at,used_at&order=created_at.desc');
      drawCodes(); drawKpi(lastErr);
    } catch (e) { $('#list').textContent = 'Chargement impossible : ' + e.message; }
  }
  $('#f').onsubmit = async e => {
    e.preventDefault(); $('#err').textContent = '';
    try {
      const code = await db.rpc('create_company_code', { p_name: $('#name').value.trim() });
      $('#new').innerHTML = `<p class="muted">Code à transmettre à l’abonné :</p><span class="code">${esc(code)}</span>`;
      $('#name').value = ''; codes();
    } catch (x) { $('#err').textContent = x.message; }
  };
  $('#org-q').addEventListener('input', drawOrgs);
  $('#code-q').addEventListener('input', drawCodes);
  orgs(); codes(); paiements();
}
