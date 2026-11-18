// Données et RPC de test uniquement. Aucun accès Supabase, aucune donnée de production.
const articles = Array.from({ length: 80 }, (_, i) => ({
  id: `a${i + 1}`, sku: `TEST-${i + 1}`, name: `Article de test ${String(i + 1).padStart(2, '0')}`,
  unit: 'pce', price_sell: 10, barcode: `1000000${i}`, unit_weight: 0
}));
export const fixture = {};
export function resetFixture(options = {}) {
  Object.assign(fixture, {
    articles: structuredClone(articles),
    customers: [{ id: 'c1', name: 'Client test', phone: '0811111111' }, { id: 'c2', name: 'Client test', phone: '0822222222' }],
    shops: [{ id: 'w1', name: 'Dépôt principal', is_default: true }, { id: 'w2', name: 'Dépôt secondaire' }],
    assignments: [{ warehouse_id: 'w1' }],
    deposits: [{ id: 'd1', customer_id: 'c1', receipt_number: 'AC-TEST-1', remaining: 40 }],
    stock: { w1: 100, w2: 1 }, stockByArticle: {}, calls: [], printed: [], tasks: [],
    discounts: false, barcode: false, failSale: false, failStock: false, failDeposits: false, failPrint: false, printGate: null,
    holdSale: false, releaseSale: null, stockGates: {}, depositGates: {},
    ...options
  });
}
resetFixture();
export const session = () => ({ uid: 'test-user' });
export const newId = () => crypto.randomUUID();
export const takeInvoiceNumber = () => null;
export const pendingCount = async () => fixture.pending || 0;
export const rejectedItems = async () => [];
export const db = {
  select(table, query = '') {
    const task = (async () => {
      if (table === 'articles') return structuredClone(fixture.articles);
      if (table === 'customers') return structuredClone(fixture.customers);
      if (table === 'warehouses') return structuredClone(fixture.shops);
      if (table === 'profiles') {
        if (query.includes('receipt_footer') && fixture.printGate) await fixture.printGate;
        return [{ organizations: { name: 'Entreprise de test', discounts_enabled: fixture.discounts, barcode_enabled: fixture.barcode } }];
      }
      if (table === 'user_warehouses') return structuredClone(fixture.assignments);
      if (table === 'stock_lots') return [];
      if (table === 'warehouse_stock') {
        const wh = query.match(/warehouse_id=eq\.([^&]+)/)?.[1];
        if (fixture.stockGates[wh]) await fixture.stockGates[wh];
        if (fixture.failStock) throw new Error('Stock indisponible (test).');
        return fixture.articles.map(a => ({ article_id: a.id, qty: fixture.stockByArticle[`${wh}/${a.id}`] ?? fixture.stock[wh] ?? 0 }));
      }
      if (table === 'customer_deposits') {
        const cid = query.match(/customer_id=eq\.([^&]+)/)?.[1];
        if (fixture.depositGates[cid]) await fixture.depositGates[cid];
        if (fixture.failDeposits) throw new Error('Acomptes indisponibles (test).');
        return structuredClone(fixture.deposits.filter(d => d.customer_id === cid && d.remaining > 0));
      }
      if (table === 'sales') return [{ number: 'TEST-0001' }];
      return [];
    })();
    fixture.tasks.push(task);
    return task;
  },
  async rpc(fn, payload) {
    fixture.calls.push({ fn, payload: structuredClone(payload) });
    if (fn === 'create_sale') {
      if (fixture.holdSale) await new Promise(resolve => { fixture.releaseSale = resolve; });
      if (fixture.failSale) throw new Error('Vente refusée (test).');
      for (const line of payload.p_lines) {
        const key = `${payload.p_warehouse}/${line.article_id}`;
        fixture.stockByArticle[key] = (fixture.stockByArticle[key] ?? fixture.stock[payload.p_warehouse]) - line.qty;
      }
      const deposit = fixture.deposits.find(d => d.id === payload.p_deposit_id);
      if (deposit) deposit.remaining -= payload.p_advance_amount;
      return 'sale-test';
    }
    return true;
  }
};
