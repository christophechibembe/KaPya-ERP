// KaPya ERP — présentation du tableau de bord.
// Trois présentations pour le même tableau de bord et les mêmes données :
//   classic       : tableau de bord historique, inchangé (par défaut)
//   modern_pc     : cartes aérées, filtres regroupés, graphiques côte à côte
//   modern_mobile : lecture au pouce, cartes compactes, filtres compacts
// Aucun calcul métier ici : uniquement des préférences d'affichage.
import { CFG } from './config.js';
import { localStore as localStorage } from './storage.js';

export const MODES = ['classic', 'modern_pc', 'modern_mobile'];
export const MODE_LABELS = {
  classic: 'Classique',
  modern_pc: 'Moderne PC',
  modern_mobile: 'Moderne mobile'
};
export const DASHBOARD_MODE_EVENT = 'kp:dashboard-mode-change';
export const BREAKPOINTS = { mobile: 320, tablet: 768, pc: 1024 };

// Préférence de l'appareil (dernier choix fait ici) et préférence du compte.
const DEVICE_KEY = 'kp.dashboard.mode';
const userKey = uid => `kp.dashboard.mode.user.${uid}`;

const isMode = value => MODES.includes(value);

function read(key) {
  try {
    const value = localStorage.getItem(key);
    return isMode(value) ? value : null;
  } catch { return null; }
}

function write(key, mode) {
  try { localStorage.setItem(key, mode); } catch { /* stockage indisponible : on garde le défaut */ }
}

// Identifiant du compte connecté, sans dépendre du module api.js.
export function currentUid() {
  try {
    const session = JSON.parse(localStorage.getItem('kp.session') || 'null');
    return session && session.uid ? session.uid : null;
  } catch { return null; }
}

export function getDeviceMode() { return read(DEVICE_KEY); }
export function getUserMode(uid = currentUid()) { return uid ? read(userKey(uid)) : null; }
export function getStoredMode(uid = currentUid()) { return getUserMode(uid) || getDeviceMode(); }

export function screenWidth() {
  return Math.max(0, Number(window.innerWidth) || 0);
}

// Détection automatique : téléphone, tablette, ordinateur.
export function detectMode(width = screenWidth()) {
  if (width >= BREAKPOINTS.tablet) return 'modern_pc';
  if (width >= BREAKPOINTS.mobile) return 'modern_mobile';
  return 'classic';
}

// Mode réellement affiché : choix enregistré, sinon détection de l'écran.
export function resolveMode(uid = currentUid()) {
  const config = CFG.dashboard || {};
  if (config.autoDetectDevice === false) return getStoredMode(uid) || config.mode || 'classic';
  // Chaque présentation s'adapte en CSS : la largeur ne remplace jamais un choix explicite.
  return getStoredMode(uid) || detectMode();
}

// Applique la présentation au document.
export function applyMode(mode) {
  const resolved = isMode(mode) ? mode : 'classic';
  const root = document.documentElement;
  if (root) root.dataset.dashboardMode = resolved;
  const body = document.body;
  if (body) {
    body.classList.toggle('dashboard-mode-pc', resolved === 'modern_pc');
    body.classList.toggle('dashboard-mode-mobile', resolved === 'modern_mobile');
  }
  return resolved;
}

// Enregistre le choix pour ce compte ET pour cet appareil, puis l'applique.
export function setMode(mode, uid = currentUid()) {
  if (!isMode(mode)) throw new Error('Présentation de tableau de bord inconnue.');
  write(DEVICE_KEY, mode);
  if (uid) write(userKey(uid), mode);
  applyMode(mode);
  window.dispatchEvent(new CustomEvent(DASHBOARD_MODE_EVENT, { detail: { mode } }));
  return mode;
}

// Présentation suivante : Classique → Moderne PC → Moderne mobile → Classique.
export function nextMode() {
  const current = getDeviceMode() || resolveMode();
  return MODES[(MODES.indexOf(current) + 1) % MODES.length];
}

// Au démarrage : applique le choix enregistré (ou la détection de l'écran).
export function initDashboardMode() {
  return applyMode(resolveMode());
}

if (typeof window !== 'undefined') {
  // Changement de largeur (rotation, fenêtre redimensionnée) : on suit seulement
  // tant que l'utilisateur n'a pas fait de choix explicite.
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!getStoredMode()) applyMode(resolveMode());
    }, 150);
  });
}
