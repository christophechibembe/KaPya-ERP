// Notes de version affichées une fois dans l'application, après une mise à jour.
import { APP_VERSION } from './version.js';

export const NEWS = {
  version: APP_VERSION,
  title: 'Nouveautés de KaPya ERP',
  items: [
    'Une seule entrée « Vente » pour encaisser, avec le bouton Enregistrer toujours visible sur téléphone.',
    'Mobile money : choisissez l’opérateur (Airtel, M-Pesa, Orange) et notez la référence.',
    'Nom du client facultatif : sans nom, la vente reste au nom de « Client comptoir ».',
    'Panier sauvegardé : il revient si l’application se ferme pendant une vente.',
    'Hors connexion : une vente faite sans réseau est envoyée dès le retour de la connexion.'
  ]
};

const key = uid => `kp.news.${uid}.${NEWS.version}`;

// Affiche le bandeau une seule fois par compte et par version.
export function showNews(uid, next = () => {}) {
  if (!uid) return next();
  try { if (localStorage.getItem(key(uid))) return next(); } catch { return next(); }
  const box = document.createElement('div');
  box.id = 'news';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', NEWS.title);
  box.innerHTML = `<div class="news-card"><h2>${NEWS.title} · ${NEWS.version}</h2><ul>${NEWS.items.map(i => `<li>${i}</li>`).join('')}</ul><button class="btn" id="news-ok" type="button">J’ai compris</button></div>`;
  document.body.append(box);
  box.querySelector('#news-ok').addEventListener('click', () => {
    try { localStorage.setItem(key(uid), '1'); } catch { /* ignoré */ }
    box.remove();
    next();
  });
}
