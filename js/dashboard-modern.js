// KaPya ERP — rendus « Moderne PC » et « Moderne mobile » du tableau de bord.
// Aucun calcul métier ici : le modèle est préparé par js/modules/accueil.js avec les
// mêmes requêtes, les mêmes chiffres et les mêmes droits que la présentation classique.
import { esc, ico, n, usdOnly, fcOnly } from './ui.js';

export const PERIOD_OPTIONS = [
  ['today', 'Aujourd’hui'],
  ['yesterday', 'Hier'],
  ['7', '7 derniers jours'],
  ['30', '30 derniers jours'],
  ['month', 'Ce mois'],
  ['prev', 'Mois précédent'],
  ['custom', 'Période personnalisée']
];
export const PERIOD_LABELS = Object.fromEntries(PERIOD_OPTIONS);

const initials = name => {
  const parts = String(name || 'KaPya').trim().split(/\s+/).filter(Boolean);
  return (parts.map(part => part[0]).join('').slice(0, 2) || 'KP').toLocaleUpperCase('fr');
};
const dateFr = value => {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—';
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
};
const pct = (value, total) => total > 0 ? Math.round(value / total * 100) : 0;

function periodSelect(selected = '7') {
  const value = PERIOD_LABELS[selected] ? selected : '7';
  return `<select id="owner-period" aria-label="Période">${PERIOD_OPTIONS
    .map(([key, label]) => `<option value="${key}"${key === value ? ' selected' : ''}>${esc(label)}</option>`)
    .join('')}</select>`;
}

function expenseButtons(canRecordCashOut) {
  if (!canRecordCashOut) return '';
  return `<button class="ghost" id="owner-expense" type="button">+ Dépense</button><button class="ghost" id="owner-init-supplier" type="button">Solde anciennes factures</button><button class="btn" id="owner-supplier-payment" type="button">+ Paiement fournisseur</button>`;
}

function dateFields(monthStart, today) {
  return `<label class="owner-date mdp-field" hidden><span>Du</span><input type="date" id="owner-from" value="${monthStart}"></label>
    <label class="owner-date mdp-field" hidden><span>Au</span><input type="date" id="owner-to" value="${today}"></label>`;
}

// ------------------------------------------------------------------ pages
export function renderModernPage(options = {}) {
  const mode = options.mode === 'modern_mobile' ? 'modern_mobile' : 'modern_pc';
  return mode === 'modern_mobile' ? mobilePage(options) : pcPage(options);
}

function pcPage({ modeLabel, greeting, canRecordCashOut, monthStart, today, periodValue }) {
  return `<div class="mdp">
    <header class="mdp-head">
      <div class="mdp-title">
        <p class="mdp-greet" id="owner-greet">${greeting ? esc(greeting) : 'Bonjour'}</p>
        <h1>Tableau de bord</h1>
        <p class="mdp-sub">Vue globale de votre activité commerciale</p>
      </div>
      <span class="mdp-period-chip" id="mdp-period-chip">${esc(PERIOD_LABELS[periodValue] || PERIOD_LABELS['7'])}</span>
    </header>
    <div class="mdp-filters" role="search" aria-label="Filtres du tableau de bord">
      <label class="mdp-field"><span>Période</span>${periodSelect(periodValue)}</label>
      <div class="mdp-shop" id="owner-shop-slot"></div>
      ${dateFields(monthStart, today)}
      <div class="mdp-actions">
        <button class="btn" id="owner-run" type="button" hidden>Afficher</button>
        <button class="ghost" id="owner-refresh" type="button" title="Recharger les chiffres maintenant">${ico('refresh')}<span>Actualiser</span></button>
        <button class="ghost" id="owner-customize" type="button">Personnaliser</button>
        <button class="ghost" id="owner-mode" type="button" title="Changer la présentation du tableau de bord">Présentation : ${esc(modeLabel)}</button>
        <button class="ghost" id="owner-summary" type="button">Résumer la période</button>
        ${expenseButtons(canRecordCashOut)}
      </div>
    </div>
    <p class="muted owner-updated" id="owner-updated" aria-live="polite" hidden></p>
    <div id="owner-content" aria-live="polite"><div class="mdp-loading">Chargement des données…</div></div>
    <dialog id="owner-dialog"></dialog>
  </div>`;
}

