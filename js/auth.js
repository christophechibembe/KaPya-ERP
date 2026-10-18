import { signIn, signUp, db } from './api.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function card(root, title, fields, cta, onSubmit, extra = '') {
  root.innerHTML = `<div class="auth"><form class="card" novalidate><img class="auth-logo" src="assets/logo.png" alt="KaPya ERP" width="260"><h1>${title}</h1>
    ${fields.map(([id, label, type, ac]) => `<label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" autocomplete="${ac}" required>`).join('')}
    <p class="err" role="alert" aria-live="assertive"></p>
    <button class="btn" type="submit">${cta}</button>${extra}</form></div>`;
  const f = root.querySelector('form'), err = f.querySelector('.err'), b = f.querySelector('button');
  f.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const v = Object.fromEntries(new FormData(f));
    if (Object.values(v).some(x => !String(x).trim())) { err.textContent = 'Renseignez tous les champs.'; return; }
    b.disabled = true;
    try { await onSubmit(v); } catch (x) { err.textContent = x.message; b.disabled = false; }
  });
  f.querySelector('input').focus();
}

export function renderAuth(root, done, mode = 'in') {
  const swap = mode === 'in'
    ? `<p>Pas de compte ? <a href="#" id="sw">Créer un compte</a></p>` : `<p>Déjà inscrit ? <a href="#" id="sw">Se connecter</a></p>`;
  card(root, mode === 'in' ? 'Se connecter' : 'Créer un compte',
    [['email', 'Adresse e-mail', 'email', 'email'], ['password', 'Mot de passe (8 caractères minimum)', 'password', mode === 'in' ? 'current-password' : 'new-password']],
    mode === 'in' ? 'Se connecter' : 'Créer le compte',
    async v => {
      if (mode === 'in') { await signIn(v.email, v.password); return done(); }
      if (v.password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
      const r = await signUp(v.email, v.password);
      if (r.confirm) { root.innerHTML = '<div class="auth"><div class="card"><h1>Vérifiez votre boîte mail</h1><p>Cliquez sur le lien de confirmation, puis connectez-vous.</p></div></div>'; return; }
      done();
    }, swap);
  root.querySelector('#sw').addEventListener('click', e => { e.preventDefault(); renderAuth(root, done, mode === 'in' ? 'up' : 'in'); });
}

export function renderOrg(root, done) {
  card(root, 'Créer votre entreprise', [['org', 'Nom de l’entreprise', 'text', 'organization']], 'Créer l’entreprise',
    async v => { await db.rpc('bootstrap_org', { org_name: v.org.trim() }); done(); },
    '<p class="or">ou</p><button class="ghost" id="join" type="button">J’ai un code d’invitation</button>');
  root.querySelector('#join').addEventListener('click', () => renderJoin(root, done));
}
function renderJoin(root, done) {
  card(root, 'Rejoindre une entreprise', [['code', 'Code d’invitation ou d’activation', 'text', 'one-time-code']], 'Valider',
    async v => {
      const c = v.code.trim();
      try { await db.rpc('join_org', { p_code: c }); }
      catch (e) { if (!/invalide|expir/i.test(e.message)) throw e; await db.rpc('redeem_company_code', { p_code: c }); }
      done();
    },
    '<p><a href="#" id="back">Retour</a></p>');
  root.querySelector('#back').addEventListener('click', e => { e.preventDefault(); renderOrg(root, done); });
}
