// Personnel : payer un travailleur et suivre les paiements du mois. Réservé au gérant. N'affecte pas la caisse.
import { db, session } from '../api.js';
import { esc, notify, usdOnly, ico, fmtDate } from '../ui.js';
import { can } from '../roles.js';

const METHOD = { cash: 'Espèces', mobile_money: 'Mobile money', bank: 'Banque' };
const PAY = { fixed: 'Salaire fixe (par mois)', daily: 'Par jour ou par tâche' };
const today = () => new Date().toLocaleDateString('sv-SE');
const thisMonth = () => today().slice(0, 7);
const fr = d => fmtDate(d);
const options = (map, selected) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${l}</option>`).join('');

export async function render(main, ctx) {
  if (!can(ctx?.role, 'workers.view')) { main.innerHTML = '<p class="card muted">Cette page est réservée au gérant.</p>'; return; }
  const $ = s => main.querySelector(s);
  let workers = [], payments = [], org = null;

  main.innerHTML = `<div class="page-head"><div><h1>Personnel et paiements</h1><p class="sub">Notez ici ce que vous payez à vos travailleurs. Ce registre n’affecte pas la caisse.</p></div></div>

    <section class="card facture" aria-labelledby="pay-title">
      <h2 class="sec" id="pay-title">1. Payer un travailleur</h2>
      <p class="muted">Choisissez la personne : le montant habituel s’affiche tout seul. Corrigez-le si besoin, puis enregistrez.</p>
      <div class="grid2">
        <div><label for="p-worker">Qui payez-vous ?</label><select id="p-worker"></select></div>
        <div><label for="p-amount">Combien (USD) ?</label><input id="p-amount" type="number" min="0" step="any" inputmode="decimal"></div>
        <div><label for="p-date">Date du paiement</label><input id="p-date" type="date"></div>
        <div><label for="p-method">Comment ?</label><select id="p-method">${options(METHOD, 'cash')}</select></div>
      </div>
      <label>Note (facultatif)<input id="p-note" maxlength="300" placeholder="Ex. salaire de octobre"></label>
      <div class="acts end"><button class="btn" id="p-save" type="button">${ico('check')}<span>Enregistrer le paiement</span></button></div>
      <p class="err" id="p-err" role="alert"></p>
    </section>

    <section class="card" aria-labelledby="month-title">
      <div class="sec-head"><h2 class="sec" id="month-title">2. Paiements du mois</h2>
        <label class="sr" for="p-month">Choisir le mois</label><input id="p-month" type="month"></div>
      <div class="sumbox"><div class="srow big"><span>Total payé ce mois</span><span id="m-total">0,00 $</span></div><p class="muted" id="m-count"></p></div>
      <div class="tw" id="p-list"></div>
    </section>

    <section class="card" aria-labelledby="stmt-title">
      <h2 class="sec" id="stmt-title">Relevé d’une personne</h2>
      <p class="muted">Le détail de ce qu’une personne a reçu pour le mois. Vous pouvez l’imprimer ou l’envoyer par WhatsApp.</p>
      <div class="grid2">
        <div><label for="s-worker">Personne</label><select id="s-worker"></select></div>
        <div><label for="s-month">Mois</label><input id="s-month" type="month"></div>
      </div>
      <div class="acts end"><button class="ghost" id="s-show" type="button">Voir le relevé</button><button class="ghost" id="s-all" type="button">Relevé de tout le personnel</button></div>
      <div id="s-box"></div>
    </section>

    <details class="card">
      <summary><b>3. Ajouter une nouvelle personne</b></summary>
      <div class="grid2" style="margin-top:.75rem">
        <div><label for="w-name">Nom complet</label><input id="w-name" maxlength="120" placeholder="Ex. Jean Mukendi"></div>
        <div><label for="w-role">Son travail</label><input id="w-role" maxlength="80" placeholder="Ex. vendeur, gardien"></div>
        <div><label for="w-kind">Comment est-il payé ?</label><select id="w-kind">${options(PAY, 'fixed')}</select></div>
        <div><label for="w-usual">Montant habituel (USD)</label><input id="w-usual" type="number" min="0" step="any" value="0"></div>
      </div>
      <div class="acts end"><button class="btn" id="w-add" type="button">${ico('plus')}<span>Ajouter cette personne</span></button></div>
      <p class="err" id="w-err" role="alert"></p>
      <h3 class="sec" style="margin-top:1rem">Vos travailleurs</h3>
      <div id="w-list" class="tw"></div>
    </details>`;

  function drawWorkers() {
    $('#p-worker').innerHTML = workers.filter(w => w.active).map(w => `<option value="${esc(w.id)}">${esc(w.name)}${w.usual_amount ? ` (habituel : ${usdOnly(w.usual_amount)})` : ''}</option>`).join('')
      || '<option value="">Ajoutez d’abord une personne (section 3)</option>';
    $('#s-worker').innerHTML = $('#p-worker').innerHTML;
    const chosen = workers.find(w => w.id === $('#p-worker').value);
    if (chosen && !$('#p-amount').value) $('#p-amount').value = chosen.usual_amount || '';
    $('#w-list').innerHTML = workers.length ? `<table><thead><tr><th>Nom</th><th>Travail</th><th>Payé</th><th class="r money">Habituel</th></tr></thead><tbody>${workers.map(w => `<tr><td>${esc(w.name)}</td><td>${esc(w.role_label || '—')}</td><td>${PAY[w.pay_kind] || '—'}</td><td class="r">${usdOnly(w.usual_amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Pas encore de personne enregistrée.</p>';
    // Colonne d'action : retirer une personne qui ne travaille plus pour l'entreprise
    const tableau = $('#w-list table');
    if (tableau) {
      tableau.querySelector('thead tr').appendChild(Object.assign(document.createElement('th'), { className: 'r' }));
      [...tableau.querySelectorAll('tbody tr')].forEach((tr, i) => {
        const w = workers[i]; if (!w) return;
        const td = document.createElement('td');
        td.className = 'r';
        td.innerHTML = w.active ? `<button class="ghost" type="button" data-retirer="${esc(w.id)}">Retirer</button>` : '<span class="muted">Retiré</span>';
        tr.appendChild(td);
      });
    }
  }

  function drawMonth() {
    const month = $('#p-month').value || thisMonth();
    const rows = payments.filter(p => (p.paid_on || '').startsWith(month));
    $('#m-total').textContent = usdOnly(rows.reduce((s, p) => s + Number(p.amount || 0), 0));
    $('#m-count').textContent = rows.length ? `${rows.length} paiement(s) pour ce mois.` : 'Aucun paiement pour ce mois.';
    $('#p-list').innerHTML = rows.length ? `<table><thead><tr><th>Date</th><th>Personne</th><th class="r money">Montant</th><th>Mode</th><th>Note</th></tr></thead><tbody>${rows.map(p => `<tr><td>${fr(p.paid_on)}</td><td>${esc(p.workers?.name || '—')}</td><td class="r">${usdOnly(p.amount)}</td><td>${METHOD[p.method] || esc(p.method)}</td><td>${esc(p.note || '')}</td></tr>`).join('')}</tbody></table>` : '';
  }

  async function load() {
    [workers, payments] = await Promise.all([
      db.select('workers', 'select=id,name,role_label,pay_kind,usual_amount,active&order=name').catch(() => []),
      db.select('worker_payments', 'select=id,worker_id,paid_on,amount,method,note,workers(name)&order=paid_on.desc,created_at.desc&limit=500').catch(() => [])
    ]);
    const profile = await db.select('profiles', `select=org_id&id=eq.${session().uid}`).catch(() => []);
    [org] = await db.select('organizations', `select=name,address,phone&id=eq.${profile[0]?.org_id}`).catch(() => []);
    drawWorkers(); drawMonth();
  }

  $('#p-worker').addEventListener('change', () => {
    const w = workers.find(x => x.id === $('#p-worker').value);
    if (w) $('#p-amount').value = w.usual_amount || '';
  });
  $('#p-month').addEventListener('change', drawMonth);

  // Retirer une personne : supprimée si elle n'a jamais été payée, sinon retirée de la liste (l'historique est gardé)
  $('#w-list').addEventListener('click', async e => {
    const btn = e.target.closest('[data-retirer]');
    if (!btn) return;
    const w = workers.find(x => x.id === btn.dataset.retirer);
    if (!w) return;
    if (!window.confirm(`Retirer ${w.name} de la liste du personnel ?\n\nSi cette personne a déjà été payée, son historique de paiements est conservé.`)) return;
    btn.disabled = true;
    try {
      const res = await db.rpc('delete_worker', { p_worker: w.id });
      notify(res === 'deleted' ? `${w.name} a été supprimé(e) du personnel.` : `${w.name} a été retiré(e) du personnel. Son historique de paiements est conservé.`, 'Personnel');
      await load();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'Suppression impossible.', 'Personnel');
    }
  });

  $('#p-save').onclick = async () => {
    const err = $('#p-err'); err.textContent = '';
    const worker = $('#p-worker').value, amount = Number($('#p-amount').value);
    if (!worker) return (err.textContent = 'Ajoutez d’abord une personne dans la section 3.');
    if (!(amount > 0)) return (err.textContent = 'Indiquez un montant supérieur à 0.');
    try {
      await db.rpc('record_worker_payment', { p_worker: worker, p_amount: amount, p_date: $('#p-date').value || null, p_method: $('#p-method').value, p_note: $('#p-note').value.trim() || null });
      $('#p-amount').value = ''; $('#p-note').value = '';
      notify('Paiement enregistré.', 'Personnel'); load();
    } catch (e) { err.textContent = e.message || 'Enregistrement impossible.'; }
  };

  $('#w-add').onclick = async () => {
    const err = $('#w-err'); err.textContent = '';
    const name = $('#w-name').value.trim(), usual = Number($('#w-usual').value) || 0;
    if (!name) return (err.textContent = 'Écrivez le nom de la personne.');
    if (usual < 0) return (err.textContent = 'Le montant ne peut pas être négatif.');
    try {
      await db.rpc('create_worker', { p_name: name, p_role: $('#w-role').value.trim() || null, p_kind: $('#w-kind').value, p_usual: usual });
      $('#w-name').value = ''; $('#w-role').value = ''; $('#w-usual').value = 0;
      notify('Personne ajoutée.', 'Personnel'); load();
    } catch (e) { err.textContent = e.message || 'Ajout impossible.'; }
  };

  const monthLabel = m => new Date(m + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const monthRows = (w, month) => payments.filter(p => p.worker_id === w.id && (p.paid_on || '').startsWith(month));
  const monthTotal = rows => rows.reduce((t, p) => t + Number(p.amount || 0), 0);

  function balanceHtml(w, rows) {
    const total = monthTotal(rows), usual = Number(w.usual_amount || 0);
    const fixed = w.pay_kind === 'fixed' && usual > 0;
    return `<div class="sumbox">${fixed
      ? `<div class="srow"><span>Salaire du mois</span><span>${usdOnly(usual)}</span></div><div class="srow"><span>Déjà reçu</span><span>${usdOnly(total)}</span></div><div class="srow big"><span>Reste à payer</span><span>${usdOnly(Math.max(0, usual - total))}</span></div>`
      : `<div class="srow big"><span>Total reçu ce mois</span><span>${usdOnly(total)}</span></div>`}</div>`;
  }

  function statementHtml(w, month) {
    const rows = monthRows(w, month);
    const head = org ? `<p><b>${esc(org.name)}</b>${org.address ? ' · ' + esc(org.address) : ''}${org.phone ? ' · ' + esc(org.phone) : ''}</p>` : '';
    return `${head}<h3>Relevé de paiement : ${esc(w.name)}</h3>
      <p class="muted">${esc(w.role_label || '')} · ${esc(monthLabel(month))} · établi le ${fr(today())}</p>
      ${rows.length ? `<table><thead><tr><th>Date</th><th>Mode</th><th class="r money">Montant</th></tr></thead><tbody>${rows.map(p => `<tr><td>${fr(p.paid_on)}</td><td>${METHOD[p.method] || esc(p.method)}</td><td class="r">${usdOnly(p.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun paiement pour ce mois.</p>'}
      ${balanceHtml(w, rows)}`;
  }

  function statementText(w, month) {
    const rows = monthRows(w, month);
    const due = w.pay_kind === 'fixed' && Number(w.usual_amount) > 0 ? [`Reste à payer : ${usdOnly(Math.max(0, Number(w.usual_amount) - monthTotal(rows)))}`] : [];
    return [org?.name || '', `Relevé de paiement : ${w.name}`, monthLabel(month),
      ...rows.map(p => `${fr(p.paid_on)} : ${usdOnly(p.amount)} (${METHOD[p.method] || p.method})`),
      ...due, `Total reçu : ${usdOnly(monthTotal(rows))}`].join('\n');
  }

  function printStatement(html) {
    const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
    area.innerHTML = `<div class="report-print">${html}</div>`;
    window.print();
  }

  async function shareText(text) {
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) { /* partage annulé */ } return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  $('#s-show').onclick = () => {
    const w = workers.find(x => x.id === $('#s-worker').value);
    if (!w) { $('#s-box').innerHTML = '<p class="err">Ajoutez d’abord une personne dans la section 3.</p>'; return; }
    const month = $('#s-month').value || thisMonth();
    $('#s-box').innerHTML = `<div class="card">${statementHtml(w, month)}<div class="acts end"><button class="ghost" id="s-share" type="button">Partager</button><button class="btn" id="s-print" type="button">Imprimer</button></div></div>`;
    $('#s-print').onclick = () => printStatement(statementHtml(w, month));
    $('#s-share').onclick = () => shareText(statementText(w, month));
  };

  function allStatementHtml(month) {
    const head = org ? `<p><b>${esc(org.name)}</b>${org.address ? ' · ' + esc(org.address) : ''}${org.phone ? ' · ' + esc(org.phone) : ''}</p>` : '';
    const list = workers.filter(w => w.active).map(w => {
      const total = monthTotal(monthRows(w, month)), usual = Number(w.usual_amount || 0);
      const fixed = w.pay_kind === 'fixed' && usual > 0;
      return { w, total, usual, fixed, due: fixed ? Math.max(0, usual - total) : null };
    });
    const sum = list.reduce((t, r) => t + r.total, 0);
    return `${head}<h3>Relevé du personnel : ${esc(monthLabel(month))}</h3>
      <p class="muted">Établi le ${fr(today())}</p>
      ${list.length ? `<table><thead><tr><th>Personne</th><th class="r money">Salaire</th><th class="r money">Reçu</th><th class="r money">Reste</th></tr></thead><tbody>${list.map(r => `<tr><td>${esc(r.w.name)}</td><td class="r">${r.fixed ? usdOnly(r.usual) : '—'}</td><td class="r">${usdOnly(r.total)}</td><td class="r">${r.fixed ? usdOnly(r.due) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun travailleur enregistré.</p>'}
      <div class="sumbox"><div class="srow big"><span>Total reçu par le personnel</span><span>${usdOnly(sum)}</span></div></div>`;
  }

  function allText(month) {
    const lines = workers.filter(w => w.active).map(w => {
      const total = monthTotal(monthRows(w, month)), usual = Number(w.usual_amount || 0);
      const fixed = w.pay_kind === 'fixed' && usual > 0;
      return `${w.name} : reçu ${usdOnly(total)}${fixed ? `, reste ${usdOnly(Math.max(0, usual - total))}` : ''}`;
    });
    return [org?.name || '', `Relevé du personnel : ${monthLabel(month)}`, ...lines].join('\n');
  }

  $('#s-all').onclick = () => {
    const month = $('#s-month').value || thisMonth();
    $('#s-box').innerHTML = `<div class="card">${allStatementHtml(month)}<div class="acts end"><button class="ghost" id="s-all-share" type="button">Partager</button><button class="btn" id="s-all-print" type="button">Imprimer</button></div></div>`;
    $('#s-all-print').onclick = () => printStatement(allStatementHtml(month));
    $('#s-all-share').onclick = () => shareText(allText(month));
  };

  $('#s-month').value = thisMonth();
  $('#p-date').value = today();
  $('#p-month').value = thisMonth();
  load();
}
