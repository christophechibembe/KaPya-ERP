// API simulée pour le tableau de bord : aucune donnée réelle, aucun accès réseau.
export const fixture = { sales: [], calls: [] };

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

export const resetDashboard = () => { fixture.sales = []; fixture.calls = []; };

export const addSale = (options = {}) => {
  const id = fixture.sales.length + 1;
  const line = { id: `l${id}`, qty: options.qty ?? 1, unit_price: options.unit ?? 10 };
  fixture.sales.push({
    id: `s${id}`,
    number: `TEST-${id}`,
    sold_at: options.soldAt ?? localToday(),
    payment: options.payment ?? 'cash',
    paid: line.qty * line.unit_price,
    sale_lines: [line]
  });
};

export const db = {
  async select(table, query = '') {
    fixture.calls.push({ table, query });
    if (table === 'profiles') return [{ org_id: 'o1', full_name: 'Test Admin' }];
    if (table === 'organizations') return [{ name: 'Entreprise test' }];
    if (table === 'warehouses') return [{ id: 'w1', name: 'Dépôt principal', is_default: true }];
    if (table === 'dashboard_preferences') return [];
    if (table === 'sales') {
      let rows = fixture.sales.slice();
      const from = query.match(/sold_at=gte\.([^&]+)/)?.[1];
      const to = query.match(/sold_at=lt\.([^&]+)/)?.[1];
      const payment = query.match(/payment=eq\.(\w+)/)?.[1];
      if (payment) rows = rows.filter(sale => sale.payment === payment);
      if (from) rows = rows.filter(sale => String(sale.sold_at).slice(0, 10) >= from);
      if (to) rows = rows.filter(sale => String(sale.sold_at).slice(0, 10) < to);
      return structuredClone(rows);
    }
    return [];
  }
};
