// Effets locaux de l'annulation d'une pièce (vente ou achat) hors ligne.
// Module pur : il décrit les mouvements de stock à appliquer à la copie locale,
// pour que l'écran reste cohérent avant l'envoi de la suppression au serveur.
//
// Côté base, la suppression d'une vente ou d'un achat supprime ses lignes en cascade
// (ON DELETE CASCADE) et les déclencheurs de lignes remettent le stock à l'endroit :
// - vente supprimée   : le stock vendu revient       (+qty) ;
// - achat supprimé    : le stock acheté est retiré   (-qty).

export const DOCUMENT_TABLES = new Set(['sales', 'purchases']);

export function documentLines(table, row) {
  if (table === 'sales') return Array.isArray(row?.sale_lines) ? row.sale_lines : [];
  if (table === 'purchases') return Array.isArray(row?.purchase_lines) ? row.purchase_lines : [];
  return [];
}

// Mouvements de stock, un par article (les lignes du même article sont additionnées).
export function stockDelta(table, lines = []) {
  const sign = table === 'sales' ? 1 : table === 'purchases' ? -1 : 0;
  if (!sign) return [];
  const byArticle = new Map();
  for (const line of lines) {
    const id = line?.article_id;
    const qty = Number(line?.qty);
    if (!id || !Number.isFinite(qty) || !qty) continue;
    byArticle.set(id, (byArticle.get(id) || 0) + sign * qty);
  }
  return [...byArticle].map(([article_id, qty]) => ({ article_id, qty }));
}

// Vrai si la ligne correspond au document supprimé.
export function isDocumentRow(table, row, id) {
  return !!row && row.id === id && DOCUMENT_TABLES.has(table);
}
