import { CFG } from '../config.js';
import { ownOrgRows } from '../own-org.js';
import { esc, getRate, n, ico, notify, fmtDate, askConfirm } from '../ui.js';
import { ROLES, can } from '../roles.js';
import { saveRate } from '../rate.js';
import { resetLocal } from '../demo.js';
import { db, session } from '../api.js';
import { getLanguage, setLanguage } from '../i18n.js';
import { openDialog, showDialog, fld } from '../ui.js';
import { hasPin, setPin, checkPin, removePin, setAutoLock, autoLockMinutes, lockNow, AUTO_CHOICES, hideLockEnabled, setHideLock } from '../lock.js';
import { loadShops } from '../shops.js';
import { thermalUsbCard, bindThermalUsb } from '../thermal-usb.js';
import { rangeStatus, ensureInvoiceRange, offlineStatus, syncNow, clearOffline, rejectedItems, retryRejected, discardRejected, historyDepth, setHistoryDepth, HISTORY_DEPTH_CHOICES } from '../api.js';
import { offlineSummary } from '../offline.js';
import { BUSINESS_TYPES, TOGGLABLE, getBusinessType, getHiddenFeatures } from '../business.js';
import { getPlan, featuresOf } from '../plans.js';
import { mfaStatus, mfaEnroll, mfaVerify, mfaUnenroll } from '../api.js';
import { getVat, saveVat, loadVat } from '../vat.js';
import { MODE_LABELS, resolveMode as resolveDashboardMode, getStoredMode, setMode as setDashboardMode } from '../dashboard-modes.js';