function mobilePage({ modeLabel, userName, canRecordCashOut, monthStart, today, periodValue }) {
  const first = String(userName || '').trim().split(/\s+/)[0] || '';
  return `<div class="mdm">
    <header class="mdm-header">
      <div class="mdm-bar">
        <div class="mdm-brand"><img src="assets/logo-k.png" alt="" width="28" height="32"><span><b>KaPya</b><small>ERP</small></span></div>
        <div class="mdm-bar-actions">
          <a class="mdm-iconbtn" href="#/alertes" aria-label="Alertes et rappels">${ico('bell')}</a>
          <a class="mdm-avatar" href="#/parametres" aria-label="Paramètres">${esc(initials(userName))}</a>
        </div>
      </div>
      <p class="mdm-hello">${esc(first ? `Bonjour, ${first}` : 'Bonjour,')}</p>
      <h1>Tableau de bord</h1>
      <p class="mdm-header-note">Vue globale de votre activité commerciale</p>
    </header>
    <div class="mdm-filters" role="search" aria-label="Filtres du tableau de bord">
      <label class="mdm-field"><span class="sr">Période</span>${periodSelect(periodValue)}</label>
      <div class="mdm-shop" id="owner-shop-slot"></div>
      ${dateFields(monthStart, today)}
      <details class="mdm-menu">
        <summary aria-label="Actions">${ico('dots')}</summary>
        <div class="mdm-menu-body">
          <button id="owner-refresh" type="button">${ico('refresh')}<span>Actualiser</span></button>
          <button id="owner-customize" type="button">Personnaliser</button>
          <button id="owner-mode" type="button">Présentation : ${esc(modeLabel)}</button>
          <button id="owner-summary" type="button">Résumer la période</button>
          <button class="btn" id="owner-run" type="button" hidden>Afficher</button>
          ${expenseButtons(canRecordCashOut)}
        </div>
      </details>
    </div>
    <p class="muted owner-updated" id="owner-updated" aria-live="polite" hidden></p>
    <div id="owner-content" aria-live="polite"><div class="mdp-loading">Chargement des données…</div></div>
    <dialog id="owner-dialog"></dialog>
  </div>`;
}

// --------------------------------------------------------------- fragments
function kpi(label, value, note, icon, tone) {
  return `<article class="mdp-card mdp-kpi t-${tone}">
    <div class="mdp-kpi-top"><span class="mdp-ico">${ico(icon)}</span><span class="mdp-kpi-label">${esc(label)}</span></div>
    <b>${value}</b>
    <span class="mdp-kpi-note">${note}</span>
  </article>`;
}

