// Surveillance des erreurs : enregistre les plantages de l'application dans la base (table app_errors),
// pour que le super administrateur puisse les voir. Limité à 20 envois par visite, sans doublon.
import { db, session } from './api.js';
import { APP_VERSION } from './version.js';

const sent = new Set();
let budget = 20;

async function report(message, source) {
  if (budget <= 0 || session().uid === 'demo') return;
  const text = String(message || 'Erreur inconnue').slice(0, 500);
  const key = text.slice(0, 120);
  if (sent.has(key)) return;
  sent.add(key);
  budget--;
  try {
    await db.insert('app_errors', {
      message: text,
      source: String(source || '').slice(0, 200),
      page: location.hash.slice(0, 200),
      app_version: APP_VERSION
    });
  } catch { /* la surveillance ne doit jamais bloquer l'application */ }
}

export function initMonitor() {
  addEventListener('error', event => report(event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
  addEventListener('unhandledrejection', event => report(event.reason?.message || String(event.reason), 'promise'));
}