// Type d'activité de l'entreprise (gérant) : adapte le menu à son métier.
// Formule de l'entreprise : ce qui est inclus, et ce qui ne l'est pas.
function planCard(ctx) {
  if (ctx?.role !== 'admin' || ctx?.platform) return '';
  const plan = getPlan();
  const rows = featuresOf(plan).map(f => `<li class="${f.included ? 'inc' : 'exc'}">${f.included ? '✓' : '✕'} ${esc(f.label)}</li>`).join('');
  return `<p class="muted">Votre formule : <b>${esc(plan.charAt(0).toUpperCase() + plan.slice(1))}</b>. Pour ajouter une fonction, contactez KaPya.</p><ul class="plan-list">${rows}</ul>`;
}
// Journal des actions sensibles (super administrateur seulement).
function auditCard(ctx) {
  if (!ctx?.platform) return '';
  return '<div id="audit-list"><p class="muted">Chargement du journal…</p></div>';
}
// Erreurs récentes de l'application (super administrateur seulement).
function errorsCard(ctx) {
  if (!ctx?.platform) return '';
  return '<div id="err-list"><p class="muted">Chargement des erreurs…</p></div>';
}
// Pied de page des reçus : réservé au super administrateur, qui le règle pour chaque entreprise.
// Section repliable des paramètres : moins de contenu affiché d'un coup.
function section(title, html, open = false) {
  if (!html || !html.trim()) return '';
  return `<details class="pref-sec" ${open ? 'open' : ''}><summary>${title}</summary>${html}</details>`;
}
// Actions volontairement en ligne : membres, rôles et inventaire physique.
// Mieux vaut un message clair qu'une file d'attente qui modifierait les droits hors contrôle.
function requireOnline(message) {
  if (CFG.demo || navigator.onLine) return true;
  notify(message, 'Hors ligne');
  return false;
}
const MEMBERS_ONLINE = 'La gestion des membres et des rôles nécessite une connexion.';
const INVENTORY_ONLINE = 'L’inventaire physique nécessite une connexion : ouverture, comptage et validation se font en ligne.';
function receiptCard(ctx) {
  if (!ctx?.platform) return '';
  return `<section class="card set"><div class="set-main"><h2>Pied de page des reçus (super administrateur)</h2><p class="muted">Mentions légales et coordonnées affichées en bas des reçus et factures de l’entreprise choisie.</p></div>
    <label>Entreprise<select id="rcpt-org"><option value="">Chargement…</option></select></label>
    <h3>En-tête (imprimé sur les reçus)</h3>
    <div class="grid-form">
      <label>Nom<input id="hd-name" maxlength="120" disabled></label>
      <label>Téléphone<input id="hd-phone" maxlength="40" disabled></label>
      <label>E-mail<input id="hd-email" maxlength="120" disabled></label>
      <label>Adresse<input id="hd-address" maxlength="200" disabled></label>
      <label>NIF<input id="hd-tax" maxlength="60" disabled></label>
      <label>RC<input id="hd-rc" maxlength="60" disabled></label>
    </div>
    <div class="acts"><button class="ghost" id="hd-save" type="button" disabled>Enregistrer l’en-tête</button></div>
    <label>Pied de page<textarea id="rcpt-footer" rows="3" maxlength="500" disabled></textarea></label>
    <div class="acts"><button class="ghost" id="rcpt-save" type="button" disabled>Enregistrer</button></div>
    <h3>Logo de l’entreprise</h3><p class="muted">Image PNG, JPEG ou WebP, 150 Ko maximum. Il apparaît en haut des reçus et factures.</p>
    <div id="rcpt-logo-preview"></div>
    <label>Choisir un logo<input id="rcpt-logo-file" type="file" accept="image/png,image/jpeg,image/webp" disabled></label>
    <div class="acts"><button class="ghost" id="rcpt-logo-save" type="button" disabled>Enregistrer le logo</button><button class="ghost" id="rcpt-logo-remove" type="button" disabled>Retirer le logo</button></div>
    <p class="err" id="rcpt-logo-err" role="alert"></p></section>`;
}
// Type d'activité et fonctions affichées (gérant) : adapte le menu à son métier.
function businessCard(ctx) {
  if (ctx?.role !== 'admin') return '';
  const current = getBusinessType();
  const hidden = getHiddenFeatures();
  return `<section class="card set"><div class="set-main"><h2>Type d’activité</h2><p class="muted">Le menu s’adapte à votre métier. Cochez les fonctions que vous voulez afficher.</p></div>
    <div class="acts"><select id="bt-type" aria-label="Type d’activité">${BUSINESS_TYPES.map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="acts"><label class="check"><input id="disc-on" type="checkbox"> Activer les remises sur les factures</label><button class="ghost" id="disc-save" type="button">Enregistrer</button></div>
    <div class="acts"><label class="check"><input id="bar-on" type="checkbox"> Activer le code-barres (scan et recherche par code)</label><button class="ghost" id="bar-save" type="button">Enregistrer</button></div>
    <div class="bt-features">${TOGGLABLE.map(([k, l]) => `<label class="check"><input type="checkbox" data-feature="${k}"${hidden.includes(k) ? '' : ' checked'}> ${l}</label>`).join('')}</div>
    <div class="acts"><button class="ghost" id="bt-save" type="button">Enregistrer</button></div></section>`;
}
// Carte « Code de verrouillage » : propre à cet appareil.
function securityCard() {
  if (!hasPin()) return `<section class="card set"><div class="set-main"><h2>Code de verrouillage</h2><p class="muted">Verrouillez l’application quand vous quittez votre poste. Le code est propre à cet appareil.</p></div>
    <form id="pin-form" class="row-form"><input id="pin-new" type="password" inputmode="numeric" maxlength="6" placeholder="Nouveau code (4 à 6 chiffres)" autocomplete="new-password" aria-label="Nouveau code"><input id="pin-confirm" type="password" inputmode="numeric" maxlength="6" placeholder="Confirmer le code" autocomplete="new-password" aria-label="Confirmer le code"><button class="btn" type="submit">Activer le code</button></form><p class="err" id="pin-err" role="alert"></p></section>`;
  const current = autoLockMinutes();
  return `<section class="card set"><div class="set-main"><h2>Code de verrouillage</h2><p class="muted">Actif sur cet appareil. Verrouillage automatique après inactivité :</p></div>
    <select id="pin-auto" aria-label="Verrouillage automatique">${AUTO_CHOICES.map(([m, l]) => `<option value="${m}"${m === current ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <label class="check"><input type="checkbox" id="pin-hide"${hideLockEnabled() ? ' checked' : ''}> Verrouiller dès que l’application passe en arrière-plan (après quelques secondes)</label>
    <div class="acts"><button class="ghost" id="pin-lock" type="button">Verrouiller maintenant</button><button class="ghost" id="pin-change" type="button">Changer le code</button><button class="ghost" id="pin-off" type="button">Désactiver</button></div></section>`;
}
// Lien discret vers les informations sur le développeur.
const aboutLink = () => `<p class="about-link"><button class="lnk" id="about-dev" type="button">À propos du développeur</button></p>`;
const DEV_BIO = `<p><b>Christophe Cibembe</b>, ingénieur en informatique.</p>
  <p>Il conçoit et développe <b>KaPya ERP</b>, le logiciel de gestion des ventes, des achats, des stocks et de la caisse.</p>
  <p>Il est responsable de <b>KaPYA Digital</b>, l’entreprise qui édite KaPya ERP.</p>`;
function dialogFor(id) {
  let d = document.getElementById(id);
  if (!d) { d = document.createElement('dialog'); d.id = id; document.body.append(d); }
  return d;
}
function bindSecurity(main, ctx) {
  const rerender = () => render(main, ctx);
  const auditBox = main.querySelector('#audit-list');
  if (auditBox) {
    db.select('platform_audit', 'select=created_at,actor_email,action,detail&order=created_at.desc&limit=30').then(rows => {
      auditBox.innerHTML = rows.length ? `<ul class="err-list">${rows.map(r => `<li><b>${esc(new Date(r.created_at).toLocaleString('fr-FR'))}</b> · ${esc(r.actor_email || 'système')} · ${esc(r.action)}<br><span class="muted">${esc(r.detail)}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune action enregistrée.</p>';
    }).catch(() => { auditBox.innerHTML = '<p class="muted">Journal indisponible.</p>'; });
  }
  const errBox = main.querySelector('#err-list');
  if (errBox) {
    db.select('app_errors', 'select=created_at,role,page,app_version,message&order=created_at.desc&limit=20').then(rows => {
      errBox.innerHTML = rows.length ? `<ul class="err-list">${rows.map(r => `<li><b>${esc(new Date(r.created_at).toLocaleString('fr-FR'))}</b> · ${esc(r.role || '—')} · ${esc(r.page || '')} · v${esc(r.app_version || '')}<br><span class="muted">${esc(r.message)}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune erreur enregistrée. Tout va bien.</p>';
    }).catch(() => { errBox.innerHTML = '<p class="muted">Liste indisponible.</p>'; });
  }
  const orgSel = main.querySelector('#rcpt-org'), footerBox = main.querySelector('#rcpt-footer'), footerSave = main.querySelector('#rcpt-save');
  if (orgSel) {
    db.select('organizations', 'select=id,name&order=name').then(orgs => {
      orgSel.innerHTML = '<option value="">— choisir une entreprise —</option>' + orgs.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
    }).catch(() => {});
    const logoFile = main.querySelector('#rcpt-logo-file'), logoSave = main.querySelector('#rcpt-logo-save'), logoRemove = main.querySelector('#rcpt-logo-remove'), logoErr = main.querySelector('#rcpt-logo-err'), logoPreview = main.querySelector('#rcpt-logo-preview');
    let pendingLogo = null;
    orgSel.addEventListener('change', async () => {
      const on = !!orgSel.value;
      footerBox.disabled = footerSave.disabled = logoFile.disabled = logoSave.disabled = logoRemove.disabled = !on;
      ['hd-name','hd-phone','hd-email','hd-address','hd-tax','hd-rc','hd-save'].forEach(id => { const el = main.querySelector('#' + id); if (el) el.disabled = !on; });
      pendingLogo = null; logoErr.textContent = ''; logoPreview.innerHTML = '';
      if (!on) return;
      const [o] = await db.select('organizations', `select=receipt_footer,logo,name,phone,email,address,tax_id,rc&id=eq.${orgSel.value}`).catch(() => []);
      footerBox.value = o?.receipt_footer || '';
      main.querySelector('#hd-name').value = o?.name || '';
      main.querySelector('#hd-name').dataset.orig = o?.name || '';
      main.querySelector('#hd-phone').value = o?.phone || '';
      main.querySelector('#hd-email').value = o?.email || '';
      main.querySelector('#hd-address').value = o?.address || '';
      main.querySelector('#hd-tax').value = o?.tax_id || '';
      main.querySelector('#hd-rc').value = o?.rc || '';
      if (o?.logo) logoPreview.innerHTML = `<img src="${esc(o.logo)}" alt="Logo actuel" style="max-width:180px;max-height:70px">`;
    });
    logoFile.addEventListener('change', () => {
      const file = logoFile.files?.[0]; logoErr.textContent = ''; pendingLogo = null;
      if (!file) return;
      if (file.size > 150 * 1024) { logoErr.textContent = 'Image trop lourde : 150 Ko maximum.'; logoFile.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { pendingLogo = reader.result; logoPreview.innerHTML = `<img src="${esc(pendingLogo)}" alt="Aperçu du logo" style="max-width:180px;max-height:70px">`; };
      reader.readAsDataURL(file);
    });
    logoSave.addEventListener('click', async () => {
      if (!pendingLogo) { logoErr.textContent = 'Choisissez d’abord une image.'; return; }
      try { await db.rpc('set_company_logo', { p_org: orgSel.value, p_logo: pendingLogo }); notify('Logo enregistré pour cette entreprise.', 'Reçus'); }
      catch (error) { logoErr.textContent = error.message || 'Enregistrement impossible.'; }
    });
    logoRemove.addEventListener('click', async () => {
      try { await db.rpc('set_company_logo', { p_org: orgSel.value, p_logo: '' }); logoPreview.innerHTML = ''; notify('Logo retiré.', 'Reçus'); }
      catch (error) { logoErr.textContent = error.message || 'Suppression impossible.'; }
    });
    main.querySelector('#hd-save')?.addEventListener('click', async () => {
      const v = id => main.querySelector('#' + id).value.trim();
      const orig = main.querySelector('#hd-name').dataset.orig || '';
      const newName = v('hd-name');
      // Garde-fou : renommer une entreprise change ses documents imprimés. On demande confirmation.
      if (newName !== orig && !(await askConfirm(`Renommer l’entreprise « ${orig} » en « ${newName} » ? Les reçus et factures imprimés afficheront ce nouveau nom.`))) return;
      try { await db.rpc('set_company_header', { p_org: orgSel.value, p_name: v('hd-name'), p_address: v('hd-address'), p_phone: v('hd-phone'), p_email: v('hd-email'), p_tax_id: v('hd-tax'), p_rc: v('hd-rc') }); notify('En-tête enregistré pour cette entreprise.', 'Reçus'); }
      catch (error) { notify(error.message || 'Enregistrement impossible.'); }
    });
    footerSave?.addEventListener('click', async () => {
      try { await db.rpc('set_receipt_footer', { p_org: orgSel.value, p_text: footerBox.value }); notify('Pied de page enregistré pour cette entreprise.', 'Reçus'); }
      catch (error) { notify(error.message || 'Enregistrement impossible.'); }
    });
  }
  if (main.querySelector('#bar-on')) {
    db.select('profiles', `select=organizations(barcode_enabled)&id=eq.${session().uid}`).then(rows => { main.querySelector('#bar-on').checked = !!rows?.[0]?.organizations?.barcode_enabled; }).catch(() => {});
    main.querySelector('#bar-save').addEventListener('click', async () => {
      try { await db.rpc('set_barcode_enabled', { p_on: main.querySelector('#bar-on').checked }); notify('Réglage du code-barres enregistré.', 'Paramètres'); }
      catch (error) { notify(error.message || 'Enregistrement impossible.'); }
    });
  }
  if (main.querySelector('#disc-on')) {
    db.select('profiles', `select=organizations(discounts_enabled)&id=eq.${session().uid}`).then(rows => { main.querySelector('#disc-on').checked = !!rows?.[0]?.organizations?.discounts_enabled; }).catch(() => {});
    main.querySelector('#disc-save').addEventListener('click', async () => {
      try { await db.rpc('set_discounts_enabled', { p_on: main.querySelector('#disc-on').checked }); notify('Réglage des remises enregistré.', 'Paramètres'); }
      catch (error) { notify(error.message || 'Enregistrement impossible.'); }
    });
  }
  main.querySelector('#bt-save')?.addEventListener('click', async () => {
    try {
      const hiddenNow = [...main.querySelectorAll('[data-feature]')].filter(box => !box.checked).map(box => box.dataset.feature);
      await db.rpc('set_business_type', { p_type: main.querySelector('#bt-type').value });
      await db.rpc('set_hidden_features', { p_list: hiddenNow });
      location.reload();
    } catch (error) { notify(error.message || 'Enregistrement impossible.'); }
  });
  main.querySelector('#pin-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = main.querySelector('#pin-err');
    const first = main.querySelector('#pin-new').value, second = main.querySelector('#pin-confirm').value;
    if (first !== second) { err.textContent = 'Les deux codes ne correspondent pas.'; return; }
    try { await setPin(first, 10); rerender(); } catch (x) { err.textContent = x.message; }
  });
  main.querySelector('#pin-auto')?.addEventListener('change', event => setAutoLock(event.target.value));
  main.querySelector('#pin-hide')?.addEventListener('change', event => setHideLock(event.target.checked));
  main.querySelector('#pin-lock')?.addEventListener('click', lockNow);
  main.querySelector('#pin-change')?.addEventListener('click', () => openDialog(dialogFor('pin-dlg'), 'Changer le code',
    fld('code', 'Code actuel', 'password', 'inputmode="numeric" maxlength="6" required') + fld('pin1', 'Nouveau code (4 à 6 chiffres)', 'password', 'inputmode="numeric" maxlength="6" required') + fld('pin2', 'Confirmer le nouveau code', 'password', 'inputmode="numeric" maxlength="6" required'),
    async v => { if (!await checkPin(v.code)) throw new Error('Code actuel incorrect.'); if (v.pin1 !== v.pin2) throw new Error('Les deux nouveaux codes ne correspondent pas.'); await setPin(v.pin1, autoLockMinutes()); }, rerender));
  main.querySelector('#pin-off')?.addEventListener('click', () => openDialog(dialogFor('pin-dlg'), 'Désactiver le code',
    fld('code', 'Code actuel', 'password', 'inputmode="numeric" maxlength="6" required'),
    async v => { if (!await checkPin(v.code)) throw new Error('Code incorrect.'); removePin(); }, rerender));
  main.querySelector('#about-dev')?.addEventListener('click', () => showDialog(dialogFor('about-dlg'), 'À propos du développeur', DEV_BIO));
}
const ROLE = ROLES;
// Type de compte affiché : le super administrateur n'est jamais présenté comme gérant d'une entreprise.
function accountType(ctx) {
  if (ctx?.platform) return ctx?.noOrg ? 'Super administrateur (sans entreprise)' : 'Super administrateur';
  return ROLE[ctx?.role] || ctx?.role || '—';
}
function languageCard() {
  return `<section class="card set"><div class="set-main"><h2>Langue de l’application</h2><p class="muted">Choisissez la langue de l’interface.</p></div>
    <select id="app-language" aria-label="Langue de l’application"><option value="fr"${getLanguage() === 'fr' ? ' selected' : ''}>Français</option><option value="en"${getLanguage() === 'en' ? ' selected' : ''}>English</option></select></section>`;
}
function bindLanguage(main) {
  const select = main.querySelector('#app-language');
  if (select) select.onchange = () => { setLanguage(select.value); location.reload(); };
}

// Carte : numéros de factures réservés pour cet appareil (fonctionnement hors ligne)
function rangeCard() {
  const r = rangeStatus();
  const etat = r.next === null ? 'Aucune plage réservée : le serveur numérotera à l’envoi.'
    : (r.ok ? `Plage active : ${r.left} numéro(s) restant(s), prochain ${r.prefix}-${String(r.next).padStart(5, '0')}.` : 'Plage épuisée : une nouvelle plage sera demandée dès que le réseau revient.');
  return `<section class="card set" id="range-card"><div class="set-main"><h2>Numéros de factures de cet appareil</h2>
    <p class="muted">Permet de facturer hors connexion sans doublon. ${esc(etat)}</p></div>
    <div class="acts"><button class="ghost" id="range-go" type="button">Réserver une plage maintenant</button></div></section>`;
}

// Carte : état du mode hors-ligne (copie locale, file d'attente, reprise).
function offlineCard(ctx) {
  if (ctx?.platform) return '';
  const depth = historyDepth();
  return `<section class="card set" id="offline-card"><div class="set-main"><h2>Mode hors-ligne</h2>
    <p class="muted">${CFG.demo ? 'Mode démonstration : les données restent dans ce navigateur.' : 'Les ventes, achats, encaissements, retours, annulations et clôtures sont enregistrés sur cet appareil, puis envoyés dès le retour du réseau. Les écrans déjà chargés restent consultables sans connexion.'}</p></div>
    <div id="offline-state" role="status" aria-live="polite"><p class="muted">Chargement…</p></div>
    <label>Historique conservé sur cet appareil<select id="offline-depth" aria-label="Profondeur de l’historique hors ligne">${HISTORY_DEPTH_CHOICES.map(([value, label]) => `<option value="${value}"${value === depth ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <p class="hint">Plus la profondeur est grande, plus la copie locale occupe d’espace et plus le rafraîchissement est long. Les pièces plus anciennes restent consultables en ligne.</p>
    <div class="acts">
      <button class="ghost" id="offline-sync" type="button">${ico('refresh')}<span>Synchroniser maintenant</span></button>
      <button class="ghost" id="offline-rejected" type="button" hidden>Voir les pièces refusées</button>
      <button class="ghost" id="offline-clear" type="button">Vider les données hors ligne</button>
    </div></section>`;
}

async function bindOffline(main) {
  const card = main.querySelector('#offline-card');
  if (!card) return;
  const state = card.querySelector('#offline-state');
  const syncButton = card.querySelector('#offline-sync');
  const rejectedButton = card.querySelector('#offline-rejected');
  const clearButton = card.querySelector('#offline-clear');
  const depthSelect = card.querySelector('#offline-depth');
  const dlg = () => document.getElementById('dlg') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'dlg' }));

  depthSelect.onchange = async () => {
    const chosen = Number(depthSelect.value);
    if (!(await askConfirm(`Conserver jusqu’à ${chosen.toLocaleString('fr-FR')} pièces sur cet appareil ? La copie locale sera retéléchargée à la prochaine synchronisation.`))) {
      depthSelect.value = String(historyDepth());
      return;
    }
    setHistoryDepth(chosen);
    notify('Profondeur d’historique enregistrée. Rechargement…', 'Mode hors-ligne');
    location.reload();
  };

  async function refresh() {
    try {
      const status = await offlineStatus();
      const summary = offlineSummary(status);
      const range = rangeStatus();
      const rangeLabel = range.next === null ? 'aucune plage réservée'
        : range.ok ? `${range.left} numéro(s) restant(s)` : 'plage épuisée, à renouveler';
      const background = 'serviceWorker' in navigator && !!globalThis.ServiceWorkerRegistration && 'sync' in ServiceWorkerRegistration.prototype;
      const tone = summary.status === 'rejected' ? 'bad' : summary.status === 'synced' ? 'ok' : 'warn';
      state.innerHTML = `<div class="tw"><table><tbody>
        <tr><th>Réseau</th><td><span class="sync ${tone}">${summary.online ? 'En ligne' : 'Hors ligne'}</span></td></tr>
        <tr><th>Dernière synchronisation</th><td>${summary.lastSyncLabel ? esc(summary.lastSyncLabel) : 'jamais'}</td></tr>
        <tr><th>File d’attente</th><td>${summary.pending} en attente · ${summary.rejected} refusée(s)</td></tr>
        <tr><th>Copie locale</th><td>${summary.cacheCount} requête(s)${summary.cacheAgeLabel ? ` · ${esc(summary.cacheAgeLabel)}` : ''} · conservée ${summary.cacheDays} jours</td></tr>
        <tr><th>Historique local</th><td>${Number(status.historyDepth || 0).toLocaleString('fr-FR')} pièces maximum par table de mouvement</td></tr>
        <tr><th>Application fermée</th><td>${background ? 'Reprise automatique possible sur ce navigateur' : 'Non prise en charge par ce navigateur : la file repart à la prochaine ouverture'}</td></tr>
        <tr><th>Numéros de facture</th><td>${esc(rangeLabel)}</td></tr>
      </tbody></table></div>`;
      rejectedButton.hidden = !summary.rejected;
    } catch (error) {
      state.textContent = 'État hors-ligne indisponible : ' + error.message;
    }
  }

  syncButton.onclick = async () => {
    syncButton.disabled = true;
    state.innerHTML = '<p class="muted">Synchronisation en cours…</p>';
    try {
      const result = await syncNow({ force: true });
      if (result === 'locked') notify('Synchronisation déjà en cours dans un autre onglet.', 'Mode hors-ligne');
      else notify('Synchronisation terminée.', 'Mode hors-ligne');
    }
    catch (error) { notify('Synchronisation impossible : ' + error.message, 'Mode hors-ligne'); }
    finally { syncButton.disabled = false; refresh(); }
  };

  rejectedButton.onclick = async () => {
    const list = await rejectedItems().catch(() => []);
    const body = list.length
      ? list.map(item => `<div class="row" style="justify-content:space-between;gap:10px;margin:8px 0">
          <span>${esc(new Date(item.created).toLocaleString('fr-FR'))} · ${esc(item.error || 'refusée')}</span>
          <span><button class="ghost" type="button" data-retry="${item.seq}">Réessayer</button>
          <button class="ghost" type="button" data-discard="${item.seq}">Retirer</button></span></div>`).join('')
      : '<p class="muted">Aucune pièce refusée.</p>';
    const note = '<p class="muted">Les refus temporaires (serveur indisponible, limite de débit) sont réessayés automatiquement, au plus 3 fois. Les refus métier restent à votre choix.</p>';
    const d = dlg();
    showDialog(d, 'Pièces refusées', body + note);
    d.querySelectorAll('[data-retry]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await retryRejected(Number(button.dataset.retry)); notify('Nouvelle tentative effectuée.', 'Mode hors-ligne'); d.close(); refresh(); }
      catch (error) { notify('Réessai impossible : ' + error.message, 'Mode hors-ligne'); button.disabled = false; }
    }));
    d.querySelectorAll('[data-discard]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await discardRejected(Number(button.dataset.discard)); d.close(); refresh(); }
      catch (error) { notify('Retrait impossible : ' + error.message, 'Mode hors-ligne'); button.disabled = false; }
    }));
  };

  clearButton.onclick = async () => {
    if (!(await askConfirm('Vider la copie locale et la file d’attente ? Les pièces non envoyées seront perdues.', { danger: true }))) return;
    try { await clearOffline(); notify('Données hors ligne vidées.', 'Mode hors-ligne'); refresh(); }
    catch (error) { notify('Suppression impossible : ' + error.message, 'Mode hors-ligne'); }
  };

  await refresh();
}

