// Rôles et droits de KaPya ERP. Source unique : l'interface s'en sert pour afficher/masquer ; la base applique les mêmes règles (RLS).
export const ROLES = { admin: 'Gérant', manager: 'Responsable', facturier: 'Facturier', comptable: 'Comptable', user: 'Lecture seule' };
const ALL = ['admin', 'manager', 'facturier', 'comptable', 'user'];
const MATRIX = {
  'ventes.view': ALL,
  'credits.view': ALL,
  'credits.write': ['admin', 'manager', 'facturier', 'comptable'],
  'ventes.write': ['admin', 'manager', 'facturier'],
  'ventes.cancel': ['admin', 'manager'],
  'achats.view': ['admin', 'manager', 'comptable', 'user'],
  'achats.write': ['admin', 'manager'],
  'achats.cancel': ['admin', 'manager'],
  'stock.view': ALL,
  'stock.write': ['admin', 'manager'],
  'clients.view': ALL,
  'clients.write': ['admin', 'manager', 'facturier'],
  'fournisseurs.view': ['admin', 'manager', 'comptable', 'user'],
  'fournisseurs.write': ['admin', 'manager'],
  'rapports.view': ['admin', 'manager', 'comptable', 'user'],
  'caisse.view': ['admin', 'manager', 'facturier', 'comptable'],
  'caisse.write': ['admin', 'manager', 'facturier'],
  'historique.view': ['admin', 'manager'],
  'sauvegarde.export': ['admin'],
  'depots.manage': ['admin', 'manager'],
  'depots.transfer': ['admin', 'manager', 'facturier'],
  'taux.view': ALL,
  'taux.write': ['admin', 'manager'],
  'ventes.edit': ['admin', 'manager'],
  'transferts.write': ['admin', 'manager', 'facturier'],
  'equipe.manage': ['admin'],
};
export const can = (role, cap) => (MATRIX[cap] || []).includes(role);
// Espace du menu -> droit de lecture requis (null = accessible à tous)
const VIEW = { exports: 'rapports.view', facture: 'ventes.write', accueil: null, ventes: 'ventes.view', credits: 'credits.view', acomptes: 'credits.view', stocks: 'stock.view', achats: 'achats.view', fournisseurs: 'fournisseurs.view', clients: 'clients.view', rapports: 'rapports.view', caisse: 'caisse.view', historique: 'historique.view', sauvegarde: 'sauvegarde.export', depots: 'stock.view', parametres: 'taux.view', plus: null };
export const canView = (role, key) => !VIEW[key] || can(role, VIEW[key]);
