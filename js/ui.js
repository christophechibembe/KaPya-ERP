export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const n = v => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
// Taux du jour (1 USD = x FC), chargé au démarrage et mis à jour depuis le tableau de bord.

// Icônes SVG en trait (sans dépendance externe)
const ICONS = {
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
const usd = v => '$ ' + Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fc = v => Math.round(Number(v) * CUR.usd_cdf).toLocaleString('fr-FR') + ' FC';
export const money = v => usd(v) + (CUR ? ' · ' + fc(v) : '');
export const usdOnly = usd;
export const fcOnly = v => (CUR ? fc(v) : '');
export const fld = (id, l, t = 'text', x = '') => `<label for="${id}">${l}</label><input id="${id}" name="${id}" type="${t}" ${x}>`;

// Boîte de dialogue de saisie : onOk(valeurs, FormData) ; done() est appelé après succès.
export function openDialog(d, title, body, onOk, done, setup, cls = '') {
  d.className = cls;
  d.innerHTML = `<form><h2>${title}</h2>${body}<p class="err" role="alert"></p><div class="row"><button type="button" class="ghost" id="c">Annuler</button><button class="btn">Enregistrer</button></div></form>`;
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
  d.innerHTML = `<div><h2>${title}</h2>${body}<div class="row"><button type="button" class="btn" id="c">Fermer</button></div></div>`;
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
