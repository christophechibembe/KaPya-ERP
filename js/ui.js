import { esc } from './escape.js';
import { searchArticles } from './localdb.js';
export { esc };
export const n = v => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
// Taux du jour (1 USD = x FC), chargé au démarrage et mis à jour depuis le tableau de bord.

// Icônes SVG en trait (sans dépendance externe)
const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2l2-7H7"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  invoice: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h3"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M10 12h5M10 16h5"/>',
  minus: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 14h6"/>',
  return: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-2"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  sales: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  purchases: '<path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  stock: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  coins: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2 0 2.8 5 1.4 5 4.2 0 1.2-1.1 2-2.5 2-1.2 0-2.1-.5-2.6-1.3M12 6v2M12 16v2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  adjust: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.3L21 8"/><path d="M21 3v5h-5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  warehouse: '<path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-7h10v7"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
};
export const ico = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

let CUR = null;
export const setRate = r => { CUR = r ? { usd_cdf: +r.usd_cdf, rate_date: r.rate_date } : null; document.dispatchEvent(new Event('kp:rate')); };
export const getRate = () => CUR;
// Montants : dollars, avec équivalent FC si le taux est renseigné. Les quantités restent en n().
const usd = v => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
const fc = v => Math.round(Number(v) * CUR.usd_cdf).toLocaleString('fr-FR') + ' FC';
export const money = v => usd(v) + (CUR ? ' · ' + fc(v) : '');
export const usdOnly = usd;
export const fcOnly = v => (CUR ? fc(v) : '');
export const fld = (id, l, t = 'text', x = '') => `<label for="${id}">${l}</label><input id="${id}" name="${id}" type="${t}" ${x}>`;

// Boîte de dialogue de saisie : onOk(valeurs, FormData) ; done() est appelé après succès.
export function openDialog(d, title, body, onOk, done, setup, cls = '') {
  d.className = cls;
  d.innerHTML = `<form><h2>${esc(title)}</h2>${body}<p class="err" role="alert"></p><div class="row"><button type="button" class="ghost" id="c">Annuler</button><button class="btn">Enregistrer</button></div></form>`;
  const f = d.querySelector('form'); d.querySelector('#c').onclick = () => d.close();
  f.onsubmit = async e => {
    e.preventDefault();
    const ok = f.querySelector('.row .btn'); ok.disabled = true;   // évite le double enregistrement
    try { const fd = new FormData(f); await onOk(Object.fromEntries(fd), fd); d.close(); await done(); }
    catch (x) { const er = f.querySelector('.err'); er.textContent = /duplicate/.test(x.message) ? 'Cette référence existe déjà.' : x.message; er.scrollIntoView({ block: 'nearest' }); ok.disabled = false; }
  };
  if (setup) setup(f);
  d.showModal(); f.querySelector('input,select').focus();
}

// Boîte de dialogue en lecture seule.
export function showDialog(d, title, body) {
  d.className = 'wide';
  d.innerHTML = `<div><h2>${esc(title)}</h2>${body}<div class="row"><button type="button" class="btn" id="c">Fermer</button></div></div>`;
  d.querySelector('#c').onclick = () => d.close(); d.showModal(); d.querySelector('#c').focus();
}