// Carte : éléments archivés (produits, clients, fournisseurs) avec restauration
function archivedCard() {
  return `<section class="card set" id="arch-card"><div class="set-main"><h2>Éléments archivés</h2>
    <p class="muted">Produits, clients et fournisseurs masqués des listes. Leur historique est conservé ; vous pouvez les restaurer.</p></div>
    <div class="acts"><button class="ghost" id="arch-go" type="button">Voir et restaurer les archivés</button></div></section>`;
}

async function openArchived(main) {
  const dlg = document.getElementById('dlg') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'dlg' }));
  const tables = [['articles', 'Produit', 'name'], ['customers', 'Client', 'name'], ['suppliers', 'Fournisseur', 'name']];
  const rows = [];
  for (const [t, label, col] of tables) {
    const list = await db.select(t, `select=id,${col}&archived_at=not.is.null&order=${col}`).catch(() => []);
    list.forEach(r => rows.push({ t, label, id: r.id, name: r[col] }));
  }
  const body = rows.length
    ? rows.map(r => `<div class="row" style="justify-content:space-between;gap:10px"><span>${esc(r.label)} : <b>${esc(r.name)}</b></span><button class="ghost" type="button" data-restore="${esc(r.t)}|${esc(r.id)}">Restaurer</button></div>`).join('')
    : '<p class="muted">Aucun élément archivé.</p>';
  openDialog(dlg, 'Éléments archivés', body, async () => {}, null, (d) => {
    d.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', async () => {
      const [t, id] = b.dataset.restore.split('|');
      try { await db.update(t, id, { archived_at: null }); notify('Élément restauré.'); b.closest('.row').remove(); }
      catch (e) { notify('Restauration impossible : ' + e.message); }
    }));
  });
  dlg.showModal?.();
}

