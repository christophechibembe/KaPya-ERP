import { CFG } from './config.js';
import { db, session, signOut, profile, syncNow, pendingCount, rejectedItems, dropRejected, clearOffline } from './api.js';
import { clearCache } from './cache.js';
import { renderAuth, renderOrg } from './auth.js';
import { loadRate } from './rate.js';
import { getRate, ico, showDialog, esc } from './ui.js';
// Thème clair/sombre mémorisé sur cet appareil.
const THEME = localStorage.getItem('kp.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('kp.theme', t); const b = document.getElementById('themebtn'); if (b) { b.innerHTML = ico(t === 'dark' ? 'sun' : 'moon'); b.setAttribute('aria-label', t === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'); b.title = b.getAttribute('aria-label'); } }
applyTheme(THEME);
import { ROLES, canView } from './roles.js';
import { mountQuickActions } from './modules/actions-mobiles.js';
import { setPlan, routeAllowed, planAllows } from './plans.js';
import * as accueil from './modules/accueil.js';
import * as ventes from './modules/ventes.js';
import * as credits from './modules/credits.js';
import * as acomptes from './modules/acomptes.js';
import * as stocks from './modules/stocks.js';
import * as achats from './modules/achats.js';
import * as fournisseurs from './modules/fournisseurs.js';
import * as clients from './modules/clients.js';
import * as rapports from './modules/rapports.js';
import * as parametres from './modules/parametres.js';
import * as plus from './modules/plus.js';
import * as facture from './modules/facture.js';
import * as abonnes from './modules/abonnes.js';
import * as caisse from './modules/caisse.js';
import * as historique from './modules/historique.js';
import * as sauvegarde from './modules/sauvegarde.js';
import * as depots from './modules/depots.js';
import * as alertes from './modules/alertes.js';
import * as exporter from './modules/exports.js';
import { alertCount, paintBadges } from './notifications.js';

const ROUTES = { abonnes: 'Abonnés', facture: 'Nouvelle facture', accueil: 'Tableau de bord', ventes: 'Ventes', credits: 'Crédits clients', acomptes: 'Acomptes clients', caisse: 'Clôture de caisse', historique: 'Historique des actions', sauvegarde: 'Sauvegarde', depots: 'Dépôts', alertes: 'Alertes et rappels', stocks: 'Produits & Stocks', achats: 'Achats', fournisseurs: 'Fournisseurs', clients: 'Clients', rapports: 'Rapports', exports: 'Exports comptables', parametres: 'Paramètres', plus: 'Plus' };
const ICON = { exports: 'download', abonnes: 'users', facture: 'sales', accueil: 'grid', ventes: 'sales', credits: 'receipt', acomptes: 'wallet', caisse: 'cash', historique: 'history', sauvegarde: 'database', depots: 'warehouse', alertes: 'bell', stocks: 'stock', achats: 'purchases', fournisseurs: 'truck', clients: 'users', rapports: 'chart', parametres: 'cog', plus: 'dots' };
const MODS = { exports: exporter, abonnes, facture, accueil, ventes, credits, acomptes, caisse, historique, sauvegarde, depots, alertes, stocks, achats, fournisseurs, clients, rapports, parametres, plus };

// Barre latérale (PC) : entrées regroupées par métier. Sur téléphone, seules certaines entrées restent visibles (voir theme.css).
const NAV_GROUPS = [
  ['Pilotage', ['accueil', 'alertes']],
  ['Ventes et encaissements', ['ventes', 'credits', 'acomptes', 'caisse']],
  ['Clients et stock', ['clients', 'stocks', 'depots', 'achats', 'fournisseurs']],
  ['Analyse', ['rapports', 'exports', 'historique']],
  ['Administration', ['abonnes', 'sauvegarde', 'parametres']],
];
const navHtml = ctx => NAV_GROUPS.map(([title, keys]) => {
  const links = keys.filter(k => k in ROUTES && (k !== 'abonnes' || ctx?.platform) && canView(ctx?.role, k) && routeAllowed(k))
    .map(k => `<a href="#/${k}" data-r="${k}">${ico(ICON[k])}<span>${ROUTES[k]}</span></a>`).join('');
  return links ? `<div class="nav-sec" aria-hidden="true">${title}</div>${links}` : '';
}).join('');

const NEEDS_RATE = ['ventes', 'credits', 'stocks', 'achats', 'facture'];
const root = document.getElementById('root');
// Version de l'app : la mise à jour du shell est gérée par le service worker.
const APP_VERSION = '77';
let ctx = null;
const PAGE_SEARCH = '#doc-q,#credit-q,#deposit-q,#party-q,#transfer-q,#q';

