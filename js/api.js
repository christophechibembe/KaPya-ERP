import { replayOutcome } from './replay.js';
import { localStore as localStorage } from './storage.js';
import { clearDash } from './dash-cache.js';
import { isVersionConflict, conflictError } from './conflict.js';
// Client Supabase (Auth + PostgREST), sans dépendance.
// Hors ligne : les lectures sont mises en cache et relues sans réseau ; les ventes et achats sont mis en file d'attente
// (avec un identifiant unique, pour qu'une pièce envoyée deux fois ne soit enregistrée qu'une fois).
import { CFG } from './config.js';
import { demoDb } from './demo.js';
import { cget, cset, ckeys, cacheStats, outboxAdd, outboxAll, outboxDel, outboxPut, clearAll, CACHE_TTL_DAYS } from './cache.js';
import { localSelect } from './offline-query.mjs';
import { replaceArticles } from './localdb.js';
// Colonnes des produits, sans le stock total (le total passe par article_total_stock, réservé au gérant et au responsable)
export const ART_COLS = 'id,sku,name,unit,price_buy,price_sell,min_stock,barcode,unit_weight,track_expiry,archived_at,updated_at,version';
import { applyCachedRecordUpdate, restoreCachedRecord, setCachedRecordPending } from './modules/offline-record-updates.mjs';

const K = 'kp.session';
// randomUUID() est absent de certains navigateurs Android en HTTP sur le réseau local.
export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
let S = JSON.parse(localStorage.getItem(K) || 'null');
const save = s => { S = s; s ? localStorage.setItem(K, JSON.stringify(s)) : localStorage.removeItem(K); };
const toS = d => ({ access: d.access_token, refresh: d.refresh_token, uid: d.user.id, exp: Date.now() + d.expires_in * 1000 });
const isNet = e => !e.status;                       // pas de réponse HTTP : réseau coupé
const emit = () => document.dispatchEvent(new Event('kp:sync'));
const QUEUE = { create_customer_return: 'customer_returns', create_credit_note: 'credit_notes', create_sale: 'sales', create_purchase: 'purchases', create_transfer: 'transfers', create_customer_deposit: 'customer_deposits', update_sale: 'sales', record_credit_payment: 'sale_payments', save_cash_closure: 'cash_closures', save_shop_closure: 'cash_closures_shop', set_sale_payment_method: 'sales', set_initial_payment_method: 'sale_payments' };
const FN = { sales: 'create_sale', purchases: 'create_purchase', transfers: 'create_transfer', customer_returns: 'create_customer_return', credit_notes: 'create_credit_note' };
const INSERT_TABLE = { insert_customer: 'customers', insert_supplier: 'suppliers', insert_article: 'articles' };
const UPDATE_TABLE = { update_customer: 'customers', update_supplier: 'suppliers', update_article: 'articles' };

async function raw(path, { method = 'GET', body, token, prefer } = {}) {
  if (CFG.demo) throw new Error('Connexion au serveur désactivée dans la démonstration.');
  // Content-Type seulement quand il y a un corps (les lectures GET n'en ont pas besoin)
  const h = { apikey: CFG.key };
  if (body) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  if (prefer) h.Prefer = prefer;
  let r;
  try { r = await fetch(CFG.url + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) {
    // Indique la requête exacte qui a échoué (sans clé ni donnée) : utile pour diagnostiquer
    const where = `${method} ${path.split('?')[0]}`;
    throw Object.assign(new TypeError(`${e.message} — ${where}`), { cause: e });
  }
  const t = await r.text(); const d = t ? JSON.parse(t) : null;
  if (!r.ok) throw Object.assign(new Error(d?.msg || d?.message || d?.error_description || 'Erreur ' + r.status), { status: r.status, code: d?.code });
  return d;
}
async function refresh() {
  try { save(toS(await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: S.refresh } }))); }
  catch (e) { if (!isNet(e)) save(null); throw e; }
}
// Renouvelle le jeton si besoin. Hors ligne, on garde la session : les données viennent du cache.
async function ensureToken() {
  if (!S || Date.now() < S.exp - 30000) return;
  try { await refresh(); }
  catch (e) { if (!isNet(e)) throw Object.assign(e, { status: 401 }); }
}