function kpiCards(model) {
  const cards = [
    kpi('Chiffre d’affaires', usdOnly(model.revenue), `${model.salesCount} vente(s)${fcOnly(model.revenue) ? ` · ${fcOnly(model.revenue)}` : ''}`, 'sales', 'blue'),
    kpi('Ventes cash', usdOnly(model.cashSales), `${model.cashCount} facture(s) payée(s) comptant`, 'cash', 'green'),
    kpi('Ventes à crédit', usdOnly(model.creditSales), `${model.creditCount} facture(s) à crédit`, 'invoice', 'blue'),
    kpi('Paiements reçus', usdOnly(model.paymentsReceived), `${model.receiptsCount} encaissement(s)`, 'coins', 'green')
  ];
  if (model.canSeeCosts) {
    cards.push(kpi('Bénéfice brut', model.saleCostsAvailable ? usdOnly(model.gross) : '—', model.profitDetail, 'coins', 'violet'));
    cards.push(kpi('Entrées de trésorerie', usdOnly(model.cashIn), 'Ventes cash, paiements et dépôts reçus', 'sales', 'green'));
    cards.push(kpi('Sorties de trésorerie', usdOnly(model.cashOut), `Fournisseurs ${usdOnly(model.supplierPaid)} · dépenses ${usdOnly(model.expenseTotal)}`, 'purchases', 'orange'));
    cards.push(kpi('Flux net de trésorerie', usdOnly(model.cashNet), 'Entrées moins sorties enregistrées', 'wallet', model.cashNet >= 0 ? 'green' : 'red'));
    cards.push(kpi('Résultat net', model.saleCostsAvailable ? usdOnly(model.netProfit) : '—', model.saleCostsAvailable ? `Bénéfice brut moins ${usdOnly(model.expenseTotal)} de dépenses` : 'Configuration SQL des coûts requise', 'coins', model.netProfit >= 0 ? 'green' : 'red'));
    cards.push(kpi('Valeur du stock', usdOnly(model.stockValue), `Au prix d’achat${fcOnly(model.stockValue) ? ` · ${fcOnly(model.stockValue)}` : ''}`, 'stock', 'teal'));
  } else {
    cards.push(kpi('Créances clients restantes', usdOnly(model.outstanding), 'Solde restant à recouvrer', 'coins', 'orange'));
  }
  return cards.join('');
}

function mobileKpis(model) {
  const cards = [
    kpi('Ventes cash', usdOnly(model.cashSales), `${model.cashCount} facture(s)`, 'cash', 'green'),
    kpi('Ventes à crédit', usdOnly(model.creditSales), `${model.creditCount} facture(s)`, 'invoice', 'blue'),
    kpi('Paiements reçus', usdOnly(model.paymentsReceived), `${model.receiptsCount} encaissement(s)`, 'coins', 'green')
  ];
  if (model.canSeeCosts) cards.push(kpi('Bénéfice brut', model.saleCostsAvailable ? usdOnly(model.gross) : '—', model.profitDetail, 'coins', 'violet'));
  else cards.push(kpi('Créances clients restantes', usdOnly(model.outstanding), 'Solde restant à recouvrer', 'coins', 'orange'));
  return cards.join('');
}

let chartSeq = 0;
function trendChart(buckets, aria) {
  const width = 720, height = 240, left = 46, right = 18, top = 24, bottom = 34;
  const values = buckets.map(item => Number(item.value) || 0);
  const max = Math.max(1, ...values);
  const plotW = width - left - right, plotH = height - top - bottom;
  const step = values.length === 1 ? 0 : plotW / (values.length - 1);
  const points = values.map((value, index) => [left + step * index, top + plotH * (1 - value / max)]);
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
  const last = points[points.length - 1] || [left, top + plotH];
  const first = points[0] || [left, top + plotH];
  const area = `${line} L${last[0].toFixed(1)},${top + plotH} L${first[0].toFixed(1)},${top + plotH} Z`;
  const id = `mdchart-${++chartSeq}`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(part => {
    const y = top + plotH * part;
    return `<line class="md-grid" x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/><text class="md-axis" x="${left - 8}" y="${y + 4}" text-anchor="end">${n(Math.round(max * (1 - part)))}</text>`;
  }).join('');
  const every = Math.max(1, Math.ceil(values.length / 7));
  const fewPoints = values.length - 11 < 0;
  const labels = points.map((point, index) => (fewPoints || index % every === 0 || index === values.length - 1)
    ? `<text class="md-axis md-xlab" x="${point[0]}" y="${height - 10}" text-anchor="middle">${esc(buckets[index].label)}</text>` : '').join('');
  const dots = points.map((point, index) => `<circle class="md-dot" cx="${point[0]}" cy="${point[1]}" r="3.5"><title>${esc(buckets[index].label)} : ${esc(usdOnly(values[index]))}</title></circle>`).join('');
  return `<svg class="md-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0B5FFB" stop-opacity=".24"/><stop offset="100%" stop-color="#0B5FFB" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#${id})"/><path d="${line}" class="md-line"/>${dots}${labels ? `<g class="md-xlabels">${labels}</g>` : ''}
  </svg>`;
}

