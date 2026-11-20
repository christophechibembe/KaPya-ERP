import { signIn, signUp, signOut, db, sendPasswordReset, setNewPassword, mfaStatus, mfaVerify } from './api.js';
import { esc } from './ui.js';

function card(root, title, fields, cta, onSubmit, extra = '') {
  const logo = document.documentElement.dataset.theme === 'dark' ? 'assets/logo-dark.png' : 'assets/logo.png';
  root.innerHTML = `<div class="auth"><form class="card" novalidate><img class="auth-logo" src="${logo}" alt="KaPya ERP" width="260"><h1>${title}</h1>
    ${fields.map(([id, label, type, ac]) => `<label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" autocomplete="${ac}" required>`).join('')}
    <p class="err" role="alert" aria-live="assertive"></p>
    <button class="btn" type="submit">${cta}</button>${extra}<p class="auth-legal"><a href="guide.html">Guide d'utilisation</a> · <a href="confidentialite.html">Confidentialité et conditions</a></p></form></div>`;
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

import { weakPasswordReason } from './password.js';

export function renderAuth(root, done, mode = 'in') {
  const swap = mode === 'in'
    ? `<p>Pas de compte ? <a href="#" id="sw">Créer un compte</a></p><p><a href="#" id="forgot">Mot de passe oublié ?</a></p>` : `<p>Déjà inscrit ? <a href="#" id="sw">Se connecter</a></p>`;
  card(root, mode === 'in' ? 'Se connecter' : 'Créer un compte',
    [['email', 'Adresse e-mail', 'email', 'email'], ['password', 'Mot de passe (8 caractères minimum)', 'password', mode === 'in' ? 'current-password' : 'new-password']],
    mode === 'in' ? 'Se connecter' : 'Créer le compte',
    async v => {
      if (mode === 'in') { await signIn(v.email, v.password); const st = await mfaStatus().catch(() => ({ needs: false })); if (st.needs) return renderMfa(root, done, st.factorId); return done(); }
      const weak = weakPasswordReason(v.password, v.email);
  if (weak) throw new Error(weak);
      const r = await signUp(v.email, v.password);
      if (r.confirm) { root.innerHTML = '<div class="auth"><div class="card"><h1>Vérifiez votre boîte mail</h1><p>Cliquez sur le lien de confirmation, puis connectez-vous.</p></div></div>'; return; }
      done();
    }, swap + '<p><a class="btn ghost" href="/demo/">Essayer la démo sans inscription</a></p>');
  root.querySelector('#sw').addEventListener('click', e => { e.preventDefault(); renderAuth(root, done, mode === 'in' ? 'up' : 'in'); });
  root.querySelector('#forgot')?.addEventListener('click', e => { e.preventDefault(); renderReset(root, done); });
}

// Rattachement à une entreprise par code (activation ou invitation). Un code invalide renvoie le code d'erreur KP404 :
// on ne lit plus le texte du message.
async function joinWithCode(code) {
  try { await db.rpc('join_org', { p_code: code }); }
  catch (e) { if (e.code !== 'KP404') throw e; await db.rpc('redeem_company_code', { p_code: code }); }
}
export function renderOrg(root, done) {
  // Un nouveau compte ne peut pas créer d'entreprise : seul le super administrateur accorde l'accès, par code.
  card(root, 'Activer votre accès', [['code', 'Code d’activation ou d’invitation', 'text', 'one-time-code']], 'Valider',
    async v => { await joinWithCode(v.code.trim()); done(); },
    '<p class="muted">Votre compte est créé, mais il n’est rattaché à aucune entreprise. Demandez à l’administrateur de KaPya ERP un code d’activation pour votre entreprise.</p><p><a href="#" id="logout-org">Se déconnecter</a></p>');
  root.querySelector('#logout-org').addEventListener('click', e => { e.preventDefault(); signOut(); location.reload(); });
}
function renderJoin(root, done) {
  card(root, 'Rejoindre une entreprise', [['code', 'Code d’invitation ou d’activation', 'text', 'one-time-code']], 'Valider',
    async v => { await joinWithCode(v.code.trim()); done(); },
    '<p><a href="#" id="back">Retour</a></p>');
  root.querySelector('#back').addEventListener('click', e => { e.preventDefault(); renderOrg(root, done); });
}

// ---- Mot de passe oublié ----
export function renderReset(root, done) {
  card(root, 'Réinitialiser le mot de passe', [['email', 'Adresse e-mail', 'email', 'email']], 'Envoyer le lien',
    async v => {
      await sendPasswordReset(v.email);
      root.innerHTML = '<div class="auth"><div class="card"><h1>Vérifiez votre boîte mail</h1><p>Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.</p></div></div>';
    },
    '<p><a href="#" id="back-in">Retour à la connexion</a></p>');
  root.querySelector('#back-in').addEventListener('click', e => { e.preventDefault(); renderAuth(root, done, 'in'); });
}

// Lien reçu par e-mail : le lien contient les jetons dans l'adresse. Retourne true si la page a été prise en charge.
export function recoveryFromLink(root, done) {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('type') !== 'recovery' || !p.get('access_token')) return false;
  const token = p.get('access_token');
  history.replaceState(null, '', location.pathname + location.search);
  card(root, 'Nouveau mot de passe', [['password', 'Nouveau mot de passe (8 caractères minimum)', 'password', 'new-password']], 'Enregistrer',
    async v => {
      const weak = weakPasswordReason(v.password, '');
      if (weak) throw new Error(weak);
      await setNewPassword(token, v.password);
      renderAuth(root, done, 'in');
    });
  return true;
}

// ---- Double authentification : code demandé après le mot de passe ----
export function renderMfa(root, done, factorId) {
  card(root, 'Code de vérification', [['code', 'Code à 6 chiffres (application d’authentification)', 'text', 'one-time-code']], 'Valider',
    async v => {
      try { await mfaVerify(factorId, v.code); } catch { throw new Error('Code incorrect ou expiré. Réessayez avec le code affiché actuellement.'); }
      done();
    },
    '<p><a href="#" id="mfa-out">Se déconnecter</a></p>');
  root.querySelector('#mfa-out').addEventListener('click', e => { e.preventDefault(); signOut(); location.reload(); });
}
