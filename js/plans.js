// Formules : basique, standard, premium.
// Miroir de public.plan_allows() (sql/formules.sql). La base applique les règles ; l'interface masque ce qui n'est pas inclus.
export const PLANS = ['basique', 'standard', 'premium'];
const FEATURES = {
  basique: [],
  standard: ['depots', 'transferts', 'alertes', 'exports', 'sauvegarde', 'whatsapp'],
  premium: ['depots', 'transferts', 'alertes', 'exports', 'sauvegarde', 'whatsapp', 'historique', 'exports_pdf', 'restauration'],
};
let current = 'standard';
export const setPlan = p => { current = PLANS.includes(p) ? p : 'standard'; };
export const getPlan = () => current;
export const planAllows = feature => (FEATURES[current] || []).includes(feature);
// Pages du menu réservées à une formule
const ROUTE_FEATURE = { depots: 'depots', alertes: 'alertes', exports: 'exports', sauvegarde: 'sauvegarde', historique: 'historique' };
export const routeAllowed = key => !ROUTE_FEATURE[key] || planAllows(ROUTE_FEATURE[key]);
