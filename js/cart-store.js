// Panier en cours sauvegardé sur l'appareil, par compte : il est retrouvé si l'application se ferme pendant une vente.
// Il est effacé dès que la vente est enregistrée. Les clients récents sont gardés à part.
const CART = uid => `kp.cart.${uid}`;
const RECENT = uid => `kp.recent-customers.${uid}`;
export function loadCart(uid) {
  try { const v = JSON.parse(localStorage.getItem(CART(uid))); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveCart(uid, cart) {
  try { if (cart.length) localStorage.setItem(CART(uid), JSON.stringify(cart)); else localStorage.removeItem(CART(uid)); } catch { /* ignoré */ }
}
export function recentCustomers(uid) {
  try { const v = JSON.parse(localStorage.getItem(RECENT(uid))); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function rememberCustomer(uid, id) {
  if (!id) return;
  try { localStorage.setItem(RECENT(uid), JSON.stringify([id, ...recentCustomers(uid).filter(x => x !== id)].slice(0, 5))); } catch { /* ignoré */ }
}
