// Échappement HTML : toute donnée saisie par un utilisateur doit passer par esc() avant d'être affichée en HTML.
// Une valeur vide devient une chaîne vide (et non « undefined » ou « null »).
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => (value === null || value === undefined ? '' : String(value)).replace(/[&<>"']/g, c => MAP[c]);
