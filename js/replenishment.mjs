// Aide à la décision uniquement : ne crée ni commande ni mouvement de stock.
export function recommendOrders(articles, sales, { days = 30, coverageDays = 14, leadDays = 7 } = {}) {
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(coverageDays) || coverageDays < 1 || coverageDays > 180 || !Number.isFinite(leadDays) || leadDays < 0 || leadDays > 60) throw new Error('Horizon ou délai fournisseur invalide.');
  const sold = new Map();
  for (const sale of sales) for (const line of sale.sale_lines || []) {
    const qty = Number(line.qty);
    if (line.article_id && Number.isFinite(qty) && qty > 0) sold.set(line.article_id, (sold.get(line.article_id) || 0) + qty);
  }
  return articles.filter(a => !a.archived_at).map(a => {
    const stock = Number(a.stock), minimum = Math.max(0, Number(a.min_stock) || 0);
    if (!Number.isFinite(stock)) return null;
    const quantitySold = sold.get(a.id) || 0, daily = quantitySold / days;
    const target = Math.max(minimum, daily * (coverageDays + leadDays));
    const toOrder = Math.ceil(Math.max(0, target - stock) * 1000) / 1000;
    return toOrder > 0 ? { ...a, quantitySold, daily, target, toOrder, daysLeft: daily > 0 ? Math.max(0, stock) / daily : null } : null;
  }).filter(Boolean).sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || b.toOrder - a.toOrder);
}
