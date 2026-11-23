// Filtres de boutique pour les pièces rattachées à une vente.
// Les retours clients (customer_returns) portent leur propre warehouse_id ;
// les avoirs (credit_notes) n'en ont pas : on passe par la vente rattachée.
// Fonctions pures, testées dans tests/report-scope.test.mjs.

// Retour client : la boutique est une colonne de la table.
export const shopReturnFilter = shop => (shop ? `&warehouse_id=eq.${shop}` : '');

// Avoir : jointure sur la vente pour filtrer par sa boutique.
export const shopCreditNoteSelect = (select, shop) => (shop ? `${select},sales!inner(warehouse_id)` : select);
export const shopCreditNoteFilter = shop => (shop ? `&sales.warehouse_id=eq.${shop}` : '');