// Pièce hors ligne : mise en file d'attente, et stock affiché corrigé dans le cache des articles.
const tableCachePrefix = table => `/rest/v1/${table}?`;
async function mutateCachedRows(table, mutate) {
  for (const key of (await ckeys()).filter(x => typeof x === 'string' && x.startsWith(tableCachePrefix(table)))) {
    const rows = await cget(key);
    if (!Array.isArray(rows)) continue;
    if (mutate(rows)) await cset(key, rows);
  }
}
async function cachedRows(table) {
  const result = [];
  for (const key of (await ckeys()).filter(x => typeof x === 'string' && x.startsWith(tableCachePrefix(table)))) {
    const rows = await cget(key);
    if (Array.isArray(rows)) result.push(...rows);
  }
  return result;
}
async function applyLocalUpdateSale(body, pending = true) {
  const oldLines = (await cachedRows('sales')).find(sale => sale.id === body.p_id)?.sale_lines || [];
  const articles = await cachedRows('articles');
  const bySku = new Map(articles.map(article => [article.sku, article]));
  const oldQty = {}, newQty = {};
  oldLines.forEach(line => { const id = line.article_id || line.articles?.id || bySku.get(line.articles?.sku)?.id; if (id) oldQty[id] = (oldQty[id] || 0) + Number(line.qty || 0); });
  (body.p_lines || []).forEach(line => { newQty[line.article_id] = (newQty[line.article_id] || 0) + Number(line.qty || 0); });
  const byArticle = new Map(articles.map(article => [article.id, article]));
  for (const id of new Set([...Object.keys(oldQty), ...Object.keys(newQty)])) {
    const change = (oldQty[id] || 0) - (newQty[id] || 0);
    if (!change) continue;
    await mutateCachedRows('articles', rows => {
      let changed = false;
      rows.forEach(article => { if (article.id === id) { article.stock = Number(article.stock || 0) + change; changed = true; } });
      return changed;
    });
  }
  const total = (body.p_lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unit_price || 0), 0);
  const customer = (await cachedRows('customers')).find(row => row.id === body.p_customer);
  await mutateCachedRows('sales', rows => {
    let changed = false;
    rows.forEach(sale => {
      if (sale.id !== body.p_id) return;
      sale.customer_id = body.p_customer || null;
      sale.customer_label = body.p_customer_label || null;
      sale.customers = customer ? { name: customer.name } : (sale.customers || null);
      sale.sold_at = body.p_date || sale.sold_at;
      sale.payment = body.p_payment || 'cash';
      sale.paid = sale.payment === 'cash' ? total : Math.min(Math.max(Number(body.p_paid || 0), 0), total);
      sale.sale_lines = (body.p_lines || []).map((line, index) => {
        const article = byArticle.get(line.article_id);
        return { id: `offline-${body.p_id}-${index}`, article_id: line.article_id, qty: Number(line.qty), unit_price: Number(line.unit_price), articles: article ? { sku: article.sku, name: article.name, unit: article.unit } : null };
      });
      if (pending) sale._offline_pending = true;
      changed = true;
    });
    return changed;
  });
}
async function applyLocalCreditPayment(body, pending = true) {
  await mutateCachedRows('sales', rows => {
    let changed = false;
    rows.forEach(sale => {
      if (sale.id !== body.p_sale_id) return;
      sale.paid = Number(sale.paid || 0) + Number(body.p_amount || 0);
      sale.sale_payments ||= [];
      if (!sale.sale_payments.some(payment => payment.id === body.p_id)) {
        sale.sale_payments.push({ id: body.p_id, sale_id: body.p_sale_id, amount: Number(body.p_amount), paid_at: body.p_paid_at, kind: 'payment', offline_pending: pending, created_at: new Date().toISOString() });
      }
      changed = true;
    });
    return changed;
  });
}
async function applyLocalDeposit(body, pending = true) {
  const customer = (await cachedRows('customers')).find(row => row.id === body.p_customer_id);
  const amount = Math.round(Number(body.p_amount) * 100) / 100;
  const row = { id: body.p_id, customer_id: body.p_customer_id, customers: customer ? { name: customer.name, phone: customer.phone } : null,
    receipt_number: `PROV-${String(body.p_id).slice(-8).toUpperCase()}`, amount, remaining: amount,
    received_at: body.p_received_at, created_at: new Date().toISOString(), _offline_pending: pending };
  await mutateCachedRows('customer_deposits', rows => {
    const index = rows.findIndex(deposit => deposit.id === row.id);
    if (index < 0) rows.unshift(row); else rows[index] = { ...rows[index], ...row };
    return true;
  });
}
async function applyLocalQueuedChange(fn, body, pending = true) {
  if (INSERT_TABLE[fn]) {
    const table = INSERT_TABLE[fn];
    const row = { ...body, _offline_pending: pending };
    if (table === 'articles') { row.stock = Number(row.stock || 0); row.min_stock = Number(row.min_stock || 0); }
    await mutateCachedRows(table, rows => {
      const index = rows.findIndex(item => item.id === row.id);
      if (index < 0) rows.push(row); else rows[index] = { ...rows[index], ...row };
      return true;
    });
  } else if (UPDATE_TABLE[fn]) {
    const table = UPDATE_TABLE[fn];
    await mutateCachedRows(table, rows => applyCachedRecordUpdate(rows, body, pending));
  } else if (fn === 'create_customer_deposit') await applyLocalDeposit(body, pending);
  else if (fn === 'update_sale') await applyLocalUpdateSale(body, pending);
  else if (fn === 'record_credit_payment') await applyLocalCreditPayment(body, pending);
}
async function captureQueuedRollback(fn, body) {
  if (INSERT_TABLE[fn]) return { table: INSERT_TABLE[fn], rowId: body.id };
  if (UPDATE_TABLE[fn]) {
    const table = UPDATE_TABLE[fn];
    const row = (await cachedRows(table)).find(item => item.id === body.id);
    return { table, rowId: body.id, previousRow: row ? JSON.parse(JSON.stringify(row)) : null };
  }
  if (fn === 'create_customer_deposit') return { rowId: body.p_id };
  if (['create_sale', 'create_purchase', 'create_transfer'].includes(fn)) {
    const ids = new Set((body.p_lines || []).map(line => line.article_id).filter(Boolean));
    const articleStocks = {};
    (await cachedRows('articles')).forEach(article => { if (ids.has(article.id)) articleStocks[article.id] = Number(article.stock || 0); });
    return { articleStocks };
  }
  if (fn === 'update_sale') {
    const sale = (await cachedRows('sales')).find(row => row.id === body.p_id);
    const articleIds = new Set([...(sale?.sale_lines || []).map(line => line.article_id || line.articles?.id), ...(body.p_lines || []).map(line => line.article_id)].filter(Boolean));
    const articleStocks = {};
    (await cachedRows('articles')).forEach(article => { if (articleIds.has(article.id)) articleStocks[article.id] = Number(article.stock || 0); });
    const fields = ['customer_id', 'customer_label', 'customers', 'sold_at', 'payment', 'paid', 'sale_lines', '_offline_pending'];
    const previousSale = sale ? Object.fromEntries(fields.filter(key => key in sale).map(key => [key, JSON.parse(JSON.stringify(sale[key]))])) : null;
    return { saleId: body.p_id, previousSale, articleStocks };
  }
  if (fn === 'record_credit_payment') {
    const sale = (await cachedRows('sales')).find(row => row.id === body.p_sale_id);
    return { saleId: body.p_sale_id, previousPaid: Number(sale?.paid || 0) };
  }
  return null;
}
async function rollbackQueuedChange(item) {
  const { fn, body, rollback } = item;
  if (INSERT_TABLE[fn]) await mutateCachedRows(rollback?.table || INSERT_TABLE[fn], rows => {
    const oldLength = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].id === rollback?.rowId) rows.splice(i, 1);
    return rows.length !== oldLength;
  });
  else if (UPDATE_TABLE[fn] && rollback?.previousRow) await mutateCachedRows(rollback.table || UPDATE_TABLE[fn], rows => restoreCachedRecord(rows, rollback.rowId, rollback.previousRow));
  else if (fn === 'create_customer_deposit') await mutateCachedRows('customer_deposits', rows => {
    const oldLength = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].id === rollback?.rowId) rows.splice(i, 1);
    return rows.length !== oldLength;
  });
  else if (['create_sale', 'create_purchase', 'create_transfer'].includes(fn)) {
    for (const [id, stock] of Object.entries(rollback?.articleStocks || {})) await mutateCachedRows('articles', rows => {
      let changed = false; rows.forEach(row => { if (row.id === id) { row.stock = stock; changed = true; } }); return changed;
    });
  }
  else if (fn === 'update_sale' && rollback?.previousSale) {
    const previous = rollback.previousSale;
    await mutateCachedRows('sales', rows => {
      let changed = false;
      rows.forEach(row => { if (row.id === rollback.saleId) { for (const key of ['customer_id','customer_label','customers','sold_at','payment','paid','sale_lines','_offline_pending']) { if (key in previous) row[key] = previous[key]; else delete row[key]; } changed = true; } });
      return changed;
    });
    for (const [id, stock] of Object.entries(rollback.articleStocks || {})) await mutateCachedRows('articles', rows => {
      let changed = false; rows.forEach(row => { if (row.id === id) { row.stock = stock; changed = true; } }); return changed;
    });
  } else if (fn === 'record_credit_payment') await mutateCachedRows('sales', rows => {
    let changed = false; rows.forEach(row => { if (row.id === rollback?.saleId) { row.paid = rollback.previousPaid; row.sale_payments = (row.sale_payments || []).filter(payment => payment.id !== body.p_id); changed = true; } }); return changed;
  });
}
async function reapplyLaterQueuedChanges(item) {
  if (UPDATE_TABLE[item.fn]) {
    const table = UPDATE_TABLE[item.fn], id = item.body.id;
    const laterUpdates = (await outboxAll()).filter(next => next.seq > item.seq && next.status !== 'rejected' && UPDATE_TABLE[next.fn] === table && next.body.id === id);
    for (const next of laterUpdates) {
      next.rollback = await captureQueuedRollback(next.fn, next.body).catch(() => next.rollback);
      await outboxPut(next);
      await applyLocalQueuedChange(next.fn, next.body, true);
    }
    if (!laterUpdates.length) await mutateCachedRows(table, rows => setCachedRecordPending(rows, id, false));
  }
  const saleId = item.fn === 'update_sale' ? item.body.p_id
    : item.fn === 'record_credit_payment' ? item.body.p_sale_id : null;
  const articleIds = new Set([...(item.body.p_lines || []).map(line => line.article_id), ...Object.keys(item.rollback?.articleStocks || {})].filter(Boolean));
  if (!saleId && !articleIds.size) return;
  const later = (await outboxAll()).filter(next => next.seq > item.seq && next.status !== 'rejected');
  for (const next of later) {
    const relatedSale = next.body.p_id === saleId || next.body.p_sale_id === saleId;
    const relatedStock = (next.body.p_lines || []).some(line => articleIds.has(line.article_id));
    if (['update_sale', 'record_credit_payment'].includes(next.fn) && (relatedSale || (next.fn === 'update_sale' && relatedStock))) {
      next.rollback = await captureQueuedRollback(next.fn, next.body).catch(() => next.rollback);
      await outboxPut(next);
      await applyLocalQueuedChange(next.fn, next.body, true);
    } else if (['create_sale', 'create_purchase', 'create_transfer'].includes(next.fn) && relatedStock) {
      next.rollback = await captureQueuedRollback(next.fn, next.body).catch(() => next.rollback);
      await outboxPut(next);
      await applyLocalStock(next.fn, next.body);
    }
  }
}
async function markQueuedChangeSynced(item) {
  const { fn, body } = item;
  if (INSERT_TABLE[fn]) await mutateCachedRows(INSERT_TABLE[fn], rows => {
    let changed = false; rows.forEach(row => { if (row.id === body.id && row._offline_pending) { delete row._offline_pending; changed = true; } }); return changed;
  });
  else if (UPDATE_TABLE[fn]) {
    const hasLaterPendingUpdate = (await outboxAll()).some(next => next.status !== 'rejected' && UPDATE_TABLE[next.fn] === UPDATE_TABLE[fn] && next.body.id === body.id);
    await mutateCachedRows(UPDATE_TABLE[fn], rows => setCachedRecordPending(rows, body.id, hasLaterPendingUpdate));
  }
  else if (fn === 'create_customer_deposit') {
    let serverRow;
    try { [serverRow] = await raw(`/rest/v1/customer_deposits?id=eq.${body.p_id}&select=id,receipt_number,customer_id,amount,remaining,received_at,created_at`, { token: S.access }); } catch {}
    if (serverRow) await mutateCachedRows('customer_deposits', rows => {
      let changed = false;
      rows.forEach(row => { if (row.id === body.p_id) { Object.assign(row, serverRow); delete row._offline_pending; changed = true; } });
      return changed;
    });
  }
  else if (fn === 'update_sale') await mutateCachedRows('sales', rows => {
    let changed = false; rows.forEach(row => { if (row.id === body.p_id && row._offline_pending) { delete row._offline_pending; changed = true; } }); return changed;
  });
  else if (fn === 'record_credit_payment') await mutateCachedRows('sales', rows => {
    let changed = false;
    rows.forEach(sale => {
      if (sale.id !== body.p_sale_id) return;
      (sale.sale_payments || []).forEach(payment => {
        if (payment.id === body.p_id && payment.offline_pending) { delete payment.offline_pending; changed = true; }
      });
    });
    return changed;
  });
}
// Demande au navigateur de réveiller l'application quand le réseau revient.
// Le service worker ne peut pas rejouer la file seul (il n'a pas la session) :
// il prévient les onglets ouverts, qui lancent alors syncNow().
function requestBackgroundSync() {
  try {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => reg.sync?.register('kapya-sync')).catch(() => {});
  } catch { /* navigateur sans Background Sync */ }
}

