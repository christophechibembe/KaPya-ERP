// Rythme et état de la synchronisation hors ligne.
// Module pur : aucune lecture du navigateur, pour rester testable sans DOM.

// Vérification régulière : toutes les minutes, la décision ci-dessous décide s'il faut agir.
export const SYNC_CHECK_MS = 60 * 1000;
// Sans rien en attente, on vérifie la file au plus toutes les 5 minutes.
// Le préchargement complet des données reste limité à une fois toutes les 20 minutes (api.js).
export const SYNC_INTERVAL_MS = 5 * 60 * 1000;
// En cas d'échec réseau : 15 s, 30 s, 1 min, 2 min, 5 min, puis 15 min maximum.
export const BACKOFF_BASE_MS = 15 * 1000;
export const BACKOFF_MAX_MS = 15 * 60 * 1000;

const entier = value => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function retryDelay(attempts = 0, { base = BACKOFF_BASE_MS, max = BACKOFF_MAX_MS } = {}) {
  const n = entier(attempts);
  return Math.min(max, base * 2 ** Math.min(n, 10));
}

// Décide s'il faut lancer une synchronisation maintenant.
// - hors ligne : jamais, sauf reprise forcée (le drapeau du navigateur peut mentir
//   sur un réseau captif ou sur iOS : on tente alors malgré tout, avec backoff).
// - pièces en attente : après le délai de reprise (backoff) ;
// - rien en attente : rafraîchissement périodique de la copie locale.
// Les pièces refusées ne sont pas réessayées seules : l'utilisateur choisit dans Paramètres.
export function syncDecision({ online = true, forced = false, pending = 0, lastAttempt = 0, attempts = 0, lastSync = 0, now = Date.now(), interval = SYNC_INTERVAL_MS } = {}) {
  if (!online && !forced) return { run: false, reason: 'offline' };
  const waiting = entier(pending);
  if (waiting > 0) {
    const delay = retryDelay(attempts);
    const elapsed = Math.max(0, now - entier(lastAttempt));
    if (!lastAttempt || elapsed >= delay) return { run: true, reason: 'pending', delay };
    return { run: false, reason: 'backoff', retryIn: delay - elapsed };
  }
  if (!lastSync || now - entier(lastSync) >= interval) return { run: true, reason: 'periodic' };
  return { run: false, reason: 'idle' };
}

// Reprise automatique des refus temporaires du serveur : pas des refus métier
// (stock insuffisant, donnée invalide), qui restent au choix de l'utilisateur.
export const RETRYABLE_STATUSES = new Set([408, 409, 423, 429, 500, 502, 503, 504]);
export const MAX_AUTO_RETRIES = 3;
export function shouldAutoRetry(item, now = Date.now()) {
  if (!item || item.status !== 'rejected' || item.swRollback) return false;
  if (!RETRYABLE_STATUSES.has(Number(item.statusCode || 0))) return false;
  const attempts = Math.max(0, Math.floor(Number(item.retries) || 0));
  if (attempts >= MAX_AUTO_RETRIES) return false;
  const waited = now - Math.max(0, Number(item.rejectedAt) || 0);
  return waited >= retryDelay(attempts + 1);
}

// Profondeur de l'historique conservé sur l'appareil (copie locale hors ligne).
// Les valeurs sont volontairement bornées : « tout » n'est pas raisonnable sur un téléphone.
export const HISTORY_DEPTHS = [2000, 10000, 20000];
export const DEFAULT_HISTORY_DEPTH = 2000;
export function normalizeHistoryDepth(value) {
  const depth = Math.floor(Number(value));
  return HISTORY_DEPTHS.includes(depth) ? depth : DEFAULT_HISTORY_DEPTH;
}

export function formatAge(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 60 * 1000) return 'à l’instant';
  const minutes = Math.floor(value / 60000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

// Résumé lisible pour l'écran Paramètres > Mode hors-ligne.
export function offlineSummary({ online = true, pending = 0, rejected = 0, lastSync = 0, cacheCount = 0, cacheOldest = 0, cacheDays = 30, now = Date.now() } = {}) {
  const pendingCount = entier(pending);
  const rejectedCount = entier(rejected);
  const last = entier(lastSync);
  const oldest = entier(cacheOldest);
  const status = rejectedCount ? 'rejected' : !online ? 'offline' : pendingCount ? 'pending' : 'synced';
  return {
    online: !!online,
    pending: pendingCount,
    rejected: rejectedCount,
    lastSync: last,
    cacheCount: entier(cacheCount),
    cacheDays: entier(cacheDays) || 30,
    cacheAge: oldest ? Math.max(0, now - oldest) : null,
    cacheAgeLabel: oldest ? formatAge(now - oldest) : '',
    lastSyncLabel: last ? new Date(last).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
    status
  };
}
