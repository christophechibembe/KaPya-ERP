// Notifications dans l'application : pastille sur « Alertes » (et sur « Plus » sur téléphone).
// Données mises en cache 2 minutes pour ne pas recharger à chaque changement de page.
import { loadAlerts } from './modules/alertes.js';

let cache = { at: 0, count: 0, detail: '' };

export async function alertCount(role, { force = false } = {}) {
  if (!force && Date.now() - cache.at < 120000) return cache;
  try {
    const { stock, late, unpaid } = await loadAlerts(role);
    const count = stock.length + late.length + unpaid.length;
    const detail = [
      stock.length && `${stock.length} produit(s) à réapprovisionner`,
      late.length && `${late.length} crédit(s) en retard`,
      unpaid.length && `${unpaid.length} facture(s) fournisseur à payer`
    ].filter(Boolean).join(' · ');
    cache = { at: Date.now(), count, detail };
  } catch {
    // Hors ligne ou erreur : on garde la dernière valeur connue, sans bloquer l'application.
    cache = { ...cache, at: Date.now() };
  }
  return cache;
}

export function paintBadges(count, detail) {
  for (const key of ['alertes', 'plus']) {
    const link = document.querySelector(`#nav a[data-r="${key}"]`);
    if (!link) continue;
    link.querySelector('.nbadge')?.remove();
    if (count <= 0) continue;
    const badge = document.createElement('span');
    badge.className = 'nbadge';
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.setAttribute('aria-label', `${count} notification(s) : ${detail}`);
    badge.title = detail;
    link.appendChild(badge);
  }
}