async function autoClean() {
  if (localStorage.getItem('kp.version') === APP_VERSION) return false;
  // Ne pas effacer le cache d'application ici : il permet d'ouvrir l'ERP sans réseau.
  localStorage.setItem('kp.version', APP_VERSION);
  return false;
}

const rateChip = () => { const r = getRate(); return r ? `1 $ = ${Number(r.usd_cdf).toLocaleString('fr-FR')} FC` : 'Taux non renseigné'; };
const initials = () => ((ctx?.full_name || 'KaPya').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());

// Indicateur de synchronisation (en-tête)
async function updateSync() {
  const el = document.getElementById('sync'); if (!el || CFG.demo) return;
  const n = await pendingCount().catch(() => 0), rej = (await rejectedItems().catch(() => [])).length;
  const off = !navigator.onLine, parts = [];
  if (off) parts.push('Hors ligne');
  if (n - rej > 0) parts.push(`${n - rej} en attente`);
  if (rej) parts.push(`${rej} refusée(s)`);
  el.textContent = parts.length ? parts.join(' · ') : 'Synchronisé';
  el.className = 'sync ' + (rej ? 'bad' : (off || n) ? 'warn' : 'ok');
}
async function showRejected() {
  const list = await rejectedItems();
  let dlg = document.getElementById('sync-dlg');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'sync-dlg'; document.body.append(dlg); }
  showDialog(dlg, 'Pièces refusées', `<p class="muted">Le serveur a refusé ces pièces à la synchronisation (par exemple stock insuffisant). Vérifiez-les et ressaisissez-les si besoin.</p>
    <ul class="checks">${list.map(it => `<li>${it.fn === 'create_sale' ? 'Vente' : 'Achat'} du ${new Date(it.created).toLocaleString('fr-FR')} : ${esc(it.error)}</li>`).join('')}</ul>`);
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = 'Retirer ces pièces';
  b.onclick = async () => { await dropRejected(); dlg.close(); updateSync(); route(); };
  dlg.querySelector('.row').insertBefore(b, dlg.querySelector('.row').firstChild);
}

