// TVA de l'entreprise : activée par l'administrateur dans les paramètres.
// Les prix restent TTC ; la TVA affichée sur les reçus est la part contenue dans le total.
import { db, session } from './api.js';

const K = 'kp.vat';
const SANS_TVA = { enabled: false, rate: 0 };

export const getVat = () => {
  try { return JSON.parse(localStorage.getItem(K)) || SANS_TVA; } catch { return SANS_TVA; }
};

// Taux à figer sur une pièce créée maintenant : 0 si la TVA est désactivée.
// Les anciennes pièces sans taux gardent le comportement d'avant (réglage courant).
export const vatRateForDocument = () => {
  const v = getVat();
  return v.enabled ? Number(v.rate) || 0 : 0;
};

// Lit le réglage de l'entreprise et le garde sur l'appareil (les reçus se font aussi hors connexion).
export async function loadVat() {
  try {
    const rows = await db.select('profiles', `select=organizations(vat_enabled,vat_rate)&id=eq.${session().uid}`);
    const o = rows?.[0]?.organizations;
    if (!o) return getVat();
    const v = { enabled: !!o.vat_enabled, rate: Number(o.vat_rate) || 0 };
    localStorage.setItem(K, JSON.stringify(v));
    return v;
  } catch { return getVat(); }
}

export async function saveVat(enabled, rate) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Taux de TVA invalide (entre 0 et 100).');
  await db.rpc('set_vat', { p_on: enabled, p_rate: rate });
  localStorage.setItem(K, JSON.stringify({ enabled, rate }));
}
import { localStore as localStorage } from './storage.js';
