// Super administrateur : toutes les entreprises (statut, échéance), codes d'activation pour les nouveaux abonnés.
import { db } from '../api.js';
import { esc, ico } from '../ui.js';
import { PLANS } from '../plans.js';
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
export async function render(main) {
  main.innerHTML = `<div class="page-head"><div><h1>Abonnés</h1><p class="sub">Toutes les entreprises de la plateforme. Une entreprise suspendue ou expirée n’a plus accès à ses données.</p></div></div>
    <h2 class="sec">Entreprises</h2><div class="card list-search"><label for="org-q">Rechercher une entreprise<input id="org-q" type="search" placeholder="Nom, statut ou échéance…" autocomplete="off"></label></div><div class="card tw" id="orgs">Chargement…</div>
    <h2 class="sec">Nouvel abonné</h2>
    <section class="card set"><div class="set-main"><p class="muted">Créez un code pour une nouvelle entreprise. L’abonné crée son compte, puis saisit ce code.</p></div>
      <form class="rf" id="f"><label for="name" class="sr">Nom de l’entreprise</label><input id="name" placeholder="Nom de l’entreprise" autocomplete="off"><button class="btn" type="submit">${ico('plus')}<span>Créer le code</span></button><p class="err" id="err" role="alert"></p></form>
      <div id="new" class="code-out"></div></section>
    <h2 class="sec">Codes créés</h2><div class="card list-search"><label for="code-q">Rechercher un code<input id="code-q" type="search" placeholder="Entreprise, code ou statut…" autocomplete="off"></label></div><div class="card tw" id="list">Chargement…</div>`;
  const $ = s => main.querySelector(s);
  const dstr = d => d ? d.split('-').reverse().join('/') : '—';
  let organizations = [], activationCodes = [];

  function drawOrgs() {
    const query = norm($('#org-q').value.trim());
    const visible = organizations.filter(o => !query || norm([o.name, o.status, o.expires_at, o.plan].join(' ')).includes(query));
    $('#orgs').innerHTML = visible.length ? `<table><thead><tr><th>Entreprise</th><th>Formule</th><th>Statut</th><th>Échéance</th><th class="c">Actions</th></tr></thead><tbody>${visible.map(o => `<tr>
      <td>${esc(o.name)}</td><td><select class="cell" data-plan="${o.id}" aria-label="Formule de ${esc(o.name)}">${PLANS.map(p => `<option value="${p}"${o.plan === p ? ' selected' : ''}>${p}</option>`).join('')}</select></td><td>${o.status === 'active' ? '<span class="pill ok">Actif</span>' : '<span class="pill bad">Suspendu</span>'}</td>
      <td><input type="date" class="cell date" value="${o.expires_at || ''}" data-exp="${o.id}" aria-label="Échéance de ${esc(o.name)}"></td>
      <td class="c"><button class="lnk" type="button" data-st="${o.id}" data-next="${o.status === 'active' ? 'suspended' : 'active'}">${o.status === 'active' ? 'Suspendre' : 'Réactiver'}</button></td></tr>`).join('')}</tbody></table>` : `<p class="empty">${organizations.length ? 'Aucune entreprise ne correspond à cette recherche.' : 'Aucune entreprise.'}</p>`;
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
    } catch (e) { $('#orgs').textContent = 'Chargement impossible : ' + e.message; }
  }
  $('#orgs').onclick = async e => {
    const b = e.target.closest('button[data-st]'); if (!b) return;
    try { await db.update('organizations', b.dataset.st, { status: b.dataset.next }); orgs(); } catch (x) { alert('Action impossible : ' + x.message); }
  };
  $('#orgs').onchange = async e => {
    const pl = e.target.closest('select[data-plan]');
    if (pl) { try { await db.update('organizations', pl.dataset.plan, { plan: pl.value }); } catch (x) { alert('Formule impossible : ' + x.message); } orgs(); return; }
    const i = e.target.closest('input[data-exp]'); if (!i) return;
    try { await db.update('organizations', i.dataset.exp, { expires_at: i.value || null }); } catch (x) { alert('Échéance impossible : ' + x.message); }
  };
  async function codes() {
    try {
      activationCodes = await db.select('company_codes', 'select=code,company_name,created_at,used_at&order=created_at.desc');
      drawCodes();
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
  orgs(); codes();
}
