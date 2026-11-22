// Formules : basique, standard, premium.
// Miroir de public.plan_allows() (sql/formules.sql). La base applique les règles ; l'interface masque ce qui n'est pas inclus.
export const PLANS = ['basique', 'standard', 'premium'];
const FEATURES = {
  basique: [],
  standard: ['depots', 'transferts', 'alertes', 'exports', 'comptabilite', 'sauvegarde', 'whatsapp'],
  premium: ['depots', 'transferts', 'alertes', 'exports', 'comptabilite', 'sauvegarde', 'whatsapp', 'historique', 'exports_pdf', 'restauration', 'personnel'],
};
let current = 'standard';
export const setPlan = p => { current = PLANS.includes(p) ? p : 'standard'; };
export const getPlan = () => current;
export const planAllows = feature => (FEATURES[current] || []).includes(feature);
// Pages du menu réservées à une formule
const ROUTE_FEATURE = { depots: 'depots', alertes: 'alertes', exports: 'exports', comptabilite: 'comptabilite', sauvegarde: 'sauvegarde', historique: 'historique', workers: 'personnel' };
export const routeAllowed = key => !ROUTE_FEATURE[key] || planAllows(ROUTE_FEATURE[key]);

// Libellés des fonctions selon la formule (affichés au gérant).
export const FEATURE_LABELS = {
  depots: 'Dépôts (plusieurs boutiques)', transferts: 'Transferts entre dépôts', alertes: 'Alertes et rappels',
  exports: 'Exports comptables', comptabilite: 'Comptabilité et TVA', sauvegarde: 'Sauvegarde et restauration', whatsapp: 'Envoi par WhatsApp',
  historique: 'Historique des actions', exports_pdf: 'Exports PDF', restauration: 'Restauration des données',
  personnel: 'Personnel et paiements'
};
export const featuresOf = plan => Object.keys(FEATURE_LABELS).map(k => ({ key: k, label: FEATURE_LABELS[k], included: (FEATURES[plan] || []).includes(k) }));

