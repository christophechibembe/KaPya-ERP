// Entreprise rattachée au compte connecté. Le super administrateur voit toutes les entreprises :
// il faut donc toujours passer par le profil, et non prendre « la première » de la liste.
import { db, session } from './api.js';

export async function ownOrgRows(fields) {
  const rows = await db.select('profiles', `select=organizations(${fields})&id=eq.${session().uid}`).catch(() => null);
  if (rows === null) return [];
  const org = rows?.[0]?.organizations;
  return org ? [org] : [];
}
