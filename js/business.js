import { isDemo, DEMO_ROUTES } from './demo-mode.js';
// Type d'activité : libellés et fonctions affichées. Chaque entreprise peut ajuster la liste des
// fonctions masquées (Paramètres > Type d'activité). Si elle n'a rien réglé, la liste par défaut du type s'applique.
export const BUSINESS_TYPES = [['commerce', 'Commerce général'], ['alimentation', 'Alimentation et boissons'], ['services', 'Services (sans stock)'], ['restauration', 'Restauration'], ['autre', 'Autre']];

const DEFAULT_HIDDEN = {
  commerce: [],
  alimentation: [],
  restauration: ['lots'],
  services: ['stocks', 'lots', 'depots', 'achats', 'bons', 'fournisseurs', 'retours'],
  autre: []
};

// Fonctions que l'entreprise peut afficher ou masquer.
export const TOGGLABLE = [
  ['stocks', 'Produits et stocks'], ['lots', 'Lots et péremption'], ['depots', 'Dépôts'], ['achats', 'Achats'],
  ['fournisseurs', 'Fournisseurs'], ['retours', 'Retours'], ['proformas', 'Proformas'], ['avoirs', 'Avoirs'], ['bons', 'Bons de commande']
];

// Libellés adaptés au métier.
const SHOP_LABEL = { commerce: 'Boutique', alimentation: 'Boutique', services: 'Agence', restauration: 'Salle', autre: 'Site' };

let type = 'commerce';
let hidden = null;

export function setBusinessConfig(businessType, hiddenFeatures) {
  type = DEFAULT_HIDDEN[businessType] ? businessType : 'commerce';
  hidden = Array.isArray(hiddenFeatures) ? hiddenFeatures : null;
}
export const getBusinessType = () => type;
export const getHiddenFeatures = () => (hidden ?? DEFAULT_HIDDEN[type] ?? []);
export const businessAllows = route => (!isDemo || DEMO_ROUTES.has(route)) && !getHiddenFeatures().includes(route);
export const shopLabel = () => SHOP_LABEL[type] || 'Boutique';
