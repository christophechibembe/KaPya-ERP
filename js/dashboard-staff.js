// Présentation du résumé journalier du facturier (« Activité du jour »).
// Les trois rendus affichent exactement les mêmes chiffres et les mêmes opérations :
// seul l'habillage change (classique, moderne PC, moderne mobile).
// Aucune requête ni calcul métier ici : l'écran fournit les valeurs déjà calculées.
import { esc, ico } from './ui.js';
import { MODE_LABELS } from './dashboard-modes.js';

const modern = mode => mode === 'modern_pc' || mode === 'modern_mobile';

// Coquille de l'écran. Le rendu classique reste strictement inchangé.
export function staffShell(mode, { today, greet = '', modeLabel = '' }) {
  const label = modeLabel || MODE_LABELS[mode] || '';
  if (!modern(mode)) return `<div class="page-head owner-head"><div><h1>Activité du jour</h1>${greet}<p class="sub">Ventes cash, ventes à crédit et paiements de crédits reçus.</p></div><label class="owner-filters"><span>Date</span><input type="date" id="staff-day" value="${esc(today)}"></label></div><div id="staff-day-content" aria-live="polite"><div class="card empty">Chargement…</div></div>`;
  const mobile = mode === 'modern_mobile';
  const wrap = mobile ? 'mdm' : 'mdp';
  const header = mobile
    ? `<header class="mdm-header">${greet ? `<p class="mdm-hello">${greet}</p>` : ''}<h1>Activité du jour</h1><p class="mdm-header-note">Ventes cash, ventes à crédit et paiements de crédits reçus.</p></header>`
    : `<header class="mdp-head"><div class="mdp-title">${greet ? `<p class="mdp-greet">${greet}</p>` : ''}<h1>Activité du jour</h1><p class="mdp-sub">Ventes cash, ventes à crédit et paiements de crédits reçus.</p></div></header>`;
  return `<div class="${wrap} staff-day">${header}
    <div class="${mobile ? 'mdm-filters' : 'mdp-filters'}" role="search" aria-label="Filtres de l’activité du jour">
      <label class="${mobile ? 'mdm-field' : 'mdp-field'}"><span class="${mobile ? 'sr' : ''}">Date</span><input type="date" id="staff-day" value="${esc(today)}"></label>
      <button class="ghost" id="owner-mode" type="button" title="Changer la présentation du tableau de bord">Présentation : ${esc(label)}</button>
    </div>
    <div id="staff-day-content" class="${mobile ? 'mdm-body' : 'mdp-body'}" aria-live="polite"><div class="card empty">Chargement…</div></div>
  </div>`;
}

const card = (label, value, note, icon, tone) => `<article class="mdp-card mdp-kpi t-${tone}"><div class="mdp-kpi-top"><span class="mdp-ico">${ico(icon)}</span><span class="mdp-kpi-label">${esc(label)}</span></div><b>${value}</b><span class="mdp-kpi-note">${esc(note)}</span></article>`;

// Contenu du jour. Retourne null pour le rendu classique, dont le balisage reste
// dans accueil.js. `rowsHtml` est fourni par l'écran (échappement et tri identiques).
export function staffContent(mode, { dayLabel, cash, credit, receipt, collected, counts, rowsHtml }) {
  if (!modern(mode)) return null;
  const mobile = mode === 'modern_mobile';
  const head = `<div class="mdp-card-head"><div><h2>Opérations de la journée</h2><p>${esc(dayLabel)}</p></div></div>`;
  const activity = `<section class="${mobile ? 'mdm-card mdm-activity' : 'mdp-card mdp-activity'}">${head}${rowsHtml}</section>`;
  if (mobile) return `<section class="mdm-hero" aria-label="Total encaissé">
      <div class="mdm-hero-top"><span>Total encaissé</span><span class="mdm-hero-ico">${ico('wallet')}</span></div>
      <b>${collected}</b>
      <div class="mdm-hero-foot"><span>${esc(dayLabel)}</span><span>${counts.all} opération(s)</span></div>
    </section>
    <section class="mdm-kpis" aria-label="Indicateurs du jour">
      ${card('Ventes cash', cash, `${counts.cash} facture(s)`, 'cash', 'green')}
      ${card('Ventes à crédit', credit, `${counts.credit} facture(s)`, 'invoice', 'blue')}
      ${card('Paiements reçus', receipt, `${counts.receipt} versement(s)`, 'coins', 'purple')}
    </section>${activity}`;
  return `<p class="owner-period-label">Résumé du ${esc(dayLabel)}</p>
    <section class="mdp-kpis">
      ${card('Ventes cash', cash, `${counts.cash} facture(s)`, 'cash', 'green')}
      ${card('Ventes à crédit', credit, `${counts.credit} facture(s)`, 'invoice', 'blue')}
      ${card('Paiements reçus', receipt, `${counts.receipt} versement(s)`, 'coins', 'purple')}
      ${card('Total encaissé', collected, 'Ventes cash + paiements reçus', 'wallet', 'orange')}
    </section>${activity}`;
}