// Carte : inventaire physique (comptage réel d'un dépôt, validation des écarts)
function inventoryCard(ctx) {
  if (!['admin', 'manager'].includes(ctx?.role)) return '';
  return `<section class="card set" id="inv-card"><div class="set-main"><h2>Inventaire physique</h2>
    <p class="muted">Comptez le stock réel d’un dépôt. Les écarts sont corrigés à la validation, avec une trace dans l’historique. Réservé au gérant et au responsable.</p></div>
    <div class="acts"><button class="ghost" id="inv-go" type="button">Ouvrir un inventaire</button></div></section>`;
}

async function openInventory() {
  if (!requireOnline(INVENTORY_ONLINE)) return;
  const dlg = document.getElementById('dlg') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'dlg' }));
  const whs = await db.select('warehouses', 'select=id,name&active=eq.true&order=name').catch(() => []);
  const drafts = await db.select('inventories', 'select=id,warehouse_id,created_at&status=eq.draft&order=created_at.desc').catch(() => []);
  const nomDepot = Object.fromEntries(whs.map(w => [w.id, w.name]));
  const body = `<label>Dépôt<select id="inv-wh">${whs.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></label>
    <div class="row" style="margin:8px 0"><button class="ghost" type="button" id="inv-new">Commencer un inventaire pour ce dépôt</button></div>
    <div id="inv-list">${drafts.length ? drafts.map(d => `<div class="row" style="justify-content:space-between"><span>En cours : <b>${esc(nomDepot[d.warehouse_id] || 'Dépôt')}</b> (depuis le ${esc(new Date(d.created_at).toLocaleDateString('fr-FR'))})</span><button class="ghost" type="button" data-inv-open="${esc(d.id)}">Reprendre</button></div>`).join('') : '<p class="muted">Aucun inventaire en cours.</p>'}</div>
    <div id="inv-sheet"></div>`;
  openDialog(dlg, 'Inventaire physique', body, async () => {}, null, (d) => {
    d.querySelector('#inv-new').addEventListener('click', async () => {
      if (!requireOnline(INVENTORY_ONLINE)) return;
      try { const id = await db.rpc('create_inventory', { p_warehouse: d.querySelector('#inv-wh').value }); notify('Inventaire ouvert.'); await showSheet(d, id); }
      catch (e) { notify('Impossible : ' + e.message); }
    });
    d.querySelectorAll('[data-inv-open]').forEach(b => b.addEventListener('click', () => showSheet(d, b.dataset.invOpen)));
  });
  dlg.showModal?.();
}

