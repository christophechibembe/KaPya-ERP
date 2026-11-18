import { CFG } from './config.js';
import { db, session, signOut, profile, syncNow, pendingCount, rejectedItems, dropRejected, clearOffline } from './api.js';
import { clearCache } from './cache.js';
import { renderAuth, renderOrg, renderMfa, recoveryFromLink } from './auth.js';
import { mfaStatus } from './api.js';
import { loadVat } from './vat.js';
import { loadRate } from './rate.js';
import { getRate, ico, showDialog, esc } from './ui.js';
// Thème clair/sombre mémorisé sur cet appareil.
const THEME = localStorage.getItem('kp.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('kp.theme', t); const b = document.getElementById('themebtn'); if (b) { b.innerHTML = ico(t === 'dark' ? 'sun' : 'moon'); b.setAttribute('aria-label', t === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'); b.title = b.getAttribute('aria-label'); } }
applyTheme(THEME);
import { ROLES, canView } from './roles.js';
import { mountQuickActions } from './modules/actions-mobiles.js';
import { setPlan, routeAllowed, planAllows } from './plans.js';
import { alertCount, paintBadges } from './notifications.js';
import { initLock, lockNow, hasPin } from './lock.js';
import { watchLanguage } from './i18n.js';

const ROUTES = { abonnes: 'Abonnés', workers: 'Personnel et paiements', vente: 'Vente', facture: 'Vente avancée', accueil: 'Tableau de bord', ventes: 'Historique', proformas: 'Proformas', avoirs: 'Avoirs', retours: 'Retours', lots: 'Lots et péremption', bons: 'Bons de commande', credits: 'Crédits clients', acomptes: 'Acomptes clients', caisse: 'Clôture de caisse', historique: 'Historique des actions', sauvegarde: 'Sauvegarde', depots: 'Dépôts', alertes: 'Alertes et rappels', stocks: 'Produits & Stocks', achats: 'Achats', fournisseurs: 'Fournisseurs', clients: 'Clients', rapports: 'Rapports', exports: 'Exports comptables', parametres: 'Paramètres', plus: 'Plus' };
const ICON = { workers: 'users', exports: 'download', abonnes: 'users', facture: 'invoice', accueil: 'grid', ventes: 'history', proformas: 'doc', vente: 'cart', avoirs: 'minus', retours: 'return', bons: 'clipboard', credits: 'card', acomptes: 'wallet', caisse: 'cash', historique: 'history', sauvegarde: 'database', depots: 'warehouse', alertes: 'bell', stocks: 'stock', achats: 'purchases', fournisseurs: 'truck', clients: 'user', rapports: 'chart', parametres: 'cog', plus: 'dots' };
const LOADERS = {
  accueil: () => import('./modules/accueil.js'),
  ventes: () => import('./modules/ventes.js'),
  credits: () => import('./modules/credits.js'),
  acomptes: () => import('./modules/acomptes.js'),
  stocks: () => import('./modules/stocks.js'),
  achats: () => import('./modules/achats.js'),
  fournisseurs: () => import('./modules/fournisseurs.js'),
  clients: () => import('./modules/clients.js'),
  rapports: () => import('./modules/rapports.js'),
  parametres: () => import('./modules/parametres.js'),
  plus: () => import('./modules/plus.js'),
  facture: () => import('./modules/facture.js'),
  abonnes: () => import('./modules/abonnes.js'),
  caisse: () => import('./modules/caisse.js'),
  historique: () => import('./modules/historique.js'),
  proformas: () => import('./modules/proforma.js'),
  avoirs: () => import('./modules/avoirs.js'),
  retours: () => import('./modules/retours.js'),
  lots: () => import('./modules/lots.js'),
  bons: () => import('./modules/bons.js'),
  vente: () => import('./modules/vente-rapide.js'),
  sauvegarde: () => import('./modules/sauvegarde.js'),
  depots: () => import('./modules/depots.js'),
  workers: () => import('./modules/workers.js'),
  alertes: () => import('./modules/alertes.js'),
  exports: () => import('./modules/exports.js')
};
const loaded = {};
let routeToken = 0;

