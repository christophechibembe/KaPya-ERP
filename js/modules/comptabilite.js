// Comptabilité : journal, balance et TVA de la période, à partir des ventes, achats et dépenses.
// Lecture seule : aucune écriture n'est créée ni modifiée par cet écran.
import { db } from '../api.js';
import { esc, n, ico } from '../ui.js';
import { downloadCsv, csvNumber } from '../export.js';
import { planAllows } from '../plans.js';
import { getVat, loadVat } from '../vat.js';
import { buildJournal, buildBalance, summarize, journalTotals, ACCOUNTS } from '../accounting.js';

const iso = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const today = () => iso(new Date());
const monthStart = () => { const now = new Date(); return iso(new Date(now.getFullYear(), now.getMonth(), 1)); };
const fr = value => String(value || '').slice(0, 10).split('-').reverse().join('/');
const usd = value => `${n(Number(value) || 0)} $`;
const MAX_ROWS = 300;

export async function render(main) {
  main.dataset.page = 'comptabilite';
  if (!planAllows('comptabilite')) {
    main.innerHTML = `<div class="page-head"><div><h1>Comptabilité</h1><p class="sub">Journal, balance et TVA de la période.</p></div></div>
      <section class="card"><h2>Comptabilité</h2>
        <p class="muted">La comptabilité est incluse dans la formule Standard et dans la formule Premium.</p>
        <p><a class="btn" href="#/parametres">Voir ma formule</a></p></section>`;
    return;
  }

  main.innerHTML = `<div class="page-head"><div><h1>Comptabilité</h1><p class="sub">Journal, balance et TVA de la période.</p></div></div>
    <section class="card">
      <div class="grid2">
        <div><label for="cp-from">Du</label><input id="cp-from" type="date" value="${monthStart()}"></div>
        <div><label for="cp-to">Au</label><input id="cp-to" type="date" value="${today()}"></div>
      </div>
      <div class="acts">
        <button class="btn" id="cp-refresh" type="button">${ico('refresh')}<span>Actualiser</span></button>
        <button class="ghost" id="cp-journal" type="button">${ico('download')}<span>Journal (Excel)</span></button>
        <button class="ghost" id="cp-balance" type="button">${ico('download')}<span>Balance (Excel)</span></button>
      </div>
      <p class="muted" id="cp-msg" role="status" aria-live="polite"></p>
    </section>
    <div id="cp-body"></div>`;

  const $ = selector => main.querySelector(selector);
  let last = null;

  const period = () => {
    const from = $('#cp-from').value, to = $('#cp-to').value;
    if (!from || !to || from > to) throw new Error('Choisissez une période valide (la date de début doit précéder la date de fin).');
    return { from, to };
  };

  async function load() {
    const { from, to } = period();
    $('#cp-msg').textContent = 'Chargement…';
    const vat = await loadVat().catch(() => getVat());
    const [sales, salePayments, purchases, purchasePayments, expenses, returns, creditNotes] = await Promise.all([
      db.select('sales', `select=id,number,sold_at,payment,customer_label,sale_lines(qty,unit_price)&sold_at=gte.${from}&sold_at=lte.${to}&order=sold_at.asc`),
      db.select('sale_payments', `select=id,amount,paid_at,kind,sales(number)&paid_at=gte.${from}&paid_at=lte.${to}&order=paid_at.asc`).catch(() => []),
      db.select('purchases', `select=id,number,bought_at,purchase_lines(qty,unit_cost)&bought_at=gte.${from}&bought_at=lte.${to}&order=bought_at.asc`),
      db.select('purchase_payments', `select=id,amount,paid_at,purchases(number)&paid_at=gte.${from}&paid_at=lte.${to}&order=paid_at.asc`).catch(() => []),
      db.select('business_expenses', `select=id,label,category,amount,paid_at&paid_at=gte.${from}&paid_at=lte.${to}&order=paid_at.asc`).catch(() => []),
      db.select('customer_returns', `select=id,returned_on,total_usd&returned_on=gte.${from}&returned_on=lte.${to}&order=returned_on.asc`).catch(() => []),
      db.select('credit_notes', `select=id,issued_on,total_usd&issued_on=gte.${from}&issued_on=lte.${to}&order=issued_on.asc`).catch(() => [])
    ]);

    const journal = buildJournal({ sales, salePayments, purchases, purchasePayments, expenses, returns, creditNotes, vat });
    const balance = buildBalance(journal);
    const totals = summarize(journal);
    const check = journalTotals(journal);
    last = { from, to, journal, balance, totals, check, vat };
    draw();
    $('#cp-msg').textContent = journal.length ? `${journal.length} ligne(s) comptable(s).` : 'Aucune opération sur cette période.';
  }

  function kpi(label, value, detail, icon, tone) {
    return `<article class="kpi ${tone || ''}"><span class="kpi-ico">${ico(icon)}</span><div><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail)}</small></div></article>`;
  }

  function draw() {
    const { from, to, journal, balance, totals, check, vat } = last;
    const shown = journal.slice(0, MAX_ROWS);
    const vatCard = vat.enabled
      ? `<div class="tw"><table><thead><tr><th>Élément</th><th class="r">Montant</th></tr></thead><tbody>
          <tr><td>TVA collectée sur les ventes</td><td class="r">${usd(totals.vatCollected)}</td></tr>
          <tr><td>TVA récupérable sur les achats</td><td class="r">− ${usd(totals.vatDeductible)}</td></tr>
          <tr><td><b>TVA à payer</b></td><td class="r"><b>${usd(totals.vatDue)}</b></td></tr>
        </tbody></table></div>
        <p class="muted">Taux appliqué : ${n(vat.rate)} %. Les prix étant TTC, la TVA est la part contenue dans les totaux.</p>`
      : '<p class="muted">TVA désactivée. Activez-la dans Paramètres &gt; TVA pour la calculer et l’afficher ici.</p>';

    $('#cp-body').innerHTML = `<p class="report-range">${fr(from)} au ${fr(to)}</p>
      <section class="kpis">
        ${kpi('Chiffre d’affaires', usd(totals.revenue), 'ventes nettes de retours et avoirs', 'sales', 't-green')}
        ${kpi('Achats', usd(totals.purchases), 'marchandises achetées sur la période', 'purchases', 't-blue')}
        ${kpi('Dépenses', usd(totals.expenses), 'charges saisies dans Caisse', 'cash', 't-orange')}
        ${kpi('Résultat', usd(totals.result), totals.result >= 0 ? 'bénéfice de la période' : 'perte de la période', 'chart', totals.result >= 0 ? 't-green' : 't-orange')}
      </section>
      <section class="card report-section"><h2>Journal comptable</h2>
        ${journal.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Pièce</th><th>Libellé</th><th>Compte</th><th class="r">Débit</th><th class="r">Crédit</th></tr></thead><tbody>${shown.map(line => `<tr><td>${fr(line.date)}</td><td>${esc(line.piece || '—')}</td><td>${esc(line.label)}</td><td>${esc(line.account)} ${esc(ACCOUNTS[line.account] || '')}</td><td class="r">${line.debit ? usd(line.debit) : '—'}</td><td class="r">${line.credit ? usd(line.credit) : '—'}</td></tr>`).join('')}</tbody></table></div>
          ${journal.length > MAX_ROWS ? `<p class="muted">Affichage limité aux ${MAX_ROWS} premières lignes. L’export Excel contient tout.</p>` : ''}
          <p class="muted">Total débit : ${usd(check.debit)} · total crédit : ${usd(check.credit)} · écart : ${usd(check.difference)}.</p>`
        : '<p class="muted">Aucune opération sur cette période.</p>'}
      </section>
      <section class="card report-section"><h2>Balance</h2>
        ${balance.length ? `<div class="tw"><table><thead><tr><th>Compte</th><th>Intitulé</th><th class="r">Débit</th><th class="r">Crédit</th><th class="r">Solde</th></tr></thead><tbody>${balance.map(row => `<tr><td>${esc(row.account)}</td><td>${esc(row.label)}</td><td class="r">${usd(row.debit)}</td><td class="r">${usd(row.credit)}</td><td class="r">${usd(row.balance)}</td></tr>`).join('')}</tbody></table></div>
          <p class="muted">Un solde positif est un solde débiteur (actif ou charge) ; un solde négatif est créditeur (passif ou produit).</p>`
        : '<p class="muted">Aucune opération sur cette période.</p>'}
      </section>
      <section class="card report-section"><h2>TVA</h2>${vatCard}</section>`;
  }

  $('#cp-refresh').onclick = () => load().catch(error => { $('#cp-msg').textContent = 'Chargement impossible : ' + error.message; });
  $('#cp-journal').onclick = () => {
    if (!last) return;
    const headers = ['Date', 'Pièce', 'Libellé', 'Compte', 'Débit', 'Crédit'];
    const rows = last.journal.map(line => [fr(line.date), line.piece, line.label, `${line.account} ${ACCOUNTS[line.account] || ''}`, csvNumber(line.debit), csvNumber(line.credit)]);
    downloadCsv(`journal-comptable-${last.from}-au-${last.to}`, headers, rows).catch(error => { $('#cp-msg').textContent = 'Export impossible : ' + error.message; });
  };
  $('#cp-balance').onclick = () => {
    if (!last) return;
    const headers = ['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde'];
    const rows = last.balance.map(row => [row.account, row.label, csvNumber(row.debit), csvNumber(row.credit), csvNumber(row.balance)]);
    downloadCsv(`balance-comptable-${last.from}-au-${last.to}`, headers, rows).catch(error => { $('#cp-msg').textContent = 'Export impossible : ' + error.message; });
  };

  await load();
}