async function enqueue(path, body, fn, options = {}) {
  if (['create_sale', 'create_purchase', 'create_transfer', 'create_customer_deposit', 'record_credit_payment'].includes(fn)) body.p_id ||= newId();
  if (INSERT_TABLE[fn]) body.id ||= newId();
  if (UPDATE_TABLE[fn]) {
    const table = UPDATE_TABLE[fn];
    const pendingInsert = (await outboxAll()).find(item => item.status !== 'rejected' && INSERT_TABLE[item.fn] === table && item.body.id === body.id);
    if (pendingInsert) {
      pendingInsert.body = { ...pendingInsert.body, ...body };
      await outboxPut(pendingInsert);
      await applyLocalQueuedChange(fn, body, true);
      emit();
      return body.id;
    }
  }
  const rollback = await captureQueuedRollback(fn, body).catch(() => null);
  await outboxAdd({ path, body, fn, method: options.method || 'POST', prefer: options.prefer, rollback, created: Date.now(), status: 'pending' });
  await applyLocalStock(fn, body).catch(() => {});
  await applyLocalQueuedChange(fn, body).catch(() => {});
  requestBackgroundSync();
  emit();
  return INSERT_TABLE[fn] ? body.id : body.p_id;
}
async function applyLocalStock(fn, body) {
  if (!['create_sale', 'create_purchase', 'create_transfer'].includes(fn)) return;
  const sign = fn === 'create_purchase' ? 1 : -1, by = {};
  body.p_lines.forEach(l => { by[l.article_id] = (by[l.article_id] || 0) + sign * +l.qty; });
  for (const k of (await ckeys()).filter(x => typeof x === 'string' && x.startsWith('/rest/v1/articles'))) {
    const list = await cget(k);
    if (!Array.isArray(list)) continue;
    list.forEach(a => { if (by[a.id] !== undefined && Number.isFinite(Number(a.stock))) a.stock = Number(a.stock) + by[a.id]; });
    await cset(k, list);
  }
}