// Barre latérale (PC) : entrées regroupées par métier. Sur téléphone, seules certaines entrées restent visibles (voir theme.css).
const NAV_GROUPS = [
  ['Pilotage', ['accueil', 'alertes']],
  ['Ventes et encaissements', ['vente', 'ventes', 'proformas', 'avoirs', 'retours', 'credits', 'acomptes', 'caisse']],
  ['Clients et stock', ['clients', 'stocks', 'lots', 'depots', 'achats', 'bons', 'fournisseurs']],
  ['Analyse', ['rapports', 'exports', 'historique']],
  ['Administration', ['abonnes', 'workers', 'sauvegarde', 'parametres']],
];
const navHtml = ctx => NAV_GROUPS.map(([title, keys]) => {
  const links = keys.filter(k => k in ROUTES && (k !== 'abonnes' || ctx?.platform) && (!ctx?.noOrg || k === 'abonnes') && canView(ctx?.role, k) && routeAllowed(k) && businessAllows(k))
    .map(k => `<a href="#/${k}" data-r="${k}">${ico(ICON[k])}<span>${ROUTES[k]}</span></a>`).join('');
  return links ? `<div class="nav-sec" aria-hidden="true">${title}</div>${links}` : '';
}).join('')
  // Accès « Plus » : affiché seulement sur téléphone (voir theme.css), il regroupe les autres espaces
  + `<a href="#/plus" data-r="plus">${ico('dots')}<span>Plus</span></a>`;

const NEEDS_RATE = ['vente', 'ventes', 'credits', 'stocks', 'achats', 'facture'];
const root = document.getElementById('root');
watchLanguage(root);
// Version de l'app : la mise à jour du shell est gérée par le service worker.
import { APP_VERSION, BUILD, VERSION_LABEL } from './version.js';
import { initMonitor } from './monitor.js';
import { setBusinessConfig, businessAllows } from './business.js';
import { startOnboarding } from './onboarding.js';
import { showNews } from './news.js';
import { helpHref } from './help.js';
import { openGlobalSearch, pendingSearch } from './global-search.js';
import { activerNotifications } from './push.js';

// Pages proposées par la recherche générale : seulement celles auxquelles l'utilisateur a accès
const searchPages = () => Object.keys(ROUTES)
  .filter(k => k !== 'plus' && (k !== 'abonnes' || ctx?.platform) && (!ctx?.noOrg || k === 'abonnes') && canView(ctx?.role, k) && routeAllowed(k) && businessAllows(k))
  .map(k => ({ key: k, label: ROUTES[k] }));
const openSearch = () => { if (!ctx?.noOrg) openGlobalSearch({ pages: searchPages() }); };
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } });

