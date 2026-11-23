// Simulation métier : aucun réseau, aucun compte Supabase, données synthétiques uniquement.
import { localStore, clearDemoStorage } from './storage.js';
const KEY = 'kp.demo.data.v2';
const clone = value => JSON.parse(JSON.stringify(value));
const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const sum = (rows, fn) => round(rows.reduce((total, row) => total + fn(row), 0));
const totalOf = sale => sum(sale.sale_lines || [], line => line.qty * line.unit_price);
export const DEMO_BUSINESSES = { commerce: 'Commerce', restauration: 'Restaurant', services: 'Salon de coiffure' };
export function demoBusiness() {
  try { const kind = localStore.getItem('kp.demo.business'); return kind in DEMO_BUSINESSES ? kind : 'commerce'; }
  catch { return 'commerce'; }
}

export function seedDemo(now = new Date(), business = 'commerce') {
  const date = days => { const d = new Date(now); d.setDate(d.getDate() + days); return d.toLocaleDateString('sv-SE'); };
  const names = business === 'restauration'
    ? [['REP-01', 'Poulet et riz', 'plat', 3, 7, 60], ['BOI-01', 'Jus de fruits', 'verre', .5, 2, 100], ['REP-02', 'Poisson grillé', 'plat', 4, 9, 35], ['BOI-02', 'Eau minérale', 'bouteille', .4, 1, 24]]
    : business === 'services'
      ? [['COU-01', 'Coupe classique', 'prestation', 1, 5, 1000], ['COI-01', 'Coiffure et tresses', 'prestation', 5, 20, 1000], ['SOI-01', 'Soin capillaire', 'prestation', 2, 8, 1000], ['BAR-01', 'Taille de barbe', 'prestation', .5, 3, 1000]]
      : [['RIZ-25', 'Riz parfumé 25 kg', 'sac', 38, 45, 60], ['HUI-5L', 'Huile végétale 5 L', 'bidon', 9.5, 12, 8], ['SUC-50', 'Sucre 50 kg', 'sac', 41, 48, 0], ['SAV-01', 'Savon de ménage', 'carton', 14, 18, 120],
        ['FAR-10', 'Farine de maïs 10 kg', 'sac', 6, 8, 80], ['SEL-01', 'Sel de cuisine', 'paquet', .5, 1, 90], ['EAU-15', 'Eau minérale 1,5 L', 'bouteille', .4, 1, 100], ['LAI-01', 'Lait en poudre', 'boîte', 4, 6, 30],
        ['BIS-01', 'Biscuits assortis', 'carton', 8, 11, 45], ['THE-01', 'Thé noir', 'boîte', 1.5, 2.5, 25], ['CAF-01', 'Café moulu', 'paquet', 3, 5, 36], ['DET-01', 'Détergent 1 kg', 'sachet', 2, 3, 12]];
  const articles = names.map(([sku, name, unit, price_buy, price_sell, stock], i) => ({
    id: `demo-a${i + 1}`, org_id: 'demo', sku, name, unit, price_buy, price_sell, stock,
    min_stock: business === 'services' ? 0 : 10, barcode: null, track_expiry: false, archived_at: null, version: 1
  }));
  const warehouses = [{ id: 'demo-w1', name: business === 'services' ? 'Salon principal' : 'Boutique principale', org_id: 'demo', is_default: true, active: true },
    ...(business === 'services' ? [] : [{ id: 'demo-w2', name: business === 'restauration' ? 'Terrasse' : 'Boutique du marché', org_id: 'demo', is_default: false, active: true }])];
  const customers = ['Boutique Amani', 'Restaurant du Lac', 'Client Horizon', 'Maison Soleil', 'Client Jardin', 'Client Étoile']
    .map((name, i) => ({ id: `demo-c${i + 1}`, org_id: 'demo', name, phone: '', email: '', archived_at: null, version: 1 }));
  const suppliers = [{ id: 'demo-f1', name: 'Fournisseur Démo', org_id: 'demo', phone: '', archived_at: null, version: 1 }];
  const sales = Array.from({ length: 14 }, (_, i) => {
    const a = articles[i % Math.min(articles.length, 2)], qty = i % 3 + 1, credit = i % 4 === 0;
    return { id: `demo-v${i + 1}`, org_id: 'demo', number: `DEMO-FAC-${String(i + 1).padStart(5, '0')}`,
      sold_at: date(-Math.floor(i / 2)), created_at: `${date(-Math.floor(i / 2))}T00:00:00`, warehouse_id: warehouses[i % warehouses.length].id,
      customer_id: customers[i % customers.length].id, payment: credit ? 'credit' : 'cash', payment_method: 'cash', usd_cdf: 2300,
      paid: round(qty * a.price_sell * (credit ? .25 : 1)), to_pickup: false,
      sale_lines: [{ id: `demo-l${i + 1}`, article_id: a.id, qty, unit_price: a.price_sell, unit_cost: a.price_buy, unit_cost_at_sale: a.price_buy, cost_is_estimated: false }] };
  });
  const warehouse_stock = articles.flatMap(a => warehouses.map((w, i) => ({ id: `${a.id}-${w.id}`, org_id: 'demo', article_id: a.id, warehouse_id: w.id,
    qty: warehouses.length === 1 ? a.stock : i ? Math.floor(a.stock / 5) : a.stock - Math.floor(a.stock / 5) })));
  return { version: 2, n: 100, business, counters: { invoice: 14 },
    tables: { articles, warehouses, warehouse_stock, customers, suppliers, sales,
      organizations: [{ id: 'demo', name: `${DEMO_BUSINESSES[business]} KaPya — Démonstration`, address: 'Adresse fictive', plan: 'premium', status: 'active', business_type: business,
        discounts_enabled: true, barcode_enabled: false, vat_enabled: false, receipt_footer: 'DÉMONSTRATION — SANS VALEUR COMMERCIALE' }],
      settings: [{ id: 'demo', org_id: 'demo', usd_cdf: 2300, rate_date: date(0) }],
      sale_payments: sales.filter(s => s.payment === 'credit').map((s, i) => ({ id: `demo-p${i}`, sale_id: s.id, amount: s.paid, paid_at: s.sold_at, kind: 'initial', method: 'cash' })),
      purchases: [{ id: 'demo-ach1', org_id: 'demo', number: 'DEMO-ACH-00001', bought_at: date(-2), warehouse_id: warehouses[0].id, supplier_id: suppliers[0].id,
        purchase_lines: [{ id: 'demo-al1', article_id: articles[0].id, qty: 20, unit_cost: articles[0].price_buy }] }],
      purchase_payment_balances: [{ id: 'demo-b1', purchase_id: 'demo-ach1', opening_balance: 20 * articles[0].price_buy }],
      purchase_payments: [], customer_deposits: [], credit_notes: [], transfers: [], customer_returns: [],
      stock_moves: [], cash_closures: [], cash_closures_shop: [], unit_options: [], audit_log: [], stock_lots: [],
      business_expenses: [{ id: 'demo-e1', org_id: 'demo', label: 'Transport (exemple)', category: 'Transport', amount: 5, paid_at: date(0) }] } };
}