async function authed(path, o = {}) {
  if (!S) throw Object.assign(new Error('Session expirée'), { status: 401 });
  await ensureToken();
  if ((o.method || 'GET') === 'GET') {
    try { const res = await raw(path, { token: S.access }); await cset(path, res).catch(() => {}); return res; }
    catch (e) {
      if (!isNet(e)) throw e;
      const c = await cget(path).catch(() => undefined);
      if (c !== undefined) return c;
      const table = (path.match(/^\/rest\/v1\/([a-z_]+)\?/) || [])[1];
      if (table && OFFLINE_TABLES[table]) {
        const full = await cget(OFFLINE_TABLES[table]).catch(() => undefined);
        if (Array.isArray(full)) { const local = localSelect(path, full); if (local !== undefined) return local; }
      }
      throw Object.assign(new Error('Hors ligne : cette information n’a pas encore été chargée. Reconnectez-vous une fois pour la mettre à jour.'), { offline: true, status: 0 });
    }
  }
  try { return await raw(path, { ...o, token: S.access }); }
  catch (e) {
    if (!isNet(e)) throw e;
    const fn = (path.match(/rpc\/(\w+)$/) || [])[1];
    if (QUEUE[fn]) return enqueue(path, o.body, fn);
    if (o.offlineQueue) return enqueue(o.offlineQueue.path, o.body, o.offlineQueue.fn, o.offlineQueue);
    throw Object.assign(new Error('Connexion requise pour cette action.'), { offline: true });
  }
}

