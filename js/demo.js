// Mode local : base fictive stockée dans le navigateur (localStorage), sans Supabase.
const K = 'kp.local';
const seed = () => ({ n: 10,
  A: [{ id: '1', sku: 'RIZ-25', name: 'Riz parfumé 25 kg', unit: 'sac', price_buy: 38, price_sell: 45, stock: 42, min_stock: 10 },
      { id: '2', sku: 'HUI-5L', name: 'Huile végétale 5 L', unit: 'bidon', price_buy: 9.5, price_sell: 12, stock: 6, min_stock: 15 },
      { id: '3', sku: 'SUC-50', name: 'Sucre 50 kg', unit: 'sac', price_buy: 41, price_sell: 48, stock: 0, min_stock: 5 },
      { id: '4', sku: 'SAV-01', name: 'Savon de ménage', unit: 'carton', price_buy: 14, price_sell: 18, stock: 120, min_stock: 20 }],
  S: [{ id: 's1', name: 'Agro Kivu' }, { id: 's2', name: 'Maison Tembo' }], C: [{ id: 'c1', name: 'Boutique Amani' }, { id: 'c2', name: 'Restaurant Lac' }],
  P: [{ id: 'p1', number: 'FA-0042', bought_at: '2026-10-08', suppliers: { name: 'Agro Kivu' }, purchase_lines: [{ qty: 40, unit_cost: 38, articles: { sku: 'RIZ-25', name: 'Riz parfumé 25 kg', unit: 'sac' } }, { qty: 20, unit_cost: 9.5, articles: { sku: 'HUI-5L', name: 'Huile végétale 5 L', unit: 'bidon' } }] }],
  V: [{ id: 'v1', number: 'FV-0007', sold_at: '2026-10-12', customers: { name: 'Boutique Amani' }, sale_lines: [{ qty: 10, unit_price: 45, unit_cost_at_sale: 38, cost_is_estimated: false, sale_cost_snapshots: { unit_cost_at_sale: 38, cost_is_estimated: false }, articles: { sku: 'RIZ-25', name: 'Riz parfumé 25 kg', unit: 'sac', price_buy: 38 } }] }] });
