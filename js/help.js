// Aide contextuelle : un bouton « ? » ouvre la section du guide correspondant à l'écran.
const GUIDE = { vente: 's4', facture: 's4', ventes: 's4', proformas: 's4', avoirs: 's4', retours: 's4', credits: 's5', acomptes: 's5', stocks: 's6', achats: 's6', bons: 's6', depots: 's7', transferts: 's7', caisse: 's8', rapports: 's9', exports: 's9', accueil: 's9', parametres: 's10', abonnes: 's10', lots: 's6', clients: 's4', fournisseurs: 's6' };
export const helpSection = route => GUIDE[route] || 's14';
export function helpHref(route) { return `guide.html#${helpSection(route)}`; }