// Graphiques SVG dessinés à la main (couleurs via classes CSS)
export const lineSvg = (vals, labels) => {
  const W = 640, H = 240, P = 36, base = H - 30, max = Math.max(...vals, 1) * 1.15;
  const x = i => P + i * (W - 2 * P) / Math.max(vals.length - 1, 1);
  const y = v => base - (v / max) * (base - 14);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${line} L${x(vals.length - 1)} ${base} L${x(0)} ${base} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution des ventes"><defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1f6feb" stop-opacity=".22"/><stop offset="1" stop-color="#1f6feb" stop-opacity="0"/></linearGradient></defs>
    <g class="gr">${[0, .25, .5, .75, 1].map(f => `<line x1="${P}" x2="${W - P}" y1="${(base - f * (base - 14)).toFixed(1)}" y2="${(base - f * (base - 14)).toFixed(1)}"/>`).join('')}</g>
    <path d="${area}" fill="url(#lg)"/><path class="ln" d="${line}"/>
    ${pts.map(([a, b]) => `<circle class="dot" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="4.5"/>`).join('')}
    ${labels.map((l, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${l}</text>`).join('')}</svg>`;
};
export const barSvg = (vals, labels) => {
  const W = 640, H = 240, P = 28, base = H - 30, max = Math.max(...vals, 1) * 1.15, bw = (W - 2 * P) / vals.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chiffre d’affaires par mois">${vals.map((v, i) => {
    const h = (v / max) * (base - 14), x = P + i * bw + bw * .22;
    return `<rect class="bar${i === vals.length - 1 ? ' cur' : ''}" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${(bw * .56).toFixed(1)}" height="${h.toFixed(1)}" rx="6"/><text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${labels[i]}</text>`;
  }).join('')}</svg>`;
};

// Message d'information dans une fenêtre (remplace alert()).
// Signale un chargement qui a échoué (en ligne seulement : hors connexion, les données locales prennent le relais).
export function signalerChargement(nom, err) {
  if (!navigator.onLine) return;
  const main = document.getElementById('main');
  if (!main || main.querySelector(`.load-err[data-nom="${nom}"]`)) return;
  const raison = err?.status ? `erreur ${err.status}` : 'connexion instable';
  const bande = document.createElement('div');
  bande.className = 'load-err';
  bande.dataset.nom = nom;
  bande.setAttribute('role', 'alert');
  bande.innerHTML = `<span>Impossible de charger ${esc(nom)} (${esc(raison)}). Les chiffres affichés peuvent être incomplets.</span><button class="ghost" type="button">Réessayer</button>`;
  bande.querySelector('button').onclick = () => window.dispatchEvent(new Event('hashchange'));
  main.prepend(bande);
}
// Liste chargée : en cas d'échec, la liste est vide mais l'utilisateur est prévenu.
export const listeOuErreur = (promesse, nom) => promesse.catch(err => { signalerChargement(nom, err); return []; });

export function notify(message, title = 'Information') {
  let d = document.getElementById('notice-dlg');
  if (!d) { d = document.createElement('dialog'); d.id = 'notice-dlg'; document.body.append(d); }
  showDialog(d, title, `<p>${esc(message)}</p>`);
}

// Format de date unique dans toute l'application : JJ/MM/AAAA (et JJ/MM/AAAA HH:MM pour les horodatages)
export const fmtDate = v => { const d = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : ''; };
export const fmtDateTime = v => { const t = new Date(v); return isNaN(t) ? '' : t.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

// Libellés d'unité lisibles pour les listes de choix : « Antirouille (pièce) »
const UNIT_NAMES = { pce: 'pièce', carton: 'carton', bidon: 'bidon', sac: 'sac', kg: 'kg', g: 'g', litre: 'litre', boite: 'boîte', paquet: 'paquet', bouteille: 'bouteille', rouleau: 'rouleau', lot: 'lot', tonne: 'tonne', 'demi-sac': 'demi-sac', 'demi-boite': 'demi-boîte', douzaine: 'douzaine', m: 'mètre', 'm2': 'm²', 'm3': 'm³', mm: 'mm', cm: 'cm', caisse: 'caisse', sachet: 'sachet', jerrycan: 'jerrycan', fut: 'fût', seau: 'seau', pot: 'pot', tube: 'tube', flacon: 'flacon', canette: 'canette', barquette: 'barquette', cagette: 'cagette', palette: 'palette', ballot: 'ballot', bobine: 'bobine', rame: 'rame', botte: 'botte', bloc: 'bloc', feuille: 'feuille', plaque: 'plaque', barre: 'barre', jeu: 'jeu', paire: 'paire', ensemble: 'ensemble', kit: 'kit', pack: 'pack', service: 'service', heure: 'heure', jour: 'jour', ml: 'ml', cl: 'cl', livre: 'livre', quintal: 'quintal', portion: 'portion', plat: 'plat', pain: 'pain', vrac: 'vrac' };
export const unitLabel = u => { const c = String(u || '').trim(); return UNIT_NAMES[c] || c; };
export const articleLabel = a => { const u = unitLabel(a.unit); return u ? `${a.name} (${u})` : a.name; };

// Recherche d'un produit d'après le texte saisi, scanné ou choisi dans la liste :
// insensible à la casse, aux accents et aux espaces, avec ou sans l'unité entre parenthèses.
const foldKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const stripUnit = s => String(s || '').replace(/\s*\([^)]*\)\s*$/, '');
export function matchArticle(list, text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const t = foldKey(raw), bare = foldKey(stripUnit(raw));
  return list.find(a => foldKey(articleLabel(a)) === t)
    || list.find(a => a.barcode && String(a.barcode).trim() === raw)
    || list.find(a => a.sku && foldKey(a.sku) === t)
    || list.find(a => foldKey(a.name) === t)
    || list.find(a => foldKey(a.name) === bare)
    || null;
}
// Comme matchArticle, puis repli sur le cache local : la liste proposée à la saisie vient de ce cache,
// qui peut être plus récent ou plus ancien que la liste chargée à l'ouverture de l'écran.
export async function findArticle(list, text, withBarcode = true) {
  const hit = matchArticle(list, text);
  if (hit) return hit;
  const raw = String(text || '').trim();
  if (!raw) return null;
  const local = await searchArticles(stripUnit(raw).trim() || raw, 200, withBarcode).catch(() => []);
  return matchArticle(local, raw);
}

// Liste de choix avec recherche : on tape, la liste se filtre (nom, référence, code-barres, unité).
// Remplace la liste native (datalist) qui ne permet pas toujours de chercher partout.
export function attachCombo(input, getItems, { max = 40 } = {}) {
  if (!input) return;
  input.removeAttribute('list');
  input.setAttribute('autocomplete', 'off');
  const box = document.createElement('div');
  box.className = 'combo-list';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(box);
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const draw = async () => {
    const q = norm(input.value.trim());
    const items = await getItems(q);
    const hits = (q ? items.filter(it => it.keys.some(k => norm(k).includes(q))) : items).slice(0, max);
    box.innerHTML = hits.length
      ? hits.map((it, i) => `<button type="button" class="combo-item" role="option" data-i="${i}">${esc(it.label)}</button>`).join('')
      : '<p class="combo-empty">Aucun résultat</p>';
    box._hits = hits;
    box.hidden = false;
  };
  input.addEventListener('input', draw);
  input.addEventListener('focus', draw);
  input.addEventListener('keydown', e => { if (e.key === 'Escape') box.hidden = true; });
  box.addEventListener('mousedown', e => {
    const b = e.target.closest('.combo-item'); if (!b) return;
    e.preventDefault();
    input.value = box._hits[Number(b.dataset.i)].label;
    box.hidden = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
}

// Liste déroulante avec recherche : la liste d'origine reste la valeur de référence (cachée),
// un champ de recherche la remplace à l'écran. Le choix met à jour la liste cachée.
export function selectCombo(select, getItems) {
  if (!select || select.dataset.combo) return;
  select.dataset.combo = '1';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'picker-search';
  input.placeholder = 'Rechercher…';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', select.getAttribute('aria-label') || 'Rechercher');
  select.parentNode.insertBefore(input, select);
  select.hidden = true;
  select._combo = input;
  attachCombo(input, () => getItems().map(it => ({ label: it.label, keys: it.keys })));
  input.addEventListener('change', () => {
    const hit = getItems().find(it => it.label === input.value.trim());
    if (hit) { select.value = hit.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}

// Chargement paresseux de ZXing (lecteur de codes en JavaScript), seulement si le navigateur ne sait pas lire les codes.
let zxingPromise = null;
function loadZxing() {
  if (window.ZXing || window.ZXingBrowser) return Promise.resolve(window.ZXing || window.ZXingBrowser);
  if (!zxingPromise) zxingPromise = new Promise((res, rej) => {
    const sc = document.createElement('script');
    // 1) copie locale du projet (js/vendor/zxing.min.js) : fonctionne hors ligne ; 2) sinon le CDN
    const tryLoad = (src, next) => { const sc = document.createElement('script'); sc.src = src; sc.onload = () => res(window.ZXing); sc.onerror = () => next ? next() : (zxingPromise = null, rej(new Error('lecteur indisponible'))); document.head.appendChild(sc); };
    tryLoad('js/vendor/zxing.min.js', () => tryLoad('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'));
  });
  return zxingPromise;
}

// Scan par caméra : BarcodeDetector si le navigateur le prend en charge, sinon ZXing (PC et autres navigateurs).
export async function openScanner(onCode) {
  const native = 'BarcodeDetector' in window;
  if (!native && !navigator.mediaDevices?.getUserMedia) {
    alert('La caméra ne peut pas être utilisée sur cet appareil. Utilisez un lecteur de codes-barres, ou saisissez le code.');
    return;
  }
  const ov = document.createElement('div');
  ov.className = 'scan-overlay';
  ov.innerHTML = '<div class="scan-box" role="dialog" aria-label="Scanner un code-barres"><div class="scan-bar"><b>Scanner un code-barres</b><button class="ghost" type="button" data-scan-close>Annuler</button></div><video autoplay playsinline muted></video><p class="muted scan-msg">Placez le code devant la caméra.</p></div>';
  document.body.appendChild(ov);
  const video = ov.querySelector('video');
  const msg = ov.querySelector('.scan-msg');
  let done = false, stopFn = () => {};
  const stop = () => { if (done) return; done = true; try { stopFn(); } catch {} ov.remove(); };
  ov.querySelector('[data-scan-close]').onclick = stop;
  const found = value => { if (done) return; stop(); onCode(value); };

  if (native) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stopFn = () => stream.getTracks().forEach(t => t.stop());
      video.srcObject = stream;
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
      const loop = async () => {
        if (done) return;
        try { const codes = await detector.detect(video); if (codes.length) return found(codes[0].rawValue); } catch {}
        setTimeout(loop, 250);
      };
      video.onloadeddata = loop;
      return;
    } catch { msg.textContent = 'Caméra indisponible, essai avec le lecteur intégré…'; }
  }
  try {
    const Z = await loadZxing();
    const reader = new Z.BrowserMultiFormatReader();
    const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result) => { if (result) found(result.getText()); });
    stopFn = () => controls.stop();
  } catch {
    msg.textContent = 'Lecteur de caméra indisponible hors connexion. Utilisez un lecteur de codes-barres ou saisissez le code.';
  }
}

// Message clair quand un code scanné ou saisi ne correspond à aucun article
export function unknownCodeMessage(text) {
  return /^[0-9A-Za-z-]{6,}$/.test(String(text || '').trim()) ? 'Code-barres inconnu : cet article n’est pas dans votre liste.' : 'Choisissez un produit dans la liste.';
}

// Anti double scan : un même code relu dans les 2 secondes n'est pas ajouté une seconde fois par erreur
export function scanGuard(windowMs = 2000) {
  let last = '', at = 0;
  return code => {
    const now = Date.now();
    if (code === last && now - at < windowMs) return false;
    last = code; at = now;
    return true;
  };
}

// Confirmation dans l'application (remplace confirm() du navigateur) : renvoie true si l'utilisateur confirme
export function askConfirm(text, { ok = 'Confirmer', cancel = 'Annuler', danger = false } = {}) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'doc-preview-overlay';
    ov.innerHTML = `<div class="confirm-box" role="alertdialog" aria-modal="true"><p class="confirm-text"></p><div class="confirm-acts"><button class="ghost" type="button" data-no>${cancel}</button><button class="btn ${danger ? 'btn-danger' : ''}" type="button" data-yes>${ok}</button></div></div>`;
    ov.querySelector('.confirm-text').textContent = text;
    document.body.appendChild(ov);
    const fin = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') fin(false); if (e.key === 'Enter') fin(true); };
    document.addEventListener('keydown', onKey);
    ov.querySelector('[data-yes]').onclick = () => fin(true);
    ov.querySelector('[data-no]').onclick = () => fin(false);
    ov.addEventListener('click', e => { if (e.target === ov) fin(false); });
    ov.querySelector('[data-no]').focus();
  });
}
