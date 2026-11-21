// KaPya ERP — rendus « Moderne PC » et « Moderne mobile » du tableau de bord.
// Aucun calcul métier ici : le modèle est préparé par js/modules/accueil.js avec les
// mêmes requêtes, les mêmes chiffres et les mêmes droits que la présentation classique.
import { esc, ico, n, usdOnly, fcOnly } from './ui.js';
import { METRIC_LABELS, relativeChange } from './dashboard-insights.mjs';

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

// Bascule clair/sombre : même action que le bouton d'en-tête de l'application,
// avec une icône soleil en mode sombre et lune en mode clair.
function themeToggle() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const label = dark ? 'Passer au thème clair' : 'Passer au thème sombre';
  return `<button class="mdm-iconbtn" id="mdm-theme" type="button" aria-label="${label}" title="${label}">${ico(dark ? 'sun' : 'moon')}</button>`;
}

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
        <details class="mdp-menu">
          <summary>${ico('dots')}<span>Actions</span></summary>
          <div class="mdp-menu-body">
            <button id="owner-customize" type="button">Personnaliser</button>
            <button id="owner-mode" type="button" title="Changer la présentation du tableau de bord">Présentation : ${esc(modeLabel)}</button>
            <button id="owner-summary" type="button">Résumer la période</button>
            ${expenseButtons(canRecordCashOut)}
          </div>
        </details>
      </div>
    </div>
    <p class="muted owner-updated" id="owner-updated" aria-live="polite" hidden></p>
    <div id="owner-content" aria-live="polite">${renderModernLoading()}</div>
    <dialog id="owner-dialog"></dialog>
  </div>`;
}

function mobilePage({ modeLabel, userName, canRecordCashOut, canCreateSale, monthStart, today, periodValue }) {
  const first = String(userName || '').trim().split(/\s+/)[0] || '';
  return `<div class="mdm">
    <header class="mdm-header">
      <div class="mdm-bar">
        <div class="mdm-brand"><img src="assets/logo-k.png" alt="" width="28" height="32"><span><b>KaPya</b><small>ERP</small></span></div>
        <div class="mdm-bar-actions">
          ${themeToggle()}
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
          ${expenseButtons(canRecordCashOut)}
        </div>
      </details>
      <button class="btn mdm-show" id="owner-run" type="button" hidden>Afficher</button>
    </div>
    <div class="mdm-toolbar">
      ${canCreateSale ? `<a class="mdm-new-sale" href="#/vente">${ico('plus')}<span>Nouvelle vente</span></a>` : ''}
      <p class="muted owner-updated" id="owner-updated" aria-live="polite" hidden></p>
    </div>
    <div id="owner-content" aria-live="polite">${renderModernLoading()}</div>
    <dialog id="owner-dialog"></dialog>
  </div>`;
}

// --------------------------------------------------------------- fragments
function valueButton(model, key, hero = false) {
  const available = model.details?.[key]?.available !== false;
  return `<button class="md-value${hero ? ' md-value-hero' : ''}" type="button" data-md-detail="${key}" aria-label="${esc(`Voir le détail : ${METRIC_LABELS[key]}`)}"><b>${available ? usdOnly(model[key]) : '—'}</b>${ico('eye')}</button>`;
}

function comparisonContent(model, key) {
  const comparison = model.comparison;
  if (!comparison || ['idle', 'loading'].includes(comparison.status)) return 'Comparaison en cours…';
  const change = relativeChange(model.details?.[key]?.available === false ? null : model[key], comparison.values?.[key]);
  if (change.kind === 'unavailable') return 'Comparaison indisponible';
  if (change.kind === 'stable') return 'Stable';
  if (change.kind === 'zero-base') return `<span>Période précédente :</span> ${usdOnly(0)}`;
  const good = key === 'cashOut' ? change.delta < 0 : change.delta > 0;
  return `<span class="${good ? 'md-change-good' : 'md-change-bad'}">${change.delta > 0 ? '↑' : '↓'} ${Math.abs(change.percent).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</span>`;
}

function comparisonBadge(model, key) {
  if (['stockValue', 'outstanding'].includes(key)) return '';
  return `<span class="md-change" data-md-change="${key}" title="Comparaison avec la période précédente, de même durée">${comparisonContent(model, key)}</span>`;
}

function kpi(model, key, note, icon, tone) {
  const label = METRIC_LABELS[key];
  return `<article class="mdp-card mdp-kpi t-${tone}" data-md-kpi="${key}">
    <div class="mdp-kpi-top"><span class="mdp-ico">${ico(icon)}</span><span class="mdp-kpi-label">${esc(label)}</span></div>
    ${valueButton(model, key)}
    <span class="mdp-kpi-note">${model.details?.[key]?.available === false ? 'Données indisponibles' : esc(note)}</span>
    ${comparisonBadge(model, key)}
  </article>`;
}

function kpiCards(model) {
  const cards = [
    kpi(model, 'revenue', `${model.salesCount} vente(s)${fcOnly(model.revenue) ? ` · ${fcOnly(model.revenue)}` : ''}`, 'sales', 'blue'),
    kpi(model, 'cashSales', `${model.cashCount} facture(s) payée(s) comptant`, 'cash', 'green'),
    kpi(model, 'creditSales', `${model.creditCount} facture(s) à crédit`, 'invoice', 'blue'),
    kpi(model, 'paymentsReceived', `${model.receiptsCount} encaissement(s)`, 'coins', 'green')
  ];
  const group = (label, content) => `<section class="mdp-kpi-group" aria-label="${esc(label)}"><h2>${esc(label)}</h2><div class="mdp-kpis">${content.join('')}</div></section>`;
  const groups = [group('Ventes et encaissements', cards)];
  if (model.canSeeCosts) {
    groups.push(group('Rentabilité', [
      kpi(model, 'gross', model.profitDetail, 'coins', 'violet'),
      kpi(model, 'netProfit', `Bénéfice brut moins ${usdOnly(model.expenseTotal)} de dépenses`, 'coins', model.netProfit >= 0 ? 'green' : 'red')
    ]));
    groups.push(group('Trésorerie et stock', [
      kpi(model, 'cashIn', 'Ventes cash, paiements et dépôts reçus', 'sales', 'green'),
      kpi(model, 'cashOut', `Fournisseurs ${usdOnly(model.supplierPaid)} · dépenses ${usdOnly(model.expenseTotal)}`, 'purchases', 'orange'),
      kpi(model, 'cashNet', 'Entrées moins sorties enregistrées', 'wallet', model.cashNet >= 0 ? 'green' : 'red'),
      kpi(model, 'stockValue', 'Au prix d’achat · stock actuel', 'stock', 'teal')
    ]));
  } else {
    groups.push(group('Suivi des clients', [kpi(model, 'outstanding', 'Solde restant à recouvrer', 'coins', 'orange')]));
  }
  return `<div class="mdp-kpi-groups">${groups.join('')}</div>`;
}

function mobileKpis(model) {
  const cards = [
    kpi(model, 'cashSales', `${model.cashCount} facture(s)`, 'cash', 'green'),
    kpi(model, 'creditSales', `${model.creditCount} facture(s)`, 'invoice', 'blue'),
    kpi(model, 'paymentsReceived', `${model.receiptsCount} encaissement(s)`, 'coins', 'green')
  ];
  if (model.canSeeCosts) cards.push(kpi(model, 'gross', model.profitDetail, 'coins', 'violet'));
  else cards.push(kpi(model, 'outstanding', 'Solde restant à recouvrer', 'coins', 'orange'));
  return cards.join('');
}

let chartSeq = 0;
function trendChart(buckets, aria) {
  const width = 640, height = 200, left = 24, right = 24, top = 16, bottom = 16;
  const values = buckets.map(item => Number(item.value) || 0);
  const max = Math.max(1, ...values);
  const plotW = width - left - right, plotH = height - top - bottom;
  const step = values.length === 1 ? 0 : plotW / (values.length - 1);
  const points = values.map((value, index) => [left + (values.length === 1 ? plotW / 2 : step * index), top + plotH * (1 - value / max)]);
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
  const last = points[points.length - 1] || [left, top + plotH];
  const first = points[0] || [left, top + plotH];
  const area = `${line} L${last[0].toFixed(1)},${top + plotH} L${first[0].toFixed(1)},${top + plotH} Z`;
  const id = `mdchart-${++chartSeq}`;
  const axisFormat = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
  const axis = [0, 0.25, 0.5, 0.75, 1].map(part => `<span>${axisFormat.format(max * (1 - part))}</span>`).join('');
  const grid = [0, 0.25, 0.5, 0.75, 1].map(part => {
    const y = top + plotH * part;
    return `<line class="md-grid" x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/>`;
  }).join('');
  const labels = points.map((point, index) => `<span class="md-xlab${[0, Math.floor((points.length - 1) / 2), points.length - 1].includes(index) ? ' md-xmajor' : ''}" style="left:${point[0] / width * 100}%">${esc(buckets[index].label)}</span>`).join('');
  const dots = points.map((point, index) => `<circle class="md-dot" data-md-dot="${index}" cx="${point[0]}" cy="${point[1]}" r="3.5"><title>${esc(buckets[index].label)} : ${esc(usdOnly(values[index]))}</title></circle>`).join('');
  const index = Math.max(0, buckets.length - 1);
  const selected = buckets[index];
  const text = selected ? `${selected.dateLabel || selected.label} : ${usdOnly(selected.value)}` : '';
  return `<div class="md-chart-widget" data-md-chart>
    <div class="md-chart-layout"><div class="md-y-axis" aria-hidden="true">${axis}</div><div class="md-chart-main">
    <svg class="md-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(aria)}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0B5FFB" stop-opacity=".24"/><stop offset="100%" stop-color="#0B5FFB" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#${id})"/><path d="${line}" class="md-line"/>${dots}
    <line class="md-chart-cursor" data-md-cursor x1="${last[0]}" x2="${last[0]}" y1="${top}" y2="${top + plotH}"/>
    </svg><div class="md-xlabels" aria-hidden="true">${labels}</div></div></div>
    <div class="md-chart-reading"><span>Touchez la courbe pour lire un montant</span><output data-md-chart-output aria-live="polite">${esc(text)}</output></div>
    <input class="md-chart-slider" type="range" min="0" max="${index}" step="1" value="${index}" aria-label="Jour du graphique" aria-valuetext="${esc(text)}" data-md-chart-slider>
    <div hidden data-md-chart-data>${buckets.map((bucket, i) => `<span data-index="${i}" data-value="${Number(bucket.value) || 0}" data-label="${esc(bucket.dateLabel || bucket.label)}" data-x="${points[i][0]}"></span>`).join('')}</div>
  </div>`;
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

const comparisonPeriod = model => model.comparison?.range
  ? `<p class="md-compare-period"><span>Comparaison avec la période précédente, de même durée</span> · ${dateFr(model.comparison.range.from)} – ${dateFr(model.comparison.range.to)}</p>` : '';

const emptySales = () => '<p class="md-no-sales" role="status">Aucune vente sur cette période.</p>';

function pcContent(model) {
  const totalSales = model.salesBuckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const slices = model.paymentSlices;
  const legend = slices.map(slice => `<li><span class="md-dotc" style="background:${slice.color}"></span><span>${esc(slice.label)}</span><b>${usdOnly(slice.value)}</b><small>${pct(slice.value, model.revenue)} %</small></li>`).join('');
  return `<div class="mdp-body">
    ${model.offlineNote}
    ${model.blocks.kpi ? `${comparisonPeriod(model)}${kpiCards(model)}` : ''}
    ${model.blocks.charts ? `<div class="mdp-grid">
      <section class="mdp-card mdp-trend">
        <div class="mdp-card-head"><div><h2>Évolution des ventes</h2><p>Montant des factures sur la période</p></div><span class="mdp-total">${usdOnly(totalSales)}</span></div>
        ${model.salesCount ? trendChart(model.salesBuckets, 'Évolution des ventes sur la période') : emptySales()}
        <div class="mdp-legend-row"><span><i class="md-dotc" style="background:#0B5FFB"></i>Ventes</span><span class="muted">${esc(model.dateLabel)}</span></div>
      </section>
      <section class="mdp-card mdp-donut-card">
        <div class="mdp-card-head"><div><h2>Chiffre d’affaires par type de paiement</h2><p>Répartition réelle des ventes</p></div></div>
        ${slices.length ? `<div class="mdp-donut-body">${donut(slices, model.revenue)}<ul class="mdp-donut-legend">${legend}</ul></div>` : emptySales()}
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
      <div><span>Entrées de trésorerie</span>${valueButton(model, 'cashIn')}</div>
      <div><span>Sorties de trésorerie</span>${valueButton(model, 'cashOut')}</div>
      <div><span>Flux net de trésorerie</span>${valueButton(model, 'cashNet')}</div>
      <div><span>Résultat net</span>${valueButton(model, 'netProfit')}</div>
      <div><span>Valeur du stock</span>${valueButton(model, 'stockValue')}</div>
    </div>
  </details>` : '';
  const chartCard = model.blocks.charts ? `<section class="mdm-card">
    <div class="mdp-card-head"><div><h2>Évolution des ventes</h2><p>${esc(model.dateLabel)}</p></div><span class="mdp-total">${usdOnly(totalSales)}</span></div>
    ${model.salesCount ? trendChart(model.salesBuckets, 'Évolution des ventes sur la période') : emptySales()}
  </section>` : '';
  const donutCard = model.blocks.charts ? `<details class="mdm-card mdm-more mdm-payment-details">
    <summary>Répartition des paiements</summary><div class="mdm-payment-body">
    <div class="mdp-card-head"><div><h2>Chiffre d’affaires par type de paiement</h2><p>Répartition réelle des ventes</p></div></div>
    ${slices.length ? `<div class="mdp-donut-body">${donut(slices, model.revenue)}<ul class="mdp-donut-legend">${legend}</ul></div>` : emptySales()}
  </div></details>` : '';
  return `<div class="mdm-body">
    ${model.offlineNote}
    ${model.blocks.kpi ? `<section class="mdm-hero" aria-label="Chiffre d’affaires">
      <div class="mdm-hero-top"><span>Chiffre d’affaires</span><span class="mdm-hero-ico">${ico('sales')}</span></div>
      ${valueButton(model, 'revenue', true)}
      ${comparisonBadge(model, 'revenue')}
      <div class="mdm-hero-foot"><span>${model.salesCount} vente(s)</span><span>${esc(model.periodLabel)}</span></div>
    </section>` : ''}
    ${model.blocks.kpi ? `<section class="mdm-kpis" aria-label="Indicateurs clés">${mobileKpis(model)}</section>` : ''}
    ${chartCard}
    <section class="mdm-card mdm-activity">
      <div class="mdp-card-head"><div><h2>Activités récentes</h2><p>Derniers mouvements de la période</p></div><a href="#/ventes">Voir tout</a></div>
      ${activityList(model.activities)}
    </section>
    ${donutCard}
    ${treasury}
    ${detailsBlock(model)}
  </div>`;
}

export function renderModernLoading() {
  return `<div class="md-loading-status" role="status">Chargement des chiffres…</div>
    <div class="md-skeleton" aria-hidden="true">${Array.from({ length: 4 }, () => '<div><i></i><i></i><i></i></div>').join('')}</div>`;
}

export function renderModernFailure() {
  return `<section class="md-load-error" role="alert"><h2>Chiffres indisponibles</h2>
    <p>Vérifiez la connexion et réessayez. Les données manquantes ne sont pas remplacées par zéro.</p>
    <button class="btn" type="button" data-md-retry>Réessayer</button></section>`;
}

export function paintModernComparisons(main, model) {
  main.querySelectorAll('[data-md-change]').forEach(element => {
    element.innerHTML = comparisonContent(model, element.dataset.mdChange);
  });
}

export function renderModernDetail(model, key) {
  const detail = Object.hasOwn(model.details || {}, key) ? model.details[key] : null;
  if (!detail) return null;
  const context = detail.current ? 'État actuel' : model.dateLabel;
  const scope = detail.scope === 'all' ? 'Toutes les boutiques' : model.shopLabel || 'Toutes les boutiques';
  const heading = `<p class="md-detail-context">${esc(context)} · ${esc(scope)}</p>`;
  if (!detail.available) return { title: detail.title, body: `${heading}<p role="status">Données indisponibles. Actualisez le tableau de bord pour réessayer.</p>` };
  const explanation = ['gross', 'netProfit'].includes(key)
    ? `<p class="md-detail-note">${key === 'gross' ? 'Chiffre d’affaires moins coût des articles vendus' : 'Bénéfice brut moins les dépenses de la période'}</p>` : '';
  const scopeNote = model.shopSelected && ['cashIn', 'cashOut', 'cashNet', 'netProfit'].includes(key)
    ? '<p class="md-detail-note">Les ventes sont filtrées par boutique. Dépôts, dépenses et paiements fournisseurs concernent l’ensemble de l’entreprise.</p>' : '';
  const previous = model.comparison?.values?.[key];
  const comparison = Number.isFinite(previous) ? `<p class="md-detail-note"><span>Période précédente :</span> ${usdOnly(previous)} · ${dateFr(model.comparison.range.from)} – ${dateFr(model.comparison.range.to)}</p>` : '';
  const body = detail.rows.length ? `<div class="tw md-detail-table"><table><thead><tr><th>Date</th><th>Détail</th><th class="r">Montant</th></tr></thead><tbody>
    ${detail.rows.map(row => `<tr><td>${dateFr(row.date)}</td><td>${esc(row.label)}</td><td class="r">${usdOnly(row.amount)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="md-detail-empty">Aucune opération à afficher.</p>';
  return {
    title: detail.title,
    body: `${heading}<p class="md-detail-total">${usdOnly(detail.total)}</p>${comparison}${explanation}${scopeNote}${body}<p class="md-detail-note">Les filtres du tableau de bord sont conservés à la fermeture.</p>`
  };
}

// Écouteurs délégués : un seul jeu d'événements, même après un changement de rendu.
export function bindModernInteractions(main, { signal, onDetail, onRetry }) {
  const selectPoint = (widget, index) => {
    const rows = [...widget.querySelectorAll('[data-md-chart-data] > span')];
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    const text = `${row.dataset.label} : ${usdOnly(Number(row.dataset.value))}`;
    const slider = widget.querySelector('[data-md-chart-slider]');
    slider.value = row.dataset.index;
    slider.setAttribute('aria-valuetext', text);
    widget.querySelector('[data-md-chart-output]').textContent = text;
    const cursor = widget.querySelector('[data-md-cursor]');
    cursor.setAttribute('x1', row.dataset.x);
    cursor.setAttribute('x2', row.dataset.x);
    widget.querySelectorAll('[data-md-dot]').forEach(dot => dot.classList.toggle('md-dot-selected', dot.dataset.mdDot === row.dataset.index));
  };
  main.addEventListener('input', event => {
    if (event.target.matches('[data-md-chart-slider]')) selectPoint(event.target.closest('[data-md-chart]'), Number(event.target.value));
  }, { signal });
  main.addEventListener('pointerup', event => {
    const svg = event.target.closest('svg.md-chart');
    if (!svg || event.button > 0) return;
    const widget = svg.closest('[data-md-chart]');
    const points = widget.querySelectorAll('[data-md-chart-data] > span');
    const box = svg.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * 640;
    selectPoint(widget, Math.round((x - 24) / (640 - 48) * (points.length - 1)));
  }, { signal });
  main.addEventListener('click', event => {
    const themeButton = event.target.closest('#mdm-theme');
    if (themeButton) {
      document.getElementById('themebtn')?.click();
      const dark = document.documentElement.dataset.theme === 'dark';
      const label = dark ? 'Passer au thème clair' : 'Passer au thème sombre';
      themeButton.innerHTML = ico(dark ? 'sun' : 'moon');
      themeButton.setAttribute('aria-label', label);
      themeButton.title = label;
    }
    const menuButton = event.target.closest('.mdp-menu-body button, .mdm-menu-body button');
    if (menuButton) menuButton.closest('details').open = false;
    const detail = event.target.closest('[data-md-detail]');
    if (detail) onDetail(detail.dataset.mdDetail, detail);
    if (event.target.closest('[data-md-retry]')) onRetry();
  }, { signal });
  main.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const menu = event.target.closest('.mdp-menu[open], .mdm-menu[open]');
    if (menu) { menu.open = false; menu.querySelector('summary').focus(); event.preventDefault(); }
  }, { signal });
  document.addEventListener('pointerdown', event => {
    main.querySelectorAll('.mdp-menu[open], .mdm-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  }, { signal });
}