async function showSheet(d, invId) {
  const sheet = d.querySelector('#inv-sheet');
  const lines = await db.select('inventory_lines', `select=article_id,theoretical,counted,articles(sku,name,unit)&inventory_id=eq.${invId}&order=article_id`).catch(() => []);
  sheet.innerHTML = `<h3>Comptage</h3>
    <div style="max-height:45vh;overflow:auto"><table><thead><tr><th>Produit</th><th class="r">Théorique</th><th class="r">Compté</th><th class="r">Écart</th></tr></thead><tbody>${lines.map(l => `<tr>
      <td>${esc(l.articles?.name || '')} <span class="muted">${esc(l.articles?.sku || '')}</span></td>
      <td class="r">${Number(l.theoretical)}</td>
      <td class="r"><input type="number" min="0" step="0.001" value="${l.counted ?? ''}" data-inv-art="${esc(l.article_id)}" style="width:110px"></td>
      <td class="r" data-diff="${esc(l.article_id)}">${l.counted == null ? '—' : (Number(l.counted) - Number(l.theoretical)).toFixed(3).replace(/\.?0+$/, '')}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:10px"><button class="btn" type="button" id="inv-validate">Valider l’inventaire</button></div>`;
  sheet.querySelectorAll('[data-inv-art]').forEach(inp => inp.addEventListener('change', async () => {
    if (!requireOnline(INVENTORY_ONLINE)) { inp.value = inp.defaultValue; return; }
    const v = inp.value === '' ? null : Number(inp.value);
    try {
      await db.rpc('set_inventory_count', { p_inventory: invId, p_article: inp.dataset.invArt, p_counted: v });
      const l = lines.find(x => x.article_id === inp.dataset.invArt); if (l) l.counted = v;
      const cell = sheet.querySelector(`[data-diff="${inp.dataset.invArt}"]`);
      if (cell && l) cell.textContent = v == null ? '—' : (v - Number(l.theoretical)).toFixed(3).replace(/\.?0+$/, '');
    } catch (e) { notify('Saisie impossible : ' + e.message); }
  }));
  sheet.querySelector('#inv-validate').addEventListener('click', async () => {
    if (!requireOnline(INVENTORY_ONLINE)) return;
    if (!confirm('Valider l’inventaire ? Les écarts seront corrigés dans le stock. Cette action est définitive.')) return;
    try { const n = await db.rpc('validate_inventory', { p_inventory: invId }); notify(`Inventaire validé : ${n} correction(s) de stock.`); sheet.innerHTML = '<p class="muted">Inventaire validé.</p>'; }
    catch (e) { notify('Validation impossible : ' + e.message); }
  });
}

// Carte : renouvellement de l'abonnement par Airtel Money (validé par le super administrateur)
async function renewCard(ctx) {
  if (ctx?.role !== 'admin' || ctx?.platform) return '';
  const { PAIEMENT } = await import('../config.js');
  const org = (await db.select('organizations', `select=plan,expires_at,status&id=eq.${ctx.org_id}`).catch(() => []))[0] || {};
  const prix = PAIEMENT.prix[org.plan] ?? '';
  const demandes = await db.select('paiements_abonnement', 'select=montant,plan,reference,statut,created_at&order=created_at.desc&limit=5').catch(() => []);
  const statut = { en_attente: 'En attente de validation', valide: 'Validé', rejete: 'Refusé' };
  return `<section class="card set" id="renew-card"><div class="set-main"><h2>Renouveler mon abonnement</h2>
    <p class="muted">Formule actuelle : <b>${esc(org.plan || '—')}</b>${prix !== '' ? ` · ${prix} $ / mois` : ''}. Échéance : <b>${esc(org.expires_at ? fmtDate(org.expires_at) : '—')}</b>.</p>
    <p>1. Envoyez <b>${prix} $</b> par <b>Airtel Money</b> au <b>${esc(PAIEMENT.airtel)}</b>, ou par <b>M-Pesa</b> au <b>${esc(PAIEMENT.mpesa)}</b>.<br>2. Saisissez la référence de la transaction ci-dessous.</p></div>
    <form class="rf" id="renew-form"><label for="renew-ref" class="sr">Référence Airtel Money</label><input id="renew-ref" placeholder="Référence de la transaction" autocomplete="off" required><button class="btn" type="submit">J’ai payé</button></form>
    ${demandes.length ? `<ul class="plan-list">${demandes.map(d => `<li>${esc(fmtDate(d.created_at))} · ${esc(d.plan)} · ${esc(String(d.montant))} $ · réf. ${esc(d.reference)} · <b>${esc(statut[d.statut] || d.statut)}</b></li>`).join('')}</ul>` : ''}
  </section>`;
}