// Texte de la recherche générale reporté dans le champ de recherche de l'écran ouvert
function applyPendingSearch() {
  if (!pendingSearch.value) return;
  const input = document.getElementById('main')?.querySelector(PAGE_SEARCH);
  if (!input) return;
  input.value = pendingSearch.value;
  pendingSearch.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
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
  if (off) { const t = lastSyncTime(); parts.push(t ? `Hors ligne · données du ${new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Hors ligne'); }
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
      ${canView(ctx?.role, 'vente') ? `<a href="#/vente" data-r="vente" class="fab-m" aria-label="Nouvelle vente">${ico('plus')}<span>Facturer</span></a>` : ''}
      <div class="side-foot"><span class="ver" title="${VERSION_LABEL} · build ${BUILD}">KaPya ERP ${APP_VERSION} · Officielle</span><span class="dev">Développé par Christophe Cibembe</span>${CFG.demo ? '<span class="mode">Mode local</span>' : ''}<button class="out" id="lock-now" type="button">${ico('lock')}<span>Verrouiller</span></button><button class="out" id="out" type="button">${ico('logout')}<span>Se déconnecter</span></button></div>
    </nav>
    <div class="content">
      <header class="topbar"><div class="top-search" id="top-search" role="search"></div>
        <button class="gsbtn" id="gs-btn" type="button" aria-label="Recherche générale" title="Recherche générale (Ctrl+K)">${ico('search')}</button>
        <a class="helpbtn" id="help-btn" href="#" target="_blank" rel="noopener" aria-label="Aide pour cet écran">?</a><button class="bell" id="bell" type="button" aria-label="Notifications" aria-expanded="false"><span aria-hidden="true">🔔</span><span class="bell-n" id="bell-n" hidden></span></button><div class="notif-panel" id="notif-panel" hidden></div><span class="sync" id="sync" role="status"></span><span class="rate-chip" id="rate">${rateChip()}</span><button class="themebtn" id="themebtn" type="button"></button><span class="avatar" aria-hidden="true">${initials()}</span><button class="topout" id="lock-m" type="button" aria-label="Verrouiller l’application" title="Verrouiller">${ico('lock')}</button><button class="topout" id="out-m" type="button" aria-label="Se déconnecter" title="Se déconnecter">${ico('logout')}</button><button class="menubtn" id="menu-btn" type="button" aria-label="Plus d’actions" aria-expanded="false">⋯</button><div class="menu-pop" id="menu-pop" hidden><button type="button" data-act="theme">Mode sombre / clair</button><button type="button" data-act="lock">Verrouiller</button><button type="button" data-act="logout">Se déconnecter</button></div></header>
      <main id="main" tabindex="-1"></main>
    </div></div>`;
  document.getElementById('gs-btn').onclick = openSearch;
  document.getElementById('sync').onclick = () => { if (document.getElementById('sync').classList.contains('bad')) showRejected(); };
  document.getElementById('themebtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  applyTheme(document.documentElement.dataset.theme || THEME);
  const logout = async () => {
    const n = await pendingCount().catch(() => 0);
    if (n && !(await askConfirm(`${n} pièce(s) ne sont pas encore synchronisées. Elles seront perdues si vous vous déconnectez. Continuer ?`))) return;
    await clearOffline(); signOut(); start();
  };
  document.getElementById('out').onclick = logout;
  document.getElementById('out-m').onclick = logout;
  const menuBtn = document.getElementById('menu-btn'), menuPop = document.getElementById('menu-pop');
  menuBtn?.addEventListener('click', e => { e.stopPropagation(); const open = menuPop.hidden; menuPop.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', () => { if (menuPop) { menuPop.hidden = true; menuBtn?.setAttribute('aria-expanded', 'false'); } });
  menuPop?.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'theme') document.getElementById('themebtn')?.click();
    if (act === 'lock') document.getElementById('lock-m')?.click();
    if (act === 'logout') document.getElementById('out-m')?.click();
  }));
  const lockButton = () => { if (!hasPin()) location.hash = '#/parametres'; else lockNow(); };
  document.getElementById('lock-now').onclick = lockButton;
  document.getElementById('lock-m').onclick = lockButton;
  route(); updateSync();
  // Notifications : compteur sur la cloche, liste au clic
  const refreshBell = async () => {
    const { collectNotifications, renderNotifications } = await import('./notif-centre.js');
    const items = await collectNotifications(ctx).catch(() => []);
    const n = items.filter(i => i.level !== 'info').length;
    const bn = document.getElementById('bell-n'); if (bn) { bn.hidden = !n; bn.textContent = n; }
    document.getElementById('notif-panel').innerHTML = renderNotifications(items);
  };
  const bell = document.getElementById('bell'), panel = document.getElementById('notif-panel');
  if (bell) bell.onclick = async () => { const open = panel.hidden; panel.hidden = !open; bell.setAttribute('aria-expanded', open); if (open) await refreshBell(); };
  refreshBell(); setInterval(refreshBell, 60000);
  document.getElementById('notif-panel')?.addEventListener('click', async e => {
    if (!e.target.closest('[data-push-on]')) return;
    try { await activerNotifications(); notify('Notifications activées sur cet appareil.'); }
    catch (err) { notify(err.message); }
  });
  document.addEventListener('kp:rejected', async e => {
    const { prevenirStaff } = await import('./push.js');
    prevenirStaff('Opération refusée', e.detail?.message || 'Une opération a été refusée par le serveur.', '/');
  });
  new MutationObserver(placePageSearch).observe(document.getElementById('main'), { childList: true, subtree: true });
}
function route() {
  const main = document.getElementById('main'); if (!main) return;
  document.getElementById('top-search')?.replaceChildren();
  const [r, q] = location.hash.replace('#/', '').split('?'), key = r in ROUTES && canView(ctx?.role, r) && routeAllowed(r) && businessAllows(r) && (r !== 'abonnes' || ctx?.platform) && (!ctx?.noOrg || r === 'abonnes') ? r : (ctx?.noOrg ? 'abonnes' : 'accueil');
  main._venteEvents?.abort();
  main._dashEvents?.abort();
  main.dataset.page = key;
  { const help = document.getElementById('help-btn'); if (help) help.href = helpHref(key); }
  document.querySelectorAll('#nav a').forEach(a => a.dataset.r === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  main.replaceChildren();
  const token = ++routeToken;
  const params = new URLSearchParams(q || '');
  const show = mod => {
    if (token !== routeToken) return;
    const rendering = mod.render(main, ctx, params);
    if (key === 'accueil') Promise.resolve(rendering).then(() => mountQuickActions(main, ctx));
    placePageSearch();
    if (ctx?.role && planAllows('alertes')) alertCount(ctx.role).then(c => paintBadges(c.count, c.detail));
    if (NEEDS_RATE.includes(key) && !getRate()) main.insertAdjacentHTML('afterbegin', '<p class="notice">Taux du jour non renseigné : les montants sont en dollars. <a href="#/parametres">Le renseigner</a></p>');
    main.focus();
  };
  const pending = loaded[key] || (loaded[key] = LOADERS[key]());
  Promise.resolve(pending).then(show).catch(err => {
    loaded[key] = null;
    if (token !== routeToken) return;
    console.error('Chargement impossible :', err);
    main.innerHTML = '<div class="card"><p class="err">Impossible de charger cet écran. Vérifiez la connexion puis rechargez la page.</p></div>';
  });
}
function placePageSearch() {
  applyPendingSearch();
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

// Écran de bienvenue : affiché une seule fois par compte, à la première connexion sur cet appareil.
// Renvoie vrai si l'écran de bienvenue s'affiche (le guide de démarrage suivra à la fermeture).
function showWelcomeOnce(onClose) {
  const uid = session().uid;
  const key = `kp.welcome.${uid}`;
  const screen = document.getElementById('splash');
  // Une seule fois par compte : le drapeau est enregistré sur le profil (serveur), et en local en secours
  if (!uid || !screen || ctx?.welcome_seen_at || localStorage.getItem(key)) return false;
  screen.hidden = false;
  // Le numéro affiché suit js/version.js : plus de risque de version figée dans le HTML.
  const versionTag = screen.querySelector('#splash-version');
  if (versionTag) versionTag.textContent = `Version ${APP_VERSION}`;
  document.getElementById('splash-go').onclick = () => {
    localStorage.setItem(key, '1'); screen.hidden = true;
    db.rpc('mark_welcome_seen', {}).catch(() => {});
    onClose();
  };
  return true;
}

// Entreprise rattachée au compte connecté (et non « la première » : le super administrateur voit toutes les entreprises).
async function ownOrgRow() {
  // Une seule requête : le profil et son entreprise ensemble (au lieu de deux lectures successives).
  try {
    const rows = await db.select('profiles', `select=org_id,organizations(plan,status,business_type,hidden_features)&id=eq.${session().uid}`);
    if (!rows?.length || !rows[0].org_id) return [];
    const org = rows[0].organizations;
    return org ? [org] : [];
  } catch (e) { return e.status ? null : undefined; }
}

async function start() {
  if (!CFG.demo && CFG.url.includes('VOTRE')) { root.innerHTML = '<div class="auth"><div class="card"><h1>Configuration requise</h1><p>Renseignez l’URL et la clé publique Supabase dans <code>js/config.js</code>.</p></div></div>'; return; }
  if (recoveryFromLink(root, start)) return;
  if (!session()) return renderAuth(root, start);
  const gate = await mfaStatus().catch(() => ({ needs: false }));
  if (gate.needs) return renderMfa(root, start, gate.factorId);
  loadVat();
  // Changement d'utilisateur sur cet appareil : on vide le cache (jamais les pièces en attente)
  const last = localStorage.getItem('kp.uid'), uid = session().uid;
  if (last && last !== uid) { await clearCache().catch(() => {}); localStorage.removeItem('kp.numRange'); }
  localStorage.setItem('kp.uid', uid);
  // Démarrage immédiat : on utilise le profil mémorisé pour ce compte, sans attendre le réseau.
  // Le profil est vérifié en arrière-plan ; s'il a changé (rôle, boutique), l'application se recharge.
  const savedP = JSON.parse(localStorage.getItem('kp.profile') || 'null');
  if (savedP && savedP.uid === uid && navigator.onLine) {
    ctx = savedP.p;
    profile().then(p => { if (p && JSON.stringify(p) !== JSON.stringify(savedP.p)) location.reload(); }).catch(() => {});
  } else try { ctx = await profile(); }
  catch (e) {
    // Hors ligne, un jeton expiré ne doit pas déconnecter : on repart du profil mémorisé pour ce compte
    const saved = JSON.parse(localStorage.getItem('kp.profile') || 'null');
    if (e.status === 401 && !navigator.onLine && saved && saved.uid === uid) { ctx = saved.p; }
    else if (e.status === 401) { signOut(); return renderAuth(root, start); }
    else {
    root.innerHTML = `<div class="auth"><div class="card"><h1>Connexion impossible</h1>
      <p>${esc(e.message)}</p>
      <p class="hint-txt">Serveur : <code>${esc(CFG.url.replace('https://', ''))}</code></p>
      <ul class="checks"><li>Vérifie ta connexion internet, un VPN ou un bloqueur de publicités.</li><li>Vérifie que le projet Supabase n'est pas en pause.</li></ul>
      <button class="btn" id="retry" type="button">Réessayer</button> <button class="ghost" id="reset" type="button">Effacer la session</button></div></div>`;
    document.getElementById('retry').onclick = () => location.reload();
    document.getElementById('reset').onclick = () => { signOut(); location.reload(); };
    return; }
    }
  // Un compte sans profil est encore au stade de création/rejoindre une organisation.
  // renderOrg permet de créer le profil via bootstrap_org ou de rejoindre avec un code.
  if (!ctx || !ctx.org_id) {
    // Super administrateur sans entreprise : accès à la seule gestion de la plateforme (Abonnés).
    const isPlatform = await db.rpc('is_platform_admin').then(v => v === true).catch(() => false);
    if (!isPlatform) return renderOrg(root, start);
    ctx = { ...(ctx || {}), role: 'platform', platform: true, noOrg: true, org_id: null };
    setPlan('premium');
    setBusinessConfig('commerce', null);
  }
  // Requêtes de démarrage lancées en parallèle (au lieu d'une à la suite de l'autre) : l'écran s'ouvre plus vite.
  const [platform, orgRows, rate] = await Promise.all([
    // Super administrateur : détecté côté base (table platform_admins)
    CFG.demo ? false : db.rpc('is_platform_admin').then(v => v === true).catch(() => false),
    CFG.demo ? [{ plan: 'premium', status: 'active' }] : ownOrgRow(),
    loadRate().catch(() => null)
  ]);
  ctx.platform = platform;
  ctx.plan = orgRows?.[0]?.plan || (CFG.demo ? 'premium' : 'standard');
  setPlan(ctx.plan);
  setBusinessConfig(orgRows?.[0]?.business_type || 'commerce', orgRows?.[0]?.hidden_features);
  // Entreprise suspendue ou expirée : la base ne renvoie plus rien (réponse vide). Hors ligne, on ne bloque pas.
  if (!CFG.demo && Array.isArray(orgRows) && !orgRows.length && !ctx.noOrg) {
    root.innerHTML = '<div class="auth"><div class="card"><h1>Accès suspendu</h1><p>Le compte de cette entreprise est suspendu ou son abonnement a expiré. Contactez KaPya pour le réactiver.</p><button class="ghost" id="out2" type="button">Se déconnecter</button></div></div>'; document.getElementById('out2').onclick = () => { signOut(); start(); }; return;
  }
  shell();
  // Guide de démarrage : après la bienvenue (première connexion), ou directement si la bienvenue est déjà passée.
  if (ctx.noOrg) { syncNow().then(updateSync); setInterval(updateSync, 30000); return; }
  const allowedRoute = route => route in ROUTES && canView(ctx?.role, route) && routeAllowed(route) && businessAllows(route);
  const goRoute = route => { location.hash = `#/${route}`; };
  // Ordre : bienvenue, puis nouveautés (une fois par version), puis guide de démarrage.
  const startGuide = () => startOnboarding(allowedRoute, goRoute);
  // Les nouveautés ne concernent que le gérant ; les autres passent directement au guide
  const afterWelcome = () => (ctx?.role === 'admin' ? showNews(session().uid, startGuide) : startGuide());
  if (!showWelcomeOnce(afterWelcome)) afterWelcome();
  syncNow().then(updateSync);
  setInterval(updateSync, 30000);
}
initMonitor();
initLock({ logout: () => document.getElementById('out')?.click() });
autoClean().then(reloaded => { if (reloaded) location.reload(); else start(); });
