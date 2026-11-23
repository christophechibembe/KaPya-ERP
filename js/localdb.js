// Base locale des produits (IndexedDB, un enregistrement par produit, index par référence, code-barres et nom).
// Permet une recherche rapide même avec des milliers d'articles, sans charger tout le catalogue à chaque écran.
import { isDemo } from './demo-mode.js';
const DB_NAME = isDemo ? 'kapya-demo-local' : 'kapya-local', DB_VER = 1, STORE = 'articles';
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('sku', 'sku');
        s.createIndex('barcode', 'barcode');
        s.createIndex('nname', 'nname');
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx(mode, fn) {
  return open().then(d => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { d.close(); res(out && out.result !== undefined ? out.result : undefined); };
    t.onerror = () => { d.close(); rej(t.error); };
  }));
}

// Ajoute ou met à jour des produits ; retire ceux qui sont archivés
export async function upsertArticles(rows) {
  if (!rows.length) return;
  await tx('readwrite', s => {
    for (const a of rows) {
      if (a.archived_at) { s.delete(a.id); continue; }
      s.put({ ...a, nname: norm(a.name), nsku: norm(a.sku) });
    }
  });
}

// Remplace tout le contenu (après une copie complète)
export async function replaceArticles(rows) {
  await tx('readwrite', s => s.clear());
  await upsertArticles(rows);
}

// Vide le catalogue local (déconnexion, changement d'utilisateur, « vider les données hors ligne »).
export async function clearArticles() {
  await tx('readwrite', s => s.clear());
}

// Recherche : référence, code-barres, ou tout ou partie du nom (sans accents ni majuscules)
export async function searchArticles(q, limit = 40, withBarcode = true) {
  const needle = norm(q);
  const d = await open();
  return new Promise((res, rej) => {
    const out = [];
    const t = d.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c || out.length >= limit) { d.close(); return res(out); }
      const a = c.value;
      const byCode = withBarcode && a.barcode && a.barcode === q.trim();
      if (!needle || norm(a.sku) === needle || byCode || a.nname.includes(needle) || a.nsku.includes(needle)) out.push(a);
      c.continue();
    };
    req.onerror = () => { d.close(); rej(req.error); };
  });
}

export async function articleByCode(code) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readonly');
    const idx = t.objectStore(STORE).index('barcode');
    const r = idx.get(String(code).trim());
    r.onsuccess = () => { d.close(); res(r.result || null); };
    r.onerror = () => { d.close(); rej(r.error); };
  });
}