function printCard() {
  return `<section class="card set" id="print-test-card"><div class="set-main"><h2>Impression thermique</h2><p class="muted">Imprimez une page de test pour vérifier la largeur du papier de votre imprimante avant de vendre.</p></div><div class="acts"><label>Format<select id="pt-fmt"><option value="80">80 mm</option><option value="85">85 mm</option><option value="55">55 mm</option></select></label><button class="ghost" id="pt-go" type="button">Imprimer la page de test</button></div><p class="muted" style="font-size:.88rem">Réglez le papier de l'imprimante sur la même taille, avec des marges à 0. Le trait doit faire exactement la largeur choisie.</p></section>`;
}
function rateCard(ctx) {
  const rate = getRate(), canRate = can(ctx?.role, 'taux.write');
  return `<section class="card set"><div class="set-main"><h2>Taux du jour</h2><p class="muted">${rate ? `1 $ = ${n(rate.usd_cdf)} FC · mis à jour le ${fmtDate(rate.rate_date)}` : 'Non renseigné : les montants sont affichés en dollars.'}</p></div>
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
function installCard() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let body;
  if (standalone) body = '<p class="muted">KaPya est installée sur cet appareil.</p>';
  else if (window.__kapyaInstall) body = '<button class="btn" id="install-app" type="button">Installer l’application</button>';
  else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) body = '<p class="muted">Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil ».</p>';
  else body = '<p class="muted">Le bouton d’installation apparaît si votre navigateur le permet (Chrome sur Android).</p>';
  return section('Application', body);
}
function bindInstall(main) {
  const b = main.querySelector('#install-app'); if (!b) return;
  b.onclick = async () => {
    const e = window.__kapyaInstall; if (!e) return;
    e.prompt();
    const r = await e.userChoice;
    window.__kapyaInstall = null;
    if (r && r.outcome === 'accepted') b.remove();
  };
}

export function render(main, ctx) {
  if (!CFG.demo && ctx?.role === 'admin') return renderTeam(main, ctx);
  main.innerHTML = `<div class="page-head"><div><h1>Paramètres</h1><p class="sub">Taux de change et informations de l’espace.</p></div></div>
    ${languageCard()}
    ${installCard()}
    <div id="renew-slot"></div>
    ${printCard()}
    ${thermalUsbCard()}
    ${rangeCard()}
    ${offlineCard(ctx)}
    ${archivedCard()}
    ${inventoryCard(ctx)}
    ${rateCard(ctx)}${section('Présentation du tableau de bord', dashboardModeCard(ctx), true)}
    ${section('Votre formule', planCard(ctx))}${section('TVA', vatCard(ctx))}${section('Sécurité du compte', '<div id="mfa-box"><p class="muted">Chargement…</p></div>')}${section('Reçus et logo (super administrateur)', receiptCard(ctx))}${section('Erreurs récentes (super administrateur)', errorsCard(ctx))}${section('Journal des actions (super administrateur)', auditCard(ctx))}${section('Fonctionnement de l’entreprise', businessCard(ctx), false)}${section('Mon compte et sécurité', securityCard() + aboutLink())}
    <section class="card set"><div class="set-main"><h2>Espace</h2><p class="muted">Rôle : ${esc(ctx?.role || '—')}</p></div></section>
    ${CFG.demo ? `<section class="card set"><div class="set-main"><h2>Simuler un rôle</h2><p class="muted">Mode local : pour tester les droits de chaque rôle.</p></div><select id="sim" aria-label="Rôle simulé">${Object.keys(ROLES).map(k => `<option value="${k}"${k === ctx?.role ? ' selected' : ''}>${ROLES[k]}</option>`).join('')}</select></section>` : ''}
    ${CFG.demo ? '<section class="card set"><div class="set-main"><h2>Mode local</h2><p class="muted">Les données sont enregistrées dans ce navigateur.</p></div><button class="ghost" id="rst" type="button">Réinitialiser les données</button></section>' : ''}`;
  bindRate(main, ctx);
  bindMfa(main);
  bindVat(main);
  bindOffline(main);
  bindInstall(main);
  bindThermalUsb(main);
  // Renouvellement : carte chargée (elle lit l'abonnement), puis formulaire relié
  renewCard(ctx).then(html => {
    const slot = main.querySelector('#renew-slot'); if (!slot || !html) return;
    slot.innerHTML = html;
    main.querySelector('#renew-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const ref = main.querySelector('#renew-ref').value.trim();
      if (ref.length < 4) return notify('Saisissez la référence de la transaction.');
      const { PAIEMENT } = await import('../config.js');
      const plan = (await db.select('organizations', `select=plan&id=eq.${ctx.org_id}`).catch(() => []))[0]?.plan || 'basique';
      try {
        const s2 = session();
        await fetch(`${CFG.url}/rest/v1/paiements_abonnement`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.key, Authorization: `Bearer ${s2.access}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ org_id: ctx.org_id, plan, montant: PAIEMENT.prix[plan], reference: ref }) }).then(r => { if (!r.ok) throw new Error('envoi refusé'); });
        notify('Paiement signalé. Il sera validé par KaPya.');
        main.querySelector('#renew-form').reset();
      } catch (err) { notify('Envoi impossible : ' + err.message); }
    });
  });
  main.querySelector('#range-go')?.addEventListener('click', async () => { await ensureInvoiceRange(); notify(`Numéros disponibles sur cet appareil : ${rangeStatus().left}.`); main.querySelector('#range-card')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: rangeCard() }).firstElementChild); });
  main.querySelector('#arch-go')?.addEventListener('click', () => openArchived(main));
  main.querySelector('#inv-go')?.addEventListener('click', () => openInventory());
  const pt = main.querySelector('#pt-go');
  if (pt) pt.onclick = () => { const w = window.open('', '_blank'); if (!w) return notify('Autorisez les fenêtres pop-up pour imprimer la page de test.'); w.document.write(printTestPage(main.querySelector('#pt-fmt').value)); w.document.close(); };
  bindSecurity(main, ctx);
  bindLanguage(main);
  bindDashboardMode(main, ctx);
  const sim = main.querySelector('#sim');
  if (sim) sim.onchange = () => { localStorage.setItem('kp.demoRole', sim.value); location.reload(); };
  const rst = main.querySelector('#rst');
  if (rst) rst.onclick = () => { if (rst.dataset.ok) resetLocal(); else { rst.dataset.ok = 1; rst.textContent = 'Confirmer la réinitialisation ?'; } };
}

