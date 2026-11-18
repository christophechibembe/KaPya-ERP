// Contrôle des lignes d'un fichier d'articles avant enregistrement.
// Colonnes attendues : reference (ou sku), designation (ou nom), unite, prix_achat, prix_vente, seuil_alerte.
import { toNumber } from './csv.js';

export function checkArticleRows(records, existingSkus = []) {
  const known = new Set(existingSkus.map(s => String(s).toLowerCase()));
  const seen = new Set();
  const ok = [], errors = [];
  records.forEach((r, index) => {
    const line = index + 2; // ligne du fichier (la 1re est l'en-tête)
    const sku = (r.reference || r.sku || '').trim();
    const name = (r.designation || r.nom || r.name || '').trim();
    const unit = (r.unite || r.unit || 'pce').trim() || 'pce';
    const buy = toNumber(r.prix_achat ?? r.price_buy ?? '0');
    const sell = toNumber(r.prix_vente ?? r.price_sell ?? '0');
    const min = toNumber(r.seuil_alerte ?? r.min_stock ?? '0');
    if (!sku) return errors.push(`Ligne ${line} : référence manquante.`);
    if (!name) return errors.push(`Ligne ${line} : désignation manquante (${sku}).`);
    if (buy === null || sell === null || min === null) return errors.push(`Ligne ${line} : un prix ou un seuil n'est pas un nombre (${sku}).`);
    if (buy < 0 || sell < 0 || min < 0) return errors.push(`Ligne ${line} : les montants ne peuvent pas être négatifs (${sku}).`);
    const key = sku.toLowerCase();
    if (seen.has(key)) return errors.push(`Ligne ${line} : référence en double dans le fichier (${sku}).`);
    seen.add(key);
    if (known.has(key)) return errors.push(`Ligne ${line} : cette référence existe déjà (${sku}). Ignorée.`);
    ok.push({ sku, name, unit, price_buy: buy, price_sell: sell, min_stock: min });
  });
  return { ok, errors };
}