// Fabrique injectable pour les tests : les scénarios ne lisent pas le navigateur.
export function createDemoDatabase({ storage = localStore, now = () => new Date(), business = demoBusiness() } = {}) {
  let data;
  try { data = JSON.parse(storage.getItem(KEY)); } catch { /* stockage privé ou indisponible */ }
  if (!data || data.version !== 2 || !data.tables?.warehouses) data = seedDemo(now(), business);
  const rows = table => data.tables[table] || [];
  const today = () => now().toLocaleDateString('sv-SE');
  const id = prefix => `demo-${prefix}${++data.n}`;
  const number = (kind, prefix) => `DEMO-${prefix}-${String(data.counters[kind] = (data.counters[kind] || 0) + 1).padStart(5, '0')}`;
  const find = (table, key) => {
    const row = rows(table).find(row => row.id === key);
    if (!row) throw new Error('Fiche introuvable dans la démonstration.');
    return row;
  };
  const line = l => ({ ...l, articles: rows('articles').find(a => a.id === l.article_id),
    sale_cost_snapshots: { unit_cost_at_sale: l.unit_cost_at_sale, cost_is_estimated: false } });
  const saleView = sale => ({ ...sale, customers: rows('customers').find(c => c.id === sale.customer_id) || null,
    warehouses: rows('warehouses').find(w => w.id === sale.warehouse_id), sale_lines: sale.sale_lines.map(line),
    credit_notes_total: sum(rows('credit_notes').filter(c => c.sale_id === sale.id), c => c.total_usd) });
  function view(table, row) {
    if (table === 'sales') return { ...saleView(row), credit_notes: rows('credit_notes').filter(c => c.sale_id === row.id),
      sale_payments: rows('sale_payments').filter(p => p.sale_id === row.id) };
    if (table === 'profiles') return row;
    if (table === 'sale_payments') return { ...row, sales: saleView(find('sales', row.sale_id)) };
    if (table === 'purchases') return { ...row, suppliers: rows('suppliers').find(s => s.id === row.supplier_id),
      warehouses: rows('warehouses').find(w => w.id === row.warehouse_id), purchase_lines: row.purchase_lines.map(line),
      purchase_payments: rows('purchase_payments').filter(p => p.purchase_id === row.id),
      purchase_payment_balances: rows('purchase_payment_balances').find(p => p.purchase_id === row.id) || null };
    if (table === 'purchase_payments') return { ...row, purchases: view('purchases', find('purchases', row.purchase_id)) };
    if (table === 'purchase_payment_balances') return { ...row, purchases: view('purchases', find('purchases', row.purchase_id)) };
    if (table === 'credit_notes') return { ...row, sales: { number: find('sales', row.sale_id).number } };
    if (table === 'customer_deposits') return { ...row, customers: find('customers', row.customer_id) };
    if (table === 'transfers') return { ...row, transfer_lines: row.transfer_lines.map(line) };
    if (['warehouse_stock', 'stock_moves', 'stock_lots'].includes(table)) return { ...row, articles: rows('articles').find(a => a.id === row.article_id) };
    return row;
  }
  function transaction(fn) {
    const before = clone(data);
    try {
      const result = fn();
      storage.setItem(KEY, JSON.stringify(data));
      if (typeof document !== 'undefined') document.dispatchEvent(new Event('kp:demo-change'));
      return clone(result ?? null);
    } catch (error) { data = before; throw error; }
  }
  const amount = (value, allowZero = false) => {
    const n = round(value);
    if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) throw new Error('Montant invalide.');
    return n;
  };
  const activeWarehouse = key => {
    const w = key ? find('warehouses', key) : rows('warehouses').find(w => w.is_default);
    if (!w?.active) throw new Error('Dépôt inactif.');
    return w.id;
  };
  function move(articleId, qty, warehouse, reason, ref) {
    const article = find('articles', articleId);
    let stock = rows('warehouse_stock').find(s => s.article_id === articleId && s.warehouse_id === warehouse);
    if (!stock) { stock = { id: id('stock'), org_id: 'demo', article_id: articleId, warehouse_id: warehouse, qty: 0 }; rows('warehouse_stock').push(stock); }
    if (!Number.isFinite(qty) || stock.qty + qty < -0.00001) throw new Error('Stock insuffisant dans ce dépôt.');
    stock.qty = Math.round((stock.qty + qty) * 1000) / 1000;
    article.stock = sum(rows('warehouse_stock').filter(s => s.article_id === articleId), s => s.qty);
    rows('stock_moves').push({ id: id('move'), article_id: articleId, qty, warehouse_id: warehouse, reason, ref_id: ref, created_at: now().toISOString() });
  }
  function linesFrom(input, priceKey) {
    if (!Array.isArray(input) || !input.length) throw new Error('Ajoutez au moins une ligne.');
    return input.map(l => {
      const a = find('articles', l.article_id), qty = Number(l.qty), price = amount(l[priceKey], true);
      if (!Number.isFinite(qty) || qty <= 0 || a.archived_at) throw new Error('Article ou quantité invalide.');
      return { id: id('line'), article_id: a.id, qty, [priceKey]: price, unit_cost: a.price_buy, unit_cost_at_sale: a.price_buy, cost_is_estimated: false };
    });
  }
  const balance = sale => Math.max(0, round(totalOf(sale) - sale.paid - sum(rows('credit_notes').filter(c => c.sale_id === sale.id), c => c.total_usd)));
  function createDocument(a, purchase = false) {
    const table = purchase ? 'purchases' : 'sales';
    if (a.p_id && rows(table).some(s => s.id === a.p_id)) return a.p_id;
    const lines = linesFrom(a.p_lines, purchase ? 'unit_cost' : 'unit_price');
    const wh = activeWarehouse(a.p_warehouse);
    const sid = a.p_id || id(purchase ? 'purchase' : 'sale');
    if (purchase) {
      find('suppliers', a.p_supplier);
      const total = sum(lines, l => l.qty * l.unit_cost);
      for (const l of lines) move(l.article_id, l.qty, wh, 'purchase', sid);
      rows('purchases').unshift({ id: sid, org_id: 'demo', supplier_id: a.p_supplier, warehouse_id: wh, number: number('purchase', 'ACH'), bought_at: a.p_date || today(), vat_rate: a.p_vat_rate ?? null, purchase_lines: lines });
      rows('purchase_payment_balances').push({ id: id('balance'), purchase_id: sid, opening_balance: total });
      return sid;
    }
    const payment = a.p_payment || 'cash', total = sum(lines, l => l.qty * l.unit_price);
    if (!['credit', 'cash'].includes(payment)) throw new Error('Mode de paiement invalide.');
    if (a.p_customer) find('customers', a.p_customer);
    if (payment === 'credit' && !a.p_customer) throw new Error('Choisissez un client pour une vente à crédit.');
    const advance = amount(a.p_advance_amount || 0, true);
    const paid = payment === 'cash' ? round(total - advance) : amount(a.p_paid || 0, true);
    if (paid < 0 || paid + advance > total) throw new Error('Le montant versé dépasse le total.');
    if (advance) {
      const deposit = find('customer_deposits', a.p_deposit_id);
      if (deposit.customer_id !== a.p_customer || advance > deposit.remaining) throw new Error('Acompte indisponible pour ce client.');
      deposit.remaining = round(deposit.remaining - advance);
      rows('sale_payments').push({ id: id('payment'), sale_id: sid, amount: advance, paid_at: a.p_date || today(), kind: 'advance', customer_deposit_id: deposit.id });
    }
    for (const l of lines) move(l.article_id, -l.qty, wh, 'sale', sid);
    rows('sales').unshift({ id: sid, org_id: 'demo', customer_id: a.p_customer || null, customer_label: a.p_customer_label || null,
      number: number('invoice', 'FAC'), sold_at: a.p_date || today(), created_at: now().toISOString(), warehouse_id: wh,
      payment, payment_method: 'cash', paid: round(paid + advance), usd_cdf: a.p_usd_cdf || 2300, vat_rate: a.p_vat_rate ?? null, sale_lines: lines });
    if (payment === 'credit' && paid > 0) rows('sale_payments').push({ id: id('payment'), sale_id: sid, amount: paid, paid_at: a.p_date || today(), kind: 'initial', method: 'cash' });
    return sid;
  }
  function recordPayment(a) {
    if (a.p_id && rows('sale_payments').some(p => p.id === a.p_id)) return a.p_id;
    const sale = find('sales', a.p_sale_id), paid = amount(a.p_amount);
    if (sale.payment !== 'credit' || paid > balance(sale)) throw new Error('Le paiement dépasse le solde restant.');
    const method = a.p_method || 'cash';
    if (!['cash', 'mobile_money', 'bank'].includes(method) || (method !== 'cash' && !a.p_reference?.trim())) throw new Error('Mode ou référence de paiement invalide.');
    const pid = a.p_id || id('payment');
    rows('sale_payments').push({ id: pid, sale_id: sale.id, amount: paid, paid_at: a.p_paid_at || today(), kind: 'payment', method, reference: a.p_reference || '', created_at: now().toISOString() });
    sale.paid = round(sale.paid + paid);
    return pid;
  }
  function summary(day, wh = null) {
    const sales = rows('sales').filter(s => s.sold_at === day && (!wh || s.warehouse_id === wh));
    const payments = rows('sale_payments').filter(p => p.paid_at === day && (!wh || find('sales', p.sale_id).warehouse_id === wh));
    const cash_sales = round(sum(sales.filter(s => s.payment === 'cash' && s.payment_method === 'cash'), totalOf)
      - sum(payments.filter(p => p.kind === 'advance' && find('sales', p.sale_id).payment === 'cash'), p => p.amount));
    const credit_payments = sum(payments.filter(p => ['initial', 'payment'].includes(p.kind) && (p.method || 'cash') === 'cash'), p => p.amount);
    const customer_deposits = wh ? 0 : sum(rows('customer_deposits').filter(d => d.received_at === day), d => d.amount);
    const expenses = wh ? 0 : sum(rows('business_expenses').filter(d => d.paid_at === day), d => d.amount);
    const supplier_payments = wh ? 0 : sum(rows('purchase_payments').filter(d => d.paid_at === day), d => d.amount);
    return { business_date: day, exchange_rate: rows('settings')[0].usd_cdf, rate_date: rows('settings')[0].rate_date,
      cash_sales, credit_payments, customer_deposits, expenses, supplier_payments,
      cash_in: round(cash_sales + credit_payments + customer_deposits), cash_out: round(expenses + supplier_payments),
      closure: rows('cash_closures').find(c => c.business_date === day) || null, previous_close: null };
  }
  function closeCash(a, shop = false) {
    const wh = shop ? activeWarehouse(a.p_warehouse) : null, day = a.p_day || today();
    if (day !== today()) throw new Error('Clôturez uniquement la journée en cours.');
    if (!shop && rows('warehouses').some(w => w.active && !rows('cash_closures_shop').some(c => c.warehouse_id === w.id && c.business_date === day))) throw new Error('Clôturez d’abord chaque boutique.');
    const s = summary(day, wh), rate = s.exchange_rate;
    const opening_usd = amount(shop ? a.p_open_usd || 0 : a.p_opening_usd || 0, true);
    const opening_fc = amount(shop ? a.p_open_fc || 0 : a.p_opening_fc || 0, true);
    const counted_usd = amount(shop ? a.p_count_usd || 0 : a.p_counted_usd || 0, true);
    const counted_fc = amount(shop ? a.p_count_fc || 0 : a.p_counted_fc || 0, true);
    const expected_usd = round(opening_usd + opening_fc / rate + s.cash_in - s.cash_out);
    const counted_total_usd = round(counted_usd + counted_fc / rate);
    const table = shop ? 'cash_closures_shop' : 'cash_closures';
    const old = rows(table).find(c => c.business_date === day && (!shop || c.warehouse_id === wh));
    const { closure, previous_close, ...storedSummary } = s;
    const c = { id: old?.id || id('closure'), business_date: day, warehouse_id: wh, opening_usd, opening_fc, counted_usd, counted_fc, expected_usd,
      exchange_rate: rate, counted_total_usd, difference_usd: round(counted_total_usd - expected_usd), summary: storedSummary, note: String(a.p_note || '').slice(0, 500), closed_at: now().toISOString(), closed_by_name: 'Gérant Démo' };
    if (old) Object.assign(old, c); else rows(table).push(c);
    return shop ? s : summary(day);
  }
  const readRpcs = {
    article_total_stock: () => rows('articles').map(a => ({ article_id: a.id, total: a.stock })),
    credit_sales_all: () => rows('sales').filter(s => s.payment === 'credit').map(s => view('sales', s)),
    is_platform_admin: () => false,
    cash_close_summary: a => summary(a.p_day || today()),
    cash_close_summary_shop: a => summary(a.p_day || today(), a.p_warehouse),
    mobile_money_total: a => sum(rows('sales').filter(s => s.sold_at === a.p_day && s.payment_method === 'mobile_money' && (!a.p_warehouse || s.warehouse_id === a.p_warehouse)), totalOf)
      + sum(rows('sale_payments').filter(p => p.paid_at === a.p_day && p.method === 'mobile_money' && (!a.p_warehouse || find('sales', p.sale_id).warehouse_id === a.p_warehouse)), p => p.amount),
    search_sales: a => rows('sales').filter(s => JSON.stringify(saleView(s)).toLocaleLowerCase('fr').includes(String(a.p_term || '').toLocaleLowerCase('fr'))).slice(a.p_offset || 0, (a.p_offset || 0) + (a.p_limit || 50)).map(s => ({ id: s.id })),
    customer_debts: () => rows('customers').map(c => ({ customer_id: c.id, total_debt: sum(rows('sales').filter(s => s.customer_id === c.id), balance) }))
  };
  function rpc(fn, a) {
    if (fn === 'create_sale') return createDocument(a);
    if (fn === 'create_purchase') return createDocument(a, true);
    if (['record_credit_payment', 'record_credit_payment_method'].includes(fn)) return recordPayment(a);
    if (fn === 'save_cash_closure') return closeCash(a);
    if (fn === 'save_shop_closure') return closeCash(a, true);
    if (fn === 'mark_welcome_seen') return true;
    if (fn === 'create_credit_note') {
      if (a.p_id && rows('credit_notes').some(c => c.id === a.p_id)) return a.p_id;
      const sale = find('sales', a.p_sale), input = linesFrom(a.p_lines.map(l => ({ ...l, unit_price: 0 })), 'unit_price');
      const grouped = new Map();
      for (const l of input) grouped.set(l.article_id, (grouped.get(l.article_id) || 0) + l.qty);
      for (const [aid, qty] of grouped) {
        const sold = sum(sale.sale_lines.filter(l => l.article_id === aid), l => l.qty);
        const credited = sum(rows('credit_notes').filter(c => c.sale_id === sale.id).flatMap(c => c.credit_note_lines).filter(l => l.article_id === aid), l => l.qty);
        if (qty > sold - credited) throw new Error('Quantité supérieure à celle restant sur la facture.');
      }
      for (const l of input) l.unit_price = Math.max(...sale.sale_lines.filter(s => s.article_id === l.article_id).map(s => s.unit_price));
      const total = sum(input, l => l.qty * l.unit_price);
      if (total <= 0) throw new Error('Le montant de l’avoir doit être positif.');
      const cid = a.p_id || id('credit');
      rows('credit_notes').unshift({ id: cid, sale_id: sale.id, number: number('avoir', 'AV'), issued_on: today(), total_usd: total, note: a.p_note || '', vat_rate: sale.vat_rate ?? null, credit_note_lines: input });
      return cid;
    }
    if (fn === 'create_warehouse_transfer') {
      const from = activeWarehouse(a.p_from), to = activeWarehouse(a.p_to);
      if (from === to) throw new Error('Choisissez deux dépôts différents.');
      const lines = linesFrom(a.p_lines.map(l => ({ ...l, unit_price: 0 })), 'unit_price'), tid = id('transfer');
      for (const l of lines) { move(l.article_id, -l.qty, from, 'transfer', tid); move(l.article_id, l.qty, to, 'transfer', tid); }
      rows('transfers').unshift({ id: tid, number: number('transfer', 'TRF'), moved_at: a.p_date || today(), destination: find('warehouses', to).name, from_warehouse_id: from, to_warehouse_id: to, note: a.p_note || '', transfer_lines: lines });
      return tid;
    }
    if (fn === 'create_customer_deposit') {
      if (a.p_id && rows('customer_deposits').some(d => d.id === a.p_id)) return a.p_id;
      find('customers', a.p_customer_id);
      if (sum(rows('sales').filter(s => s.customer_id === a.p_customer_id), balance) > 0) throw new Error('Ce client doit d’abord régler sa dette.');
      const n = amount(a.p_amount), did = a.p_id || id('deposit');
      rows('customer_deposits').unshift({ id: did, customer_id: a.p_customer_id, receipt_number: number('deposit', 'AC'), amount: n, remaining: n, received_at: a.p_received_at || today() });
      return did;
    }
    if (fn === 'record_business_expense') {
      if (!a.p_label?.trim() || !a.p_category?.trim()) throw new Error('Complétez la description et la catégorie.');
      const eid = id('expense');
      rows('business_expenses').push({ id: eid, label: a.p_label, category: a.p_category, amount: amount(a.p_amount), paid_at: a.p_paid_at || today() });
      return eid;
    }
    if (fn === 'record_purchase_payment') {
      const purchase = find('purchases', a.p_purchase_id), n = amount(a.p_amount);
      const opening = rows('purchase_payment_balances').find(b => b.purchase_id === purchase.id)?.opening_balance;
      if (opening == null || n > round(opening - sum(rows('purchase_payments').filter(p => p.purchase_id === purchase.id), p => p.amount))) throw new Error('Le paiement dépasse le solde fournisseur.');
      const pid = a.p_id || id('supplier-payment');
      rows('purchase_payments').push({ id: pid, purchase_id: purchase.id, amount: n, paid_at: a.p_paid_at || today() });
      return pid;
    }
    if (fn === 'initialize_purchase_balance') {
      const p = find('purchases', a.p_purchase_id), opening_balance = amount(a.p_remaining, true);
      if (rows('purchase_payment_balances').some(b => b.purchase_id === p.id) || opening_balance > sum(p.purchase_lines, l => l.qty * l.unit_cost)) throw new Error('Solde initial invalide ou déjà renseigné.');
      rows('purchase_payment_balances').push({ id: id('balance'), purchase_id: p.id, opening_balance });
      return p.id;
    }
    if (['update_credit_payment', 'cancel_credit_payment'].includes(fn)) {
      const p = find('sale_payments', a.p_payment_id), sale = find('sales', p.sale_id);
      if (!['initial', 'payment'].includes(p.kind)) throw new Error('Paiement non modifiable.');
      const n = fn === 'cancel_credit_payment' ? 0 : amount(a.p_amount);
      if (n > balance(sale) + p.amount) throw new Error('Le paiement dépasse le solde.');
      sale.paid = round(sale.paid - p.amount + n);
      if (n) Object.assign(p, { amount: n, paid_at: a.p_paid_at || p.paid_at });
      else data.tables.sale_payments = rows('sale_payments').filter(row => row.id !== p.id);
      return sale.id;
    }
    if (['set_sale_pickup', 'set_sale_payment_method', 'set_initial_payment_method'].includes(fn)) {
      const sale = find('sales', a.p_sale);
      if (fn === 'set_sale_pickup') sale.to_pickup = !!a.p_pickup;
      else {
        if (!['cash', 'mobile_money', 'bank'].includes(a.p_method) || (a.p_method !== 'cash' && !a.p_reference?.trim())) throw new Error('Référence de paiement obligatoire.');
        const target = fn === 'set_initial_payment_method' ? rows('sale_payments').find(p => p.sale_id === sale.id && p.kind === 'initial') : sale;
        if (target) Object.assign(target, fn === 'set_sale_payment_method' ? { payment_method: a.p_method, payment_reference: a.p_reference } : { method: a.p_method, reference: a.p_reference });
      }
      return sale.id;
    }
    if (fn === 'update_sale') {
      const old = find('sales', a.p_id);
      if (rows('credit_notes').some(c => c.sale_id === old.id) || rows('sale_payments').some(p => p.sale_id === old.id)) throw new Error('Dans la démo, modifiez uniquement une vente sans paiement de crédit ni avoir.');
      for (const l of old.sale_lines) move(l.article_id, l.qty, old.warehouse_id, 'sale', old.id);
      data.tables.sales = rows('sales').filter(s => s.id !== old.id);
      const originalNumber = old.number;
      const sid = createDocument({ ...a, p_customer: a.p_customer ?? old.customer_id, p_warehouse: old.warehouse_id });
      find('sales', sid).number = originalNumber;
      return sid;
    }
    throw new Error('Cette action n’est pas proposée dans la démonstration.');
  }
  return {
    async select(table, query = '') {
      let list = table === 'profiles' ? [{ id: 'demo', org_id: 'demo', full_name: 'Gérant Démo', role: 'admin', organizations: rows('organizations')[0] }]
        : table === 'user_warehouses' ? [{ user_id: 'demo', warehouse_id: rows('warehouses')[0].id }]
          : table === 'sale_cost_snapshots' ? rows('sales').flatMap(s => s.sale_lines.map(l => ({ sale_line_id: l.id, unit_cost_at_sale: l.unit_cost_at_sale, cost_is_estimated: false })))
            : rows(table).map(row => view(table, row));
      const params = new URLSearchParams(query);
      for (const [column, filter] of params) {
        if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
        if (column === 'or') {
          const terms = filter.replace(/^\(|\)$/g, '').split(',');
          list = list.filter(row => terms.some(term => { const match = term.match(/^([\w.]+)\.ilike\.\*(.*)\*$/); return match && String(valueAt(row, match[1]) || '').toLowerCase().includes(match[2].toLowerCase()); }));
        } else list = list.filter(row => matches(valueAt(row, column), filter));
      }
      if (params.has('order')) {
        const order = params.get('order').split(',').map(part => part.split('.'));
        list.sort((a, b) => { for (const [key, dir] of order) { const x = a[key], y = b[key]; if (x === y) continue; return (x > y ? 1 : -1) * (dir === 'desc' ? -1 : 1); } return 0; });
      }
      const offset = Number(params.get('offset')) || 0, limit = Number(params.get('limit')) || list.length;
      return clone(list.slice(offset, offset + limit));
    },
    async rpc(fn, args = {}) {
      if (fn in readRpcs) return clone(readRpcs[fn](args));
      return transaction(() => rpc(fn, args));
    },
    async insert(table, input) {
      return transaction(() => {
        if (table === 'stock_moves') { move(input.article_id, Number(input.qty), activeWarehouse(input.warehouse_id), 'adjustment', id('adjust')); return [input]; }
        if (!['articles', 'customers', 'suppliers', 'warehouses', 'unit_options'].includes(table)) throw new Error('Ajout non proposé dans la démo.');
        if (table === 'articles' && rows(table).some(a => a.sku === input.sku)) throw new Error('Cette référence existe déjà.');
        const row = { id: id('row'), org_id: 'demo', version: 1, archived_at: null,
          ...(table === 'articles' ? { stock: 0, min_stock: 0 } : {}),
          ...(table === 'warehouses' ? { is_default: false, active: true } : {}), ...input };
        rows(table).push(row); return [row];
      });
    },
    async update(table, key, input, version) {
      return transaction(() => {
        if (!['articles', 'customers', 'suppliers', 'warehouses'].includes(table)) throw new Error('Modification non proposée dans la démo.');
        const row = find(table, key);
        if (version != null && row.version !== version) throw new Error('La fiche a changé. Rechargez-la.');
        if (table === 'articles' && rows(table).some(a => a.id !== key && (input.sku && a.sku === input.sku || input.barcode && a.barcode === input.barcode))) throw new Error('Référence ou code-barres déjà utilisé.');
        if (table === 'warehouses' && row.is_default && input.active === false) throw new Error('Le dépôt principal doit rester actif.');
        Object.assign(row, input, { version: (row.version || 0) + 1 }); return [row];
      });
    },
    async delete(table, key) {
      return transaction(() => {
        if (!['sales', 'purchases'].includes(table)) throw new Error('Suppression non proposée dans la démo.');
        const row = find(table, key);
        if (table === 'sales' && (rows('sale_payments').some(p => p.sale_id === key) || rows('credit_notes').some(p => p.sale_id === key))) throw new Error('Cette vente possède des versements ou des avoirs.');
        if (table === 'purchases' && rows('purchase_payments').some(p => p.purchase_id === key)) throw new Error('Cet achat possède des paiements.');
        for (const l of row[table === 'sales' ? 'sale_lines' : 'purchase_lines']) move(l.article_id, l.qty * (table === 'sales' ? 1 : -1), row.warehouse_id, table === 'sales' ? 'sale' : 'purchase', key);
        data.tables[table] = rows(table).filter(r => r.id !== key);
        if (table === 'purchases') data.tables.purchase_payment_balances = rows('purchase_payment_balances').filter(r => r.purchase_id !== key);
        return null;
      });
    },
    async upsert() { throw new Error('Cette configuration n’est pas modifiable dans la démo.'); }
  };
}

