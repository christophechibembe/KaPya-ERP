// Ventes enregistrées sur cet appareil et pas encore envoyées au serveur.
// Le tableau de bord doit les compter : sinon une vente faite hors ligne semble
// ne jamais arriver, alors qu'elle est bien dans la file d'attente et dans
// l'historique. Elles portent la mention « en attente » et quittent ces calculs
// dès que la file est vidée, pour ne jamais compter deux fois.

export const PENDING_SALE_LABEL = 'En attente';

const dayOnly = value => String(value ?? '').slice(0, 10);

// Transforme les opérations `create_sale` en attente en lignes comparables à
// celles renvoyées par le serveur. `articles` fournit le nom affiché et le prix
// d'achat utilisé pour estimer le coût (aucun coût n'est figé hors ligne).
export function pendingSaleRows(items, { from = '', to = '', shop = '', articles = [] } = {}) {
  const byId = new Map((articles || []).map(article => [article.id, article]));
  const rows = [];
  for (const item of items || []) {
    if (!item || item.fn !== 'create_sale') continue;
    // Une pièce refusée est annulée localement ; une pièce déjà envoyée est au serveur.
    if (item.status === 'rejected' || item.status === 'sent') continue;
    const body = item.body || {};
    const soldAt = dayOnly(body.p_date);
    if (!soldAt) continue;
    if (from && soldAt < from) continue;
    if (to && soldAt > to) continue;
    if (shop && body.p_warehouse !== shop) continue;
    const lines = (body.p_lines || []).map((line, index) => {
      const article = byId.get(line.article_id) || null;
      return {
        id: `${body.p_id || 'pending'}:${index}`,
        article_id: line.article_id,
        qty: Number(line.qty) || 0,
        unit_price: Number(line.unit_price) || 0,
        discount_pct: Number(line.discount_pct) || 0,
        articles: article ? {
          id: article.id, sku: article.sku, name: article.name,
          unit: article.unit, price_buy: article.price_buy
        } : null,
        pending: true
      };
    });
    rows.push({
      id: body.p_id,
      number: body.p_number || '',
      sold_at: soldAt,
      payment: body.p_payment === 'credit' ? 'credit' : 'cash',
      // Le mode de paiement détaillé est posé après l'envoi : on reste sur le mode principal.
      payment_method: body.p_payment === 'credit' ? 'credit' : 'cash',
      paid: Number(body.p_paid) || 0,
      customer_id: body.p_customer || null,
      customer_label: body.p_customer_label || '',
      customers: body.p_customer_label ? { name: body.p_customer_label } : null,
      warehouse_id: body.p_warehouse || null,
      sale_lines: lines,
      pending: true
    });
  }
  return rows.sort((a, b) => a.sold_at.localeCompare(b.sold_at)
    || String(a.number).localeCompare(String(b.number)));
}

// Total d'une vente, au même calcul que le tableau de bord : `unit_price` est
// déjà net de remise au moment de l'enregistrement.
export const pendingLineTotal = lines => (lines || [])
  .reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unit_price || 0), 0);

export const pendingSaleTotal = sale => pendingLineTotal(sale?.sale_lines);

// Coût estimé des ventes en attente : faute d'instantané de coût, on prend le
// prix d'achat actuel de l'article. Il est signalé comme estimation dans l'écran.
export function pendingSaleCost(rows) {
  return (rows || []).reduce((total, sale) => total + (sale.sale_lines || [])
    .reduce((part, line) => part + Number(line.qty || 0) * Number(line.articles?.price_buy || 0), 0), 0);
}

export function pendingLineCount(rows) {
  return (rows || []).reduce((count, sale) => count + (sale.sale_lines || []).length, 0);
}
