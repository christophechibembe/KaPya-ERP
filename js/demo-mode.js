// La démo est choisie par son entrée dédiée, jamais par un paramètre de session.
export const isDemo = typeof location !== 'undefined' && /^\/demo(?:\/|$)/.test(location.pathname);
export const DEMO_ROUTES = new Set(['accueil', 'vente', 'facture', 'ventes', 'stocks', 'clients',
  'fournisseurs', 'achats', 'credits', 'acomptes', 'avoirs', 'depots', 'caisse', 'rapports', 'comptabilite', 'alertes', 'plus']);
export const demoMark = '<div class="demo-print" style="border:2px solid #000;padding:6px;text-align:center;font-weight:bold">DÉMONSTRATION — DONNÉES FICTIVES — SANS VALEUR COMMERCIALE</div>';
