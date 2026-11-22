// Comptabilité simplifiée : journal, balance et TVA à partir des ventes, achats et dépenses.
// Les prix sont TTC : quand la TVA est activée, la part de TVA est extraite du total.
// Module pur (aucun accès réseau) pour rester testable sans navigateur.

export const ACCOUNTS = Object.freeze({
  '401': 'Fournisseurs',
  '411': 'Clients',
  '443': 'TVA collectée',
  '445': 'TVA récupérable',
  '571': 'Caisse',
  '607': 'Achats de marchandises',
  '658': 'Charges diverses',
  '701': 'Ventes de marchandises'
});

const r2 = value => Math.round((Number(value) || 0) * 100) / 100;
const amountOf = value => Math.max(0, r2(value));
const sumLines = (lines, price) => (lines || []).reduce((total, line) => total + (Number(line.qty) || 0) * (Number(line[price]) || 0), 0);

// Part HT et part de TVA d'un montant TTC. Un taux nul ou une TVA désactivée laisse le total en HT.
export function splitVat(total, rate, enabled = true) {
  const ttc = r2(total);
  const percent = enabled ? Math.min(100, Math.max(0, Number(rate) || 0)) : 0;
  const ht = percent > 0 ? r2(ttc / (1 + percent / 100)) : ttc;
  return { total: ttc, ht, vat: r2(ttc - ht), rate: percent };
}

const entry = (date, piece, label, account, debit, credit) => ({
  date: String(date || '').slice(0, 10),
  piece: String(piece || ''),
  label: String(label || ''),
  account,
  debit: amountOf(debit),
  credit: amountOf(credit)
});

// Journal : chaque opération produit des lignes équilibrées (débit = crédit).
export function buildJournal({
  sales = [], salePayments = [], purchases = [], purchasePayments = [],
  expenses = [], returns = [], creditNotes = [], vat = {}
} = {}) {
  const lines = [];
  const vatOn = !!vat.enabled;
  const rate = Number(vat.rate) || 0;

  for (const sale of sales) {
    const total = r2(sumLines(sale.sale_lines, 'unit_price'));
    if (total <= 0) continue;
    const { ht, vat: tax } = splitVat(total, rate, vatOn);
    const piece = sale.number || '';
    const label = `Vente ${piece}`.trim();
    // Vente comptant : l'argent entre en caisse. Vente à crédit : la créance client est ouverte.
    lines.push(entry(sale.sold_at, piece, label, sale.payment === 'credit' ? '411' : '571', total, 0));
    lines.push(entry(sale.sold_at, piece, label, '701', 0, ht));
    if (tax > 0) lines.push(entry(sale.sold_at, piece, label, '443', 0, tax));
  }

  for (const payment of salePayments) {
    const value = r2(payment.amount);
    if (value <= 0) continue;
    const piece = payment.sales?.number || '';
    const label = `Encaissement ${piece}`.trim();
    lines.push(entry(payment.paid_at, piece, label, '571', value, 0));
    lines.push(entry(payment.paid_at, piece, label, '411', 0, value));
  }

  for (const purchase of purchases) {
    const total = r2(sumLines(purchase.purchase_lines, 'unit_cost'));
    if (total <= 0) continue;
    const { ht, vat: tax } = splitVat(total, rate, vatOn);
    const piece = purchase.number || '';
    const label = `Achat ${piece}`.trim();
    lines.push(entry(purchase.bought_at, piece, label, '607', ht, 0));
    if (tax > 0) lines.push(entry(purchase.bought_at, piece, label, '445', tax, 0));
    lines.push(entry(purchase.bought_at, piece, label, '401', 0, total));
  }

  for (const payment of purchasePayments) {
    const value = r2(payment.amount);
    if (value <= 0) continue;
    const piece = payment.purchases?.number || '';
    const label = `Règlement fournisseur ${piece}`.trim();
    lines.push(entry(payment.paid_at, piece, label, '401', value, 0));
    lines.push(entry(payment.paid_at, piece, label, '571', 0, value));
  }

  for (const expense of expenses) {
    const value = r2(expense.amount);
    if (value <= 0) continue;
    const label = expense.label || expense.category || 'Dépense';
    lines.push(entry(expense.paid_at, '', label, '658', value, 0));
    lines.push(entry(expense.paid_at, '', label, '571', 0, value));
  }

  // Retour ou avoir : on annule la vente correspondante (produit et TVA) et la créance client.
  for (const movement of [...returns.map(r => ({ ...r, kind: 'Retour' })), ...creditNotes.map(n => ({ ...n, kind: 'Avoir' }))]) {
    const total = r2(movement.total ?? movement.total_usd);
    if (total <= 0) continue;
    const { ht, vat: tax } = splitVat(total, rate, vatOn);
    const label = movement.kind;
    lines.push(entry(movement.date || movement.returned_on || movement.issued_on, '', label, '701', ht, 0));
    if (tax > 0) lines.push(entry(movement.date || movement.returned_on || movement.issued_on, '', label, '443', tax, 0));
    lines.push(entry(movement.date || movement.returned_on || movement.issued_on, '', label, '411', 0, total));
  }

  return lines.sort((a, b) => a.date.localeCompare(b.date) || a.piece.localeCompare(b.piece) || a.account.localeCompare(b.account));
}

export function journalTotals(lines = []) {
  const debit = r2(lines.reduce((total, line) => total + line.debit, 0));
  const credit = r2(lines.reduce((total, line) => total + line.credit, 0));
  return { debit, credit, difference: r2(debit - credit) };
}

export function buildBalance(lines = []) {
  const accounts = new Map();
  for (const line of lines) {
    const row = accounts.get(line.account) || { account: line.account, label: ACCOUNTS[line.account] || '', debit: 0, credit: 0 };
    row.debit += line.debit;
    row.credit += line.credit;
    accounts.set(line.account, row);
  }
  return [...accounts.values()]
    .map(row => ({ ...row, debit: r2(row.debit), credit: r2(row.credit), balance: r2(row.debit - row.credit) }))
    .sort((a, b) => a.account.localeCompare(b.account));
}

// Soldes utiles au tableau de bord comptable. Un solde débiteur est positif.
export function summarize(lines = []) {
  const debit = account => r2(lines.filter(line => line.account === account).reduce((total, line) => total + line.debit, 0));
  const credit = account => r2(lines.filter(line => line.account === account).reduce((total, line) => total + line.credit, 0));
  const revenue = r2(credit('701') - debit('701'));
  const purchases = r2(debit('607') - credit('607'));
  const expenses = r2(debit('658') - credit('658'));
  const vatCollected = r2(credit('443') - debit('443'));
  const vatDeductible = r2(debit('445') - credit('445'));
  return {
    revenue,
    purchases,
    expenses,
    result: r2(revenue - purchases - expenses),
    vatCollected,
    vatDeductible,
    vatDue: r2(vatCollected - vatDeductible),
    cash: r2(debit('571') - credit('571')),
    receivable: r2(debit('411') - credit('411')),
    payable: r2(credit('401') - debit('401'))
  };
}
