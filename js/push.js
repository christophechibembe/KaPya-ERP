// Notifications sur cet appareil (téléphone, ordinateur, Mac).
// Seule la clé PUBLIQUE VAPID est dans l'application (config.js). La clé privée reste sur Supabase.
import { CFG, VAPID_PUBLIC_KEY } from './config.js';
import { session } from './api.js';

const toBytes = b64 => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};

export const pushSupported = () => !CFG.demo && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Attend une promesse au plus X ms : évite qu'un bouton reste sans réaction si le service worker ne répond pas
const avec = (promesse, ms, message) => new Promise((ok, ko) => {
  const t = setTimeout(() => ko(new Error(message)), ms);
  promesse.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); ko(e); });
});

// Demande la permission, abonne l'appareil, et enregistre l'abonnement dans la base.
// Chaque étape a un message clair : plus de clic sans réaction.
export async function activerNotifications() {
  if (!pushSupported()) throw new Error('Notifications non prises en charge ici. Sur iPhone, installez d’abord l’application sur l’écran d’accueil.');
  if (!VAPID_PUBLIC_KEY) throw new Error('Clé de notification non configurée (config.js).');
  if (Notification.permission === 'denied') throw new Error('Notifications bloquées pour ce site. Autorisez-les dans les réglages du navigateur (cadenas à côté de l’adresse), puis réessayez.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications non autorisées. Acceptez la demande du navigateur pour les activer.');
  const reg = await avec(navigator.serviceWorker.ready, 8000, 'Le service de notifications ne démarre pas. Rechargez la page. Sur ordinateur de test, utilisez l’adresse https du site (le service ne tourne pas en localhost).');
  let sub;
  try {
    sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) }));
  } catch (e) {
    throw new Error('Impossible de s’abonner aux notifications sur cet appareil : ' + (e?.message || e));
  }
  const j = sub.toJSON();
  const s = session();
  const rp = await fetch(`${CFG.url}/rest/v1/profiles?select=org_id&id=eq.${s.uid}`, { headers: { apikey: CFG.key, Authorization: `Bearer ${s.access}` } });
  const [p] = rp.ok ? await rp.json() : [];
  if (!p?.org_id) throw new Error('Profil introuvable. Reconnectez-vous puis réessayez.');
  const res = await fetch(`${CFG.url}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CFG.key, Authorization: `Bearer ${s.access}`, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ org_id: p.org_id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth })
  });
  if (!res.ok) throw new Error(`Enregistrement de l’appareil refusé par le serveur (code ${res.status}). Réessayez ou contactez le support.`);
  return true;
}

// Prévient les gérants et responsables. N'interrompt jamais l'application.
export async function prevenirStaff(title, body, link = '/') {
  if (CFG.demo || !VAPID_PUBLIC_KEY) return;
  try {
    await fetch(`${CFG.url}/functions/v1/notify-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.key, Authorization: `Bearer ${session().access}` },
      body: JSON.stringify({ title, body, link })
    });
  } catch { /* hors connexion : rien à faire */ }
}
