// Dernier affichage du tableau de bord, gardé sur l'appareil pour s'afficher tout de suite.
// Propre à un compte et à une période. Effacé à la déconnexion. Jamais utilisé pour de nouveaux calculs.
const PREFIX = 'kp.dash.';
const MAX_CHARS = 400000;
export const dashKey = (userId, mode, from, to) => `${PREFIX}${userId}.${mode}.${from}.${to}`;
export function readDash(key) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v.html === 'string' ? v : null; } catch { return null; }
}
export function writeDash(key, html) {
  try {
    if (html.length > MAX_CHARS) return;
    localStorage.setItem(key, JSON.stringify({ html, at: Date.now() }));
  } catch { /* stockage plein : on n'affiche simplement pas le cache */ }
}
export function clearDash() {
  try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch { /* ignoré */ }
}