const valueAt = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
function matches(value, filter) {
  if (filter.startsWith('not.')) return !matches(value, filter.slice(4));
  const dot = filter.indexOf('.'), op = filter.slice(0, dot), expected = filter.slice(dot + 1);
  if (op === 'is') return expected === 'null' ? value == null : String(value) === expected;
  if (op === 'in') return expected.replace(/^\(|\)$/g, '').split(',').includes(String(value));
  if (op === 'eq') return String(value) === expected;
  if (op === 'neq') return String(value) !== expected;
  if (op === 'ilike') return String(value || '').toLocaleLowerCase('fr').includes(expected.replace(/\*/g, '').toLocaleLowerCase('fr'));
  let a = value, b = expected;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(a))) { a = String(a).length === 10 ? `${a}T00:00:00` : String(a); b = b.length === 10 ? `${b}T00:00:00` : b; }
  else if (typeof a === 'number') b = Number(b);
  return ({ gt: a > b, gte: a >= b, lt: a < b, lte: a <= b })[op] ?? false;
}
export const demoDb = createDemoDatabase();
export async function resetLocal(business = demoBusiness()) {
  clearDemoStorage();
  localStore.setItem('kp.demo.business', business in DEMO_BUSINESSES ? business : 'commerce');
  await Promise.all(['kapya-demo-offline', 'kapya-demo-local'].map(name => new Promise(resolve => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = resolve;
  })));
  location.href = '/demo/';
}