const realDb = {
  select: (t, q = '') => {
    // Fiches archivées : masquées des listes (l'historique des ventes les garde)
    if (ARCHIVABLE.has(t) && !/(^|&)archived_at=/.test(q)) q = q ? q + '&archived_at=is.null' : 'archived_at=is.null';
    return authed(`/rest/v1/${t}?${q}`);
  },
  insert: (t, row, mode = 'representation') => {
    const insertFn = { customers: 'insert_customer', suppliers: 'insert_supplier', articles: 'insert_article' }[t];
    const body = insertFn ? { ...row, id: row.id || newId() } : row;
    const offlineQueue = insertFn ? { fn: insertFn, path: `/rest/v1/${t}?on_conflict=id`, method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal' } : undefined;
    return authed(`/rest/v1/${t}`, { method: 'POST', body, prefer: `return=${mode}`, offlineQueue });
  },
  // expectVersion : version connue de la fiche. Si la fiche a changé entre-temps (autre appareil), aucune ligne n'est
  // modifiée et la mise à jour est signalée comme un conflit, au lieu d'écraser la modification de l'autre.
  update: (t, id, row, expectVersion) => {
    const updateFn = { customers: 'update_customer', suppliers: 'update_supplier', articles: 'update_article' }[t];
    const body = { ...row, id };
    const guard = Number.isInteger(expectVersion) ? `&version=eq.${expectVersion}` : '';
    const path = `/rest/v1/${t}?id=eq.${encodeURIComponent(id)}${guard}`;
    const offlineQueue = updateFn ? { fn: updateFn, path, method: 'PATCH', prefer: 'return=representation' } : undefined;
    return authed(path, { method: 'PATCH', body: row, prefer: 'return=representation', offlineQueue: offlineQueue ? { ...offlineQueue, body } : undefined })
      .then(result => {
        if (guard && isVersionConflict({ method: 'PATCH', path, result })) throw conflictError();
        return result;
      });
  },
  delete: (t, id) => authed(`/rest/v1/${t}?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }),
  upsert: (t, row, key) => authed(`/rest/v1/${t}?on_conflict=${key}`, { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' }),
  rpc: (fn, args = {}) => authed(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }),
};
export const db = CFG.demo ? demoDb : realDb;

// Envoi des pièces en attente, puis rafraîchissement du cache. Ne fait rien hors ligne.
let syncing = false;
const SYNC_ATTEMPTS_KEY = 'kp.syncAttempts', SYNC_ATTEMPT_AT_KEY = 'kp.syncAttemptAt';
const markSyncStart = () => localStorage.setItem(SYNC_ATTEMPT_AT_KEY, String(Date.now()));
const markSyncResult = failed => {
  if (failed) localStorage.setItem(SYNC_ATTEMPTS_KEY, String((Number(localStorage.getItem(SYNC_ATTEMPTS_KEY)) || 0) + 1));
  else localStorage.removeItem(SYNC_ATTEMPTS_KEY);
};
// État de reprise, lu par la synchronisation automatique de l'application.
export const syncMeta = () => ({
  attempts: Number(localStorage.getItem(SYNC_ATTEMPTS_KEY)) || 0,
  lastAttempt: Number(localStorage.getItem(SYNC_ATTEMPT_AT_KEY)) || 0
});
// Index local des ventes récentes (pour chercher et réafficher hors ligne)
export const LOCAL_SALES_KEY = '/local/sales-index';
const SALES_INDEX_PATH = '/rest/v1/sales?select=id,number,sold_at,created_at,to_pickup,customer_id,customer_label,payment,payment_method,payment_reference,paid,warehouse_id,customers(name),sale_lines(id,article_id,qty,unit_price,unit_cost,unit_cost_at_sale,cost_is_estimated,discount_pct,warehouse_id,articles(id,sku,name,unit,unit_weight,price_buy))&order=sold_at.desc,created_at.desc&limit=2000';

// Requêtes préchargées qui servent aussi de copie locale interrogeable hors ligne.
// Les chemins sont partagés avec OFFLINE_TABLES pour éviter deux requêtes identiques.
const OFFLINE_PATHS = {
  sales: LOCAL_SALES_KEY,
  sale_payments: '/rest/v1/sale_payments?select=id,sale_id,amount,paid_at,kind,created_at,customer_deposit_id,method,reference,operator,sales(number,customer_label,customer_id)&order=paid_at.desc,created_at.desc&limit=2000',
  purchases: '/rest/v1/purchases?select=id,supplier_id,number,bought_at,created_at,usd_cdf,payment_balance_opening,warehouse_id,suppliers(name,phone),purchase_lines(id,article_id,qty,unit_cost,warehouse_id,articles(id,sku,name,unit,price_buy))&order=bought_at.desc,created_at.desc&limit=1000',
  purchase_payments: '/rest/v1/purchase_payments?select=id,purchase_id,amount,paid_at,created_at,purchases(number,supplier_id,suppliers(name))&order=paid_at.desc,created_at.desc&limit=2000',
  business_expenses: '/rest/v1/business_expenses?select=id,label,category,amount,paid_at,created_at&order=paid_at.desc,created_at.desc&limit=2000',
  customer_returns: '/rest/v1/customer_returns?select=id,number,sale_id,warehouse_id,returned_on,total_usd,note,created_at&order=returned_on.desc,created_at.desc&limit=1000',
  credit_notes: '/rest/v1/credit_notes?select=id,number,sale_id,customer_id,issued_on,total_usd,note,created_at&order=issued_on.desc,created_at.desc&limit=1000',
  customer_deposits: '/rest/v1/customer_deposits?select=id,receipt_number,customer_id,amount,remaining,received_at,created_at,customers(name,phone)&order=received_at.desc,created_at.desc&limit=1000',
  cash_closures: '/rest/v1/cash_closures?select=*&order=business_date.desc,closed_at.desc&limit=1000',
  cash_closures_shop: '/rest/v1/cash_closures_shop?select=*&order=business_date.desc,closed_at.desc&limit=1000',
  stock_lots: '/rest/v1/stock_lots?select=id,expiry_date,qty_left,article_id,warehouse_id,articles(name,sku,unit)&qty_left=gt.0&order=expiry_date.asc&limit=2000'
};
const PREFETCH = [
  // Lots en stock (sans filtre de date : le filtre se fait à l'écran, pour que la copie reste valable tous les jours)
  OFFLINE_PATHS.stock_lots,
  `/rest/v1/articles?select=${ART_COLS}&order=name`,
  '/rest/v1/customers?select=*&order=name', '/rest/v1/suppliers?select=*&order=name',
  '/rest/v1/customers?select=id,name&order=name', '/rest/v1/suppliers?select=id,name&order=name',
  '/rest/v1/customers?select=id,name,phone,email&order=name', '/rest/v1/suppliers?select=id,name,phone,email&order=name',
  '/rest/v1/customers?select=id,name,phone&order=name',
  '/rest/v1/sales?select=id,payment,paid,customer_id,sale_lines(qty,unit_price)&payment=eq.credit',
  OFFLINE_PATHS.purchases,
  OFFLINE_PATHS.sale_payments,
  OFFLINE_PATHS.purchase_payments,
  OFFLINE_PATHS.business_expenses,
  OFFLINE_PATHS.customer_returns,
  OFFLINE_PATHS.credit_notes,
  OFFLINE_PATHS.customer_deposits,
  OFFLINE_PATHS.cash_closures,
  OFFLINE_PATHS.cash_closures_shop,
  '/rest/v1/organizations?select=name,address,phone,email,tax_id,rc,logo,receipt_footer',
  '/rest/v1/settings?select=usd_cdf,rate_date&limit=1'];
const ARCHIVABLE = new Set(['articles', 'customers', 'suppliers']);
const DELTA_TABLES = new Set(['articles', 'customers', 'suppliers', 'stock_lots', 'warehouse_stock']);
const tableOf = p => (p.match(/^\/rest\/v1\/([a-z_]+)\?/) || [])[1];
const hasId = p => /(^|[?&])select=(\*|[^&]*\bid\b)/.test(p);

// Fusionne les lignes modifiées (par identifiant) dans une liste déjà présente sur l'appareil
function mergeRows(cached, changed, p) {
  const byId = new Map(cached.map(r => [r.id, r]));
  for (const r of changed) { if (r.archived_at) byId.delete(r.id); else byId.set(r.id, r); }
  let out = [...byId.values()];
  if (/order=name/.test(p)) out.sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), 'fr'));
  return out;
}

// Rafraîchit le catalogue : copie complète (sinceIso = null) ou seulement les changements depuis sinceIso
async function refreshCatalog(token, sinceIso) {
  try { await cset(LOCAL_SALES_KEY, await raw(SALES_INDEX_PATH, { token })); } catch (e) { if (isNet(e)) return; }
  const whPath = '/rest/v1/warehouses?select=id,name,is_default&active=eq.true&order=is_default.desc,name';
  let whs = [];
  try { whs = await raw(whPath, { token }); await cset(whPath, whs); } catch (e) { if (isNet(e)) return; }
  const keys = [...PREFETCH.map(k => (tableOf(k) && ARCHIVABLE.has(tableOf(k)) && !/archived_at=/.test(k) ? k + '&archived_at=is.null' : k)), ...whs.map(w => `/rest/v1/warehouse_stock?select=id,article_id,qty&warehouse_id=eq.${w.id}`)];
  for (const p of keys) {
    try {
      const table = tableOf(p);
      const cached = await cget(p).catch(() => undefined);
      if (sinceIso && table && DELTA_TABLES.has(table) && hasId(p) && Array.isArray(cached)) {
        const changed = await raw(p + `&updated_at=gt.${encodeURIComponent(sinceIso)}`, { token });
        if (changed.length) await cset(p, mergeRows(cached, changed, p));
      } else {
        await cset(p, await raw(p, { token }));
      }
    } catch (e) { if (isNet(e)) break; }
  }
}

// Lecture hors ligne « comme une base » : chaque table préchargée peut être filtrée,
// triée et limitée sur l'appareil (colonnes simples et relations déjà embarquées).
// Toute requête non simulable (filtre sur une relation, opérateur inconnu) reste sur la copie exacte.
export const OFFLINE_TABLES = {
  articles: `/rest/v1/articles?select=${ART_COLS}&order=name&archived_at=is.null`,
  customers: '/rest/v1/customers?select=*&order=name',
  suppliers: '/rest/v1/suppliers?select=*&order=name',
  ...OFFLINE_PATHS
};

// ── Plages de numéros de factures par appareil (fonctionnement hors ligne) ──
const RANGE_KEY = 'kp.numRange', DEVICE_KEY = 'kp.device', RANGE_SIZE = 150, RANGE_LOW = 30;
function deviceId() {
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) { d = 'dev-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE_KEY, d); }
  return d;
}
// Numéro réservé pour la prochaine facture de cet appareil (ou null : le serveur numérotera au moment de l'envoi)
export function takeInvoiceNumber() {
  if (CFG.demo) return null;
  const r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null');
  if (!r || r.next > r.to) return null;
  const n = r.next++;
  localStorage.setItem(RANGE_KEY, JSON.stringify(r));
  return `${r.prefix}-${String(n).padStart(5, '0')}`;
}
// Réserve une nouvelle plage quand l'appareil est presque à court de numéros (réseau requis)
// État de la plage de numéros de cet appareil (pour l'interface)
export function rangeStatus() {
  const r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null');
  if (!r) return { ok: false, left: 0, prefix: 'FAC', next: null, to: null };
  return { ok: r.next <= r.to, left: Math.max(0, r.to - r.next + 1), prefix: r.prefix, next: r.next, to: r.to };
}

export async function ensureInvoiceRange() {
  if (CFG.demo || !navigator.onLine) return;
  const r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null');
  if (r && r.to - r.next + 1 > RANGE_LOW) return;
  try {
    const got = await db.rpc('reserve_invoice_range', { p_device: deviceId(), p_size: RANGE_SIZE });
    const next = got && got.from;
    if (next) localStorage.setItem(RANGE_KEY, JSON.stringify({ prefix: got.prefix, next: got.from, to: got.to }));
  } catch { /* plus tard */ }
}

// Colonnes des produits, sans le stock total (le total passe par article_total_stock, réservé au gérant et au responsable)
// Lit des produits et ajoute leur stock total (seulement pour le gérant et le responsable ; sinon 0)
export async function selectArticlesWithTotal(qs) {
  const rows = await db.select('articles', qs);
  const tot = await db.rpc('article_total_stock', {}).catch(() => []);
  const m = new Map((Array.isArray(tot) ? tot : []).map(t => [t.article_id, Number(t.total) || 0]));
  return rows.map(r => ({ ...r, stock: m.get(r.id) ?? 0 }));
}
export async function syncNow() {
  if (CFG.demo || syncing || !S || !navigator.onLine) return;
  syncing = true;
  let networkStop = false;
  markSyncStart();
  try {
    await ensureToken();
    await ensureInvoiceRange().catch(() => {});
    for (const it of await outboxAll()) {
      if (it.status === 'rejected') continue;
      try {
        const result = await raw(it.path, { method: it.method || 'POST', body: it.body, token: S.access, prefer: it.prefer });
        // Mise à jour protégée par la version : aucune ligne modifiée = la fiche a changé ailleurs.
        if (isVersionConflict({ method: it.method, path: it.path, result })) throw conflictError();
        await outboxDel(it.seq); await markQueuedChangeSynced(it);
      }
      catch (e) {
        if (replayOutcome(e) === 'stop') { networkStop = true; break; }  // toujours hors ligne, ou session à renouveler
        const rejected = { ...it, status: 'rejected', error: e.message };
        await outboxPut(rejected); // refusée par le serveur (stock, données)
        try { document.dispatchEvent(new CustomEvent('kp:rejected', { detail: { message: e.message } })); } catch {}
        await rollbackQueuedChange(rejected).then(() => reapplyLaterQueuedChanges(rejected)).catch(() => {});
      }
      emit();
    }
    // Catalogue hors ligne (étape A) : au plus une fois toutes les 20 minutes.
    // Tous les 24 h : copie complète (rattrape aussi les suppressions).
    // Entre-temps : seules les lignes modifiées depuis la dernière synchronisation sont téléchargées et fusionnées.
    const PREFETCH_EVERY = 20 * 60 * 1000, FULL_EVERY = 24 * 60 * 60 * 1000;
    const last = Number(localStorage.getItem('kp.lastPrefetch') || 0);
    if (Date.now() - last > PREFETCH_EVERY) {
      const fullDue = !last || Date.now() - Number(localStorage.getItem('kp.lastFull') || 0) > FULL_EVERY;
      const sinceIso = new Date(last - 5 * 60 * 1000).toISOString(); // marge pour l'écart d'horloge
      await refreshCatalog(S.access, fullDue ? null : sinceIso);
      // Base locale des produits : tenue à jour à chaque rafraîchissement du catalogue
      const arts = await cget(`/rest/v1/articles?select=${ART_COLS}&order=name&archived_at=is.null`).catch(() => null);
      if (Array.isArray(arts)) await replaceArticles(arts).catch(() => {});
      localStorage.setItem('kp.lastSync', String(Date.now()));
      localStorage.setItem('kp.lastPrefetch', String(Date.now()));
      if (fullDue) localStorage.setItem('kp.lastFull', String(Date.now()));
    }
  } catch (e) { if (isNet(e) || e?.status === 401) networkStop = true; /* hors ligne : on réessaiera */ }
  finally { syncing = false; markSyncResult(networkStop); emit(); }
}
export const pendingFor = async table => (await outboxAll()).filter(it => it.fn === FN[table]);
export const lastSyncTime = () => Number(localStorage.getItem('kp.lastSync')) || 0;
export const pendingCount = async () => (await outboxAll()).length;
// Diagnostic complet pour Paramètres > Mode hors-ligne.
export async function offlineStatus() {
  const [queue, cache] = await Promise.all([queueStats(), cacheStats().catch(() => ({ count: 0, oldest: 0, newest: 0 }))]);
  return { online: navigator.onLine, ...queue, ...cache, cacheDays: CACHE_TTL_DAYS, lastSync: lastSyncTime(), ...syncMeta() };
}
export const queueStats = async () => {
  const all = await outboxAll();
  const rejected = all.filter(it => it.status === 'rejected').length;
  return { total: all.length, pending: all.length - rejected, rejected };
};
// Opérations en attente d'un type donné (paiements de crédit, etc.)
export const pendingOps = async fn => (await outboxAll()).filter(it => it.fn === fn && it.status !== 'rejected');
export const rejectedItems = async () => (await outboxAll()).filter(it => it.status === 'rejected');
// Opérations refusées : réessayer (remise en attente puis envoi) ou abandonner (retirer de la file)
export async function retryRejected(seq) {
  const it = (await outboxAll()).find(x => x.seq === seq);
  if (!it) return;
  const { status, error, ...rest } = it;
  await outboxPut(rest);
  await syncNow();
}
export async function discardRejected(seq) { await outboxDel(seq); }
export async function dropRejected() { for (const it of await rejectedItems()) await outboxDel(it.seq); emit(); }
export const clearOffline = () => clearAll();

export const session = () => CFG.demo ? { uid: 'demo' } : S;
export const signOut = () => { clearDash(); if (!CFG.demo) save(null); };
export async function signIn(email, password) {
  save(toS(await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })));
}
export async function signUp(email, password) {
  const d = await raw('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (!d.access_token) return { confirm: true };   // confirmation e-mail activée côté Supabase
  save(toS(d)); return { confirm: false };
}
export async function profile() {
  if (CFG.demo) return { id: 'demo', org_id: 'demo', role: localStorage.getItem('kp.demoRole') || 'admin', full_name: 'Démo' };
  try {
    const p = await profileOnline();
    if (p) localStorage.setItem('kp.profile', JSON.stringify({ uid: S.uid, p }));
    return p;
  } catch (e) {
    // Hors ligne au démarrage : on repart du profil mémorisé pour le même compte
    const saved = JSON.parse(localStorage.getItem('kp.profile') || 'null');
    if (isNet(e) && saved && saved.uid === S.uid) return saved.p;
    throw e;
  }
}

async function profileOnline() {
  // Si la colonne welcome_seen_at n'existe pas encore (migration non exécutée), on relit le profil sans elle
  try {
    const [p] = await db.select('profiles', `id=eq.${S.uid}&select=id,org_id,role,full_name,welcome_seen_at`);
    return p || null;
  } catch (e) {
    if (!/welcome_seen_at/.test(String(e.message || e))) throw e;
    const [p] = await db.select('profiles', `id=eq.${S.uid}&select=id,org_id,role,full_name`);
    return p || null;
  }
}

// ---- Mot de passe oublié ----
export const sendPasswordReset = (email) => raw('/auth/v1/recover', { method: 'POST', body: { email, redirect_to: location.origin + location.pathname } });
export const setNewPassword = (token, password) => raw('/auth/v1/user', { method: 'PUT', token, body: { password } });

// ---- Double authentification (code de l'application d'authentification) ----
const aalOf = token => { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal || 'aal1'; } catch { return 'aal1'; } };
// needs : le compte a une double authentification active et la session n'a pas encore reçu le second facteur
export async function mfaStatus() {
  if (CFG.demo) return { needs: false, factors: [] };
  const s = session();
  if (!s) return { needs: false, factors: [] };
  const u = await raw('/auth/v1/user', { token: s.access });
  const factors = (u.factors || []).filter(f => f.status === 'verified');
  return { factors, needs: factors.length > 0 && aalOf(s.access) !== 'aal2', factorId: factors[0]?.id };
}
export const mfaEnroll = () => raw('/auth/v1/factors', { method: 'POST', token: session().access, body: { factor_type: 'totp', friendly_name: 'KaPya' } });
// Vérifie un code : remplace la session par une session à deux facteurs
export async function mfaVerify(factorId, code) {
  const token = session().access;
  const ch = await raw(`/auth/v1/factors/${factorId}/challenge`, { method: 'POST', token, body: {} });
  const d = await raw(`/auth/v1/factors/${factorId}/verify`, { method: 'POST', token, body: { challenge_id: ch.id, code: String(code).trim() } });
  save(toS(d));
  return d;
}
export const mfaUnenroll = factorId => raw(`/auth/v1/factors/${factorId}`, { method: 'DELETE', token: session().access });