function donut(slices, total) {
  const cx = 70, cy = 70, r = 52, circumference = 2 * Math.PI * r;
  let offset = 0;
  const rings = slices.map(slice => {
    const length = total ? Math.max(0, slice.value / total) * circumference : 0;
    const ring = `<circle class="md-donut-seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${slice.color}" stroke-width="18" stroke-linecap="butt" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(slice.label)} : ${esc(usdOnly(slice.value))}</title></circle>`;
    offset += length;
    return ring;
  }).join('');
  return `<div class="md-donut-wrap" role="img" aria-label="Chiffre d’affaires par type de paiement">
    <svg class="md-donut" viewBox="0 0 140 140" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEF3FB" stroke-width="18"/>${rings}</svg>
    <div class="md-donut-center"><span>Total</span><b>${usdOnly(total)}</b></div>
  </div>`;
}

function activityList(items) {
  if (!items.length) return '<p class="mdp-empty">Aucune activité sur cette période.</p>';
  return `<ul class="mdp-activity-list">${items.map(item => `<li>
    <span class="mdp-act-ico t-${item.tone}">${ico(item.icon)}</span>
    <div class="mdp-act-main"><b>${esc(item.title)}</b><span>${esc(item.subtitle)}</span></div>
    <b class="mdp-act-amount ${item.direction === 'out' ? 'out' : 'in'}">${item.direction === 'out' ? '−' : '+'}${usdOnly(Math.abs(item.amount))}</b>
  </li>`).join('')}</ul>`;
}

