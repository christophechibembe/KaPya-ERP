import { db } from '../api.js';
import { esc, usdOnly, ico } from '../ui.js';
import { hasNewCashMovements } from './caisse-metrics.mjs';

const isoToday = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const fr = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '—';
const amount = value => usdOnly(Number(value || 0));
const number = value => Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const dual = (value, rate) => `<span class="cash-dual">${amount(value)}<small>≈ ${Math.round(Number(value || 0) * Number(rate || 0)).toLocaleString('fr-FR')} FC</small></span>`;

export async function render(main, ctx) {
  const today = isoToday();
  const canClose = ['admin', 'manager', 'facturier'].includes(ctx?.role);
  const canCorrect = ['admin', 'manager'].includes(ctx?.role);
  main.innerHTML = `<div class="page-head"><div><h1>Clôture de caisse</h1><p class="sub">Comparez les mouvements enregistrés avec l’argent réellement compté.</p></div><label class="cash-date"><span>Journée</span><input type="date" id="cash-day" max="${today}" value="${today}"></label></div>
    <div id="cash-content" aria-live="polite"><div class="card empty">Chargement du résumé…</div></div>`;
  const dayInput = main.querySelector('#cash-day');
  const content = main.querySelector('#cash-content');

  function printClosure(day, data, closure, formData = null, paper = '85', org = {}) {
    const summary = data;
    const rate = Number(closure?.exchange_rate || summary.exchange_rate || 0);
    const rateDate = closure ? closure.summary?.rate_date : summary.rate_date;
    const opening = closure
      ? Number(closure.opening_usd || 0) + Number(closure.opening_fc || 0) / rate
      : Number(formData?.get('opening_usd') || 0) + Number(formData?.get('opening_fc') || 0) / rate;
    const expected = closure ? Number(closure.expected_usd || 0) : opening + Number(summary.cash_in || 0) - Number(summary.cash_out || 0);
    const openingUsd = Number(closure?.opening_usd ?? formData?.get('opening_usd') ?? 0);
    const openingFc = Number(closure?.opening_fc ?? formData?.get('opening_fc') ?? 0);
    const countedUsd = Number(closure?.counted_usd ?? formData?.get('counted_usd') ?? 0);
    const countedFc = Number(closure?.counted_fc ?? formData?.get('counted_fc') ?? 0);
    const counted = closure ? Number(closure.counted_total_usd || 0) : countedUsd + countedFc / rate;
    const difference = closure ? Number(closure.difference_usd || 0) : counted - expected;
    const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
    const companyDetails = [org.address, org.phone && `Tél. : ${org.phone}`, org.email && `E-mail : ${org.email}`, org.tax_id && `NIF : ${org.tax_id}`, org.rc && `RC : ${org.rc}`].filter(Boolean).map(esc).join(' · ');
    area.innerHTML = `<article class="classic-cash-report paper-${paper}"><header><b>${esc(org.name || 'KaPya ERP')}</b><p>Récapitulatif de caisse</p>${companyDetails ? `<p>${companyDetails}</p>` : ''}</header><h1>Clôture de caisse</h1><p class="classic-date">Date : <b>${fr(day)}</b></p>
      <table><thead><tr><th>Désignation</th><th class="r">Montant</th></tr></thead><tbody>
      <tr><td>Ventes au comptant</td><td class="r">${amount(summary.cash_sales)}</td></tr>
      <tr><td>Paiements de crédits reçus</td><td class="r">${amount(summary.credit_payments)}</td></tr>
      <tr><td>Dépôts clients reçus</td><td class="r">${amount(summary.customer_deposits)}</td></tr>
      <tr><td>Sorties enregistrées</td><td class="r">− ${amount(summary.cash_out)}</td></tr>
      <tr><td>Fonds initial USD</td><td class="r">${amount(openingUsd)}</td></tr>
      <tr><td>Fonds initial FC</td><td class="r">${number(openingFc)} FC</td></tr>
      <tr class="classic-total"><th>Montant attendu</th><th class="r">${amount(expected)}<br>${Math.round(expected * rate).toLocaleString('fr-FR')} FC</th></tr>
      <tr><td>Montant compté USD</td><td class="r">${amount(countedUsd)}</td></tr>
      <tr><td>Montant compté FC</td><td class="r">${number(countedFc)} FC</td></tr>
      <tr class="classic-total"><th>Écart</th><th class="r">${difference > 0 ? '+' : ''}${amount(difference)}<br>${difference > 0 ? '+' : ''}${Math.round(difference * rate).toLocaleString('fr-FR')} FC</th></tr>
      </tbody></table><p>Montants convertis au taux appliqué de 1 $ = ${number(rate)} FC${rateDate ? ` · mis à jour le ${fr(rateDate)}` : ''}.</p>
      ${closure?.note ? `<p>Note : ${esc(closure.note)}</p>` : ''}<footer>Clôture de caisse · KaPya Digital</footer></article>`;
    window.print();
  }

  async function load() {
    const day = dayInput.value || today;
    content.innerHTML = '<div class="card empty">Chargement du résumé…</div>';
    try {
      const [data, orgRows] = await Promise.all([
        db.rpc('cash_close_summary', { p_day: day }),
        db.select('organizations', 'select=name,address,phone,email,tax_id,rc').catch(() => [])
      ]);
      const org = orgRows[0] || {};
      if (!data || !Number(data.exchange_rate)) throw new Error('Le taux du jour est absent. Renseignez-le dans Paramètres.');
      const closure = data.closure;
      const displayData = closure?.summary ? { ...data, ...closure.summary } : data;
      const previous = data.previous_close;
      const hasNewMovements = hasNewCashMovements(data, closure?.summary);
      const closureRateDate = closure?.summary?.rate_date || null;
      const rateNotice = closure
        ? (!closureRateDate ? '<div class="cash-rate-notice">La date du taux appliqué n’a pas été conservée dans cette ancienne clôture.</div>' : '')
        : day === today && data.rate_date !== day
          ? `<div class="cash-rate-notice">Le taux actif date du ${data.rate_date ? fr(data.rate_date) : 'jour non précisé'}. Mettez-le à jour dans Paramètres avant de clôturer si nécessaire.</div>`
          : day !== today
            ? `<div class="cash-rate-notice">Cette journée n’a pas de clôture enregistrée. La conversion utilise le taux actuellement configuré${data.rate_date ? `, mis à jour le ${fr(data.rate_date)}` : ''}.</div>`
            : '';
      const openUsd = closure ? closure.opening_usd : (previous?.counted_usd || 0);
      const openFc = closure ? closure.opening_fc : (previous?.counted_fc || 0);
      const isClosed = !!closure;
      const expected = closure?.expected_usd ?? (Number(openUsd) + Number(openFc) / Number(data.exchange_rate) + Number(data.cash_in || 0) - Number(data.cash_out || 0));
      const displayClosedBy = closure?.closed_by_name ? ` par ${esc(closure.closed_by_name)}` : '';
      const canEdit = canClose && day === today && (!isClosed || canCorrect);
      content.innerHTML = `<section class="cash-summary-grid">
        <article class="card cash-flow-card"><span>Entrées de caisse</span><b>${dual(displayData.cash_in, data.exchange_rate)}</b><small>Comptant ${amount(displayData.cash_sales)} · Crédits ${amount(displayData.credit_payments)} · Dépôts ${amount(displayData.customer_deposits)}</small></article>
        <article class="card cash-flow-card cash-out-card"><span>Sorties enregistrées</span><b>${dual(displayData.cash_out, data.exchange_rate)}</b><small>Fournisseurs ${amount(displayData.supplier_payments)} · Dépenses ${amount(displayData.expenses)}</small></article>
        <article class="card cash-flow-card cash-expected-card"><span>Montant attendu</span><b>${dual(expected, closure?.exchange_rate || data.exchange_rate)}</b><small>Taux : 1 $ = ${number(closure?.exchange_rate || data.exchange_rate)} FC</small></article>
      </section>
      ${rateNotice}
      ${isClosed ? `<div class="cash-closed-banner">${ico('check')} <span>Journée clôturée${displayClosedBy} · ${new Date(closure.closed_at).toLocaleString('fr-FR')}</span></div>${hasNewMovements ? '<div class="cash-changed-banner">De nouveaux mouvements ont été enregistrés après cette clôture. Le gérant ou le responsable doit la recalculer.</div>' : ''}` : '<div class="cash-open-banner">Journée non clôturée</div>'}
      <section class="card cash-close-card"><div class="sec-head"><div><h2>${isClosed ? 'Détail de la clôture' : 'Compter la caisse'}</h2><p class="muted">Saisissez les billets et pièces en USD et en francs congolais.</p></div><span class="cash-rate">1 $ = ${number(data.exchange_rate)} FC</span></div>
        ${canEdit ? `<form id="cash-form" class="cash-form">
          <div class="cash-form-row"><div><label for="cash-open-usd">Fonds initial en USD</label><input id="cash-open-usd" name="opening_usd" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(openUsd)}" required></div><div><label for="cash-open-fc">Fonds initial en FC</label><input id="cash-open-fc" name="opening_fc" type="number" min="0" step="1" inputmode="decimal" value="${esc(openFc)}" required></div></div>
          <div class="cash-form-row"><div><label for="cash-count-usd">Montant compté en USD</label><input id="cash-count-usd" name="counted_usd" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(closure?.counted_usd ?? '')}" placeholder="0,00" required></div><div><label for="cash-count-fc">Montant compté en FC</label><input id="cash-count-fc" name="counted_fc" type="number" min="0" step="1" inputmode="decimal" value="${esc(closure?.counted_fc ?? '')}" placeholder="0" required></div></div>
          <label for="cash-note">Note sur l’écart ou la journée <span class="muted">(facultatif)</span></label><textarea id="cash-note" name="note" maxlength="500" rows="3" placeholder="Ex. différence vérifiée, dépense non encore enregistrée…">${esc(closure?.note || '')}</textarea>
          <div class="cash-live-total" id="cash-live-total" aria-live="polite"></div><p class="err" id="cash-error" role="alert"></p>
          <div class="acts cash-actions"><label class="cash-print-format">Mise en page<select id="cash-print-format"><option value="85">Ticket 85 mm</option><option value="55">Ticket 55 mm</option><option value="a4">A4</option></select></label><button class="ghost" type="button" id="cash-print">Imprimer</button><button class="btn" type="submit">${isClosed ? 'Enregistrer la correction' : 'Clôturer la journée'}</button></div><p class="cash-print-hint">Dans la fenêtre d’impression, choisissez aussi le format de papier correspondant à votre imprimante.</p>
        </form>` : isClosed ? `<div class="cash-readonly"><p><b>Montant compté :</b> ${dual(closure.counted_total_usd, closure.exchange_rate)} · Écart : <b>${closure.difference_usd > 0 ? '+' : ''}${amount(closure.difference_usd)}</b></p><p>${esc(closure.note || 'Aucune note ajoutée.')}</p><label class="cash-print-format">Mise en page<select id="cash-print-format"><option value="85">Ticket 85 mm</option><option value="55">Ticket 55 mm</option><option value="a4">A4</option></select></label><button class="ghost" type="button" id="cash-print">Imprimer la clôture</button><p class="cash-print-hint">Dans la fenêtre d’impression, choisissez aussi le format de papier correspondant à votre imprimante.</p></div>` : `<p class="muted">${day === today ? 'La saisie est réservée au gérant, au responsable et au facturier.' : 'La clôture peut être enregistrée uniquement pour la journée en cours.'} Aucune clôture n’est disponible à cette date.</p>`}
      </section>
      ${previous ? `<p class="cash-previous-hint">Fonds initial proposé depuis la dernière clôture (${fr(previous.business_date)}). Vous pouvez le corriger.</p>` : `<p class="cash-previous-hint">Aucune clôture précédente trouvée : vérifiez les fonds initiaux avant de compter.</p>`}`;
      const form = content.querySelector('#cash-form');
      const compute = () => {
        const f = new FormData(form);
        const rate = Number(data.exchange_rate);
        const opening = Number(f.get('opening_usd') || 0) + Number(f.get('opening_fc') || 0) / rate;
        const counted = Number(f.get('counted_usd') || 0) + Number(f.get('counted_fc') || 0) / rate;
        const expectedNow = opening + Number(data.cash_in || 0) - Number(data.cash_out || 0);
        const delta = counted - expectedNow;
        const expectedCard = content.querySelector('.cash-expected-card b');
        if (expectedCard) expectedCard.innerHTML = dual(expectedNow, rate);
        content.querySelector('#cash-live-total').innerHTML = `<span>Attendu : <b>${dual(expectedNow, rate)}</b></span><span>Compté : <b>${dual(counted, rate)}</b></span><span class="${delta < -.005 ? 'negative' : delta > .005 ? 'positive' : ''}">Écart : <b>${delta > 0.005 ? '+' : ''}${dual(delta, rate)}</b></span>`;
      };
      if (form) {
        form.querySelectorAll('input').forEach(input => input.addEventListener('input', compute));
        compute();
        form.onsubmit = async event => {
          event.preventDefault();
          const button = form.querySelector('[type=submit]');
          button.disabled = true;
          content.querySelector('#cash-error').textContent = '';
          try {
            const f = new FormData(form);
            await db.rpc('save_cash_closure', {
              p_day: day,
              p_opening_usd: Number(f.get('opening_usd') || 0),
              p_opening_fc: Number(f.get('opening_fc') || 0),
              p_counted_usd: Number(f.get('counted_usd') || 0),
              p_counted_fc: Number(f.get('counted_fc') || 0),
              p_note: String(f.get('note') || '').trim()
            });
            await load();
          } catch (error) {
            content.querySelector('#cash-error').textContent = error.message || 'La clôture n’a pas pu être enregistrée.';
            button.disabled = false;
          }
        };
      }
      content.querySelector('#cash-print')?.addEventListener('click', () => printClosure(day, displayData, closure, form ? new FormData(form) : null, content.querySelector('#cash-print-format')?.value || '85', org));
    } catch (error) {
      const hint = error.offline ? 'La clôture nécessite une connexion à Supabase ; reconnectez-vous puis réessayez.' : 'Vérifiez que le script « cloture-caisse.sql » a été exécuté dans Supabase et que vous êtes connecté à Internet.';
      content.innerHTML = `<div class="card"><p class="err">Impossible de charger la clôture : ${esc(error.message)}.</p><p class="muted">${hint}</p></div>`;
    }
  }

  dayInput.addEventListener('change', load);
  await load();
}
