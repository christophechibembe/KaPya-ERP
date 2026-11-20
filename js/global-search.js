// Recherche générale : une seule zone pour trouver un produit, un client, un fournisseur, une vente ou une page.
// Chaque résultat ouvre l'écran concerné, avec le texte déjà saisi dans son champ de recherche.
import { db, LOCAL_SALES_KEY } from './api.js';
import { cget } from './cache.js';
import { searchArticles } from './localdb.js';
import { esc, articleLabel, ico } from './ui.js';

// Texte à reporter dans le champ de recherche de l'écran qui va s'ouvrir (lu par app.js).
export const pendingSearch = { value: '' };

const MIN_CHARS = 2;

// Filtre contenant : une valeur encodée, jamais de virgule ni de parenthèse qui casserait la requête.
const likeFilter = term => `*${encodeURIComponent(term.replace(/[,()*%]/g, ' ').trim())}*`;

const foldKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Clients et fournisseurs : liste complète lue une fois par ouverture (cache hors ligne inclus),
// filtrée ici. Ainsi la recherche fonctionne aussi sans connexion.
async function loadParties(table) {
  const rows = await db.select(table, 'select=id,name,phone&order=name').catch(() => []);
  return Array.isArray(rows) ? rows : [];
}
const matchesParty = (row, t) => foldKey(row.name).includes(t) || String(row.phone || '').replace(/\s/g, '').includes(t.replace(/\s/g, ''));

// Ventes : en ligne, recherche complète sur le serveur ; hors ligne, index local des 2000 ventes les plus récentes.
async function searchSales(term) {
  let rows;
  if (navigator.onLine) {
    rows = await db.select('sales', `select=id,number,sold_at,customer_label&number=ilike.${likeFilter(term)}&order=sold_at.desc&limit=6`).catch(() => []);
  } else {
    const all = (await cget(LOCAL_SALES_KEY).catch(() => null)) || [];
    const t = foldKey(term);
    rows = all.filter(s => foldKey(s.number).includes(t) || foldKey(s.customer_label).includes(t) || foldKey(s.customers?.name).includes(t)).slice(0, 6);
  }
  const items = (Array.isArray(rows) ? rows : []).map(s => ({ label: `Vente ${s.number || ''}`.trim(), sub: [s.customer_label || s.customers?.name, s.sold_at ? String(s.sold_at).slice(0, 10) : ''].filter(Boolean).join(' · '), go: '#/ventes', q: s.number || '' }));
  return { offline: false, items };
}

async function searchAll(term, pages, parties) {
  const t = foldKey(term);
  const [products, sales] = await Promise.all([
    searchArticles(term, 6, true).catch(() => []),
    searchSales(term)
  ]);
  const pageHits = pages.filter(p => foldKey(p.label).includes(t)).slice(0, 6);
  const customers = parties.customers.filter(r => matchesParty(r, t)).slice(0, 6);
  const suppliers = parties.suppliers.filter(r => matchesParty(r, t)).slice(0, 6);
  const groups = [
    { title: 'Produits', items: products.map(a => ({ label: articleLabel(a), sub: `Réf. ${a.sku || '—'}`, go: '#/stocks', q: a.name })) },
    { title: 'Clients', items: customers.map(c => ({ label: c.name, sub: c.phone || 'Client', go: '#/clients', q: c.name })) },
    { title: 'Fournisseurs', items: suppliers.map(s => ({ label: s.name, sub: s.phone || 'Fournisseur', go: '#/fournisseurs', q: s.name })) },
    { title: 'Ventes', items: sales.items, note: sales.offline ? 'Indisponible hors connexion' : '' },
    { title: 'Pages', items: pageHits.map(p => ({ label: p.label, sub: 'Ouvrir l’écran', go: `#/${p.key}`, q: '' })) }
  ];
  return groups.filter(g => g.items.length || g.note);
}

// pages : [{ key, label }] déjà filtrées selon les droits, le forfait et le type d'activité (voir app.js)
export function openGlobalSearch({ pages }) {
  if (document.querySelector('.gs-overlay')) return;
  const ov = document.createElement('div');
  ov.className = 'gs-overlay';
  ov.innerHTML = `<div class="gs-box" role="dialog" aria-modal="true" aria-label="Recherche générale">
      <div class="gs-head">${ico('search')}<input id="gs-q" type="search" placeholder="Produit, client, fournisseur, vente, page…" autocomplete="off" aria-label="Recherche générale"><button class="ghost" type="button" data-gs-close>Fermer</button></div>
      <div class="gs-results" id="gs-results" aria-live="polite"><p class="muted gs-empty">Tapez au moins ${MIN_CHARS} lettres.</p></div>
    </div>`;
  document.body.appendChild(ov);
  const input = ov.querySelector('#gs-q');
  const out = ov.querySelector('#gs-results');
  let timer = 0, seq = 0, current = [], parties = null;

  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const go = (item) => {
    pendingSearch.value = item.q || '';
    try { sessionStorage.setItem('kp.q', item.q || ''); } catch {}
    close();
    if (location.hash === item.go) window.dispatchEvent(new Event('hashchange'));
    else location.hash = item.go;
  };
  const draw = groups => {
    current = groups.flatMap(g => g.items);
    if (!groups.length) { out.innerHTML = '<p class="muted gs-empty">Aucun résultat.</p>'; return; }
    let i = 0;
    out.innerHTML = groups.map(g => `<div class="gs-group"><h3>${esc(g.title)}</h3>${g.note ? `<p class="muted gs-note">${esc(g.note)}</p>` : ''}${g.items.map(it => `<button type="button" class="gs-item" data-i="${i++}"><b>${esc(it.label)}</b><span class="muted">${esc(it.sub)}</span></button>`).join('')}</div>`).join('');
  };
  const run = async () => {
    const term = input.value.trim();
    const mine = ++seq;
    if (term.length < MIN_CHARS) { current = []; out.innerHTML = `<p class="muted gs-empty">Tapez au moins ${MIN_CHARS} lettres.</p>`; return; }
    if (!parties) parties = Promise.all([loadParties('customers'), loadParties('suppliers')]).then(([customers, suppliers]) => ({ customers, suppliers }));
    const groups = await searchAll(term, pages, await parties);
    if (mine !== seq) return;
    draw(groups);
  };

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  out.addEventListener('click', e => { const b = e.target.closest('.gs-item'); if (b) go(current[Number(b.dataset.i)]); });
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-gs-close]')) close(); });
  const onKey = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && document.activeElement === input && current[0]) { e.preventDefault(); go(current[0]); }
  };
  document.addEventListener('keydown', onKey);
  input.focus();
}
import { sessionStore as sessionStorage } from './storage.js';
