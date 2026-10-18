// Plus (téléphone) : tous les autres espaces, rangés par thème pour les retrouver vite.
import { ico } from '../ui.js';
import { canView } from '../roles.js';
import { routeAllowed } from '../plans.js';
export function render(main, ctx) {
  const groups = [
    ['Ventes et encaissements', [['credits', 'Crédits clients', 'receipt'], ['acomptes', 'Acomptes clients', 'wallet'], ['caisse', 'Clôture de caisse', 'cash']]],
    ['Achats et fournisseurs', [['achats', 'Achats', 'purchases'], ['fournisseurs', 'Fournisseurs', 'truck']]],
    ['Contacts', [['clients', 'Clients', 'users']]],
    ['Gestion', [['rapports', 'Rapports', 'chart'], ['exports', 'Exports comptables', 'download'], ['historique', 'Historique des actions', 'history'], ['sauvegarde', 'Sauvegarde', 'database'], ['depots', 'Dépôts', 'warehouse'], ['alertes', 'Alertes et rappels', 'bell'], ['parametres', 'Paramètres', 'cog'], ...(ctx?.platform ? [['abonnes', 'Abonnés', 'users']] : [])]],
  ];
  main.innerHTML = `<div class="page-head"><div><h1>Plus</h1><p class="sub">Tous les autres espaces de KaPya.</p></div></div>` +
    groups.map(([title, items]) => {
      const ok = items.filter(([k]) => canView(ctx?.role, k) && routeAllowed(k));
      return ok.length ? `<h2 class="sec">${title}</h2><div class="menu-grid">${ok.map(([k, l, i]) => `<a class="card menu-item" href="#/${k}">${ico(i)}<span>${l}</span></a>`).join('')}</div>` : '';
    }).join('');
}
