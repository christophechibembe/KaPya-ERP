// API simulée pour le tableau de bord : aucune donnée réelle, aucun accès réseau.
export const fixture = { sales: [], expenses: [], payments: [], deposits: [], moves: [], blocks: null, calls: [] };

export const session = () => ({ uid: 'dash-user' });
export const pendingFor = async () => [];
export const pendingCount = async () => 0;
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
  Object.assign(fixture, { sales: [], expenses: [], payments: [], deposits: [], moves: [], blocks: null, calls: [] });
};

export const addSale = (options = {}) => {
  const id = fixture.sales.length + 1;
  const line = { id: `l${id}`, qty: options.qty ?? 1, unit_price: options.unit ?? 10 };
  fixture.sales.push({
    id: `s${id}`,
    number: `TEST-${id}`,
    sold_at: options.soldAt ?? localToday(),
    payment: options.payment ?? 'cash',
    payment_method: options.method ?? 'cash',
    paid: options.paid ?? line.qty * line.unit_price,
    sale_lines: [line]
  });
  return `s${id}`;
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
