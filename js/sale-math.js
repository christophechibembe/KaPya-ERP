// Calculs de vente, de crédit et de clôture. Fonctions pures : elles sont testées dans tests/.
export const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

// Prix net d'une ligne après remise en pourcentage (0 à 100).
export const netPrice = (price, discountPct = 0) => {
  const d = Math.min(100, Math.max(0, Number(discountPct) || 0));
  return round2((Number(price) || 0) * (100 - d) / 100);
};

// Total d'une ligne et total d'un panier.
export const lineTotal = (qty, price) => round2((Number(qty) || 0) * (Number(price) || 0));
export const cartTotal = lines => round2(lines.reduce((t, l) => t + lineTotal(l.qty, l.price), 0));

// Solde restant d'une facture : total - versements - avoirs, jamais négatif.
export const creditBalance = (total, paid = 0, credited = 0) => Math.max(0, round2(total - paid - credited));

// Une quantité est vendable si elle ne dépasse pas le stock disponible.
export const stockAllows = (qty, stock) => stock == null || Number(qty) <= Number(stock);

// Écart de clôture : compté - attendu (négatif = manque d'argent).
export const closureDifference = (counted, expected) => round2(Number(counted) - Number(expected));
