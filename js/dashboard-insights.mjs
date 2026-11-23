// Compléments de lecture des présentations modernes, sans écriture ni préférence.
import { creditBalance } from './sale-math.js';

export const METRIC_LABELS = {
  revenue: 'Chiffre d’affaires',
  cashSales: 'Ventes cash',
  creditSales: 'Ventes à crédit',
  paymentsReceived: 'Paiements reçus',
  gross: 'Bénéfice brut',
  netProfit: 'Résultat net',
  cashIn: 'Entrées de trésorerie',
  cashOut: 'Sorties de trésorerie',
  cashNet: 'Flux net de trésorerie',
  stockValue: 'Valeur du stock',
  outstanding: 'Créances clients restantes'
};

const day = value => String(value || '').slice(0, 10);
const linesTotal = sale => (sale.sale_lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unit_price || 0), 0);
const amounts = rows => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
const saleCost = (sale, costs) => (sale.sale_lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(costs.get(line.id)?.unit_cost_at_sale ?? 0), 0);

// Dates calendaires UTC uniquement pour mesurer la durée : aucun décalage heure d'été.
export function previousPeriod(from, to) {
  const parse = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Période invalide');
    const valueMs = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(valueMs) || new Date(valueMs).toISOString().slice(0, 10) !== value) throw new Error('Période invalide');
    return valueMs;
  };
  const start = parse(from), end = parse(to);
  if (end < start) throw new Error('Période invalide');
  const duration = end - start + 86400000;
  return {
    from: new Date(start - duration).toISOString().slice(0, 10),
    to: new Date(start - 86400000).toISOString().slice(0, 10)
  };
}

export function relativeChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return { kind: 'unavailable' };
  const delta = current - previous;
  if (Math.abs(delta) < .005) return { kind: 'stable', delta: 0, percent: 0 };
  if (Math.abs(previous) < .005) return { kind: 'zero-base', delta };
  return { kind: 'change', delta, percent: delta / Math.abs(previous) * 100 };
}

// Mêmes définitions que les indicateurs de la période courante. null = source absente,
// jamais assimilée à une liste vide ou à un montant nul.
export function periodFigures({ sales, payments, deposits, expenses, supplierPayments, creditIds, costs, costsAvailable, canSeeCosts }) {
  const validSales = Array.isArray(sales);
  const cash = validSales ? sales.filter(sale => sale.payment !== 'credit') : null;
  const receipts = Array.isArray(payments) ? payments.filter(payment => ['initial', 'payment'].includes(payment.kind) && creditIds.has(payment.sale_id)) : null;
  const figures = {
    revenue: validSales ? sales.reduce((sum, sale) => sum + linesTotal(sale), 0) : null,
    cashSales: cash ? cash.reduce((sum, sale) => sum + linesTotal(sale), 0) : null,
    creditSales: validSales ? sales.filter(sale => sale.payment === 'credit').reduce((sum, sale) => sum + linesTotal(sale), 0) : null,
    paymentsReceived: receipts ? amounts(receipts) : null
  };
  if (!canSeeCosts) return figures;
  const advance = validSales && Array.isArray(payments)
    ? amounts(payments.filter(payment => payment.kind === 'advance' && cash.some(sale => sale.id === payment.sale_id))) : null;
  figures.gross = validSales && costsAvailable ? figures.revenue - sales.reduce((sum, sale) => sum + saleCost(sale, costs), 0) : null;
  figures.netProfit = figures.gross !== null && Array.isArray(expenses) ? figures.gross - amounts(expenses) : null;
  figures.cashIn = advance !== null && Array.isArray(deposits)
    ? figures.cashSales - advance + amounts(payments.filter(payment => payment.kind !== 'advance')) + amounts(deposits) : null;
  figures.cashOut = Array.isArray(expenses) && Array.isArray(supplierPayments) ? amounts(expenses) + amounts(supplierPayments) : null;
  figures.cashNet = figures.cashIn !== null && figures.cashOut !== null ? figures.cashIn - figures.cashOut : null;
  return figures;
}

