import { db, session, pendingFor, pendingCount, pendingOps, rejectedItems, lastSyncTime, retryRejected, discardRejected, syncNow, selectArticlesWithTotal } from '../api.js';
import { dashKey, readDash, writeDash } from '../dash-cache.js';
import { esc, n, money, usdOnly, fcOnly, ico, openDialog, showDialog, fld, fmtDate, fmtDateTime, notify } from '../ui.js';
import { listeOuErreur } from '../ui.js';
import { can } from '../roles.js';
import { resolveMode as resolveDashboardMode, applyMode as applyDashboardMode, nextMode as nextDashboardMode, setMode as setDashboardMode, MODE_LABELS as DASHBOARD_MODE_LABELS } from '../dashboard-modes.js';
import { renderModernPage, renderModernContent, renderModernLoading, renderModernFailure, renderModernDetail, bindModernInteractions, paintModernComparisons, PERIOD_LABELS as MODERN_PERIOD_LABELS } from '../dashboard-modern.js';
import { previousPeriod, periodFigures, modernDetails } from '../dashboard-insights.mjs';
import { pendingSaleRows, pendingSaleTotal } from '../offline-pending.mjs';
import { loadShops, shopSelectHtml, shopSalesFilter, shopPaymentsSelect, shopPaymentsFilter, setShop, getShop, canSeeAllShops } from '../shops.js';

const isoDate = date => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const parseDate = value => new Date(`${value}T12:00:00`);
const shiftDate = (value, days) => { const date = parseDate(value); date.setDate(date.getDate() + days); return isoDate(date); };
const fr = value => value ? parseDate(value.slice(0, 10)).toLocaleDateString('fr-FR') : '—';
const sumLines = (lines, key) => (lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line[key] || 0), 0);
const cap = value => value.charAt(0).toLocaleUpperCase('fr') + value.slice(1);
const stockMoveLabel = reason => ({ sale: 'Vente', purchase: 'Achat', adjustment: 'Ajustement', transfer: 'Transfert' }[reason] || 'Mouvement');

// Blocs du tableau de bord : chacun peut choisir ceux qu'il veut voir (préférence enregistrée sur son compte).
const BLOCK_LABELS = { daily: 'Résumé de caisse du jour', kpi: 'Indicateurs clés', charts: 'Graphiques ventes, achats et stock', moves: 'Derniers mouvements de stock', watch: 'Points à surveiller', cashout: 'Dernières sorties de trésorerie' };
const DEFAULT_BLOCKS = {
  admin: ['daily', 'kpi', 'charts', 'moves', 'watch', 'cashout'],
  manager: ['daily', 'kpi', 'charts', 'moves', 'watch', 'cashout'],
  comptable: ['daily', 'kpi', 'charts', 'moves', 'watch'],
  facturier: ['daily', 'kpi', 'charts', 'moves', 'watch'],
  user: ['daily', 'kpi', 'charts', 'moves'],
};
const BLOCK_PREF_KEY = 'kp.dashboard.blocks';
// Résumé en français, calculé sans IA à partir des chiffres déjà affichés.
function buildSummary(s) {
  const out = [];
  const period = s.from === s.to ? `le ${s.dateText}` : `du ${s.dateText}`;
  if (!s.sales.length) out.push(`Aucune vente enregistrée ${period}.`);
  else {
    const cash = s.sales.filter(sale => sale.payment !== 'credit').reduce((total, sale) => total + sumLines(sale.sale_lines, 'unit_price'), 0);
    const pct = s.revenue ? Math.round(cash / s.revenue * 100) : 0;
    out.push(`${s.sales.length} vente(s) ${period}, pour ${usdOnly(s.revenue)}, dont ${pct} % payées comptant.`);
  }
  if (s.outstanding > 0.005) out.push(`Crédits clients restant à recouvrer : ${usdOnly(s.outstanding)}.`);
  if (s.expiring && s.expiring.length) {
    const first = s.expiring[0];
    out.push(`${s.expiring.length} lot(s) proche(s) de la péremption (30 jours), dont ${esc(first.articles?.name || 'un article')} le ${fmtDate(String(first.expiry_date))}.`);
  }
  if (s.lowStock.length) {
    const names = s.lowStock.slice(0, 3).map(a => esc(a.name)).join(', ');
    out.push(`${s.lowStock.length} article(s) sous le seuil d’alerte : ${names}${s.lowStock.length > 3 ? ' et d’autres' : ''}.`);
  }
  if (s.canSeeCosts) out.push(s.cashNet >= 0 ? `Trésorerie nette positive : ${usdOnly(s.cashNet)}.` : `Trésorerie nette négative : ${usdOnly(s.cashNet)}, les sorties dépassent les entrées.`);
  return out;
}
async function loadBlockPrefs() {
  if (session().uid === 'demo') { try { return JSON.parse(localStorage.getItem(BLOCK_PREF_KEY)) || null; } catch { return null; } }
  return db.select('dashboard_preferences', 'select=blocks').then(r => (r[0]?.blocks) || null).catch(() => null);
}
async function saveBlockPrefs(blocks) {
  if (session().uid === 'demo') { localStorage.setItem(BLOCK_PREF_KEY, JSON.stringify(blocks)); return; }
  await db.upsert('dashboard_preferences', { user_id: session().uid, blocks }, 'user_id');
}

const dayAfter = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 1); return x.toLocaleDateString('sv-SE'); };

// Ventes faites hors ligne (file d'attente de l'appareil), comptées dans le résumé du jour
async function pendingTodayTotals(day) {
  const out = { cash: 0, credit: 0, receipts: 0, count: 0 };
  const items = await pendingFor('sales').catch(() => []);
  for (const it of items) {
    if (it.status === 'rejected' || !it.body || it.body.p_date !== day) continue;
    const total = (it.body.p_lines || []).reduce((t, l) => t + Number(l.qty || 0) * Number(l.unit_price || 0) * (1 - Number(l.discount_pct || 0) / 100), 0);
    const paid = Number(it.body.p_paid || 0);
    out.count += 1;
    if (it.body.p_payment === 'credit') { out.credit += total; out.receipts += paid; }
    else out.cash += total;
  }
  // Paiements de crédit faits hors ligne : ils entrent dans les paiements reçus du jour
  const credPays = await pendingOps('record_credit_payment').catch(() => []);
  for (const it of credPays) {
    const when = String(it.body?.p_paid_at || new Date().toISOString()).slice(0, 10);
    if (when !== day) continue;
    out.receipts += Number(it.body?.p_amount || 0);
    out.count += 1;
  }
  return out;
}

// Bandeau « Hors ligne » : heure des données affichées et ventes en attente d'envoi
async function offlineBanner() {
  const pend = await pendingCount().catch(() => 0);
  const rej = (await rejectedItems().catch(() => [])).length;
  const off = !navigator.onLine;
  if (!off && !pend && !rej) return '';
  const t = lastSyncTime();
  const when = t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'inconnue';
  return `<div class="card sync-note" role="status"><b>${off ? 'Hors ligne' : 'En attente d’envoi'}</b> · données du ${esc(when)}${pend ? ` · ${pend} opération(s) en attente d'envoi ; les ventes en attente sont comptées dans les chiffres, avec la mention « En attente »` : ''}${rej ? ` · <button type="button" class="lnk" data-rej-open><b>${rej} opération(s) refusée(s) : voir et corriger</b></button>` : ''}</div>`;
}


// Ouverture depuis le bandeau « Hors ligne » (délégation : fonctionne sur tous les rendus)
document.addEventListener('click', e => { if (e.target.closest('[data-rej-open]')) openRejectedDialog(); });

// Liste des opérations refusées par le serveur : réessayer ou abandonner, une par une
const REJ_LABEL = { create_sale: 'Vente', create_purchase: 'Achat', create_transfer: 'Transfert', record_credit_payment: 'Paiement de crédit', create_customer_return: 'Retour client', create_credit_note: 'Avoir', create_customer_deposit: 'Acompte client', update_sale: 'Modification de vente', update_credit_payment: 'Modification de paiement', cancel_credit_payment: 'Annulation de paiement', create_supplier_return: 'Retour fournisseur', create_stock_lot: 'Lot de stock', close_cash_day: 'Clôture de caisse' };
async function openRejectedDialog() {
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const ov = document.createElement('div');
  ov.className = 'doc-preview-overlay';
  ov.innerHTML = '<div class="doc-preview-box rej-box" role="dialog" aria-label="Opérations refusées"><div class="doc-preview-bar"><b>Opérations refusées par le serveur</b><span class="doc-preview-btns"><button class="ghost" type="button" data-rej-close>Fermer</button></span></div><div class="rej-body"></div></div>';
  document.body.appendChild(ov);
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const body = ov.querySelector('.rej-body');
  const draw = async () => {
    const items = await rejectedItems().catch(() => []);
    if (!items.length) { body.innerHTML = '<p class="muted">Aucune opération refusée. Tout est synchronisé.</p>'; return; }
    body.innerHTML = '<p class="muted">Ces opérations n’ont pas été acceptées par le serveur (stock insuffisant, donnée refusée…). Elles ne sont pas comptées. Corrigez la cause, puis réessayez, ou abandonnez.</p>' +
      items.map(it => `<div class="rej-item"><div><b>${esc(REJ_LABEL[it.fn] || it.fn)}</b> <span class="muted">· ${esc(fmtDateTime(it.createdAt || it.at || it.ts || ''))}</span><div class="rej-err">${esc(it.error || 'Refus du serveur')}</div></div><div class="rej-acts"><button class="btn" type="button" data-rej-retry="${it.seq}">Réessayer</button><button class="ghost" type="button" data-rej-drop="${it.seq}">Abandonner</button></div></div>`).join('');
  };
  ov.addEventListener('click', async e => {
    if (e.target === ov || e.target.closest('[data-rej-close]')) return close();
    const r = e.target.closest('[data-rej-retry]'), d = e.target.closest('[data-rej-drop]');
    if (r) { r.disabled = true; await retryRejected(Number(r.dataset.rejRetry)); await draw(); }
    if (d && (await askConfirm('Abandonner cette opération ? Elle ne sera pas envoyée au serveur.'))) { await discardRejected(Number(d.dataset.rejDrop)); await draw(); }
  });
  await draw();
}

