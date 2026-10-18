import { CFG } from '../config.js';
import { esc, getRate, n, ico } from '../ui.js';
import { ROLES, can } from '../roles.js';
import { saveRate } from '../rate.js';
import { resetLocal } from '../demo.js';
import { db } from '../api.js';
const ROLE = ROLES;
function rateCard(ctx) {
  const rate = getRate(), canRate = can(ctx?.role, 'taux.write');
  return `<section class="card set"><div class="set-main"><h2>Taux du jour</h2><p class="muted">${rate ? `1 $ = ${n(rate.usd_cdf)} FC · mis à jour le ${rate.rate_date.split('-').reverse().join('/')}` : 'Non renseigné : les montants sont affichés en dollars.'}</p></div>
    ${canRate ? `<form class="rf" id="rf"><label for="rv" class="sr">Taux : 1 dollar en francs congolais</label><input id="rv" type="number" min="1" step="any" required placeholder="Ex. 2850" value="${rate ? rate.usd_cdf : ''}"><button class="btn" type="submit">Enregistrer</button><p class="err" role="alert"></p></form>`
      : '<p class="muted">Les membres peuvent modifier le taux, sauf le rôle Lecture seule.</p>'}</section>`;
}
function bindRate(main, ctx) {
  const f = main.querySelector('#rf');
  if (!f || !can(ctx?.role, 'taux.write')) return;
  f.onsubmit = async e => {
    e.preventDefault(); const v = +f.querySelector('#rv').value, er = f.querySelector('.err');
    if (!(v > 0)) { er.textContent = 'Saisissez un taux supérieur à 0.'; return; }
    try { await saveRate(v); render(main, ctx); } catch (x) { er.textContent = x.message; }
  };
}
export function render(main, ctx) {
  if (!CFG.demo && ctx?.role === 'admin') return renderTeam(main, ctx);
  main.innerHTML = `<div class="page-head"><div><h1>Paramètres</h1><p class="sub">Taux de change et informations de l’espace.</p></div></div>
    ${rateCard(ctx)}
    <section class="card set"><div class="set-main"><h2>Espace</h2><p class="muted">Rôle : ${esc(ctx?.role || '—')}</p></div></section>
    ${CFG.demo ? `<section class="card set"><div class="set-main"><h2>Simuler un rôle</h2><p class="muted">Mode local : pour tester les droits de chaque rôle.</p></div><select id="sim" aria-label="Rôle simulé">${Object.keys(ROLES).map(k => `<option value="${k}"${k === ctx?.role ? ' selected' : ''}>${ROLES[k]}</option>`).join('')}</select></section>` : ''}
    ${CFG.demo ? '<section class="card set"><div class="set-main"><h2>Mode local</h2><p class="muted">Les données sont enregistrées dans ce navigateur.</p></div><button class="ghost" id="rst" type="button">Réinitialiser les données</button></section>' : ''}`;
  bindRate(main, ctx);
  const sim = main.querySelector('#sim');
  if (sim) sim.onchange = () => { localStorage.setItem('kp.demoRole', sim.value); location.reload(); };
  const rst = main.querySelector('#rst');
  if (rst) rst.onclick = () => { if (rst.dataset.ok) resetLocal(); else { rst.dataset.ok = 1; rst.textContent = 'Confirmer la réinitialisation ?'; } };
}

