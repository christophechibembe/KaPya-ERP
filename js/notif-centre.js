// Centre de notifications de l'application : ce qui demande une action, calculé à partir des données locales.
import { db, pendingCount, rejectedItems, lastSyncTime } from './api.js';

export async function collectNotifications(ctx = {}) {
  const items = [];
  // Abonnement de l'entreprise : échéance proche ou dépassée (gérant)
  if (ctx.role === 'admin' && !ctx.platform && ctx.org_id) {
    const [org] = await db.select('organizations', `select=expires_at,status&id=eq.${ctx.org_id}`).catch(() => []);
    if (org?.expires_at) {
      const jours = Math.ceil((new Date(org.expires_at) - Date.now()) / 86400000);
      if (jours < 0) items.push({ level: 'bad', text: 'Abonnement expiré : renouvelez-le dans Paramètres', go: '#/parametres' });
      else if (jours <= 7) items.push({ level: 'warn', text: `Abonnement : échéance dans ${jours} jour(s)`, go: '#/parametres' });
    }
  }
  // Paiements Airtel Money à valider (super administrateur)
  if (ctx.platform) {
    const attente = await db.rpc('paiements_en_attente').catch(() => []);
    if (attente.length) items.push({ level: 'warn', text: `${attente.length} paiement(s) d’abonnement à valider`, go: '#/abonnes' });
  }
  const rej = await rejectedItems().catch(() => []);
  if (rej.length) items.push({ level: 'bad', text: `${rej.length} opération(s) refusée(s) par le serveur`, go: '#/ventes' });
  const pend = await pendingCount().catch(() => 0);
  if (pend - rej.length > 0) items.push({ level: 'warn', text: `${pend - rej.length} opération(s) en attente d’envoi`, go: '' });
  const t = lastSyncTime();
  if (!t || Date.now() - t > 2 * 86400000) items.push({ level: 'info', text: 'Données non synchronisées depuis plus de 2 jours', go: '' });
  return items;
}

export function renderNotifications(items) {
  const bouton = '<button class="ghost" type="button" data-push-on style="margin-top:6px;width:100%">Activer les notifications sur cet appareil</button>';
  if (!items.length) return '<p class="notif-empty">Aucune notification.</p>' + bouton;
  return items.map(i => `<div class="notif notif-${i.level}">${i.go ? `<a href="${i.go}">${i.text}</a>` : `<span>${i.text}</span>`}</div>`).join('') + bouton;
}
