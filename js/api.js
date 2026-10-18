// Client Supabase (Auth + PostgREST), sans dépendance.
// Hors ligne : les lectures sont mises en cache et relues sans réseau ; les ventes et achats sont mis en file d'attente
// (avec un identifiant unique, pour qu'une pièce envoyée deux fois ne soit enregistrée qu'une fois).
import { CFG } from './config.js';
import { demoDb } from './demo.js';
import { cget, cset, ckeys, outboxAdd, outboxAll, outboxDel, outboxPut, clearAll } from './cache.js';
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
const QUEUE = { create_sale: 'sales', create_purchase: 'purchases', create_transfer: 'transfers', create_customer_deposit: 'customer_deposits', update_sale: 'sales', record_credit_payment: 'sale_payments' };
const FN = { sales: 'create_sale', purchases: 'create_purchase', transfers: 'create_transfer' };
const INSERT_TABLE = { insert_customer: 'customers', insert_supplier: 'suppliers', insert_article: 'articles' };
const UPDATE_TABLE = { update_customer: 'customers', update_supplier: 'suppliers', update_article: 'articles' };

async function raw(path, { method = 'GET', body, token, prefer } = {}) {
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
  if (!r.ok) throw Object.assign(new Error(d?.msg || d?.message || d?.error_description || 'Erreur ' + r.status), { status: r.status });
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
      throw e;
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
  select: (t, q = '') => authed(`/rest/v1/${t}?${q}`),
  insert: (t, row, mode = 'representation') => {
    const insertFn = { customers: 'insert_customer', suppliers: 'insert_supplier', articles: 'insert_article' }[t];
    const body = insertFn ? { ...row, id: row.id || newId() } : row;
    const offlineQueue = insertFn ? { fn: insertFn, path: `/rest/v1/${t}?on_conflict=id`, method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal' } : undefined;
    return authed(`/rest/v1/${t}`, { method: 'POST', body, prefer: `return=${mode}`, offlineQueue });
  },
  update: (t, id, row) => {
    const updateFn = { customers: 'update_customer', suppliers: 'update_supplier', articles: 'update_article' }[t];
    const body = { ...row, id };
    const offlineQueue = updateFn ? { fn: updateFn, path: `/rest/v1/${t}?id=eq.${encodeURIComponent(id)}`, method: 'PATCH', prefer: 'return=minimal' } : undefined;
    return authed(`/rest/v1/${t}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: row, prefer: 'return=representation', offlineQueue: offlineQueue ? { ...offlineQueue, body } : undefined });
  },
  delete: (t, id) => authed(`/rest/v1/${t}?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }),
  upsert: (t, row, key) => authed(`/rest/v1/${t}?on_conflict=${key}`, { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' }),
  rpc: (fn, args = {}) => authed(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }),
};
export const db = CFG.demo ? demoDb : realDb;

// Envoi des pièces en attente, puis rafraîchissement du cache. Ne fait rien hors ligne.
let syncing = false;
const PREFETCH = [
  '/rest/v1/articles?select=*&order=name',
  '/rest/v1/articles?select=id,sku,name,unit,price_buy,price_sell,stock&order=name',
  '/rest/v1/articles?select=id,sku,name,unit,price_sell,stock&order=name',
  '/rest/v1/customers?select=id,name&order=name', '/rest/v1/suppliers?select=id,name&order=name',
  '/rest/v1/customers?select=id,name,phone,email&order=name', '/rest/v1/suppliers?select=id,name,phone,email&order=name',
  '/rest/v1/customers?select=id,name,phone&order=name',
  '/rest/v1/sales?select=id,payment,paid,customer_id,sale_lines(qty,unit_price)&payment=eq.credit',
  '/rest/v1/purchases?select=id,number,bought_at,suppliers(name),purchase_lines(qty,unit_cost,articles(sku,name,unit))&order=bought_at.desc,created_at.desc',
  '/rest/v1/customer_deposits?select=id,receipt_number,customer_id,amount,remaining,received_at,created_at,customers(name,phone)&order=received_at.desc,created_at.desc',
  '/rest/v1/organizations?select=name,address,phone,email,tax_id,rc,logo',
  '/rest/v1/settings?select=usd_cdf,rate_date&limit=1'];
export async function syncNow() {
  if (CFG.demo || syncing || !S) return;
  syncing = true;
  try {
    await ensureToken();
    for (const it of await outboxAll()) {
      if (it.status === 'rejected') continue;
      try { await raw(it.path, { method: it.method || 'POST', body: it.body, token: S.access, prefer: it.prefer }); await outboxDel(it.seq); await markQueuedChangeSynced(it); }
      catch (e) {
        if (isNet(e) || e.status === 401) break;                       // toujours hors ligne, ou session à renouveler
        const rejected = { ...it, status: 'rejected', error: e.message };
        await outboxPut(rejected); // refusée par le serveur (stock, données)
        await rollbackQueuedChange(rejected).then(() => reapplyLaterQueuedChanges(rejected)).catch(() => {});
      }
      emit();
    }
    for (const p of PREFETCH) { try { await cset(p, await raw(p, { token: S.access })); } catch (e) { if (isNet(e)) break; } }
  } catch { /* hors ligne : on réessaiera */ }
  finally { syncing = false; emit(); }
}
export const pendingFor = async table => (await outboxAll()).filter(it => it.fn === FN[table]);
export const pendingCount = async () => (await outboxAll()).length;
export const rejectedItems = async () => (await outboxAll()).filter(it => it.status === 'rejected');
export async function dropRejected() { for (const it of await rejectedItems()) await outboxDel(it.seq); emit(); }
export const clearOffline = () => clearAll();

export const session = () => CFG.demo ? { uid: 'demo' } : S;
export const signOut = () => save(null);
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
  const [p] = await db.select('profiles', `id=eq.${S.uid}&select=id,org_id,role,full_name`);
  return p || null;
}