async function renderTeam(main, ctx) {
  main.innerHTML = `<div class="page-head"><div><h1>Paramètres</h1><p class="sub">Équipe et invitations.</p></div></div>
    ${languageCard()}
    ${installCard()}
    ${rateCard(ctx)}${offlineCard(ctx)}${section('Présentation du tableau de bord', dashboardModeCard(ctx), true)}
    ${section('Votre formule', planCard(ctx))}${section('TVA', vatCard(ctx))}${section('Reçus et logo (super administrateur)', receiptCard(ctx))}${section('Erreurs récentes (super administrateur)', errorsCard(ctx))}${section('Journal des actions (super administrateur)', auditCard(ctx))}${section('Fonctionnement de l’entreprise', businessCard(ctx), false)}${section('Mon compte et sécurité', securityCard() + aboutLink())}
    <details class="pref-sec"><summary>Membres</summary><section class="card set"><div class="set-main"><h2>Membres</h2><p class="muted">Les administrateurs peuvent changer le rôle des membres.</p><div id="members" class="team">Chargement…</div></div></section></details>
    <details class="pref-sec"><summary>Inviter un membre</summary><section class="card set"><div class="set-main"><h2>Inviter un membre</h2><p class="muted">Crée un code valable 7 jours. Le membre le saisit à l’inscription.</p></div>
      <form class="rf" id="inv"><label for="irole" class="sr">Rôle</label><select id="irole">${Object.keys(ROLES).filter(k => k !== 'admin').map(k => `<option value="${k}">${ROLES[k]}</option>`).join('')}</select><button class="btn" type="submit">Créer le code</button><p class="err" role="alert"></p></form>
      <div id="codes"></div></section></details>
    <section class="card set"><div class="set-main"><h2>Type de compte</h2><p class="muted">${esc(accountType(ctx))}</p></div></section>`;
  bindRate(main, ctx);
  bindInstall(main);
  bindVat(main);
  bindOffline(main);
  bindSecurity(main, ctx);
  bindLanguage(main);
  bindDashboardMode(main, ctx);
  renderCompany(main, ctx);
  const members = main.querySelector('#members');
  async function loadMembers() {
    try {
      const [rows, shops, assigns] = await Promise.all([db.select('profiles', 'select=id,role,full_name&order=role'), loadShops(), db.select('user_warehouses', 'select=user_id,warehouse_id,can_transfer_all,can_receive_stock').catch(() => [])]);
      const shopOf = id => assigns.find(a => a.user_id === id)?.warehouse_id || '';
      const transferOf = id => !!assigns.find(a => a.user_id === id)?.can_transfer_all;
      const receiveOf = id => !!assigns.find(a => a.user_id === id)?.can_receive_stock;
      // Boutique et autorisations du facturier : il ne voit et ne vend que dans celle-ci.
      const shopCell = r => r.role !== 'facturier' ? '—' : `<select data-shop="${r.id}" aria-label="Boutique de ce facturier"><option value="">— choisir —</option>${shops.map(s => `<option value="${esc(s.id)}"${s.id === shopOf(r.id) ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select><label class="check"><input type="checkbox" data-transfer="${r.id}"${transferOf(r.id) ? ' checked' : ''}> Peut transférer depuis tous les dépôts</label><label class="check"><input type="checkbox" data-receive="${r.id}"${receiveOf(r.id) ? ' checked' : ''}> Peut enregistrer les entrées de stock dans son dépôt</label>`;
      members.innerHTML = `<table><thead><tr><th>Membre</th><th>Rôle</th><th>Boutique</th><th>Action</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.id === ctx.id ? 'Vous' : esc(r.full_name || 'Membre')}</td><td>${
        r.id === ctx.id ? esc(ROLE[r.role]) : `<select data-id="${r.id}" aria-label="Rôle de ce membre">${Object.keys(ROLES).map(k => `<option value="${k}"${k === r.role ? ' selected' : ''}>${ROLE[k]}</option>`).join('')}</select>`}</td><td>${r.id === ctx.id ? '' : shopCell(r)}</td><td>${r.id === ctx.id ? '' : `<button class="lnk" type="button" data-remove="${r.id}" data-name="${esc(r.full_name || 'ce membre')}">Retirer</button>`}</td></tr>`).join('')}</tbody></table>`;
      // Retirer un membre : il n'appartient plus à l'entreprise, son siège est libéré.
      // Il peut ensuite rejoindre une autre entreprise avec un code.
      members.querySelectorAll('button[data-remove]').forEach(btn => btn.onclick = async () => {
        if (!requireOnline(MEMBERS_ONLINE)) return;
        if (!(await askConfirm(`Retirer ${btn.dataset.name} de l'entreprise ? Il ne verra plus les données, et son siège sera libéré.`))) return;
        try { await db.rpc('remove_member', { p_user: btn.dataset.remove }); loadMembers(); }
        catch (e) { notify('Retrait impossible : ' + e.message); }
      });
      members.querySelectorAll('select[data-shop]').forEach(sel => sel.onchange = async () => {
        if (!requireOnline(MEMBERS_ONLINE)) { loadMembers(); return; }
        if (!sel.value) return;
        const all = !!members.querySelector(`[data-transfer="${sel.dataset.shop}"]`)?.checked;
        const receive = !!members.querySelector(`[data-receive="${sel.dataset.shop}"]`)?.checked;
        try { await db.upsert('user_warehouses', { user_id: sel.dataset.shop, warehouse_id: sel.value, can_transfer_all: all, can_receive_stock: receive }, 'user_id'); loadMembers(); }
        catch (e) { notify('Changement impossible : ' + e.message); loadMembers(); }
      });
      members.querySelectorAll('input[data-transfer]').forEach(box => box.onchange = async () => {
        if (!requireOnline(MEMBERS_ONLINE)) { loadMembers(); return; }
        const shop = members.querySelector(`select[data-shop="${box.dataset.transfer}"]`)?.value;
        if (!shop) { notify('Choisissez d’abord la boutique de ce facturier.'); box.checked = !box.checked; return; }
        const receive = !!members.querySelector(`[data-receive="${box.dataset.transfer}"]`)?.checked;
        try { await db.upsert('user_warehouses', { user_id: box.dataset.transfer, warehouse_id: shop, can_transfer_all: box.checked, can_receive_stock: receive }, 'user_id'); loadMembers(); }
        catch (e) { notify('Changement impossible : ' + e.message); loadMembers(); }
      });
      members.querySelectorAll('input[data-receive]').forEach(box => box.onchange = async () => {
        if (!requireOnline(MEMBERS_ONLINE)) { loadMembers(); return; }
        const shop = members.querySelector(`select[data-shop="${box.dataset.receive}"]`)?.value;
        if (!shop) { notify('Choisissez d’abord la boutique de ce facturier.'); box.checked = !box.checked; return; }
        const all = !!members.querySelector(`[data-transfer="${box.dataset.receive}"]`)?.checked;
        try { await db.upsert('user_warehouses', { user_id: box.dataset.receive, warehouse_id: shop, can_transfer_all: all, can_receive_stock: box.checked }, 'user_id'); loadMembers(); }
        catch (e) { notify('Changement impossible : ' + e.message); loadMembers(); }
      });
      members.querySelectorAll('select[data-id]').forEach(sel => sel.onchange = async () => {
        if (!requireOnline(MEMBERS_ONLINE)) { loadMembers(); return; }
        try { await db.update('profiles', sel.dataset.id, { role: sel.value }); loadMembers(); }
        catch (e) { notify('Changement impossible : ' + e.message); loadMembers(); }
      });
    } catch (e) { members.textContent = 'Chargement impossible : ' + e.message; }
  }
  const f = main.querySelector('#inv');
  f.onsubmit = async e => {
    e.preventDefault(); const er = f.querySelector('.err');
    try {
      // Code généré ici (8 caractères hexadécimaux, en majuscules), envoyé avec l'entreprise : aucune valeur par défaut côté base.
      // Hors ligne, l'invitation est mise en file : le code n'est actif qu'une fois synchronisé.
      const bytes = crypto.getRandomValues(new Uint8Array(4));
      const code = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      await db.insert('invitations', { code, org_id: ctx.org_id, role: f.irole.value }, 'minimal');
      main.querySelector('#codes').innerHTML = `<p class="muted" style="margin-top:.9rem">Code à transmettre (valable 7 jours)${navigator.onLine ? '' : ' — il sera actif dès la prochaine synchronisation'} :</p><span class="code">${esc(code)}</span>`; er.textContent = '';
    }
    catch (x) { er.textContent = x.message; }
  };
  loadMembers();
}

