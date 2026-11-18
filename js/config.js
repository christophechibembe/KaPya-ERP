// demo: true = mode local (données dans le navigateur, sans Supabase). false = base Supabase réelle.
// Clés PUBLIQUES uniquement. Ne jamais mettre la clé secrète (sb_secret_…) dans l'app.
export const CFG = { url: 'https://ttplxlobehmwzfnxviej.supabase.co', key: 'sb_publishable_yICeDw1YO0Ue2V-oBGSJ_w_dmCwLT4j', demo: false };

// Clé PUBLIQUE de notification (VAPID). À coller ici après génération (voir la notice). Vide = notifications désactivées.
export const VAPID_PUBLIC_KEY = 'BEayxpEBNxKTFtyRGNHTUrh9g1CxtMwxcBydzrYFRv_HtHwkJuE-OY_Bq16LrptaMPc0_OOOcXMu5UkWVrIRGlg';

// Paiement de l'abonnement : Airtel Money (à compléter avec le numéro de réception)
export const PAIEMENT = { airtel: '+243 995 170 824', mpesa: '+243 838 775 451', prix: { basique: 5, standard: 9, premium: 15 } };