// Message de bienvenue gardé pour les changements de présentation (aucune requête en plus).
const greetingCache = new Map();
const navigationLabels = new WeakMap();
function updateNavigationLabels(mode) {
  const compact = { accueil: 'Accueil', ventes: 'Ventes', stocks: 'Stock' };
  document.querySelectorAll('#nav a[data-r] > span').forEach(span => {
    if (!navigationLabels.has(span)) navigationLabels.set(span, span.textContent);
    const label = compact[span.parentElement.dataset.r];
    span.textContent = mode === 'modern_mobile' && label ? label : navigationLabels.get(span);
  });
}

export async function render(main, ctx) {
  // Présentation du tableau de bord : classique (par défaut) ou moderne.
  // Les trois présentations utilisent exactement les mêmes données et les mêmes calculs.
  let activeMode = resolveDashboardMode(ctx?.id);
  applyDashboardMode(activeMode);

  const today = isoDate(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const canSeeCosts = ctx?.role === 'admin';
  const canRecordCashOut = ctx?.role === 'admin';
  const canSeeDailyCreditSummary = ['admin', 'manager'].includes(ctx?.role);
  // Résumé de caisse du jour (ventes cash, à crédit, versements) : visible par tous ceux qui voient les ventes.
  const canSeeDailySummary = can(ctx?.role, 'ventes.view');

  // Les facturiers (équipe de vente/caisse) ne voient qu'un résumé journalier opérationnel.
  if (ctx?.role === 'facturier') {
    const greetProfile = await db.select('profiles', `select=org_id,full_name&id=eq.${session().uid}`).catch(() => []);
    const [greetOrg] = await db.select('organizations', `select=name&id=eq.${greetProfile[0]?.org_id}`).catch(() => []);
    const firstName = (greetProfile[0]?.full_name || '').trim().split(/\s+/)[0] || '';
    const who = firstName ? esc(firstName) : (ctx?.role === 'admin' ? 'patron' : '');
    const greetParts = [who ? `Bonjour ${who}` : '', greetOrg?.name ? `Bienvenue chez ${esc(greetOrg.name)}` : ''].filter(Boolean);
    const greet = greetParts.length ? `<p class="greet">${greetParts.join(' · ')}</p>` : '';
    main.innerHTML = `<div class="page-head owner-head"><div><h1>Activité du jour</h1>${greet}<p class="sub">Ventes cash, ventes à crédit et paiements de crédits reçus.</p></div><label class="owner-filters"><span>Date</span><input type="date" id="staff-day" value="${today}"></label></div><div id="staff-day-content" aria-live="polite"><div class="card empty">Chargement…</div></div>`;
    const dayInput = main.querySelector('#staff-day');
    const content = main.querySelector('#staff-day-content');
    const loadDay = async () => {
      const day = dayInput.value || today;
      const nextDay = shiftDate(day, 1);
      content.innerHTML = '<div class="card empty">Chargement…</div>';
      try {
        const [sales, cashSales, receipts] = await Promise.all([
          db.select('sales', `select=id,number,customer_label,sold_at,payment,customers(name),sale_lines(qty,unit_price)&payment=eq.credit&sold_at=gte.${day}&sold_at=lt.${nextDay}&order=sold_at.desc`),
          db.select('sales', `select=id,number,customer_label,sold_at,payment,customers(name),sale_lines(qty,unit_price)&payment=eq.cash&sold_at=gte.${day}&sold_at=lt.${nextDay}&order=sold_at.desc`),
          db.select('sale_payments', `select=id,amount,paid_at,kind,sales(number,customer_label,customers(name))&paid_at=gte.${day}T00:00:00&paid_at=lt.${dayAfter(day)}T00:00:00&kind=in.(initial,payment)&order=paid_at.desc`)
        ]);
        const creditTotal = sales.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0);
        const cashTotal = cashSales.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0);
        const receiptTotal = receipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
        const operations = [
          ...cashSales.map(sale => ({ date: sale.sold_at, type: 'Vente cash', reference: sale.number, customer: sale.customers?.name || sale.customer_label || 'Client particulier', amount: sumLines(sale.sale_lines, 'unit_price') })),
          ...sales.map(sale => ({ date: sale.sold_at, type: 'Vente à crédit', reference: sale.number, customer: sale.customers?.name || sale.customer_label || 'Client particulier', amount: sumLines(sale.sale_lines, 'unit_price') })),
          ...receipts.map(receipt => ({ date: receipt.paid_at, type: receipt.kind === 'initial' ? 'Versement initial' : 'Paiement de crédit', reference: receipt.sales?.number || '—', customer: receipt.sales?.customers?.name || receipt.sales?.customer_label || 'Client', amount: Number(receipt.amount || 0) }))
        ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const operationRows = operations.map(item => `<tr><td>${fr(item.date)}</td><td><span class="staff-activity-type">${esc(item.type)}</span></td><td><b>${esc(item.reference || '—')}</b><span class="staff-activity-client">${esc(item.customer)}</span></td><td class="r"><b>${usdOnly(item.amount)}</b></td></tr>`).join('');
        content.innerHTML = `<div class="owner-period-label">Résumé du ${fr(day)}</div><section class="kpis owner-kpis">${metric('Ventes cash', usdOnly(cashTotal), `${cashSales.length} facture(s) payée(s) comptant`, 'cash', 't-green')}${metric('Ventes à crédit', usdOnly(creditTotal), `${sales.length} facture(s) créée(s)`, 'sales', 't-blue')}${metric('Paiements de crédits reçus', usdOnly(receiptTotal), `${receipts.length} versement(s) encaissé(s)`, 'coins', 't-purple')}${metric('Total encaissé', usdOnly(cashTotal + receiptTotal), 'Ventes cash + paiements reçus', 'wallet', 't-orange')}</section><section class="card staff-activity"><div class="sec-head"><div><h2>Opérations de la journée</h2><p class="muted">Factures et encaissements enregistrés le ${fr(day)}.</p></div><span class="staff-activity-count">${operations.length} opération(s)</span></div>${operations.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Opération</th><th>Référence / client</th><th class="r">Montant</th></tr></thead><tbody>${operationRows}</tbody></table></div>` : '<p class="staff-activity-empty">Aucune vente ni aucun encaissement enregistré pour cette journée.</p>'}</section>`;
      } catch (error) {
        content.innerHTML = `<div class="card"><p class="err">Impossible de charger le résumé : ${esc(error.message)}</p></div>`;
      }
    };
    dayInput.addEventListener('change', loadDay);
    await loadDay();
    return;
  }

  const classicPage = () => `<div class="page-head owner-head"><div><h1>Tableau de bord</h1><p class="greet" id="owner-greet"></p><p class="sub">Vue de la performance et des mouvements de votre activité.</p></div>
    <div class="owner-filters"><label><span>Période</span><select id="owner-period"><option value="today">Aujourd’hui</option><option value="7" selected>7 derniers jours</option><option value="month">Ce mois</option><option value="custom">Période personnalisée</option></select></label>
      <label class="owner-date" hidden><span>Du</span><input type="date" id="owner-from" value="${monthStart}"></label>
      <label class="owner-date" hidden><span>Au</span><input type="date" id="owner-to" value="${today}"></label>
      <button class="btn" id="owner-run" type="button" hidden>Afficher</button>
      <button class="ghost" id="owner-refresh" type="button" title="Recharger les chiffres maintenant">Actualiser</button>
      <button class="ghost" id="owner-customize" type="button">Personnaliser</button>
      <button class="ghost" id="owner-mode" type="button" title="Changer la présentation du tableau de bord">Présentation : ${DASHBOARD_MODE_LABELS[activeMode]}</button>
      <button class="ghost" id="owner-summary" type="button">Résumer la période</button>
      ${canRecordCashOut ? '<button class="ghost" id="owner-expense" type="button">+ Dépense</button><button class="ghost" id="owner-init-supplier" type="button">Solde anciennes factures</button><button class="btn" id="owner-supplier-payment" type="button">+ Paiement fournisseur</button>' : ''}
    </div></div>
    <p class="muted owner-updated" id="owner-updated" aria-live="polite" hidden></p>
    <div id="owner-content" aria-live="polite"><div class="card empty">Chargement des données…</div></div><dialog id="owner-dialog"></dialog>`;
  const modernPage = (mode, periodValue) => renderModernPage({
    mode,
    modeLabel: DASHBOARD_MODE_LABELS[mode],
    greeting: greetingCache.get(session().uid) || '',
    userName: ctx?.full_name || '',
    canRecordCashOut,
    canCreateSale: can(ctx?.role, 'ventes.write'),
    monthStart,
    today,
    periodValue: periodValue || '7'
  });
  const pageHtml = (mode, periodValue) => mode === 'classic' ? classicPage() : modernPage(mode, periodValue);
  const $ = selector => main.querySelector(selector);
  // Chaque rendu possède son jeton : un chargement lancé avant un changement de page ne doit jamais
  // écrire dans le DOM du rendu suivant (sinon le tableau de bord peut rester sur « Chargement »).
  const viewToken = Symbol('tableau-de-bord');
  main._dashToken = viewToken;
  document.body.classList.add('kp-dashboard-page');
  const alive = () => main.isConnected && main.dataset.page === 'accueil' && main._dashToken === viewToken;
  let lastRefresh = 0;
  const paintUpdated = at => {
    if (!alive()) return;
    const stamp = $('#owner-updated');
    if (!stamp) return;
    stamp.hidden = false;
    stamp.textContent = `Chiffres à jour · ${new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  function setRangeControls() {
    const custom = $('#owner-period').value === 'custom';
    main.querySelectorAll('.owner-date').forEach(element => { element.hidden = !custom; });
    const chip = $('#mdp-period-chip');
    if (chip) chip.textContent = MODERN_PERIOD_LABELS[$('#owner-period').value] || chip.textContent;
    $('#owner-run').hidden = !custom;
    if (!custom) refresh();
  }

  const bucketData = (from, to, rows, dateOf, valueOf) => {
    const count = Math.max(1, Math.round((parseDate(to) - parseDate(from)) / 86400000) + 1);
    const step = count <= 14 ? 1 : Math.ceil(count / 7);
    const buckets = [];
    for (let day = 0; day < count; day += step) {
      const start = shiftDate(from, day), end = shiftDate(from, Math.min(day + step, count) - 1);
      buckets.push({ start, end, label: count <= 14 ? parseDate(start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', '') : `${start.slice(8, 10)}/${start.slice(5, 7)}`, value: 0 });
    }
    for (const row of rows) {
      const date = dateOf(row)?.slice(0, 10);
      const bucket = buckets.find(item => date >= item.start && date <= item.end);
      if (bucket) bucket.value += valueOf(row);
    }
    return buckets;
  };

  function bars(valuesA, valuesB, labelA, labelB, aria) {
    const width = 660, height = 230, left = 34, right = 10, top = 18, bottom = 34;
    const max = Math.max(1, ...valuesA.map(item => item.value), ...(valuesB || []).map(item => item.value));
    const plotHeight = height - top - bottom, plotWidth = width - left - right;
    const group = plotWidth / valuesA.length, barWidth = Math.min(20, group * .27);
    const grid = [0, .5, 1].map(f => `<line class="owner-gridline" x1="${left}" x2="${width - right}" y1="${top + plotHeight * (1 - f)}" y2="${top + plotHeight * (1 - f)}"/>`).join('');
    const marks = valuesA.map((item, index) => {
      const center = left + group * index + group / 2;
      const hA = item.value / max * plotHeight;
      const hB = valuesB ? valuesB[index].value / max * plotHeight : 0;
      const xA = center - (valuesB ? barWidth + 2 : barWidth / 2);
      const xB = center + 2;
      return `<rect class="owner-bar-a" x="${xA}" y="${top + plotHeight - hA}" width="${barWidth}" height="${Math.max(hA, 1)}" rx="4"><title>${esc(labelA)} · ${esc(item.label)} : ${n(item.value)}</title></rect>${valuesB ? `<rect class="owner-bar-b" x="${xB}" y="${top + plotHeight - hB}" width="${barWidth}" height="${Math.max(hB, 1)}" rx="4"><title>${esc(labelB)} · ${esc(item.label)} : ${n(valuesB[index].value)}</title></rect>` : ''}<text class="owner-axis" x="${center}" y="${height - 8}" text-anchor="middle">${esc(item.label)}</text>`;
    }).join('');
    return `<svg class="owner-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}">${grid}${marks}</svg>`;
  }

  function simpleBars(buckets, aria) {
    const width = 660, height = 230, left = 34, right = 10, top = 26, bottom = 34;
    const max = Math.max(1, ...buckets.map(item => item.value));
    const plotHeight = height - top - bottom, plotWidth = width - left - right;
    const group = plotWidth / buckets.length, barWidth = Math.min(28, group * .5);
    const grid = [0, .5, 1].map(f => `<line class="owner-gridline" x1="${left}" x2="${width - right}" y1="${top + plotHeight * (1 - f)}" y2="${top + plotHeight * (1 - f)}"/>`).join('');
    const marks = buckets.map((item, index) => {
      const center = left + group * index + group / 2;
      const h = item.value / max * plotHeight;
      const y = top + plotHeight - h;
      return `<rect class="owner-bar-a" x="${center - barWidth / 2}" y="${y}" width="${barWidth}" height="${Math.max(h, 0)}" rx="4"><title>${esc(item.label)} : ${esc(usdOnly(item.value))}</title></rect>${item.value > 0 ? `<text class="owner-axis" x="${center}" y="${y - 6}" text-anchor="middle">${esc(n(Math.round(item.value)))}</text>` : ''}<text class="owner-axis" x="${center}" y="${height - 8}" text-anchor="middle">${esc(item.label)}</text>`;
    }).join('');
    return `<svg class="owner-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}">${grid}${marks}</svg>`;
  }

  function metric(label, value, detail, icon, tone) {
    return `<article class="card kpi owner-kpi ${tone}"><div class="kh"><span class="kbub">${ico(icon)}</span><span>${label}</span></div><b>${value}</b><span>${detail}</span></article>`;
  }

  async function openExpenseDialog() {
    openDialog($('#owner-dialog'), 'Enregistrer une dépense',
      `${fld('label','Description','text','required maxlength="120" placeholder="Ex. transport, loyer…"')}${fld('category','Catégorie','text','required maxlength="60" placeholder="Ex. Transport"')}${fld('amount','Montant (USD)','number','required min="0.01" step="0.01"')}${fld('paid_at','Date','date',`required value="${today}"`)}`,
      v => db.rpc('record_business_expense', { p_label: v.label.trim(), p_category: v.category.trim(), p_amount: Number(v.amount), p_paid_at: v.paid_at }), refresh);
  }

  async function openSupplierPaymentDialog() {
    try {
      const [purchases, balances, payments] = await Promise.all([
        db.select('purchases', 'select=id,number,bought_at,suppliers(name),purchase_lines(qty,unit_cost)&order=bought_at.desc'),
        db.select('purchase_payment_balances', 'select=purchase_id,opening_balance'),
        db.select('purchase_payments', 'select=purchase_id,amount')
      ]);
      const balanceByPurchase = new Map(balances.map(row => [row.purchase_id, Number(row.opening_balance)]));
      const paidByPurchase = new Map();
      payments.forEach(row => paidByPurchase.set(row.purchase_id, (paidByPurchase.get(row.purchase_id) || 0) + Number(row.amount || 0)));
      const due = purchases.map(p => ({ ...p, opening: balanceByPurchase.get(p.id) ?? null, total: sumLines(p.purchase_lines, 'unit_cost'), paidTotal: paidByPurchase.get(p.id) || 0 }))
        .map(p => ({ ...p, remaining: Math.max(Number(p.opening || 0) - p.paidTotal, 0) })).filter(p => p.opening !== null && p.remaining > 0.005);
      if (!due.length) { $('#owner-content').insertAdjacentHTML('afterbegin', '<p class="notice">Aucune facture fournisseur à régler.</p>'); return; }
      const options = due.map(p => `<option value="${esc(p.id)}" data-balance="${p.remaining}">${esc(p.number || 'Achat')} · ${esc(p.suppliers?.name || 'Fournisseur')} · Reste ${usdOnly(p.remaining)}</option>`).join('');
      openDialog($('#owner-dialog'), 'Enregistrer un paiement fournisseur',
        `<label for="purchase_id">Facture fournisseur</label><select id="purchase_id" name="purchase_id" required>${options}</select>${fld('amount','Montant payé (USD)','number',`required min="0.01" max="${due[0].remaining}" step="0.01"`)}${fld('paid_at','Date du paiement','date',`required value="${today}"`)}<p class="muted">Le montant ne peut pas dépasser le solde de la facture.</p>`,
        v => db.rpc('record_purchase_payment', { p_purchase_id: v.purchase_id, p_amount: Number(v.amount), p_paid_at: v.paid_at }), refresh,
        form => form.querySelector('#purchase_id').addEventListener('change', e => { form.querySelector('#amount').max = e.target.selectedOptions[0].dataset.balance; }));
    } catch (error) {
      const missing = /purchase_payment_balances|purchase_payments|schema cache/i.test(error.message);
      $('#owner-content').insertAdjacentHTML('afterbegin', `<p class="notice">${missing ? 'Le suivi des soldes fournisseurs n’est pas encore installé dans Supabase. Exécute le script « couts-et-tresorerie.sql » pour activer cette fonction.' : `Impossible de charger les factures : ${esc(error.message)}`}</p>`);
    }
  }

  async function openInitialSupplierBalanceDialog() {
    try {
      const [allPurchases, balances] = await Promise.all([
        db.select('purchases', 'select=id,number,bought_at,suppliers(name),purchase_lines(qty,unit_cost)&order=bought_at.desc'),
        db.select('purchase_payment_balances', 'select=purchase_id')
      ]);
      const initialized = new Set(balances.map(row => row.purchase_id));
      const purchases = allPurchases.filter(purchase => !initialized.has(purchase.id));
      if (!purchases.length) { $('#owner-content').insertAdjacentHTML('afterbegin', '<p class="notice">Toutes les anciennes factures ont déjà un solde initialisé.</p>'); return; }
      const options = purchases.map(p => `<option value="${esc(p.id)}" data-total="${sumLines(p.purchase_lines, 'unit_cost')}">${esc(p.number || 'Achat')} · ${esc(p.suppliers?.name || 'Fournisseur')} · Total ${usdOnly(sumLines(p.purchase_lines, 'unit_cost'))}</option>`).join('');
      openDialog($('#owner-dialog'), 'Initialiser une ancienne facture',
        `<p class="muted">Indiquez le solde qui restait réellement à payer au moment de la mise à jour. Les anciennes factures ne sont pas supposées impayées automatiquement.</p><label for="purchase_id">Facture fournisseur</label><select id="purchase_id" name="purchase_id" required>${options}</select>${fld('remaining','Solde restant (USD)','number',`required min="0" max="${sumLines(purchases[0].purchase_lines, 'unit_cost')}" step="0.01"`)}<p class="muted" id="supplier-total">Total facture : ${usdOnly(sumLines(purchases[0].purchase_lines, 'unit_cost'))}</p>`,
        v => db.rpc('initialize_purchase_balance', { p_purchase_id: v.purchase_id, p_remaining: Number(v.remaining) }), refresh,
        form => form.querySelector('#purchase_id').addEventListener('change', e => { const total = Number(e.target.selectedOptions[0].dataset.total); form.querySelector('#remaining').max = total; form.querySelector('#supplier-total').textContent = `Total facture : ${usdOnly(total)}`; }));
    } catch (error) {
      const missing = /purchase_payment_balances|schema cache/i.test(error.message);
      $('#owner-content').insertAdjacentHTML('afterbegin', `<p class="notice">${missing ? 'Cette fonction attend la mise à jour de la base de données. Dans le projet Supabase associé à KaPya, ouvre SQL Editor, colle le contenu du fichier « sql/couts-et-tresorerie.sql », puis clique sur Run. La version locale seule ne crée pas les tables Supabase.' : `Impossible de charger les anciennes factures : ${esc(error.message)}`}</p>`);
    }
  }

  // Blocs visibles pour cet utilisateur : permissions d'abord, puis préférences (ou valeurs par défaut du rôle).
  let enabled = new Set();
  let lastSummary = null;
  let lastPayload = null;
  let shopsCache = null;
  let dataGeneration = 0;
  // Le cache moderne dépend aussi des droits et de la boutique. On ne réutilise
  // jamais un affichage admin/global pour un rôle ou un périmètre plus restreint.
  const displayCacheKey = (mode, period, from, to, shop = getShop()) => dashKey(
    session().uid, mode === 'classic' ? period : `${period}:${mode}:${ctx?.role || 'user'}:${shop || 'all'}`, from, to
  );
  const allowedBlocks = () => ['daily', 'kpi', 'charts', 'moves', 'watch', 'cashout'].filter(id => id === 'daily' ? canSeeDailySummary : id === 'cashout' ? canSeeCosts : true);
  const blk = (id, html) => enabled.has(id) ? html : '';
  async function resolveBlocks() {
    const allowed = allowedBlocks();
    const saved = await loadBlockPrefs();
    const chosen = Array.isArray(saved) ? saved : (DEFAULT_BLOCKS[ctx?.role] || DEFAULT_BLOCKS.user);
    enabled = new Set(chosen.filter(id => allowed.includes(id)));
  }
  async function openCustomizeDialog() {
    const allowed = allowedBlocks();
    const current = new Set(enabled);
    openDialog($('#owner-dialog'), 'Personnaliser le tableau de bord',
      `<p class="muted">Choisissez les blocs à afficher sur votre tableau de bord. Seuls les blocs autorisés pour votre rôle sont proposés.</p>` +
      allowed.map(id => `<label class="check"><input type="checkbox" name="blk" value="${id}"${current.has(id) ? ' checked' : ''}> ${BLOCK_LABELS[id]}</label>`).join(''),
      async (v, fd) => {
        const chosen = fd.getAll('blk');
        if (!chosen.length) throw new Error('Choisissez au moins un bloc.');
        await saveBlockPrefs(chosen);
      }, refresh);
  }

  async function renderDashboard() {
    if (!alive()) return;
    const generation = ++dataGeneration;
    const periodValue = $('#owner-period').value;
    let from = today, to = today;
    if (periodValue === 'custom') {
      from = $('#owner-from').value || monthStart;
      to = $('#owner-to').value || today;
    } else if (periodValue === 'yesterday') {
      from = to = shiftDate(today, -1);
    } else if (periodValue === '30') {
      from = shiftDate(today, -29);
    } else if (periodValue === 'month') {
      from = monthStart;
    } else if (periodValue === 'prev') {
      const start = new Date(parseDate(monthStart));
      start.setMonth(start.getMonth() - 1);
      from = isoDate(start);
      to = isoDate(new Date(parseDate(monthStart).getTime() - 86400000));
    } else if (periodValue !== 'today') {
      from = shiftDate(today, -6);
    }
    if (from > to) { $('#owner-content').innerHTML = '<p class="notice">La date de début doit être antérieure à la date de fin.</p>'; return; }
    // Affichage immédiat du dernier résultat sauvegardé ; les chiffres réels remplacent ce contenu dès qu'ils arrivent.
    const selectedShop = getShop();
    const cacheKeyFor = mode => displayCacheKey(mode, periodValue, from, to, selectedShop);
    const cached = readDash(cacheKeyFor(activeMode));
    $('#owner-content').innerHTML = cached
      ? `<p class="muted dash-stamp">Dernier affichage : ${esc(new Date(cached.at).toLocaleString('fr-FR'))} · mise à jour en cours…</p>${cached.html}`
      : activeMode === 'classic' ? '<div class="card empty">Chargement des données…</div>' : renderModernLoading();
    if (activeMode !== 'classic') $('#owner-content').setAttribute('aria-busy', 'true');
    const blocksReady = resolveBlocks();
    const nextDay = shiftDate(to, 1);
    const startInstant = new Date(`${from}T00:00:00`).toISOString();
    const endInstant = new Date(`${nextDay}T00:00:00`).toISOString();
    const salesSelect = 'select=id,number,sold_at,payment,payment_method,paid,customers(name),sale_lines(id,qty,unit_price,articles(sku,name,unit))';
    // Read cost snapshots separately: PostgREST may not expose the new FK in its schema cache yet.
    const saleCostsPromise = canSeeCosts
      ? db.select('sale_cost_snapshots', 'select=sale_line_id,unit_cost_at_sale,cost_is_estimated')
      : Promise.resolve([]);
    const purchasesPromise = canSeeCosts
      ? db.select('purchases', `select=id,number,bought_at,purchase_lines(qty,unit_cost)&bought_at=gte.${from}&bought_at=lt.${dayAfter(to)}&order=bought_at.asc`)
      : Promise.resolve([]);
    const supplierBalancesPromise = canSeeCosts ? db.select('purchase_payment_balances', 'select=purchase_id,opening_balance') : Promise.resolve([]);
    const supplierPaymentsAllPromise = canSeeCosts ? db.select('purchase_payments', 'select=purchase_id,amount') : Promise.resolve([]);
    // sold_at est une colonne DATE (AAAA-MM-JJ) : on compare directement des dates, sans conversion d'heure,
    // pour inclure la dernière journée quel que soit le fuseau horaire de l'appareil.
    const salesPromise = db.select('sales', `${salesSelect}&sold_at=gte.${from}&sold_at=lt.${dayAfter(to)}${shopSalesFilter()}&order=sold_at.asc`);
    const creditsPromise = db.select('sales', `${salesSelect}&payment=eq.credit${shopSalesFilter()}&order=sold_at.desc`);
    const movesPromise = db.select('stock_moves', `select=id,qty,reason,created_at,articles(sku,name,unit)&created_at=gte.${encodeURIComponent(startInstant)}&created_at=lt.${encodeURIComponent(endInstant)}&order=created_at.desc`);
    const supplierPaymentsPromise = canSeeCosts ? db.select('purchase_payments', `select=id,amount,paid_at,purchases(number,suppliers(name))&paid_at=gte.${from}&paid_at=lt.${dayAfter(to)}&order=paid_at.asc`) : Promise.resolve([]);
    const expensesPromise = canSeeCosts ? db.select('business_expenses', `select=id,label,category,amount,paid_at&paid_at=gte.${from}&paid_at=lt.${dayAfter(to)}&order=paid_at.asc`) : Promise.resolve([]);
    // Encaissements : nécessaires au classique pour les coûts (admin) et aux présentations
    // modernes pour « Paiements reçus ». Un rôle sans accès aux coûts ne doit jamais bloquer l'écran.
    const customerPaymentsPromise = canSeeCosts
      ? db.select('sale_payments', `${shopPaymentsSelect('select=id,sale_id,amount,paid_at,kind,sales(id)')}&paid_at=gte.${from}&paid_at=lt.${dayAfter(to)}&kind=in.(initial,payment,advance)${shopPaymentsFilter()}&order=paid_at.asc`)
      : canSeeDailySummary
        ? db.select('sale_payments', `${shopPaymentsSelect('select=id,sale_id,amount,paid_at,kind,sales(id)')}&paid_at=gte.${from}&paid_at=lt.${dayAfter(to)}&kind=in.(initial,payment,advance)${shopPaymentsFilter()}&order=paid_at.asc`).catch(() => null)
        : Promise.resolve([]);
    const customerDepositsPromise = canSeeCosts
      ? db.select('customer_deposits', `select=id,amount,received_at&received_at=gte.${from}&received_at=lt.${dayAfter(to)}`)
      : canSeeDailySummary
        ? db.select('customer_deposits', `select=id,amount,received_at&received_at=gte.${from}&received_at=lt.${dayAfter(to)}`).catch(() => [])
        : Promise.resolve([]);
    const ownerDailySalesPromise = canSeeDailySummary ? db.select('sales', `select=id,sale_lines(qty,unit_price)&payment=eq.credit&sold_at=gte.${today}&sold_at=lt.${shiftDate(today, 1)}${shopSalesFilter()}`) : Promise.resolve([]);
    const ownerDailyCashPromise = canSeeDailySummary ? db.select('sales', `select=id,sale_lines(qty,unit_price)&payment=eq.cash&sold_at=gte.${today}&sold_at=lt.${shiftDate(today, 1)}${shopSalesFilter()}`).catch(() => null) : Promise.resolve([]);
    const ownerDailyReceiptsPromise = canSeeDailySummary ? db.select('sale_payments', `${shopPaymentsSelect('select=id,amount,paid_at,sales(id)')}&paid_at=eq.${today}&kind=in.(initial,payment)${shopPaymentsFilter()}`) : Promise.resolve([]);
    const articlesPromise = selectArticlesWithTotal(`select=id,sku,name,unit,min_stock${canSeeCosts ? ',price_buy' : ''}&order=name`);
    try {
      // Lancé en parallèle des chiffres : les préférences et la liste du jour ne bloquent plus l'affichage.
      const auditPromise = ['admin', 'manager'].includes(ctx?.role)
        ? db.select('audit_log', `select=occurred_at,actor_name,action,summary&table_name=eq.sales&occurred_at=gte.${today}&occurred_at=lt.${shiftDate(today, 1)}&order=occurred_at.desc&limit=50`).catch(() => [])
        : Promise.resolve([]);
      await blocksReady;
      const coreResults = await Promise.allSettled([salesPromise, purchasesPromise, creditsPromise, movesPromise, articlesPromise, supplierPaymentsPromise, expensesPromise, customerPaymentsPromise, customerDepositsPromise, saleCostsPromise, supplierBalancesPromise, supplierPaymentsAllPromise, ownerDailySalesPromise, ownerDailyReceiptsPromise]);
      const [salesRows, purchaseRows, credits, moveRows, articles, supplierPayments, expenses, paymentRows, customerDeposits] = coreResults.slice(0, 9).map(result => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      });
      const paymentsAvailable = Array.isArray(paymentRows);
      const customerPayments = paymentRows || [];
      const saleCostResult = coreResults[9];
      const saleCostsAvailable = !canSeeCosts || saleCostResult.status === 'fulfilled';
      const saleCostRows = saleCostResult.status === 'fulfilled' ? saleCostResult.value : [];
      const saleCostsByLine = new Map(saleCostRows.map(snapshot => [snapshot.sale_line_id, snapshot]));
      const supplierBalances = coreResults[10].status === 'fulfilled' ? coreResults[10].value : [];
      const supplierPaymentsAll = coreResults[11].status === 'fulfilled' ? coreResults[11].value : [];
      const supplierBalancesAvailable = !canSeeCosts || (coreResults[10].status === 'fulfilled' && coreResults[11].status === 'fulfilled');
      const ownerDailySales = coreResults[12].status === 'fulfilled' ? coreResults[12].value : [];
      const ownerDailyReceipts = coreResults[13].status === 'fulfilled' ? coreResults[13].value : [];
      const ownerDailyAvailable = !canSeeDailySummary || (coreResults[12].status === 'fulfilled' && coreResults[13].status === 'fulfilled');
      const ownerDailyCash = canSeeDailySummary ? await ownerDailyCashPromise.catch(() => null) : [];
      const ownerDailyCashAvailable = !canSeeDailySummary || Array.isArray(ownerDailyCash);
      // Comparaison sur la seule date : si la base renvoie un horodatage, « 2026-11-17T09:30 » ne doit pas être exclu de la journée du 17.
      const dayOnly = value => String(value ?? '').slice(0, 10);
      const salesFromServer = salesRows.filter(sale => dayOnly(sale.sold_at) >= from && dayOnly(sale.sold_at) <= to);
      // Ventes de cet appareil pas encore envoyées : sans elles, une vente faite hors ligne
      // semble ne jamais arriver au tableau de bord. Elles portent la mention « en attente ».
      const pendingItems = await pendingFor('sales').catch(() => []);
      const pendingSales = pendingSaleRows(pendingItems, { from, to, shop: selectedShop, articles });
      const pendingTodaySales = pendingSaleRows(pendingItems, { from: today, to: today, shop: selectedShop, articles });
      // Même ordre que le serveur (date croissante), les pièces en attente après celles du serveur.
      const sales = [...salesFromServer, ...pendingSales].sort((a, b) => dayOnly(a.sold_at).localeCompare(dayOnly(b.sold_at))
        || (a.pending === b.pending ? 0 : a.pending ? 1 : -1));
      const purchases = purchaseRows.filter(purchase => dayOnly(purchase.bought_at) >= from && dayOnly(purchase.bought_at) <= to);
      const moves = moveRows.filter(move => move.created_at?.slice(0, 10) >= from && move.created_at?.slice(0, 10) <= to);
      const revenue = sales.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0);
      const cashSalesRows = sales.filter(sale => sale.payment !== 'credit');
      const creditSalesRows = sales.filter(sale => sale.payment === 'credit');
      const cashRevenue = cashSalesRows.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0);
      const creditRevenue = creditSalesRows.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0);
      const salesCost = canSeeCosts && saleCostsAvailable ? sales.reduce((sum, sale) => sum + (sale.sale_lines || []).reduce((part, line) => {
        const snapshot = saleCostsByLine.get(line.id);
        // Vente en attente : aucun coût figé hors ligne, on estime au prix d'achat actuel.
        return part + Number(line.qty || 0) * Number(line.pending ? line.articles?.price_buy ?? 0 : snapshot?.unit_cost_at_sale ?? 0);
      }, 0), 0) : 0;
      const estimatedCostLines = canSeeCosts && saleCostsAvailable ? sales.flatMap(sale => sale.sale_lines || []).filter(line => line.pending || saleCostsByLine.get(line.id)?.cost_is_estimated).length : 0;
      const gross = revenue - salesCost;
      const currentStockValue = canSeeCosts ? articles.reduce((sum, article) => sum + Number(article.stock || 0) * Number(article.price_buy || 0), 0) : 0;
      const purchaseValue = purchases.reduce((sum, purchase) => sum + sumLines(purchase.purchase_lines, 'unit_cost'), 0);
      const pendTotals = to >= today ? await pendingTodayTotals(today) : { cash: 0, credit: 0, receipts: 0, count: 0 };
      // Les ventes en attente du jour font déjà partie de `sales` : on ne les ajoute pas
      // une deuxième fois via pendTotals. Seuls les encaissements de crédits faits hors
      // ligne restent à ajouter, car ils n'ont aucune ligne serveur.
      const pendingTodayCash = pendingTodaySales.filter(sale => sale.payment !== 'credit').reduce((sum, sale) => sum + pendingSaleTotal(sale), 0);
      const pendingTodayCredit = pendingTodaySales.filter(sale => sale.payment === 'credit').reduce((sum, sale) => sum + pendingSaleTotal(sale), 0);
      const dailyCreditValue = ownerDailySales.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0) + pendingTodayCredit;
      const dailyReceiptValue = ownerDailyReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0) + pendTotals.receipts;
      const dailyCashValue = (ownerDailyCash || []).reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0) + pendingTodayCash;
      const offlineNote = await offlineBanner();
      const auditRows = await auditPromise;
      const ACTION_LABEL = { update: 'Modifiée', delete: 'Supprimée', insert: 'Créée' };
      const auditHtml = auditRows.length
        ? `<section class="card owner-panel" aria-label="Modifications du jour"><div class="sec-head"><div><h2>Modifications du jour</h2><p class="muted">${fr(today)} · factures créées, modifiées ou supprimées</p></div></div><ul class="audit-list">${auditRows.map(row => `<li><b>${esc(ACTION_LABEL[row.action] || row.action)}</b> · ${esc(row.actor_name || 'Utilisateur')} · ${esc(new Date(row.occurred_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}${row.summary ? ` · ${esc(row.summary)}` : ''}</li>`).join('')}</ul></section>`
        : '';
      const advanceAppliedToCashSales = customerPayments.filter(payment => payment.kind === 'advance' && sales.some(sale => sale.id === payment.sale_id && sale.payment !== 'credit')).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const received = canSeeCosts ? sales.filter(sale => sale.payment !== 'credit').reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0) - advanceAppliedToCashSales + customerPayments.filter(payment => payment.kind !== 'advance').reduce((sum, payment) => sum + Number(payment.amount || 0), 0) + customerDeposits.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0) : 0;
      const supplierPaid = supplierPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const netProfit = gross - expenseTotal;
      const paidByPurchase = new Map();
      supplierPaymentsAll.forEach(payment => paidByPurchase.set(payment.purchase_id, (paidByPurchase.get(payment.purchase_id) || 0) + Number(payment.amount || 0)));
      const supplierDebt = supplierBalances.reduce((sum, balance) => sum + Math.max(Number(balance.opening_balance || 0) - (paidByPurchase.get(balance.purchase_id) || 0), 0), 0);
      const cashOut = supplierPaid + expenseTotal;
      const cashNet = received + pendTotals.receipts - cashOut;
      const outstanding = credits.reduce((sum, sale) => sum + Math.max(sumLines(sale.sale_lines, 'unit_price') - Number(sale.paid || 0), 0), 0);
      const lowStock = articles.filter(article => Number(article.stock) <= Number(article.min_stock));
      // Lots qui périment dans les 30 jours : alerte seulement, la vente n'est pas bloquée
      const expiryLimit = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const expiring = (await listeOuErreur(db.select('stock_lots', 'select=id,expiry_date,qty_left,article_id,articles(name)&qty_left=gt.0&order=expiry_date.asc'), 'les lots')).filter(l => String(l.expiry_date) <= expiryLimit);
      const movementIn = moves.filter(move => Number(move.qty) > 0);
      const movementOut = moves.filter(move => Number(move.qty) < 0);
      const salesBuckets = bucketData(from, to, sales, sale => sale.sold_at, sale => sumLines(sale.sale_lines, 'unit_price'));
      const purchaseBuckets = bucketData(from, to, purchases, purchase => purchase.bought_at, purchase => sumLines(purchase.purchase_lines, 'unit_cost'));
      const inflowBuckets = bucketData(from, to, movementIn, move => move.created_at, () => 1);
      const outflowBuckets = bucketData(from, to, movementOut, move => move.created_at, () => 1);
      const dateLabel = from === to ? fr(from) : `${fr(from)} – ${fr(to)}`;
      const salesSub = `${sales.length} vente(s)${pendingSales.length ? ` dont ${pendingSales.length} en attente` : ''} · ${fcOnly(revenue)}`;
      lastSummary = { sales, revenue, outstanding, lowStock, expiring, cashNet, canSeeCosts, from, to, dateText: dateLabel };
      const profitDetail = !saleCostsAvailable ? 'Configuration SQL des coûts manquante' : salesCost > 0 ? `Marge brute · ${revenue ? (gross / revenue * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '0'} %` : 'Aucun coût de vente enregistré sur cette période';
      const costHint = canSeeCosts ? `<p class="owner-note">${!saleCostsAvailable ? 'Le calcul du bénéfice sera disponible après installation du script SQL « couts-et-tresorerie.sql » dans Supabase.' : `Le coût est figé au moment de la vente. ${estimatedCostLines ? `${estimatedCostLines} ligne(s) utilisent une estimation basée sur le prix d'achat actuel (coût non figé ou vente en attente d'envoi).` : 'Les coûts des ventes affichées sont enregistrés au moment de la vente.'} Le résultat net déduit du bénéfice brut les dépenses saisies dans Caisse sur la période.`}</p>` : '';
      const recentMoves = moves.slice(0, 8);
      const recentCashOut = [
        ...supplierPayments.map(payment => ({ date: payment.paid_at, label: `Paiement ${payment.purchases?.number || 'fournisseur'} · ${payment.purchases?.suppliers?.name || 'Fournisseur'}`, amount: Number(payment.amount), type: 'Fournisseur' })),
        ...expenses.map(expense => ({ date: expense.paid_at, label: `${expense.label} · ${expense.category}`, amount: Number(expense.amount), type: 'Dépense' }))
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
      if (!alive()) return;
      const classicHtml = offlineNote + `${blk('daily', canSeeDailySummary ? `<section class="card owner-panel"><div class="sec-head"><div><h2>Résumé de caisse du jour</h2><p class="muted">${fr(today)} · ventes cash, ventes à crédit et versements encaissés</p></div></div><section class="kpis owner-kpis">${metric('Ventes cash', ownerDailyCashAvailable ? usdOnly(dailyCashValue) : '—', ownerDailyCashAvailable ? `${(ownerDailyCash || []).length} facture(s) payée(s) comptant` : 'Suivi des ventes indisponible', 'cash', 't-green')}${metric('Ventes à crédit', ownerDailyAvailable ? usdOnly(dailyCreditValue) : '—', ownerDailyAvailable ? `${ownerDailySales.length} facture(s)` : 'Suivi des paiements indisponible', 'sales', 't-blue')}${metric('Paiements de crédits reçus', ownerDailyAvailable ? usdOnly(dailyReceiptValue) : '—', ownerDailyAvailable ? `${ownerDailyReceipts.length} versement(s)` : 'Suivi des paiements indisponible', 'coins', 't-green')}</section></section>` : '')}<div class="owner-period-label">Période affichée : <b>${dateLabel}</b></div>
        ${auditHtml}${blk('kpi', `<section class="kpis owner-kpis">
          ${metric('Chiffre d’affaires', usdOnly(revenue), salesSub, 'sales', 't-blue')}
          ${canSeeCosts ? metric('Coût des articles vendus', saleCostsAvailable ? usdOnly(salesCost) : '—', saleCostsAvailable ? 'Coût d’achat enregistré au moment de la vente' : 'Configuration SQL des coûts requise', 'purchases', 't-green') : ''}
          ${canSeeCosts ? metric('Bénéfice brut', saleCostsAvailable ? usdOnly(gross) : '—', profitDetail, 'coins', 't-purple') : ''}
          ${canSeeCosts ? metric('Résultat net', saleCostsAvailable ? usdOnly(netProfit) : '—', saleCostsAvailable ? `Bénéfice brut moins ${usdOnly(expenseTotal)} de dépenses` : 'Configuration SQL des coûts requise', 'coins', netProfit >= 0 ? 't-green' : 't-rose') : ''}
          ${canSeeCosts ? metric('Entrées de trésorerie', usdOnly(received), 'Ventes cash, paiements de crédit et dépôts reçus', 'coins', 't-teal') : ''}
          ${canSeeCosts ? metric('Sorties de trésorerie', usdOnly(cashOut), `Fournisseurs ${usdOnly(supplierPaid)} · dépenses ${usdOnly(expenseTotal)}`, 'purchases', 't-orange') : ''}
          ${canSeeCosts ? metric('Flux net de trésorerie', usdOnly(cashNet), 'Entrées moins sorties enregistrées', 'sales', cashNet >= 0 ? 't-green' : 't-rose') : ''}
          ${canSeeCosts ? metric('Valeur actuelle du stock', usdOnly(currentStockValue), `Au prix d’achat · ${fcOnly(currentStockValue)}`, 'stock', 't-teal') : ''}
        </section>`)}
        ${costHint}
        ${blk('charts', `<div class="grid-2 owner-charts">
          <section class="card owner-panel"><div class="sec-head"><div><h2>Ventes par jour</h2><p class="muted">Montant des factures de la période</p></div></div>${simpleBars(salesBuckets, 'Ventes par jour sur la période')}<p class="muted">Total des ventes : <b>${usdOnly(salesBuckets.reduce((s, b) => s + b.value, 0))}</b>${canSeeCosts ? ` · Achats : <b>${usdOnly(purchaseBuckets.reduce((s, b) => s + b.value, 0))}</b>` : ''}</p></section>
          <section class="card owner-panel"><div class="sec-head"><div><h2>Stock de la période</h2><p class="muted">Mouvements enregistrés</p></div></div><p class="owner-summary"><b>${n(inflowBuckets.reduce((s, b) => s + b.value, 0))}</b> entrée(s) · <b>${n(outflowBuckets.reduce((s, b) => s + b.value, 0))}</b> sortie(s)</p></section>
        </div>`)}
        ${blk('moves', `<section class="card owner-panel"><div class="sec-head"><h2>Derniers mouvements de stock</h2><a href="#/rapports">Voir les rapports</a></div>${recentMoves.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Article</th><th>Type</th><th class="r">Quantité</th></tr></thead><tbody>${recentMoves.map(move => `<tr><td>${fr(move.created_at)}</td><td>${esc(move.articles?.name || 'Article')}</td><td><span class="pill ${Number(move.qty) > 0 ? 'ok' : 'warn'}">${Number(move.qty) > 0 ? 'Entrée' : 'Sortie'} · ${stockMoveLabel(move.reason)}</span></td><td class="r">${Number(move.qty) > 0 ? '+' : '−'}${n(Math.abs(Number(move.qty)))} ${esc(move.articles?.unit || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucun mouvement de stock pour cette période.</p>'}</section>`)}
          ${blk('watch', `<section class="card owner-panel"><div class="sec-head"><h2>Points à surveiller</h2><span class="muted">${dateLabel}</span></div>
            ${watchGroup('Achats et fournisseurs', [
              canSeeCosts && watchRow('Achats enregistrés sur la période', `${usdOnly(purchaseValue)}${purchaseValue ? ` <small>${fcOnly(purchaseValue)}</small>` : ''}`, '#/achats'),
              canSeeCosts && watchRow('Paiements fournisseurs de la période', usdOnly(supplierPaid), '#/fournisseurs'),
              canSeeCosts && watchRow('Dette fournisseur restante', supplierBalancesAvailable ? usdOnly(supplierDebt) : '—', '#/fournisseurs', supplierBalancesAvailable && supplierDebt > 0 ? 'warn' : ''),
              canSeeCosts && watchRow('Dépenses de la période', usdOnly(expenseTotal), '#/caisse')
            ])}
            ${watchGroup('Stock et péremption', [
              canSeeCosts && watchRow('Valeur du stock au prix d’achat', usdOnly(currentStockValue), '#/stocks'),
              watchRow('Articles sous le seuil', `${lowStock.length} article(s)`, '#/alertes', lowStock.length ? 'warn' : ''),
              watchRow('Lots proches de la péremption', `${expiring.length} lot(s)`, '#/lots', expiring.length ? 'warn' : '')
            ])}
            ${watchGroup('Clients', [
              watchRow('Créances clients restantes', usdOnly(outstanding), '#/credits', outstanding > 0 ? 'warn' : '')
            ])}
            <p class="owner-note">La trésorerie reflète les paiements et dépenses enregistrés dans l’application. Les anciennes dettes fournisseur doivent d’abord être initialisées avec leur solde réel.</p></section>`)}
        </div>
        ${blk('cashout', canSeeCosts ? `<section class="card owner-panel"><div class="sec-head"><h2>Dernières sorties de trésorerie</h2><span class="muted">${dateLabel}</span></div>${recentCashOut.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>Détail</th><th class="r">Montant</th></tr></thead><tbody>${recentCashOut.map(item => `<tr><td>${fr(item.date)}</td><td>${esc(item.type)}</td><td>${esc(item.label)}</td><td class="r">${usdOnly(item.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucune sortie enregistrée sur cette période.</p>'}</section>` : '')}`;
      // Modèle commun aux deux présentations modernes : mêmes chiffres, mêmes droits, mêmes API.
      // « Paiements reçus » désigne les règlements de créances, pas les ventes cash
      // ni les dépôts clients. Une imputation d'acompte n'est pas un nouvel encaissement.
      const creditIds = new Set(credits.map(sale => sale.id));
      const creditReceipts = customerPayments.filter(payment =>
        ['initial', 'payment'].includes(payment.kind) && creditIds.has(payment.sale_id));
      const receiptsCount = creditReceipts.length;
      const paymentsReceivedModern = creditReceipts.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const periodLabel = periodValue === 'custom' ? dateLabel : (MODERN_PERIOD_LABELS[periodValue] || dateLabel);
      const activities = [
        ...sales.slice(-6).map(sale => ({
          date: String(sale.sold_at || ''),
          title: sale.payment === 'credit' ? 'Vente à crédit' : 'Vente cash',
          subtitle: `${sale.customers?.name || sale.customer_label || 'Client particulier'} · ${fr(sale.sold_at)}`,
          amount: sumLines(sale.sale_lines, 'unit_price'),
          direction: 'in',
          tone: sale.payment === 'credit' ? 'blue' : 'green',
          icon: 'sales',
          pending: Boolean(sale.pending)
        })),
        ...creditReceipts.map(payment => ({
          date: String(payment.paid_at || ''),
          title: payment.kind === 'initial' ? 'Versement initial' : 'Paiement de crédit',
          subtitle: fr(payment.paid_at),
          amount: Number(payment.amount || 0),
          direction: 'in',
          tone: 'green',
          icon: 'coins'
        })),
        ...(canSeeCosts ? recentCashOut.map(item => ({
          date: String(item.date || ''),
          title: item.type,
          subtitle: `${item.label} · ${fr(item.date)}`,
          amount: -Number(item.amount || 0),
          direction: 'out',
          tone: 'red',
          icon: item.type === 'Dépense' ? 'wallet' : 'purchases'
        })) : [])
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
      // Répartition réelle du chiffre d'affaires par mode de paiement enregistré sur la vente.
      const PAY_LABELS = { cash: 'Espèces', mobile_money: 'Mobile money', bank: 'Virement', credit: 'À crédit' };
      const PAY_COLORS = { cash: '#0B5FFB', mobile_money: '#7C3AED', bank: '#13A552', credit: '#F97316' };
      const paymentGroups = new Map();
      sales.forEach(sale => {
        const key = sale.payment === 'credit' ? 'credit' : (PAY_LABELS[sale.payment_method] ? sale.payment_method : 'cash');
        paymentGroups.set(key, (paymentGroups.get(key) || 0) + sumLines(sale.sale_lines, 'unit_price'));
      });
      const paymentSlices = [...paymentGroups].map(([key, value]) => ({ key, value, label: PAY_LABELS[key], color: PAY_COLORS[key] })).filter(slice => slice.value > 0);
      const modernModel = {
        offlineNote,
        canSeeCosts,
        saleCostsAvailable,
        paymentsAvailable,
        blocks: { kpi: enabled.has('kpi'), charts: enabled.has('charts') },
        salesCount: sales.length,
        pendingSalesCount: pendingSales.length,
        cashCount: cashSalesRows.length,
        creditCount: creditSalesRows.length,
        receiptsCount,
        revenue,
        cashSales: cashRevenue,
        creditSales: creditRevenue,
        paymentsReceived: paymentsReceivedModern,
        gross,
        netProfit,
        cashIn: received,
        cashOut,
        cashNet,
        stockValue: currentStockValue,
        outstanding,
        supplierPaid,
        expenseTotal,
        profitDetail,
        salesBuckets: salesBuckets.map(bucket => ({ label: bucket.label, value: bucket.value, dateLabel: bucket.start === bucket.end ? fr(bucket.start) : `${fr(bucket.start)} – ${fr(bucket.end)}` })),
        paymentSlices,
        activities,
        dateLabel,
        periodLabel,
        todayLabel: fr(today),
        shopLabel: selectedShop ? shopsCache?.find(shop => shop.id === selectedShop)?.name || 'Boutique sélectionnée' : 'Toutes les boutiques',
        shopSelected: Boolean(selectedShop),
        comparison: { status: 'idle', range: previousPeriod(from, to), values: {} },
        extra: {
          audit: auditRows,
          moves: enabled.has('moves') ? recentMoves : [],
          cashout: enabled.has('cashout') ? recentCashOut : [],
          watch: enabled.has('watch') ? {
            canSeeCosts,
            stockValue: currentStockValue,
            lowStock: lowStock.length,
            expiring: expiring.length,
            outstanding,
            supplierDebt,
            supplierBalancesAvailable,
            expenseTotal
          } : null,
          daily: enabled.has('daily') && canSeeDailySummary ? {
            cash: dailyCashValue,
            credit: dailyCreditValue,
            receipts: dailyReceiptValue,
            cashAvailable: ownerDailyCashAvailable,
            available: ownerDailyAvailable,
            cashCount: (ownerDailyCash || []).length + pendingTodaySales.filter(sale => sale.payment !== 'credit').length,
            creditCount: ownerDailySales.length + pendingTodaySales.filter(sale => sale.payment === 'credit').length,
            receiptCount: ownerDailyReceipts.length
          } : null
        }
      };
      const source = { sales, credits, payments: customerPayments, deposits: customerDeposits, supplierPayments, expenses, articles, costs: saleCostsByLine, pending: pendTotals };
      modernModel.details = modernDetails(modernModel, source);
      const modernPcHtml = renderModernContent(modernModel, 'modern_pc');
      const modernMobileHtml = renderModernContent(modernModel, 'modern_mobile');
      lastPayload = { classic: classicHtml, pc: modernPcHtml, mobile: modernMobileHtml, model: modernModel, source, generation, periodValue, from, to, shop: selectedShop };
      const html = activeMode === 'classic' ? classicHtml : activeMode === 'modern_pc' ? modernPcHtml : modernMobileHtml;
      $('#owner-content').innerHTML = html;
      writeDash(cacheKeyFor(activeMode), html);
      lastRefresh = Date.now();
      paintUpdated(lastRefresh);
      ensureModernComparison();
    } catch (error) {
      if (alive()) {
        $('#owner-content').innerHTML = activeMode === 'classic'
          ? `<div class="card"><p class="err">Chargement impossible : ${esc(error.message)}</p></div>` : renderModernFailure();
        if (activeMode !== 'classic') lastPayload = null;
      }
    } finally {
      if (alive() && activeMode !== 'classic') $('#owner-content').setAttribute('aria-busy', 'false');
    }
  }

  // La période précédente se charge après les chiffres courants, uniquement dans un mode
  // moderne. Un ancien résultat ne peut jamais remplacer une nouvelle période/boutique.
  async function ensureModernComparison() {
    const payload = lastPayload;
    if (activeMode === 'classic' || !payload?.model.blocks.kpi || payload.comparisonStarted || !payloadMatchesControls()) return;
    payload.comparisonStarted = true;
    const model = payload.model;
    model.comparison.status = 'loading';
    paintModernComparisons(main, model);
    try {
      const { from, to } = model.comparison.range;
      const salesQuery = `select=id,sold_at,payment,sale_lines(id,qty,unit_price)&sold_at=gte.${from}&sold_at=lt.${dayAfter(to)}${shopSalesFilter()}`;
      const paymentQuery = `${shopPaymentsSelect('select=id,sale_id,amount,paid_at,kind,sales(id)')}&paid_at=gte.${from}&paid_at=lt.${dayAfter(to)}&kind=in.(initial,payment,advance)${shopPaymentsFilter()}`;
      const results = await Promise.allSettled([
        db.select('sales', salesQuery),
        canSeeDailySummary ? db.select('sale_payments', paymentQuery) : Promise.resolve(null),
        canSeeCosts ? db.select('customer_deposits', `select=id,amount,received_at&received_at=gte.${from}&received_at=lt.${dayAfter(to)}`) : Promise.resolve([]),
        canSeeCosts ? db.select('business_expenses', `select=id,amount,paid_at&paid_at=gte.${from}&paid_at=lt.${dayAfter(to)}`) : Promise.resolve([]),
        canSeeCosts ? db.select('purchase_payments', `select=id,amount,paid_at&paid_at=gte.${from}&paid_at=lt.${dayAfter(to)}`) : Promise.resolve([])
      ]);
      const [sales, payments, deposits, expenses, supplierPayments] = results.map(result => result.status === 'fulfilled' ? result.value : null);
      const inRange = (rows, field) => Array.isArray(rows) ? rows.filter(row => String(row[field] || '').slice(0, 10) >= from && String(row[field] || '').slice(0, 10) <= to) : null;
      const values = periodFigures({
        sales: inRange(sales, 'sold_at'), payments: inRange(payments, 'paid_at'),
        deposits: inRange(deposits, 'received_at'), expenses: inRange(expenses, 'paid_at'), supplierPayments: inRange(supplierPayments, 'paid_at'),
        creditIds: new Set(payload.source.credits.map(sale => sale.id)), costs: payload.source.costs,
        costsAvailable: model.saleCostsAvailable, canSeeCosts
      });
      // Le flux net classique inclut les écritures en attente : pas de comparaison trompeuse.
      if (payload.source.pending.cash || payload.source.pending.receipts) values.cashNet = null;
      model.comparison = { ...model.comparison, status: 'ready', values };
    } catch {
      model.comparison = { ...model.comparison, status: 'error', values: {} };
    }
    if (!alive() || payload !== lastPayload || payload.generation !== dataGeneration) return;
    payload.pc = renderModernContent(model, 'modern_pc');
    payload.mobile = renderModernContent(model, 'modern_mobile');
    if (activeMode !== 'classic' && payloadMatchesControls()) {
      paintModernComparisons(main, model);
      writeDash(displayCacheKey(activeMode, payload.periodValue, payload.from, payload.to, payload.shop), activeMode === 'modern_pc' ? payload.pc : payload.mobile);
    }
  }

  // Un seul chargement à la fois ; une demande reçue pendant ce temps est rejouée dès la fin.
  let refreshing = false, queued = false;
  async function refresh() {
    if (!alive()) return;
    if (refreshing) { queued = true; return; }
    refreshing = true;
    const button = $('#owner-refresh');
    const setRefreshLabel = text => {
      if (!button) return;
      const label = button.querySelector('span');
      if (label) label.textContent = text;
      else if (!button.classList.contains('mdm-iconbtn')) button.textContent = text;
    };
    if (button) { button.disabled = true; setRefreshLabel('Actualisation…'); }
    try { await renderDashboard(); }
    finally {
      refreshing = false;
      if (button && button.isConnected) { button.disabled = false; setRefreshLabel('Actualiser'); }
      if (queued && alive()) { queued = false; refresh(); }
    }
  }

  // Mise à jour automatique : après une vente ou une synchronisation, au retour sur l'onglet, et chaque minute.
  // Les écouteurs sont libérés dès qu'on quitte la page (abort au changement de route).
  const events = new AbortController();
  main._dashEvents?.abort();
  main._dashEvents = events;
  const { signal } = events;
  bindModernInteractions(main, {
    signal,
    onRetry: refresh,
    onDetail: (key, trigger) => {
      if (activeMode === 'classic' || !payloadMatchesControls()) return;
      const detail = renderModernDetail(lastPayload.model, key);
      if (!detail) return;
      main.querySelectorAll('.mdp-menu[open], .mdm-menu[open]').forEach(menu => { menu.open = false; });
      const dialog = $('#owner-dialog');
      showDialog(dialog, detail.title, detail.body);
      dialog.classList.add('md-detail-dialog');
      dialog.addEventListener('close', () => { if (trigger.isConnected) trigger.focus({ preventScroll: true }); }, { once: true, signal });
    }
  });
  let debounce = 0;
  const maybeRefresh = () => { if (!document.hidden && alive() && Date.now() - lastRefresh > 30000) refresh(); };
  // Un événement de synchronisation signale une vraie écriture : on recharge sans attendre le délai anti-rebond.
  // Tant que le premier chargement n'est pas terminé, il lira déjà les données à jour : inutile de le doubler.
  const scheduleRefresh = () => {
    if (!lastRefresh) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => { if (!document.hidden && alive()) refresh(); }, 800);
  };
  document.addEventListener('kp:sync', scheduleRefresh, { signal });
  document.addEventListener('visibilitychange', maybeRefresh, { signal });
  addEventListener('focus', maybeRefresh, { signal });
  const timerId = setInterval(maybeRefresh, 60000);
  signal.addEventListener('abort', () => {
    clearInterval(timerId);
    clearTimeout(debounce);
    if (main._dashToken === viewToken) {
      document.body.classList.remove('kp-dashboard-page');
      updateNavigationLabels('classic');
    }
  });

  // Choix de la boutique (dépôt) pour le gérant qui a plusieurs boutiques.
  async function setupShops() {
    if (!canSeeAllShops(ctx?.role)) { setShop(''); return; }
    if (!shopsCache) shopsCache = await loadShops();
    const slot = main.querySelector('#owner-shop-slot');
    if (slot) {
      if (!slot.querySelector('#shop-select')) {
        slot.innerHTML = shopsCache.length ? shopSelectHtml(shopsCache) : '<span class="muted">Toutes les boutiques</span>';
        slot.querySelector('#shop-select')?.addEventListener('change', event => { setShop(event.target.value); refresh(); });
      }
      return;
    }
    if (shopsCache.length > 1 && !main.querySelector('#shop-select')) {
      main.querySelector('#owner-customize')?.insertAdjacentHTML('beforebegin', shopSelectHtml(shopsCache));
      main.querySelector('#shop-select')?.addEventListener('change', event => { setShop(event.target.value); refresh(); });
    }
  }

  function showSummary() {
    if (!lastSummary) return;
    const lines = buildSummary(lastSummary);
    showDialog($('#owner-dialog'), 'Résumé de la période', lines.map(line => `<p>${line}</p>`).join('') + '<p class="muted">Résumé calculé à partir des chiffres affichés, sans intelligence artificielle.</p>');
  }

  // Changement de présentation immédiat : mêmes données, aucun rechargement de l'application.
  function changePresentation() {
    const applied = setDashboardMode(nextDashboardMode(), ctx?.id);
    activeMode = applied;
    layout();
    notify(`Présentation : ${DASHBOARD_MODE_LABELS[applied]}.`);
    if (!payloadMatchesControls()) refresh();
    else ensureModernComparison();
  }

  // Relie les contrôles du rendu courant (classique ou moderne), après chaque reconstruction.
  function bindControls() {
    $('#owner-period')?.addEventListener('change', setRangeControls);
    $('#owner-run')?.addEventListener('click', refresh);
    $('#owner-refresh')?.addEventListener('click', refresh);
    $('#owner-customize')?.addEventListener('click', openCustomizeDialog);
    $('#owner-mode')?.addEventListener('click', changePresentation);
    $('#owner-summary')?.addEventListener('click', showSummary);
    $('#owner-expense')?.addEventListener('click', openExpenseDialog);
    $('#owner-init-supplier')?.addEventListener('click', openInitialSupplierBalanceDialog);
    $('#owner-supplier-payment')?.addEventListener('click', openSupplierPaymentDialog);
    setupShops();
  }

  // Construit l'enveloppe de la présentation choisie, puis y replace les chiffres déjà calculés.
  // La période choisie est conservée d'une présentation à l'autre.
  function payloadMatchesControls() {
    const period = $('#owner-period')?.value;
    return lastPayload && lastPayload.periodValue === period && lastPayload.shop === getShop()
      && (period !== 'custom' || (lastPayload.from === $('#owner-from')?.value && lastPayload.to === $('#owner-to')?.value));
  }

  function layout() {
    const previous = $('#owner-period')?.value || '7';
    const previousFrom = $('#owner-from')?.value;
    const previousTo = $('#owner-to')?.value;
    main.innerHTML = pageHtml(activeMode, previous);
    updateNavigationLabels(activeMode);
    const period = $('#owner-period');
    if (period) {
      const values = [...period.options].map(option => option.value);
      period.value = values.includes(previous) ? previous : '7';
      const custom = period.value === 'custom';
      main.querySelectorAll('.owner-date').forEach(element => { element.hidden = !custom; });
      $('#owner-run').hidden = !custom;
      if (custom && previousFrom) $('#owner-from').value = previousFrom;
      if (custom && previousTo) $('#owner-to').value = previousTo;
      const chip = $('#mdp-period-chip');
      if (chip) chip.textContent = MODERN_PERIOD_LABELS[period.value] || chip.textContent;
    }
    bindControls();
    fillGreeting();
    if (!payloadMatchesControls()) return;
    $('#owner-content').innerHTML = activeMode === 'classic' ? lastPayload.classic : activeMode === 'modern_pc' ? lastPayload.pc : lastPayload.mobile;
    if (lastRefresh) paintUpdated(lastRefresh);
  }

  layout();
  await refresh();
}

// Message de bienvenue du tableau de bord : « Bonjour <prénom> · Bienvenue chez <entreprise> »
async function fillGreeting() {
  try {
    const uid = session().uid;
    if (!greetingCache.has(uid)) {
      const [profile] = await db.select('profiles', `select=org_id,full_name&id=eq.${uid}`);
      const [org] = profile?.org_id ? await db.select('organizations', `select=name&id=eq.${profile.org_id}`) : [];
      const first = (profile?.full_name || '').trim().split(/\s+/)[0] || '';
      const parts = [first ? `Bonjour ${first}` : 'Bonjour', org?.name ? `Bienvenue chez ${org.name}` : ''].filter(Boolean);
      greetingCache.set(uid, parts.join(' · '));
    }
    if (session().uid !== uid) return;
    const box = document.getElementById('owner-greet');
    if (box) box.textContent = greetingCache.get(uid);
  } catch { /* hors connexion : pas de message, le reste de la page fonctionne */ }
}

// Ligne « Points à surveiller » : libellé à gauche, valeur à droite, lien vers l'écran concerné
const watchRow = (label, value, href, tone = '') => ({ label, value, href, tone });
function watchGroup(title, rows) {
  const items = rows.filter(Boolean);
  if (!items.length) return '';
  return `<div class="watch-group"><h3>${esc(title)}</h3>${items.map(r => `<a class="watch-row ${r.tone}" href="${r.href}"><span>${esc(r.label)}</span><b>${r.value}</b></a>`).join('')}</div>`;
}
import { localStore as localStorage } from '../storage.js';