// Détails issus exclusivement des lignes déjà lues pour le tableau de bord.
export function modernDetails(model, source) {
  const { sales, credits, payments, deposits, supplierPayments, expenses, articles, costs, pending } = source;
  const creditById = new Map(credits.map(sale => [sale.id, sale]));
  const salesRows = rows => rows.map(sale => ({
    date: day(sale.sold_at),
    label: [sale.number, sale.customers?.name || sale.customer_label].filter(Boolean).join(' · '),
    amount: linesTotal(sale)
  }));
  const paymentRows = payments.filter(payment => ['initial', 'payment'].includes(payment.kind) && creditById.has(payment.sale_id)).map(payment => ({
    date: day(payment.paid_at), label: creditById.get(payment.sale_id).number || 'Paiement de crédit', amount: Number(payment.amount || 0)
  }));
  const details = {};
  const add = (key, rows, available = true, current = false) => {
    details[key] = { title: METRIC_LABELS[key], total: model[key], rows, available, current };
  };
  add('revenue', salesRows(sales));
  add('cashSales', salesRows(sales.filter(sale => sale.payment !== 'credit')));
  add('creditSales', salesRows(sales.filter(sale => sale.payment === 'credit')));
  add('paymentsReceived', paymentRows, model.paymentsAvailable);
  add('outstanding', credits.map(sale => ({
    date: day(sale.sold_at), label: sale.number || 'Vente à crédit',
    amount: creditBalance(linesTotal(sale), Number(sale.paid || 0), Number(sale.credit_notes_total || 0))
  })).filter(row => row.amount > 0), true, true);
  if (!model.canSeeCosts) return details;
  const expenseRows = expenses.map(expense => ({ date: day(expense.paid_at), label: expense.label || 'Dépense', amount: Number(expense.amount || 0) }));
  const supplierRows = supplierPayments.map(payment => ({ date: day(payment.paid_at), label: payment.purchases?.number || 'Fournisseur', amount: Number(payment.amount || 0) }));
  const grossRows = salesRows(sales).map((row, index) => ({ ...row, amount: row.amount - saleCost(sales[index], costs) }));
  const cashIds = new Set(sales.filter(sale => sale.payment !== 'credit').map(sale => sale.id));
  const inflows = [
    ...salesRows(sales.filter(sale => sale.payment !== 'credit')),
    ...payments.filter(payment => payment.kind !== 'advance').map(payment => ({
      date: day(payment.paid_at), label: creditById.get(payment.sale_id)?.number || 'Paiement de crédit', amount: Number(payment.amount || 0)
    })),
    ...payments.filter(payment => payment.kind === 'advance' && cashIds.has(payment.sale_id)).map(payment => ({
      date: day(payment.paid_at), label: 'Imputation d’acompte', amount: -Number(payment.amount || 0)
    })),
    ...deposits.map(deposit => ({ date: day(deposit.received_at), label: 'Acompte client reçu', amount: Number(deposit.amount || 0) }))
  ];
  add('gross', grossRows, model.saleCostsAvailable);
  add('netProfit', [...grossRows, ...expenseRows.map(row => ({ ...row, amount: -row.amount }))], model.saleCostsAvailable);
  add('cashIn', inflows);
  add('cashOut', [...supplierRows, ...expenseRows]);
  add('cashNet', [
    ...inflows, ...[...supplierRows, ...expenseRows].map(row => ({ ...row, amount: -row.amount })),
    ...(pending.cash || pending.receipts ? [{ date: '', label: 'En attente d’envoi', amount: pending.cash + pending.receipts }] : [])
  ]);
  add('stockValue', articles.map(article => ({
    date: '', label: `${article.name || article.sku || 'Article'} · ${Number(article.stock || 0)} ${article.unit || ''}`,
    amount: Number(article.stock || 0) * Number(article.price_buy || 0)
  })), true, true);
  details.stockValue.scope = 'all';
  return details;
}
