// Plus (téléphone) : tous les autres espaces, rangés par thème pour les retrouver vite.
import { ico } from '../ui.js';
import { canView } from '../roles.js';
import { routeAllowed } from '../plans.js';
import { businessAllows } from '../business.js';
export function render(main, ctx) {
  const groups = [
    ['Ventes et encaissements', [['credits', 'Crédits clients', 'receipt'], ['acomptes', 'Acomptes clients', 'wallet'], ['caisse', 'Clôture de caisse', 'cash']]],
    ['Achats et fournisseurs', [['achats', 'Achats', 'purchases'], ['fournisseurs', 'Fournisseurs', 'truck']]],
    ['Contacts', [['clients', 'Clients', 'users']]],
    ['Gestion', [['rapports', 'Rapports', 'chart'], ['exports', 'Exports comptables', 'download'], ['historique', 'Historique des actions', 'history'], ['sauvegarde', 'Sauvegarde', 'database'], ['depots', 'Dépôts', 'warehouse'], ['workers', 'Personnel et paiements', 'users'], ['alertes', 'Alertes et rappels', 'bell'], ['parametres', 'Paramètres', 'cog'], ...(ctx?.platform ? [['abonnes', 'Abonnés', 'users']] : [])]],
  ];
  main.innerHTML = `<div class="page-head"><div><h1>Plus</h1><p class="sub">Tous les autres espaces de KaPya.</p></div></div>` +
    groups.map(([title, items]) => {
      const ok = items.filter(([k]) => canView(ctx?.role, k) && routeAllowed(k) && businessAllows(k));
      return ok.length ? `<h2 class="sec">${title}</h2><div class="menu-grid">${ok.map(([k, l, i]) => `<a class="card menu-item" href="#/${k}">${ico(i)}<span>${l}</span></a>`).join('')}</div>` : '';
    }).join('') +
    `<p class="dev-credit"><a href="guide.html" target="_blank" rel="noopener">Guide d’utilisation (HTML)</a></p>` +
    `<p class="dev-credit">Développé par Christophe Cibembe, ingénieur en informatique · KaPya Digital</p>`;
}
