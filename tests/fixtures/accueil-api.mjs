// API simulée pour le tableau de bord : aucune donnée réelle, aucun accès réseau.
export const fixture = { sales: [], pendingSales: [], expenses: [], payments: [], deposits: [], moves: [], blocks: null, calls: [], failTables: [], failBefore: null, holdBefore: null, pendingReads: [] };

export const session = () => ({ uid: 'dash-user' });
export const pendingFor = async table => (table === 'sales' ? fixture.pendingSales.slice() : []);
export const pendingCount = async () => fixture.pendingSales.length;
export const pendingOps = async () => [];
export const rejectedItems = async () => [];
export const lastSyncTime = () => null;
export const retryRejected = async () => {};
export const discardRejected = async () => {};
export const syncNow = async () => {};
export const selectArticlesWithTotal = async () => [];

const pad = value => String(value).padStart(2, '0');
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const resetDashboard = () => {
  Object.assign(fixture, { sales: [], pendingSales: [], expenses: [], payments: [], deposits: [], moves: [], blocks: null, calls: [], failTables: [], failBefore: null, holdBefore: null, pendingReads: [] });
};

export const addSale = (options = {}) => {
  const id = fixture.sales.length + 1;
  const line = { id: `l${id}`, qty: options.qty ?? 1, unit_price: options.unit ?? 10 };
  fixture.sales.push({
    id: `s${id}`,
    number: `TEST-${id}`,
    warehouse_id: options.warehouseId ?? 'w1',
    sold_at: options.soldAt ?? localToday(),
    payment: options.payment ?? 'cash',
    payment_method: options.method ?? 'cash',
    paid: options.paid ?? line.qty * line.unit_price,
    sale_lines: [line]
  });
  return `s${id}`;
};

// Vente saisie hors ligne : présente dans la file d'attente, pas encore au serveur.
export const addPendingSale = (options = {}) => {
  const id = fixture.pendingSales.length + 1;
  fixture.pendingSales.push({
    seq: 100 + id,
    fn: 'create_sale',
    status: 'queued',
    body: {
      p_number: `ATT-${id}`,
      p_id: `pend-${id}`,
      p_date: options.soldAt ?? localToday(),
      p_payment: options.payment ?? 'cash',
      p_paid: options.paid ?? 0,
      p_customer_label: options.customer ?? '',
      p_warehouse: options.warehouseId ?? 'w1',
      p_lines: [{ article_id: options.articleId ?? 'a1', qty: options.qty ?? 1, unit_price: options.unit ?? 10 }]
    }
  });
  return `pend-${id}`;
};

export const addPayment = (options = {}) => {
  fixture.payments.push({
    id: `p${fixture.payments.length + 1}`,
    sale_id: options.saleId,
    amount: options.amount ?? 5,
    kind: options.kind ?? 'payment',
    paid_at: options.paidAt ?? localToday()
  });
};

export const addExpense = (options = {}) => {
  fixture.expenses.push({
    id: `e${fixture.expenses.length + 1}`,
    label: options.label ?? 'Dépense test',
    category: options.category ?? 'Divers',
    amount: options.amount ?? 5,
    paid_at: options.paidAt ?? localToday()
  });
};

export const db = {
  async select(table, query = '') {
    fixture.calls.push({ table, query });
    const startDate = query.match(/(?:sold_at|paid_at|received_at)=gte\.([^&]+)/)?.[1]?.slice(0, 10);
    if (fixture.failTables.includes(table) || (fixture.failBefore && startDate && startDate < fixture.failBefore)) throw new Error('Source indisponible (test)');
    if (fixture.holdBefore && startDate && startDate < fixture.holdBefore) await new Promise(resolve => fixture.pendingReads.push(resolve));
    if (table === 'profiles') return [{ org_id: 'o1', full_name: 'Test Admin' }];
    if (table === 'organizations') return [{ name: 'Entreprise test' }];
    if (table === 'warehouses') return [{ id: 'w1', name: 'Dépôt principal', is_default: true }];
    if (table === 'dashboard_preferences') return fixture.blocks ? [{ blocks: fixture.blocks }] : [];
    if (table === 'stock_moves') return structuredClone(fixture.moves);
    if (table === 'sale_payments' || table === 'customer_deposits') {
      const dateKey = table === 'sale_payments' ? 'paid_at' : 'received_at';
      const from = query.match(new RegExp(`${dateKey}=gte\\.([^&]+)`))?.[1];
      const to = query.match(new RegExp(`${dateKey}=lt\\.([^&]+)`))?.[1];
      const day = query.match(new RegExp(`${dateKey}=eq\\.([^&]+)`))?.[1];
      const kinds = query.match(/kind=in\.\(([^)]+)\)/)?.[1].split(',');
      const rows = table === 'sale_payments' ? fixture.payments : fixture.deposits;
      return structuredClone(rows.filter(row => {
        const date = String(row[dateKey]).slice(0, 10);
        return (!from || date >= from.slice(0, 10)) && (!to || date < to.slice(0, 10))
          && (!day || date === day) && (!kinds || kinds.includes(row.kind));
      }));
    }
    if (table === 'business_expenses') {
      const from = query.match(/paid_at=gte\.([^&]+)/)?.[1];
      const to = query.match(/paid_at=lt\.([^&]+)/)?.[1];
      return structuredClone(fixture.expenses.filter(expense => (!from || expense.paid_at >= from) && (!to || expense.paid_at < to)));
    }
    if (table === 'sales') {
      let rows = fixture.sales.slice();
      const from = query.match(/sold_at=gte\.([^&]+)/)?.[1];
      const to = query.match(/sold_at=lt\.([^&]+)/)?.[1];
      const payment = query.match(/payment=eq\.(\w+)/)?.[1];
      const warehouse = query.match(/(?:^|&)warehouse_id=eq\.([^&]+)/)?.[1];
      if (warehouse) rows = rows.filter(sale => sale.warehouse_id === warehouse);
      if (payment) rows = rows.filter(sale => sale.payment === payment);
      if (from) rows = rows.filter(sale => String(sale.sold_at).slice(0, 10) >= from);
      if (to) rows = rows.filter(sale => String(sale.sold_at).slice(0, 10) < to);
      rows.sort((a, b) => String(a.sold_at).localeCompare(String(b.sold_at)));
      if (query.includes('order=sold_at.desc')) rows.reverse();
      return structuredClone(rows);
    }
    return [];
  }
};
