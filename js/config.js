// demo: true = mode local (données dans le navigateur, sans Supabase). false = base Supabase réelle.
import { isDemo } from './demo-mode.js';
// Configuration dashboard : classic (existant), modern_pc, modern_mobile
// Clés PUBLIQUES uniquement. Ne jamais mettre la clé secrète (sb_secret_…) dans l'app.
export const CFG = { url: 'https://ttplxlobehmwzfnxviej.supabase.co', key: 'sb_publishable_yICeDw1YO0Ue2V-oBGSJ_w_dmCwLT4j', demo: false, dashboard: { mode: 'classic', autoDetectDevice: true } };
if (isDemo) Object.assign(CFG, { demo: true, url: '', key: '', dashboard: { mode: 'classic', autoDetectDevice: false } });

// Pré-connexion au serveur de données : le premier appel API ne paie plus la
// résolution DNS ni la poignée de main TLS (coût mesuré jusqu'à 5 s sur un lien
// faible, 0,01 s ensuite grâce au cache système). Aucun effet en démonstration.
if (!isDemo && CFG.url && typeof document !== 'undefined' && document.head) {
  const lien = document.createElement('link');
  lien.rel = 'preconnect';
  lien.href = CFG.url;
  lien.crossOrigin = 'anonymous';
  document.head.append(lien);
}

// Clé PUBLIQUE de notification (VAPID). À coller ici après génération (voir la notice). Vide = notifications désactivées.
export const VAPID_PUBLIC_KEY = 'BEayxpEBNxKTFtyRGNHTUrh9g1CxtMwxcBydzrYFRv_HtHwkJuE-OY_Bq16LrptaMPc0_OOOcXMu5UkWVrIRGlg';

// Paiement de l'abonnement : Airtel Money (à compléter avec le numéro de réception)
export const PAIEMENT = { airtel: '+243 995 170 824', mpesa: '+243 838 775 451', prix: { basique: 5, standard: 9, premium: 15 } };
