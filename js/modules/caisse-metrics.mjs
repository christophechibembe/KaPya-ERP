const CASH_MOVEMENT_KEYS = [
  'cash_sales',
  'credit_payments',
  'customer_deposits',
  'cash_in',
  'supplier_payments',
  'expenses',
  'cash_out',
];

const cents = value => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
};

export function hasNewCashMovements(current, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  return CASH_MOVEMENT_KEYS.some(key => cents(current?.[key]) !== cents(snapshot[key]));
}