let D; try { D = JSON.parse(localStorage.getItem(K)); } catch { /* stockage indisponible */ }
D = D || seed(); D.T = D.T || []; D.DP = D.DP || []; D.E = D.E || [];
D.CD = D.CD || [];
const save = () => { try { localStorage.setItem(K, JSON.stringify(D)); } catch { /* ignoré */ } };
export const resetLocal = () => { try { localStorage.removeItem(K); } catch { /* ignoré */ } location.reload(); };
const T = { suppliers: 'S', customers: 'C', purchases: 'P', sales: 'V', transfers: 'T' };
const doc = (a, list, key, party, pk, price) => {
  if (!a.p_lines.length) throw new Error('Ajoutez au moins une ligne.');
  a.p_lines.forEach(l => { if (list === 'V' && D.A.find(x => x.id === l.article_id).stock < l.qty) throw new Error('Stock insuffisant.'); });
  const total = Math.round(a.p_lines.reduce((sum, l) => sum + Number(l.qty) * Number(l[list === 'V' ? 'unit_price' : 'unit_cost']), 0) * 100) / 100;
  const advanceAmount = list === 'V' ? Math.round(Number(a.p_advance_amount || 0) * 100) / 100 : 0;
  const deposit = advanceAmount > 0 ? D.CD.find(x => x.id === a.p_deposit_id && x.customer_id === a.p_customer) : null;
  if (advanceAmount > 0 && (!deposit || advanceAmount > deposit.remaining || a.p_payment !== 'credit')) throw new Error('Acompte client introuvable ou solde insuffisant.');
  const initialPaid = list === 'V' ? (a.p_payment === 'credit' ? Math.min(Math.max(+a.p_paid || 0, 0), total) : Math.max(total - advanceAmount, 0)) : 0;
  if (initialPaid + advanceAmount > total + 0.005) throw new Error('Les montants versé et imputé dépassent le total de la facture.');
  a.p_lines.forEach(l => { D.A.find(x => x.id === l.article_id).stock += list === 'V' ? -l.qty : l.qty; });
  const o = { id: 'd' + (++D.n), number: a.p_number || 'FAC-' + String(D.n).padStart(5, '0'), [key]: a.p_date, customer_label: a.p_customer_label || null, payment: a.p_payment || 'cash',
    ...(list === 'V' ? { customer_id: a.p_customer || null, paid: initialPaid + advanceAmount, sale_payments: [] } : { payment_balance_opening: total }),
    [party]: { name: D[pk].find(x => x.id === a[price])?.name || a.p_customer_label || 'Client comptoir' }, [list === 'V' ? 'sale_lines' : 'purchase_lines']: a.p_lines.map(l => { const x = D.A.find(y => y.id === l.article_id), unitCost = Number(x.price_buy || 0); return { ...l, ...(list === 'V' ? { unit_cost_at_sale: unitCost, cost_is_estimated: false, sale_cost_snapshots: { unit_cost_at_sale: unitCost, cost_is_estimated: false } } : {}), articles: { sku: x.sku, name: x.name, unit: x.unit, price_buy: x.price_buy } }; }) };
  if (list === 'V' && o.payment === 'credit' && initialPaid > 0) o.sale_payments.push({ id: 'cp' + (++D.n), amount: initialPaid, paid_at: a.p_date, kind: 'initial', created_at: new Date().toISOString() });
  if (advanceAmount > 0) { deposit.remaining = Math.round((deposit.remaining - advanceAmount) * 100) / 100; o.sale_payments.push({ id: 'cp' + (++D.n), amount: advanceAmount, paid_at: a.p_date, kind: 'advance', created_at: new Date().toISOString() }); }
  D[list].unshift(o); save(); return o.id;
};
const updateSale = a => {
  const s = D.V.find(v => v.id === a.p_id); if (!s) throw new Error('Facture introuvable.');
  const old = {}; (s.sale_lines || []).forEach(l => { if (l.article_id) old[l.article_id] = (old[l.article_id] || 0) + +l.qty; });
  a.p_lines.forEach(l => { const x = D.A.find(y => y.id === l.article_id); if (x.stock + (old[l.article_id] || 0) < l.qty) throw new Error(`Stock insuffisant pour ${x.name} : ${x.stock + (old[l.article_id] || 0)} ${x.unit} disponible(s).`); });
  Object.entries(old).forEach(([id, q]) => { D.A.find(y => y.id === id).stock += q; });
  a.p_lines.forEach(l => { D.A.find(y => y.id === l.article_id).stock -= +l.qty; });
  s.sold_at = a.p_date; s.payment = a.p_payment; s.customer_label = a.p_customer_label || null;
  s.customers = { name: (D.C.find(c => c.id === a.p_customer) || {}).name || a.p_customer_label || 'Client comptoir' };
  s.sale_lines = a.p_lines.map(l => { const x = D.A.find(y => y.id === l.article_id), unitCost = Number(x.price_buy || 0); return { article_id: l.article_id, qty: +l.qty, unit_price: +l.unit_price, unit_cost_at_sale: unitCost, cost_is_estimated: false, sale_cost_snapshots: { unit_cost_at_sale: unitCost, cost_is_estimated: false }, articles: { sku: x.sku, name: x.name, unit: x.unit, price_buy: x.price_buy } }; });
  s.paid = a.p_payment === 'credit' ? Math.min(Math.max(+a.p_paid || 0, 0), s.sale_lines.reduce((t, l) => t + l.qty * l.unit_price, 0)) : s.sale_lines.reduce((t, l) => t + l.qty * l.unit_price, 0);
  save(); return a.p_id;
};
const transfer = a => {
  if (!a.p_lines.length) throw new Error('Ajoutez au moins un produit.');
  a.p_lines.forEach(l => { const x = D.A.find(y => y.id === l.article_id); if (x.stock < l.qty) throw new Error(`Stock insuffisant pour ${x.name} : ${x.stock} ${x.unit} disponible(s).`); });
  a.p_lines.forEach(l => { D.A.find(y => y.id === l.article_id).stock -= +l.qty; });
  const o = { id: 't' + (++D.n), number: 'TRF-' + String(D.T.length + 1).padStart(5, '0'), destination: a.p_destination, moved_at: a.p_date, note: a.p_note || null, created_by: 'demo',
    transfer_lines: a.p_lines.map(l => { const x = D.A.find(y => y.id === l.article_id); return { qty: +l.qty, articles: { sku: x.sku, name: x.name, unit: x.unit } }; }) };
  D.T.unshift(o); save(); return o.id;
};
const recordCreditPayment = a => {
  const sale = D.V.find(x => x.id === a.p_sale_id);
  if (!sale || sale.payment !== 'credit') throw new Error('Facture à crédit introuvable.');
  const total = Math.round((sale.sale_lines || []).reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_price), 0) * 100) / 100;
  const amount = Math.round(Number(a.p_amount) * 100) / 100;
  if (!(amount > 0)) throw new Error('Le montant doit être supérieur à zéro.');
  if (amount > total - Number(sale.paid || 0) + 0.005) throw new Error('Le paiement dépasse le solde restant.');
  sale.paid = Number(sale.paid || 0) + amount;
  sale.sale_payments ||= [];
  sale.sale_payments.push({ id: 'cp' + (++D.n), amount, paid_at: a.p_paid_at || new Date().toLocaleDateString('sv-SE'), kind: 'payment', created_at: new Date().toISOString() });
  save(); return sale.id;
};
const createCustomerDeposit = a => {
  const customer = D.C.find(c => c.id === a.p_customer_id);
  const amount = Math.round(Number(a.p_amount) * 100) / 100;
  if (!customer) throw new Error('Choisissez un client enregistré.');
  if (!(amount > 0)) throw new Error('Le montant doit être supérieur à zéro.');
  const debt = D.V.filter(s => s.customer_id === customer.id && s.payment === 'credit').reduce((sum, sale) => {
    const total = (sale.sale_lines || []).reduce((acc, line) => acc + Number(line.qty) * Number(line.unit_price), 0);
    return sum + Math.max(total - Number(sale.paid || 0), 0);
  }, 0);
  if (debt > 0.005) throw new Error(`Dépôt impossible : ce client doit d’abord régler sa dette restante de ${debt.toFixed(2)}.`);
  const number = D.CD.length + 1;
  const row = { id: 'cd' + (++D.n), customer_id: customer.id, customers: customer, receipt_number: 'AC-' + String(number).padStart(6, '0'), amount, remaining: amount, received_at: a.p_received_at || new Date().toLocaleDateString('sv-SE') };
  D.CD.unshift(row); save(); return row.id;
};
const updateCreditPayment = a => {
  const sale = D.V.find(x => x.payment === 'credit' && (x.sale_payments || []).some(p => p.id === a.p_payment_id));
  const payment = sale?.sale_payments.find(p => p.id === a.p_payment_id && ['payment', 'initial'].includes(p.kind));
  if (!sale || !payment) throw new Error('Paiement introuvable ou non modifiable.');
  const amount = Math.round(Number(a.p_amount) * 100) / 100;
  const total = Math.round((sale.sale_lines || []).reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_price), 0) * 100) / 100;
  if (!(amount > 0) || Number(sale.paid || 0) - Number(payment.amount) + amount > total + 0.005) throw new Error('Montant invalide ou supérieur au total de la facture.');
  sale.paid = Number(sale.paid || 0) - Number(payment.amount) + amount;
  payment.amount = amount; payment.paid_at = a.p_paid_at || payment.paid_at;
  save(); return sale.id;
};
const cancelCreditPayment = a => {
  const sale = D.V.find(x => x.payment === 'credit' && (x.sale_payments || []).some(p => p.id === a.p_payment_id));
  const index = sale?.sale_payments.findIndex(p => p.id === a.p_payment_id && ['payment', 'initial'].includes(p.kind)) ?? -1;
  if (!sale || index < 0) throw new Error('Paiement introuvable ou non annulable.');
  sale.paid = Math.max(Number(sale.paid || 0) - Number(sale.sale_payments[index].amount), 0);
  sale.sale_payments.splice(index, 1); save(); return sale.id;
};
const recordPurchasePayment = a => {
  const purchase = D.P.find(p => p.id === a.p_purchase_id); if (!purchase) throw new Error('Facture fournisseur introuvable.');
  if (purchase.payment_balance_opening == null) throw new Error('Initialisez d’abord le solde restant de cette ancienne facture.');
  const paid = D.DP.filter(p => p.purchase_id === purchase.id).reduce((sum, p) => sum + Number(p.amount), 0);
  const amount = Math.round(Number(a.p_amount) * 100) / 100;
  if (!(amount > 0) || amount > Number(purchase.payment_balance_opening) - paid + .005) throw new Error('Le paiement dépasse le solde fournisseur restant.');
  D.DP.push({ id: 'pp' + (++D.n), purchase_id: purchase.id, amount, paid_at: a.p_paid_at || new Date().toLocaleDateString('sv-SE') }); save(); return purchase.id;
};
const initializePurchaseBalance = a => {
  const purchase = D.P.find(p => p.id === a.p_purchase_id); if (!purchase) throw new Error('Facture fournisseur introuvable.');
  const total = (purchase.purchase_lines || []).reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_cost), 0);
  const balance = Math.round(Number(a.p_remaining) * 100) / 100;
  if (purchase.payment_balance_opening != null || balance < 0 || balance > total) throw new Error('Le solde initial est invalide ou déjà renseigné.');
  purchase.payment_balance_opening = balance; save(); return purchase.id;
};
const recordExpense = a => {
  const amount = Math.round(Number(a.p_amount) * 100) / 100;
  if (!a.p_label?.trim() || !a.p_category?.trim() || !(amount > 0)) throw new Error('Complétez la description, la catégorie et un montant positif.');
  const row = { id: 'e' + (++D.n), label: a.p_label.trim(), category: a.p_category.trim(), amount, paid_at: a.p_paid_at || new Date().toLocaleDateString('sv-SE') };
  D.E.push(row); save(); return row.id;
};
export const demoDb = {
  select: async (t, q = '') => { const m = q.match(/id=eq\.([^&]+)/); let list = t === 'articles' ? [...D.A].sort((a, b) => a.name.localeCompare(b.name)) : t === 'settings' ? (D.R ? [D.R] : []) : t === 'customer_deposits' ? D.CD : t === 'business_expenses' ? D.E : t === 'purchase_payments' ? D.DP.map(p => ({ ...p, purchases: D.P.find(x => x.id === p.purchase_id) })) : t === 'sale_payments' ? D.V.flatMap(s => (s.sale_payments || []).map(p => ({ ...p, sale_id: p.sale_id || s.id, sales: s }))) : (D[T[t]] || []); if (t === 'purchases') list = list.map(p => ({ ...p, purchase_payments: D.DP.filter(x => x.purchase_id === p.id), purchase_payment_balances: p.payment_balance_opening == null ? null : { opening_balance: p.payment_balance_opening } })); const cm = q.match(/customer_id=eq\.([^&]+)/); if (cm) list = list.filter(x => x.customer_id === cm[1]); const pm = q.match(/payment=eq\.([^&]+)/); if (pm) list = list.filter(x => x.payment === pm[1]); if (q.includes('remaining=gt.0')) list = list.filter(x => x.remaining > 0); if (q.includes('purchase_payment_balances=is.null')) list = list.filter(x => x.purchase_payment_balances == null); for (const [, col, op, value] of q.matchAll(/(?:^|&)([a-z_]+)=(gte|lte)\.([^&]+)/g)) list = list.filter(x => op === 'gte' ? String(x[col] || '') >= value : String(x[col] || '') <= value); return m ? list.filter(x => x.id === m[1]) : list; },
  insert: async (t, r) => {
    if (t === 'articles') { if (D.A.some(a => a.sku === r.sku)) throw new Error('duplicate key'); const x = { id: 'a' + (++D.n), stock: 0, ...r }; D.A.push(x); save(); return [x]; }
    if (t === 'stock_moves') D.A.find(a => a.id === r.article_id).stock += r.qty;
    else if (T[t]) D[T[t]].push({ id: 'x' + (++D.n), ...r });
    save(); return [r];
  },
  delete: async (t, id) => {
    const list = T[t] === 'V' || T[t] === 'P' ? D[T[t]] : null;
    if (!list) return;
    const i = list.findIndex(x => x.id === id); if (i < 0) return;
    const pièce = list[i], isSale = T[t] === 'V';
    (pièce[isSale ? 'sale_lines' : 'purchase_lines'] || []).forEach(l => { const a = D.A.find(x => x.id === l.article_id); if (a) a.stock += isSale ? +l.qty : -(+l.qty); });
    list.splice(i, 1); save();
  },
  upsert: async (t, r) => { if (t === 'settings') { D.R = r; save(); } return [r]; },
  update: async (t, id, r) => {
    if (t === 'articles' && D.A.some(a => a.id !== id && a.sku === r.sku)) throw new Error('duplicate key');
    const article = t === 'articles' ? D.A.find(a => a.id === id) : null;
    const party = T[t] ? D[T[t]].find(x => x.id === id) : null;
    const row = article || party;
    if (!row) throw new Error('Fiche introuvable.');
    Object.assign(row, r); save(); return [row];
  },
  rpc: async (fn, a) => fn === 'record_credit_payment' ? recordCreditPayment(a) : fn === 'update_credit_payment' ? updateCreditPayment(a) : fn === 'cancel_credit_payment' ? cancelCreditPayment(a) : fn === 'create_customer_deposit' ? createCustomerDeposit(a) : fn === 'initialize_purchase_balance' ? initializePurchaseBalance(a) : fn === 'record_purchase_payment' ? recordPurchasePayment(a) : fn === 'record_business_expense' ? recordExpense(a) : fn === 'update_sale' ? updateSale(a) : fn === 'create_transfer' ? transfer(a) : fn === 'create_purchase' ? doc(a, 'P', 'bought_at', 'suppliers', 'S', 'p_supplier') : fn === 'create_sale' ? doc(a, 'V', 'sold_at', 'customers', 'C', 'p_customer') : 'local',
};
