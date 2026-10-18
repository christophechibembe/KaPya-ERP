import { render as party } from './parties.js';
export const render = (main, ctx) => party(main, { role: ctx?.role, cap: 'fournisseurs.write', table: 'suppliers', title: 'Fournisseurs', sub: 'Vos fournisseurs et leurs coordonnées.', add: 'Nouveau fournisseur', empty: 'Aucun fournisseur. Ajoutez votre premier fournisseur.' });
