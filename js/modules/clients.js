// Clients : coordonnées, dette (ventes à crédit non soldées) et rappel par WhatsApp.
import { render as party } from './parties.js';
import { db } from '../api.js';
import { esc, money, getRate } from '../ui.js';
import { planAllows } from '../plans.js';

// Numéro au format WhatsApp : chiffres seulement, avec l'indicatif pays (ex. 243… pour la RDC)
const waNumber = p => String(p || '').replace(/\D/g, '');
const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

// Ajoute la dette de chaque client. Si les ventes ne sont pas disponibles (hors ligne), la dette reste inconnue.
async function withDebt(rows) {
  const [sales, [org]] = await Promise.all([
    db.select('sales', 'select=id,customer_id,customer_label,payment,paid,sale_lines(qty,unit_price)').catch(() => null),
    db.select('organizations', 'select=name').catch(() => [])]);
  if (!sales) return rows.map(c => ({ ...c, debt: null }));
  const debt = {};
  sales.filter(s => s.payment === 'credit').forEach(s => {
    const total = (s.sale_lines || []).reduce((t, l) => t + l.qty * l.unit_price, 0);
    const key = s.customer_id || ('label:' + (s.customer_label || ''));
    debt[key] = (debt[key] || 0) + Math.max(0, total - (+s.paid || 0));
  });
  const orgName = org?.name || 'notre entreprise';
  const rate = getRate();
  // Une vente faite avant la création de la fiche est rattachée par le nom saisi
  return rows.map(c => {
    const d = (debt[c.id] || 0) + (debt['label:' + c.name] || 0);
    const msg = `Bonjour ${c.name}, votre solde impayé chez ${orgName} est de ${money(d)}${rate ? ` (≈ ${Math.round(d * rate.usd_cdf).toLocaleString('fr-FR')} FC)` : ''}. Merci de bien vouloir régulariser. Merci.`;
    return { ...c, debt: d, reminder: msg };
  });
}

function waButton(c) {
  if (c.debt === null) return '<span class="muted">—</span>';
  const hasPhone = !!waNumber(c.phone);
  return c.debt > 0 && hasPhone
    ? `<a class="wa" href="${waLink(c.phone, c.reminder)}" target="_blank" rel="noopener">WhatsApp</a>`
    : `<span class="wa" aria-disabled="true" title="${c.debt <= 0 ? 'Aucune dette' : 'Ajoutez le numéro du client'}">WhatsApp</span>`;
}

const columns = [
  { head: 'Dette', cls: 'r', cell: c => c.debt === null ? '<span class="muted">—</span>' : c.debt > 0 ? `<span class="debt">${money(c.debt)}</span>` : '<span class="debt zero">Aucune</span>' },
  { head: 'Rappel', cls: 'c', cell: waButton },
];

export const render = (main, ctx) => party(main, {
  role: ctx?.role, cap: 'clients.write', table: 'customers', title: 'Clients',
  sub: 'Coordonnées, dettes à recouvrer et rappels envoyés par WhatsApp.',
  add: 'Nouveau client', empty: 'Aucun client. Ajoutez votre premier client.',
  columns: planAllows('whatsapp') ? columns : columns.slice(0, 1), enrich: withDebt,
});