function shell() {
  root.innerHTML = `<div class="shell">
    <nav id="nav" aria-label="Navigation principale">
      <div class="brand"><img class="logo-k" src="assets/logo-k.png" alt="KaPya ERP" width="40" height="46"><span class="bname"><b>KaPya</b><small>ERP</small></span></div>
      ${navHtml(ctx)}
      ${canView(ctx?.role, 'facture') ? `<a href="#/facture" data-r="facture" class="fab-m" aria-label="Nouvelle facture">${ico('plus')}<span>Facturer</span></a>` : ''}
      <div class="side-foot"><span class="ver">KaPya v${APP_VERSION}</span>${CFG.demo ? '<span class="mode">Mode local</span>' : ''}<button class="out" id="out" type="button">${ico('logout')}<span>Se déconnecter</span></button></div>
    </nav>
    <div class="content">
      <header class="topbar"><div class="top-search" id="top-search" role="search"></div>
        <span class="sync" id="sync" role="status"></span><span class="rate-chip" id="rate">${rateChip()}</span><button class="themebtn" id="themebtn" type="button"></button><span class="avatar" aria-hidden="true">${initials()}</span></header>
      <main id="main" tabindex="-1"></main>
    </div></div>`;
  document.getElementById('sync').onclick = () => { if (document.getElementById('sync').classList.contains('bad')) showRejected(); };
  document.getElementById('themebtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  applyTheme(document.documentElement.dataset.theme || THEME);
  document.getElementById('out').onclick = async () => {
    const n = await pendingCount().catch(() => 0);
    if (n && !confirm(`${n} pièce(s) ne sont pas encore synchronisées. Elles seront perdues si vous vous déconnectez. Continuer ?`)) return;
    await clearOffline(); signOut(); start();
  };
  route(); updateSync();
  new MutationObserver(placePageSearch).observe(document.getElementById('main'), { childList: true, subtree: true });
}
function route() {
  const main = document.getElementById('main'); if (!main) return;
  document.getElementById('top-search')?.replaceChildren();
  const [r, q] = location.hash.replace('#/', '').split('?'), key = r in ROUTES && canView(ctx?.role, r) && routeAllowed(r) && (r !== 'abonnes' || ctx?.platform) ? r : 'accueil';
  document.querySelectorAll('#nav a').forEach(a => a.dataset.r === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  main.replaceChildren(); const rendering = MODS[key].render(main, ctx, new URLSearchParams(q || ''));
  if (key === 'accueil') Promise.resolve(rendering).then(() => mountQuickActions(main, ctx));
  placePageSearch();
  if (ctx?.role && planAllows('alertes')) alertCount(ctx.role).then(c => paintBadges(c.count, c.detail));
  if (NEEDS_RATE.includes(key) && !getRate()) main.insertAdjacentHTML('afterbegin', '<p class="notice">Taux du jour non renseigné : les montants sont en dollars. <a href="#/parametres">Le renseigner</a></p>');
  main.focus();
}
function placePageSearch() {
  const main = document.getElementById('main'), slot = document.getElementById('top-search');
  const input = main?.querySelector(PAGE_SEARCH);
  if (!input || !slot || slot.contains(input)) return;
  const oldCard = input.closest('.list-search,.report-filter');
  const label = main.querySelector(`label[for="${input.id}"]`);
  const wrapper = document.createElement('div'); wrapper.className = 'top-search-field';
  if (label?.contains(input)) {
    label.classList.add('sr'); input.setAttribute('aria-label', input.placeholder || label.textContent.trim());
    wrapper.append(label);
  } else {
    if (label) wrapper.append(label);
    wrapper.append(input);
  }
  slot.replaceChildren(wrapper);
  if (oldCard && !oldCard.querySelector('input,button,select,table')) oldCard.remove();
}
document.addEventListener('kp:rate', () => { const el = document.getElementById('rate'); if (el) el.textContent = rateChip(); });
document.addEventListener('kp:sync', updateSync);
addEventListener('online', async () => { updateSync(); await syncNow(); route(); });
addEventListener('offline', updateSync);
addEventListener('hashchange', route);

async function start() {
  if (!CFG.demo && CFG.url.includes('VOTRE')) { root.innerHTML = '<div class="auth"><div class="card"><h1>Configuration requise</h1><p>Renseignez l’URL et la clé publique Supabase dans <code>js/config.js</code>.</p></div></div>'; return; }
  if (!session()) return renderAuth(root, start);
  // Changement d'utilisateur sur cet appareil : on vide le cache (jamais les pièces en attente)
  const last = localStorage.getItem('kp.uid'), uid = session().uid;
  if (last && last !== uid) await clearCache().catch(() => {});
  localStorage.setItem('kp.uid', uid);
  try { ctx = await profile(); }
  catch (e) {
    if (e.status === 401) { signOut(); return renderAuth(root, start); }
    root.innerHTML = `<div class="auth"><div class="card"><h1>Connexion impossible</h1>
      <p>${esc(e.message)}</p>
      <p class="hint-txt">Serveur : <code>${esc(CFG.url.replace('https://', ''))}</code></p>
      <ul class="checks"><li>Vérifie ta connexion internet, un VPN ou un bloqueur de publicités.</li><li>Vérifie que le projet Supabase n'est pas en pause.</li></ul>
      <button class="btn" id="retry" type="button">Réessayer</button> <button class="ghost" id="reset" type="button">Effacer la session</button></div></div>`;
    document.getElementById('retry').onclick = () => location.reload();
    document.getElementById('reset').onclick = () => { signOut(); location.reload(); };
    return; }
  // Un compte sans profil est encore au stade de création/rejoindre une organisation.
  // renderOrg permet de créer le profil via bootstrap_org ou de rejoindre avec un code.
  if (!ctx || !ctx.org_id) return renderOrg(root, start);
  // Super administrateur : détecté côté base (table platform_admins)
  ctx.platform = CFG.demo ? false : await db.rpc('is_platform_admin').then(v => v === true).catch(() => false);
  ctx.plan = CFG.demo ? 'premium' : await db.select('organizations', 'select=plan').then(r => r[0]?.plan).catch(() => 'standard');
  setPlan(ctx.plan);
  // Entreprise suspendue ou expirée : la base ne renvoie plus rien (réponse vide). Hors ligne, on ne bloque pas.
  if (!CFG.demo) {
    let state = 'ok';
    try { const rows = await db.select('organizations', 'select=status'); if (!rows.length) state = 'suspended'; }
    catch (e) { state = e.status ? 'error' : 'ok'; }
    if (state === 'suspended') { root.innerHTML = '<div class="auth"><div class="card"><h1>Accès suspendu</h1><p>Le compte de cette entreprise est suspendu ou son abonnement a expiré. Contactez KaPya pour le réactiver.</p><button class="ghost" id="out2" type="button">Se déconnecter</button></div></div>'; document.getElementById('out2').onclick = () => { signOut(); start(); }; return; }
  }
  await loadRate();
  shell();
  syncNow().then(updateSync);
  setInterval(updateSync, 30000);
}
autoClean().then(reloaded => { if (reloaded) location.reload(); else start(); });
