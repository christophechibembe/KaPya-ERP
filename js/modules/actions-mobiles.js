// Mode téléphone simplifié : trois actions rapides sur l'accueil.
// Affichées seulement sur petit écran (voir theme.css) et selon les droits de chacun.
import { ico } from '../ui.js';
import { canView } from '../roles.js';

const ACTIONS = [
  { view: 'facture', href: '#/facture', icon: 'sales', label: 'Nouvelle vente' },
  { view: 'credits', href: '#/credits', icon: 'coins', label: 'Encaisser une dette' },
  { view: 'acomptes', href: '#/acomptes?nouveau=1', icon: 'coins', label: 'Déposer un acompte' },
];

export function mountQuickActions(main, ctx) {
  const items = ACTIONS.filter(a => canView(ctx?.role, a.view));
  if (!items.length || main.querySelector('.quick-actions')) return;
  const html = `<section class="quick-actions" aria-label="Actions rapides">${items.map(a =>
    `<a class="card quick-action" href="${a.href}">${ico(a.icon)}<span>${a.label}</span></a>`).join('')}</section>`;
  main.querySelector('.page-head')?.insertAdjacentHTML('afterend', html);
}
