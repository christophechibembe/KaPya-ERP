// Historique des actions : qui a créé, modifié ou supprimé une vente, un achat ou un paiement.
// Lecture seule. Les données viennent de la table audit_log (script sql/historique-actions.sql).
import { db } from '../api.js';
import { esc, ico, usdOnly } from '../ui.js';

const isoToday = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const isoDaysAgo = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const when = iso => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const TYPES = [
  ['', 'Toutes les opérations'],
  ['sales', 'Ventes'],
  ['purchases', 'Achats'],
  ['sale_payments', 'Paiements de crédit'],
  ['customer_deposits', 'Acomptes clients'],
  ['purchase_payments', 'Paiements fournisseurs'],
  ['business_expenses', 'Dépenses'],
  ['cash_closures', 'Clôtures de caisse'],
];
const ACTION = { insert: 'Créé', update: 'Modifié', delete: 'Supprimé' };
const ACTION_CLS = { insert: 'pos', update: '', delete: 'negative' };

// Champs utiles à afficher, par type de pièce (le reste reste accessible dans le détail brut).
const FIELDS = {
  sales: [['number', 'N°'], ['sold_at', 'Date'], ['payment', 'Paiement']],
  purchases: [['number', 'N°'], ['bought_at', 'Date']],
  sale_payments: [['kind', 'Type'], ['paid_at', 'Date'], ['amount', 'Montant', 'usd']],
  customer_deposits: [['receipt_number', 'Reçu'], ['received_at', 'Date'], ['amount', 'Montant', 'usd']],
  purchase_payments: [['paid_at', 'Date'], ['amount', 'Montant', 'usd']],
  business_expenses: [['label', 'Libellé'], ['paid_at', 'Date'], ['amount', 'Montant', 'usd']],
  cash_closures: [['business_date', 'Journée'], ['counted_total_usd', 'Compté', 'usd'], ['difference_usd', 'Écart', 'usd']],
};
const fmt = (v, kind) => kind === 'usd' ? usdOnly(Number(v || 0)) : v == null || v === '' ? '—' : esc(v);

function detail(row) {
  const data = row.after_data || row.before_data || {};
  const fields = (FIELDS[row.table_name] || []).filter(([k]) => data[k] != null)
    .map(([k, l, kind]) => `<span><small>${l}</small> ${fmt(data[k], kind)}</span>`).join('');
  const lines = (row.before_data?.lines || []).map(l => `<li>${esc(l.qty)} × ${usdOnly(Number(l.unit_price ?? l.unit_cost ?? 0))}</li>`).join('');
  const changed = row.action === 'update' && row.before_data && row.after_data
    ? Object.keys(row.after_data).filter(k => JSON.stringify(row.before_data[k]) !== JSON.stringify(row.after_data[k]) && !['updated_at'].includes(k))
    : [];
  return `<div class="hist-detail">
    ${fields ? `<div class="hist-fields">${fields}</div>` : ''}
    ${changed.length ? `<p class="muted">Champs modifiés : ${changed.map(esc).join(', ')}</p>` : ''}
    ${lines ? `<p><small>Lignes supprimées avec la pièce :</small></p><ul>${lines}</ul>` : ''}
    <details><summary>Détail brut</summary><pre>${esc(JSON.stringify({ avant: row.before_data, après: row.after_data }, null, 2))}</pre></details>
  </div>`;
}

export async function render(main, ctx) {
  const today = isoToday();
  main.innerHTML = `<div class="page-head"><div><h1>Historique des actions</h1><p class="sub">Qui a créé, modifié ou supprimé une vente, un achat ou un paiement.</p></div></div>
    <section class="card"><div class="hist-filters">
      <label><span>Du</span><input type="date" id="hist-from" value="${isoDaysAgo(7)}" max="${today}"></label>
      <label><span>Au</span><input type="date" id="hist-to" value="${today}" max="${today}"></label>
      <label><span>Opération</span><select id="hist-type">${TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label><span>Personne</span><input type="search" id="hist-who" placeholder="Nom ou rôle"></label>
    </div></section>
    <div id="hist-list" aria-live="polite" class="card empty">Chargement…</div>`;
  const list = main.querySelector('#hist-list');
  const from = main.querySelector('#hist-from');
  const to = main.querySelector('#hist-to');
  const type = main.querySelector('#hist-type');
  const who = main.querySelector('#hist-who');

  async function load() {
    list.innerHTML = '<div class="empty">Chargement…</div>';
    const params = [
      'select=id,occurred_at,actor_name,actor_role,table_name,record_id,action,summary,before_data,after_data',
      `occurred_at=gte.${from.value}T00:00:00`,
      `occurred_at=lt.${to.value}T23:59:59.999`,
      'order=occurred_at.desc,id.desc',
      'limit=300'
    ];
    if (type.value) params.push(`table_name=eq.${type.value}`);
    if (who.value.trim()) params.push(`or=(actor_name.ilike.*${encodeURIComponent(who.value.trim())}*,actor_role.ilike.*${encodeURIComponent(who.value.trim())}*)`);
    try {
      const rows = await db.select('audit_log', params.join('&'));
      if (!rows.length) { list.innerHTML = '<div class="empty">Aucune opération trouvée pour ces critères.</div>'; return; }
      list.innerHTML = `<div class="hist-list">${rows.map(r => `<details class="card hist-row">
        <summary>
          <span class="hist-time">${when(r.occurred_at)}</span>
          <span class="hist-what"><b>${esc(r.summary)}</b> <span class="${ACTION_CLS[r.action]}">${ACTION[r.action] || ''}</span></span>
          <span class="hist-who">${esc(r.actor_name || 'Système')}${r.actor_role ? ` · ${esc(r.actor_role)}` : ''}</span>
        </summary>${detail(r)}</details>`).join('')}</div>
        ${rows.length >= 300 ? '<p class="muted">Seules les 300 opérations les plus récentes sont affichées. Réduisez la période pour en voir davantage.</p>' : ''}`;
    } catch (error) {
      list.innerHTML = `<div class="card"><p class="err">Impossible de charger l’historique : ${esc(error.message)}.</p><p class="muted">Vérifiez que le script « historique-actions.sql » a été exécuté dans Supabase.</p></div>`;
    }
  }

  let timer;
  who.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  [from, to, type].forEach(el => el.addEventListener('change', load));
  await load();
}