async function renderTeam(main, ctx) {
  main.innerHTML = `<div class="page-head"><div><h1>Paramètres</h1><p class="sub">Équipe et invitations.</p></div></div>
    ${rateCard(ctx)}
    <section class="card set"><div class="set-main"><h2>Membres</h2><p class="muted">Les administrateurs peuvent changer le rôle des membres.</p><div id="members" class="team">Chargement…</div></div></section>
    <section class="card set"><div class="set-main"><h2>Inviter un membre</h2><p class="muted">Crée un code valable 7 jours. Le membre le saisit à l’inscription.</p></div>
      <form class="rf" id="inv"><label for="irole" class="sr">Rôle</label><select id="irole">${Object.keys(ROLES).filter(k => k !== 'admin').map(k => `<option value="${k}">${ROLES[k]}</option>`).join('')}</select><button class="btn" type="submit">Créer le code</button><p class="err" role="alert"></p></form>
      <div id="codes"></div></section>
    <section class="card set"><div class="set-main"><h2>Espace</h2><p class="muted">Rôle : ${esc(ROLE[ctx.role] || ctx.role)}</p></div></section>`;
  bindRate(main, ctx);
  renderCompany(main, ctx);
  const members = main.querySelector('#members');
  async function loadMembers() {
    try {
      const rows = await db.select('profiles', 'select=id,role,full_name&order=role');
      members.innerHTML = `<table><thead><tr><th>Membre</th><th>Rôle</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.id === ctx.id ? 'Vous' : esc(r.full_name || 'Membre')}</td><td>${
        r.id === ctx.id ? esc(ROLE[r.role]) : `<select data-id="${r.id}" aria-label="Rôle de ce membre">${Object.keys(ROLES).map(k => `<option value="${k}"${k === r.role ? ' selected' : ''}>${ROLE[k]}</option>`).join('')}</select>`}</td></tr>`).join('')}</tbody></table>`;
      members.querySelectorAll('select').forEach(sel => sel.onchange = async () => {
        try { await db.update('profiles', sel.dataset.id, { role: sel.value }); loadMembers(); }
        catch (e) { alert('Changement impossible : ' + e.message); loadMembers(); }
      });
    } catch (e) { members.textContent = 'Chargement impossible : ' + e.message; }
  }
  const f = main.querySelector('#inv');
  f.onsubmit = async e => {
    e.preventDefault(); const er = f.querySelector('.err');
    try {
      // Code généré ici (8 caractères hexadécimaux, en majuscules), envoyé avec l'entreprise : aucune valeur par défaut côté base
      const bytes = crypto.getRandomValues(new Uint8Array(4));
      const code = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      await db.insert('invitations', { code, org_id: ctx.org_id, role: f.irole.value }, 'minimal');
      main.querySelector('#codes').innerHTML = `<p class="muted" style="margin-top:.9rem">Code à transmettre (valable 7 jours) :</p><span class="code">${esc(code)}</span>`; er.textContent = '';
    }
    catch (x) { er.textContent = x.message; }
  };
  loadMembers();
}

// En-tête de l'entreprise (factures et bons imprimés) : nom, coordonnées, NIF, RC, logo
async function renderCompany(main, ctx) {
  const sec = document.createElement('section'); sec.className = 'card set company';
  sec.innerHTML = `<div class="set-main"><h2>Entreprise (en-tête des factures)</h2><p class="muted">Ces informations apparaissent sur les factures et les bons imprimés.</p>
    <form id="cof" class="cform">
      <div class="cgrid">
        <div><label for="c_name">Nom de l’entreprise</label><input id="c_name" autocomplete="organization"></div>
        <div><label for="c_phone">Téléphone</label><input id="c_phone" autocomplete="tel"></div>
        <div><label for="c_email">E-mail</label><input id="c_email" type="email" autocomplete="email"></div>
        <div><label for="c_address">Adresse</label><input id="c_address" autocomplete="street-address"></div>
        <div><label for="c_tax">NIF</label><input id="c_tax"></div>
        <div><label for="c_rc">RC</label><input id="c_rc"></div>
      </div>
      <div class="logorow"><div><span class="lab">Logo</span><img id="c_prev" class="logoprev" alt="Logo de l’entreprise" hidden></div>
        <div><input id="c_file" type="file" accept="image/*"> <button class="lnk" id="c_clear" type="button">Retirer le logo</button></div></div>
      <p class="err" id="c_err" role="alert"></p><p class="done" id="c_ok" hidden></p>
      <div class="acts end"><button class="btn" type="submit">${ico('check')}<span>Enregistrer l’entreprise</span></button></div>
    </form></div>`;
  main.prepend(sec);
  const $ = s => sec.querySelector(s);
  let logo = null;
  const show = () => { $('#c_prev').hidden = !logo; if (logo) $('#c_prev').src = logo; };
  try {
    const [o] = await db.select('organizations', 'select=name,address,phone,email,tax_id,rc,logo');
    if (o) { $('#c_name').value = o.name || ''; $('#c_phone').value = o.phone || ''; $('#c_email').value = o.email || ''; $('#c_address').value = o.address || ''; $('#c_tax').value = o.tax_id || ''; $('#c_rc').value = o.rc || ''; logo = o.logo || null; show(); }
  } catch (e) { $('#c_err').textContent = 'Chargement impossible : ' + e.message; }
  // Logo : réduit à 300 px maximum pour rester léger
  $('#c_file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, 300 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      logo = c.toDataURL('image/png'); URL.revokeObjectURL(url); show();
    };
    img.src = url;
  };
  $('#c_clear').onclick = () => { logo = null; $('#c_file').value = ''; show(); };
  $('#cof').onsubmit = async e => {
    e.preventDefault(); $('#c_err').textContent = ''; $('#c_ok').hidden = true;
    const row = { name: $('#c_name').value.trim(), phone: $('#c_phone').value.trim() || null, email: $('#c_email').value.trim() || null,
      address: $('#c_address').value.trim() || null, tax_id: $('#c_tax').value.trim() || null, rc: $('#c_rc').value.trim() || null, logo };
    if (!row.name) return ($('#c_err').textContent = 'Indiquez le nom de l’entreprise.');
    try {
      await db.update('organizations', ctx.org_id, row);
      $('#c_ok').hidden = false; $('#c_ok').textContent = 'En-tête enregistré. Il apparaîtra sur les prochaines impressions.';
    } catch (x) { $('#c_err').textContent = x.message; }
  };
}