function detailsBlock(model) {
  const extra = model.extra || {};
  const parts = [];
  if (extra.daily) {
    const daily = extra.daily;
    parts.push(`<section class="mdp-detail"><div class="mdp-card-head"><div><h2>Résumé de caisse du jour</h2><p>${esc(model.todayLabel)}</p></div></div>
      <div class="mdp-mini-kpis">
        <div><span>Ventes cash</span><b>${daily.cashAvailable ? usdOnly(daily.cash) : '—'}</b><small>${daily.cashAvailable ? `${daily.cashCount} facture(s) payée(s) comptant` : 'Suivi des ventes indisponible'}</small></div>
        <div><span>Ventes à crédit</span><b>${daily.available ? usdOnly(daily.credit) : '—'}</b><small>${daily.available ? `${daily.creditCount} facture(s)` : 'Suivi des paiements indisponible'}</small></div>
        <div><span>Paiements de crédits reçus</span><b>${daily.available ? usdOnly(daily.receipts) : '—'}</b><small>${daily.available ? `${daily.receiptCount} versement(s)` : 'Suivi des paiements indisponible'}</small></div>
      </div></section>`);
  }
  if (extra.audit?.length) {
    const labels = { update: 'Modifiée', delete: 'Supprimée', insert: 'Créée' };
    parts.push(`<section class="mdp-detail"><div class="mdp-card-head"><div><h2>Modifications du jour</h2><p>${esc(model.todayLabel)} · factures créées, modifiées ou supprimées</p></div></div>
      <ul class="mdp-audit">${extra.audit.map(row => `<li><b>${esc(labels[row.action] || row.action)}</b> · ${esc(row.actor_name || 'Utilisateur')} · ${new Date(row.occurred_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${row.summary ? ` · ${esc(row.summary)}` : ''}</li>`).join('')}</ul></section>`);
  }
  if (extra.moves?.length) {
    parts.push(`<section class="mdp-detail"><div class="mdp-card-head"><div><h2>Derniers mouvements de stock</h2><p>Entrées et sorties de la période</p></div><a href="#/rapports">Voir les rapports</a></div>
      <div class="tw"><table><thead><tr><th>Date</th><th>Article</th><th>Type</th><th class="r">Quantité</th></tr></thead><tbody>${extra.moves.map(move => `<tr><td>${dateFr(move.created_at)}</td><td>${esc(move.articles?.name || 'Article')}</td><td><span class="pill ${Number(move.qty) > 0 ? 'ok' : 'warn'}">${Number(move.qty) > 0 ? 'Entrée' : 'Sortie'}</span></td><td class="r">${Number(move.qty) > 0 ? '+' : '−'}${n(Math.abs(Number(move.qty)))} ${esc(move.articles?.unit || '')}</td></tr>`).join('')}</tbody></table></div></section>`);
  }
  if (extra.watch) {
    const w = extra.watch;
    const rows = [
      w.canSeeCosts ? `<div><span>Valeur du stock au prix d’achat</span><b>${usdOnly(w.stockValue)}</b></div>` : '',
      `<div><span>Articles sous le seuil</span><b class="${w.lowStock ? 'warn' : ''}">${w.lowStock} article(s)</b></div>`,
      `<div><span>Lots proches de la péremption</span><b class="${w.expiring ? 'warn' : ''}">${w.expiring} lot(s)</b></div>`,
      `<div><span>Créances clients restantes</span><b class="${w.outstanding > 0 ? 'warn' : ''}">${usdOnly(w.outstanding)}</b></div>`,
      w.canSeeCosts ? `<div><span>Dette fournisseur restante</span><b class="${w.supplierDebt > 0 ? 'warn' : ''}">${w.supplierBalancesAvailable ? usdOnly(w.supplierDebt) : '—'}</b></div>` : '',
      w.canSeeCosts ? `<div><span>Dépenses de la période</span><b>${usdOnly(w.expenseTotal)}</b></div>` : ''
    ].filter(Boolean).join('');
    parts.push(`<section class="mdp-detail"><div class="mdp-card-head"><div><h2>Points à surveiller</h2><p>${esc(model.dateLabel)}</p></div></div><div class="mdp-watch">${rows}</div>
      <p class="mdp-note">La trésorerie reflète les paiements et dépenses enregistrés dans l’application. Les anciennes dettes fournisseur doivent d’abord être initialisées avec leur solde réel.</p></section>`);
  }
  if (extra.cashout?.length) {
    parts.push(`<section class="mdp-detail"><div class="mdp-card-head"><div><h2>Dernières sorties de trésorerie</h2><p>${esc(model.dateLabel)}</p></div></div>
      <div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>Détail</th><th class="r">Montant</th></tr></thead><tbody>${extra.cashout.map(item => `<tr><td>${dateFr(item.date)}</td><td>${esc(item.type)}</td><td>${esc(item.label)}</td><td class="r">${usdOnly(item.amount)}</td></tr>`).join('')}</tbody></table></div></section>`);
  }
  return parts.length ? `<details class="mdp-more"><summary>Détails de la période</summary><div class="mdp-more-body">${parts.join('')}</div></details>` : '';
}

// ---------------------------------------------------------------- contenus
export function renderModernContent(model, mode) {
  return mode === 'modern_mobile' ? mobileContent(model) : pcContent(model);
}

function pcContent(model) {
  const totalSales = model.salesBuckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const slices = model.paymentSlices;
  const legend = slices.map(slice => `<li><span class="md-dotc" style="background:${slice.color}"></span><span>${esc(slice.label)}</span><b>${usdOnly(slice.value)}</b><small>${pct(slice.value, model.revenue)} %</small></li>`).join('');
  return `<div class="mdp-body">
    ${model.offlineNote}
    ${model.blocks.kpi ? `<section class="mdp-kpis" aria-label="Indicateurs clés">${kpiCards(model)}</section>` : ''}
    ${model.blocks.charts ? `<div class="mdp-grid">
      <section class="mdp-card mdp-trend">
        <div class="mdp-card-head"><div><h2>Évolution des ventes</h2><p>Montant des factures sur la période</p></div><span class="mdp-total">${usdOnly(totalSales)}</span></div>
        ${trendChart(model.salesBuckets, 'Évolution des ventes sur la période')}
        <div class="mdp-legend-row"><span><i class="md-dotc" style="background:#0B5FFB"></i>Ventes</span><span class="muted">${esc(model.dateLabel)}</span></div>
      </section>
      <section class="mdp-card mdp-donut-card">
        <div class="mdp-card-head"><div><h2>Chiffre d’affaires par type de paiement</h2><p>Répartition réelle des ventes</p></div></div>
        <div class="mdp-donut-body">${donut(slices, model.revenue)}<ul class="mdp-donut-legend">${legend}</ul></div>
      </section>
    </div>` : ''}
    <section class="mdp-card mdp-activity">
      <div class="mdp-card-head"><div><h2>Activités récentes</h2><p>Ventes, encaissements et sorties de la période</p></div><a href="#/ventes">Voir tout</a></div>
      ${activityList(model.activities)}
    </section>
    ${detailsBlock(model)}
  </div>`;
}

function mobileContent(model) {
  const totalSales = model.salesBuckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const slices = model.paymentSlices;
  const legend = slices.map(slice => `<li><span class="md-dotc" style="background:${slice.color}"></span><span>${esc(slice.label)}</span><b>${usdOnly(slice.value)}</b><small>${pct(slice.value, model.revenue)} %</small></li>`).join('');
  const treasury = model.blocks.kpi && model.canSeeCosts ? `<details class="mdm-card mdm-more">
    <summary>Trésorerie et stock</summary>
    <div class="mdm-rows">
      <div><span>Entrées de trésorerie</span><b>${usdOnly(model.cashIn)}</b></div>
      <div><span>Sorties de trésorerie</span><b>${usdOnly(model.cashOut)}</b></div>
      <div><span>Flux net de trésorerie</span><b class="${model.cashNet >= 0 ? 'in' : 'out'}">${usdOnly(model.cashNet)}</b></div>
      <div><span>Résultat net</span><b class="${model.netProfit >= 0 ? 'in' : 'out'}">${model.saleCostsAvailable ? usdOnly(model.netProfit) : '—'}</b></div>
      <div><span>Valeur du stock</span><b>${usdOnly(model.stockValue)}</b></div>
    </div>
  </details>` : '';
  const chartCard = model.blocks.charts ? `<section class="mdm-card">
    <div class="mdp-card-head"><div><h2>Évolution des ventes</h2><p>${esc(model.dateLabel)}</p></div><span class="mdp-total">${usdOnly(totalSales)}</span></div>
    ${trendChart(model.salesBuckets, 'Évolution des ventes sur la période')}
  </section>` : '';
  const donutCard = model.blocks.charts ? `<section class="mdm-card">
    <div class="mdp-card-head"><div><h2>Chiffre d’affaires par type de paiement</h2><p>Répartition réelle des ventes</p></div></div>
    <div class="mdp-donut-body">${donut(slices, model.revenue)}<ul class="mdp-donut-legend">${legend}</ul></div>
  </section>` : '';
  return `<div class="mdm-body">
    ${model.offlineNote}
    ${model.blocks.kpi ? `<section class="mdm-hero" aria-label="Chiffre d’affaires">
      <div class="mdm-hero-top"><span>Chiffre d’affaires</span><span class="mdm-hero-ico">${ico('sales')}</span></div>
      <b>${usdOnly(model.revenue)}</b>
      <div class="mdm-hero-foot"><span>${model.salesCount} vente(s)</span><span>${esc(model.periodLabel)}</span></div>
    </section>` : ''}
    ${model.blocks.kpi ? `<section class="mdm-kpis" aria-label="Indicateurs clés">${mobileKpis(model)}</section>` : ''}
    ${chartCard}${donutCard}
    <section class="mdm-card mdm-activity">
      <div class="mdp-card-head"><div><h2>Activités récentes</h2><p>Derniers mouvements de la période</p></div><a href="#/ventes">Voir tout</a></div>
      ${activityList(model.activities)}
    </section>
    ${treasury}
    ${detailsBlock(model)}
  </div>`;
}
