// Boutiques = dépôts actifs. Le gérant choisit une boutique (ou toutes) ; le choix est gardé sur l'appareil.
import { db } from './api.js';
import { esc } from './ui.js';
import { shopLabel } from './business.js';

const KEY = 'kp.shop';
// Qui voit les chiffres de toutes les boutiques : gérant, responsable, comptable.
export const canSeeAllShops = role => ['admin', 'manager', 'comptable'].includes(role);
export const getShop = () => localStorage.getItem(KEY) || '';
export const setShop = id => localStorage.setItem(KEY, id || '');
export const loadShops = () => db.select('warehouses', 'select=id,name,is_default&active=eq.true&order=is_default.desc,name').catch(() => []);
// Filtre pour les ventes (table sales) et pour les encaissements (sale_payments, via la vente).
export const shopSalesFilter = () => (getShop() ? `&warehouse_id=eq.${getShop()}` : '');
export const shopPaymentsSelect = sel => (getShop() ? sel.replace('sales(', 'sales!inner(') : sel);
export const shopPaymentsFilter = () => (getShop() ? `&sales.warehouse_id=eq.${getShop()}` : '');
export function shopSelectHtml(shops, id = 'shop-select') {
  const current = getShop();
  return `<label class="shop-pick" for="${id}">${shopLabel()}<select id="${id}"><option value="">Toutes les boutiques</option>${shops.map(s => `<option value="${esc(s.id)}"${s.id === current ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
}