// En-tête de l'entreprise (factures et bons imprimés) : nom, coordonnées, NIF, RC, logo
async function renderCompany(main, ctx) {
  // Informations de l'entreprise et en-tête des documents : réservés au super administrateur.
  if (!ctx?.platform || ctx?.noOrg) return;
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
      <p class="muted">Le logo est géré par KaPya (super administrateur).</p>
      <p class="err" id="c_err" role="alert"></p><p class="done" id="c_ok" hidden></p>
      <div class="acts end"><button class="btn" type="submit">${ico('check')}<span>Enregistrer l’entreprise</span></button></div>
    </form></div>`;
  main.prepend(sec);
  const $ = s => sec.querySelector(s);
  try {
    const [o] = await ownOrgRows('name,address,phone,email,tax_id,rc');
    if (o) { $('#c_name').value = o.name || ''; $('#c_phone').value = o.phone || ''; $('#c_email').value = o.email || ''; $('#c_address').value = o.address || ''; $('#c_tax').value = o.tax_id || ''; $('#c_rc').value = o.rc || ''; }
  } catch (e) { $('#c_err').textContent = 'Chargement impossible : ' + e.message; }
  // Logo : réduit à 300 px maximum pour rester léger
  if (!ctx?.platform) {
    // Coordonnées gérées par KaPya : lecture seule pour l'entreprise.
    document.querySelectorAll('#cof input, #cof button[type="submit"]').forEach(el => { el.disabled = true; });
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Les coordonnées de l’entreprise (nom, adresse, NIF, RC) sont gérées par KaPya. Pour les modifier, contactez le support.';
    document.getElementById('cof')?.prepend(note);
  }
  $('#cof').onsubmit = async e => {
    e.preventDefault(); $('#c_err').textContent = ''; $('#c_ok').hidden = true;
    const row = { name: $('#c_name').value.trim(), phone: $('#c_phone').value.trim() || null, email: $('#c_email').value.trim() || null,
      address: $('#c_address').value.trim() || null, tax_id: $('#c_tax').value.trim() || null, rc: $('#c_rc').value.trim() || null };
    if (!row.name) return ($('#c_err').textContent = 'Indiquez le nom de l’entreprise.');
    try {
      await db.rpc('set_company_header', { p_org: ctx.org_id, p_name: row.name, p_address: row.address, p_phone: row.phone, p_email: row.email, p_tax_id: row.tax_id, p_rc: row.rc });
      $('#c_ok').hidden = false; $('#c_ok').textContent = 'En-tête enregistré. Il apparaîtra sur les prochaines impressions.';
    } catch (x) { $('#c_err').textContent = x.message; }
  };
}

// Page de test : cadre à la largeur exacte du format, avec une règle en mm
function printTestPage(paper) {
  const page = { '80': 80, '85': 85, '55': 55 }[paper] || 80;
  const body = { '80': 74, '85': 79, '55': 51 }[paper] || 74;
  const marks = Array.from({ length: Math.floor(body / 5) + 1 }, (_, k) => `<div style="position:absolute;left:${k * 5}mm;top:0;height:${k % 2 ? 2 : 4}mm;border-left:0.3mm solid #000"></div>${k % 2 ? '' : `<div style="position:absolute;left:${k * 5 + 0.5}mm;top:5mm;font-size:6pt">${k * 5}</div>`}`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Page de test</title><style>
@page{size:${page}mm auto;margin:3mm} body{font-family:Arial,sans-serif;color:#000;width:${body}mm;margin:0 auto;font-weight:700}
.bloc{position:relative;height:12mm;border-bottom:0.3mm solid #000;margin-bottom:6mm}
h1{font-size:14pt;text-align:center;margin:4mm 0 2mm} p{font-size:9pt;margin:2mm 0}
.cadre{border:0.5mm solid #000;height:30mm;margin:4mm 0;display:flex;align-items:center;justify-content:center;font-size:11pt;text-align:center}
</style></head><body>
<h1>TEST D'IMPRESSION ${page} mm</h1>
<div class="bloc">${marks}</div>
<div class="cadre">Largeur utile : ${body} mm<br>Le cadre doit toucher les deux bords</div>
<p>Si le texte est coupé à droite : augmentez la largeur du papier dans le pilote.</p>
<p>Si un espace blanc apparaît : réduisez la taille du papier ou mettez les marges à 0.</p>
<p style="text-align:center">KaPya ERP · ${new Date().toLocaleDateString('fr-FR')}</p>
</body></html>`;
}

// ---- TVA (administrateur) ----
function vatCard(ctx) {
  if (ctx?.role !== 'admin') return '';
  return `<div class="acts"><label class="check"><input id="vat-on" type="checkbox"> Facturer la TVA (affichée sur les reçus)</label><label class="check">Taux (%) <input id="vat-rate" type="number" min="0" max="100" step="0.01" style="width:90px"></label><button class="ghost" id="vat-save" type="button">Enregistrer</button></div><p class="muted">Les prix restent TTC : la TVA affichée est la part contenue dans le total.</p>`;
}
function bindVat(main) {
  const on = main.querySelector('#vat-on'), rate = main.querySelector('#vat-rate'), save = main.querySelector('#vat-save');
  if (!save) return;
  const fill = () => { const c = getVat(); on.checked = c.enabled; rate.value = c.rate; };
  fill();
  loadVat().then(fill);
  save.addEventListener('click', async () => {
    try { await saveVat(on.checked, Number(rate.value)); notify('TVA enregistrée.', 'Paramètres'); }
    catch (e) { notify(e.message || 'Enregistrement impossible.'); }
  });
}

// ---- Double authentification du compte (chaque utilisateur pour son compte) ----
async function bindMfa(main) {
  const box = main.querySelector('#mfa-box');
  if (!box) return;
  const draw = async () => {
    const st = await mfaStatus().catch(() => null);
    if (!st) { box.innerHTML = '<p class="muted">Indisponible hors connexion.</p>'; return; }
    if (st.factors.length) {
      box.innerHTML = '<p>Double authentification <b>activée</b> pour votre compte.</p><button class="ghost" id="mfa-off" type="button">Désactiver</button>';
      box.querySelector('#mfa-off').onclick = async () => {
        if (!window.confirm('Désactiver la double authentification ?')) return;
        try { await mfaUnenroll(st.factors[0].id); notify('Double authentification désactivée.', 'Sécurité'); draw(); }
        catch (e) { notify(e.message || 'Désactivation impossible.'); }
      };
      return;
    }
    box.innerHTML = '<p class="muted">Demande un code de votre application d’authentification (Google Authenticator, Microsoft Authenticator…) à chaque connexion.</p><button class="ghost" id="mfa-on" type="button">Activer</button>';
    box.querySelector('#mfa-on').onclick = async () => {
      try {
        const f = await mfaEnroll();
        box.innerHTML = `<div class="mfa-qr">${f.totp.qr_code}</div><p class="muted">Ou saisissez cette clé : <code>${esc(f.totp.secret)}</code></p><label for="mfa-code">Code affiché par l’application</label><input id="mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"><button class="btn" id="mfa-ok" type="button">Confirmer</button>`;
        box.querySelector('#mfa-ok').onclick = async () => {
          try { await mfaVerify(f.id, box.querySelector('#mfa-code').value); notify('Double authentification activée.', 'Sécurité'); draw(); }
          catch { notify('Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.'); }
        };
      } catch (e) { notify(e.message || 'Activation impossible.'); }
    };
  };
  draw();
}

// Présentation du tableau de bord : choix explicite du compte, sur cet appareil.
function dashboardModeCard(ctx) {
  if (CFG.demo) return '';
  const current = resolveDashboardMode(ctx?.id);
  const automatic = !getStoredMode(ctx?.id);
  const choices = [
    ['classic', 'Classique', 'Le tableau de bord actuel, sans changement.'],
    ['modern_pc', 'Moderne PC', 'Cartes aérées et filtres regroupés, pour un grand écran.'],
    ['modern_mobile', 'Moderne mobile', 'Grandes cartes et filtres compacts, pour le téléphone.']
  ];
  const buttons = choices.map(([mode, label, help]) =>
    `<button class="dash-mode-choice${mode === current ? ' on' : ''}" type="button" data-dash-mode="${mode}" aria-pressed="${mode === current}"><b>${label}</b><span>${help}</span></button>`
  ).join('');
  return `<p class="muted">Choisissez la présentation du tableau de bord. Les chiffres, les rôles et les droits restent identiques.</p>
    <div class="dash-mode-pick" id="dash-mode-pick" role="group" aria-label="Présentation du tableau de bord">${buttons}</div>
    <p class="muted" id="dash-mode-note">${automatic ? 'Détection automatique selon la taille de l’écran.' : 'Choix enregistré pour ce compte sur cet appareil.'}</p>`;
}

function bindDashboardMode(main, ctx) {
  const group = main.querySelector('#dash-mode-pick');
  if (!group) return;
  group.addEventListener('click', event => {
    const button = event.target.closest('[data-dash-mode]');
    if (!button) return;
    const mode = button.dataset.dashMode;
    const applied = setDashboardMode(mode, ctx?.id);
    group.querySelectorAll('[data-dash-mode]').forEach(element => {
      const active = element.dataset.dashMode === applied;
      element.classList.toggle('on', active);
      element.setAttribute('aria-pressed', String(active));
    });
    const note = main.querySelector('#dash-mode-note');
    if (note) note.textContent = 'Choix enregistré pour ce compte sur cet appareil.';
    notify(`Tableau de bord : ${MODE_LABELS[applied]}.`);
  });
}

import { localStore as localStorage } from '../storage.js';
