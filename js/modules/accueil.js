import { db } from '../api.js';
import { esc, n, money, usdOnly, fcOnly, ico, openDialog, fld } from '../ui.js';
import { can } from '../roles.js';

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

export async function render(main, ctx) {
  const today = isoDate(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const canSeeCosts = ctx?.role === 'admin';
  const canRecordCashOut = ctx?.role === 'admin';
  const canSeeDailyCreditSummary = ['admin', 'manager'].includes(ctx?.role);

  // Les facturiers (équipe de vente/caisse) ne voient qu'un résumé journalier opérationnel.
  if (ctx?.role === 'facturier') {
    main.innerHTML = `<div class="page-head owner-head"><div><h1>Activité du jour</h1><p class="sub">Ventes à crédit et paiements de crédits reçus.</p></div><label class="owner-filters"><span>Date</span><input type="date" id="staff-day" value="${today}"></label></div><div id="staff-day-content" aria-live="polite"><div class="card empty">Chargement…</div></div>`;
    const dayInput = main.querySelector('#staff-day');
    const content = main.querySelector('#staff-day-content');
    const loadDay = async () => {
      const day = dayInput.value || today;
      const nextDay = shiftDate(day, 1);
      content.innerHTML = '<div class="card empty">Chargement…</div>';
      try {
        const [sales, receipts] = await Promise.all([
          db.select('sales', `select=id,number,sold_at,payment,sale_lines(qty,unit_price)&payment=eq.credit&sold_at=gte.${day}&sold_at=lt.${nextDay}&order=sold_at.desc`),
          db.select('sale_payments', `select=id,amount,paid_at,kind&paid_at=eq.${day}&kind=in.(initial,payment)&order=paid_at.desc`)
        ]);
        const creditTotal = sales.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0);
        const receiptTotal = receipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
        content.innerHTML = `<div class="owner-period-label">Résumé du ${fr(day)}</div><section class="kpis owner-kpis">${metric('Ventes à crédit', usdOnly(creditTotal), `${sales.length} facture(s) créée(s)`, 'sales', 't-blue')}${metric('Paiements de crédits reçus', usdOnly(receiptTotal), `${receipts.length} versement(s) encaissé(s)`, 'coins', 't-green')}</section>`;
      } catch (error) {
        content.innerHTML = `<div class="card"><p class="err">Impossible de charger le résumé : ${esc(error.message)}</p></div>`;
      }
    };
    dayInput.addEventListener('change', loadDay);
    await loadDay();
    return;
  }

  main.innerHTML = `<div class="page-head owner-head"><div><h1>Tableau de bord</h1><p class="sub">Vue de la performance et des mouvements de votre activité.</p></div>
    <div class="owner-filters"><label><span>Période</span><select id="owner-period"><option value="today">Aujourd’hui</option><option value="7">7 derniers jours</option><option value="month" selected>Ce mois</option><option value="custom">Période personnalisée</option></select></label>
      <label class="owner-date" hidden><span>Du</span><input type="date" id="owner-from" value="${monthStart}"></label>
      <label class="owner-date" hidden><span>Au</span><input type="date" id="owner-to" value="${today}"></label>
      <button class="btn" id="owner-run" type="button" hidden>Afficher</button>
      ${canRecordCashOut ? '<button class="ghost" id="owner-expense" type="button">+ Dépense</button><button class="ghost" id="owner-init-supplier" type="button">Solde anciennes factures</button><button class="btn" id="owner-supplier-payment" type="button">+ Paiement fournisseur</button>' : ''}
    </div></div>
    <div id="owner-content" aria-live="polite"><div class="card empty">Chargement des données…</div></div><dialog id="owner-dialog"></dialog>`;
  const $ = selector => main.querySelector(selector);

  function setRangeControls() {
    const custom = $('#owner-period').value === 'custom';
    main.querySelectorAll('.owner-date').forEach(element => { element.hidden = !custom; });
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

  async function refresh() {
    const mode = $('#owner-period').value;
    const to = mode === 'custom' ? ($('#owner-to').value || today) : today;
    const from = mode === 'custom' ? ($('#owner-from').value || monthStart) : mode === 'today' ? today : mode === '7' ? shiftDate(today, -6) : monthStart;
    if (from > to) { $('#owner-content').innerHTML = '<p class="notice">La date de début doit être antérieure à la date de fin.</p>'; return; }
    $('#owner-content').innerHTML = '<div class="card empty">Chargement des données…</div>';
    const nextDay = shiftDate(to, 1);
    const startInstant = new Date(`${from}T00:00:00`).toISOString();
    const endInstant = new Date(`${nextDay}T00:00:00`).toISOString();
    const salesSelect = 'select=id,number,sold_at,payment,paid,customers(name),sale_lines(id,qty,unit_price,articles(sku,name,unit))';
    // Read cost snapshots separately: PostgREST may not expose the new FK in its schema cache yet.
    const saleCostsPromise = canSeeCosts
      ? db.select('sale_cost_snapshots', 'select=sale_line_id,unit_cost_at_sale,cost_is_estimated')
      : Promise.resolve([]);
    const purchasesPromise = canSeeCosts
      ? db.select('purchases', `select=id,number,bought_at,purchase_lines(qty,unit_cost)&bought_at=gte.${from}&bought_at=lte.${to}&order=bought_at.asc`)
      : Promise.resolve([]);
    const supplierBalancesPromise = canSeeCosts ? db.select('purchase_payment_balances', 'select=purchase_id,opening_balance') : Promise.resolve([]);
    const supplierPaymentsAllPromise = canSeeCosts ? db.select('purchase_payments', 'select=purchase_id,amount') : Promise.resolve([]);
    const salesPromise = db.select('sales', `${salesSelect}&sold_at=gte.${from}&sold_at=lte.${to}&order=sold_at.asc`);
    const creditsPromise = db.select('sales', `${salesSelect}&payment=eq.credit&order=sold_at.desc`);
    const movesPromise = db.select('stock_moves', `select=id,qty,reason,created_at,articles(sku,name,unit)&created_at=gte.${encodeURIComponent(startInstant)}&created_at=lt.${encodeURIComponent(endInstant)}&order=created_at.desc`);
    const supplierPaymentsPromise = canSeeCosts ? db.select('purchase_payments', `select=id,amount,paid_at,purchases(number,suppliers(name))&paid_at=gte.${from}&paid_at=lte.${to}&order=paid_at.asc`) : Promise.resolve([]);
    const expensesPromise = canSeeCosts ? db.select('business_expenses', `select=id,label,category,amount,paid_at&paid_at=gte.${from}&paid_at=lte.${to}&order=paid_at.asc`) : Promise.resolve([]);
    const customerPaymentsPromise = canSeeCosts ? db.select('sale_payments', `select=id,sale_id,amount,paid_at,kind&paid_at=gte.${from}&paid_at=lte.${to}&kind=in.(initial,payment,advance)&order=paid_at.asc`) : Promise.resolve([]);
    const customerDepositsPromise = canSeeCosts ? db.select('customer_deposits', `select=id,amount,received_at&received_at=gte.${from}&received_at=lte.${to}`) : Promise.resolve([]);
    const ownerDailySalesPromise = canSeeDailyCreditSummary ? db.select('sales', `select=id,sale_lines(qty,unit_price)&payment=eq.credit&sold_at=gte.${today}&sold_at=lt.${shiftDate(today, 1)}`) : Promise.resolve([]);
    const ownerDailyReceiptsPromise = canSeeDailyCreditSummary ? db.select('sale_payments', `select=id,amount,paid_at&paid_at=eq.${today}&kind=in.(initial,payment)`) : Promise.resolve([]);
    const articlesPromise = db.select('articles', `select=id,sku,name,unit,stock,min_stock${canSeeCosts ? ',price_buy' : ''}&order=name`);
    try {
      const coreResults = await Promise.allSettled([salesPromise, purchasesPromise, creditsPromise, movesPromise, articlesPromise, supplierPaymentsPromise, expensesPromise, customerPaymentsPromise, customerDepositsPromise, saleCostsPromise, supplierBalancesPromise, supplierPaymentsAllPromise, ownerDailySalesPromise, ownerDailyReceiptsPromise]);
      const [salesRows, purchaseRows, credits, moveRows, articles, supplierPayments, expenses, customerPayments, customerDeposits] = coreResults.slice(0, 9).map(result => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      });
      const saleCostResult = coreResults[9];
      const saleCostsAvailable = !canSeeCosts || saleCostResult.status === 'fulfilled';
      const saleCostRows = saleCostResult.status === 'fulfilled' ? saleCostResult.value : [];
      const saleCostsByLine = new Map(saleCostRows.map(snapshot => [snapshot.sale_line_id, snapshot]));
      const supplierBalances = coreResults[10].status === 'fulfilled' ? coreResults[10].value : [];
      const supplierPaymentsAll = coreResults[11].status === 'fulfilled' ? coreResults[11].value : [];
      const supplierBalancesAvailable = !canSeeCosts || (coreResults[10].status === 'fulfilled' && coreResults[11].status === 'fulfilled');
      const ownerDailySales = coreResults[12].status === 'fulfilled' ? coreResults[12].value : [];
      const ownerDailyReceipts = coreResults[13].status === 'fulfilled' ? coreResults[13].value : [];
      const ownerDailyAvailable = !canSeeDailyCreditSummary || (coreResults[12].status === 'fulfilled' && coreResults[13].status === 'fulfilled');
      const sales = salesRows.filter(sale => sale.sold_at >= from && sale.sold_at <= to);
      const purchases = purchaseRows.filter(purchase => purchase.bought_at >= from && purchase.bought_at <= to);
      const moves = moveRows.filter(move => move.created_at?.slice(0, 10) >= from && move.created_at?.slice(0, 10) <= to);
      const revenue = sales.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0);
      const salesCost = canSeeCosts && saleCostsAvailable ? sales.reduce((sum, sale) => sum + (sale.sale_lines || []).reduce((part, line) => {
        const snapshot = saleCostsByLine.get(line.id);
        return part + Number(line.qty || 0) * Number(snapshot?.unit_cost_at_sale ?? 0);
      }, 0), 0) : 0;
      const estimatedCostLines = canSeeCosts && saleCostsAvailable ? sales.flatMap(sale => sale.sale_lines || []).filter(line => saleCostsByLine.get(line.id)?.cost_is_estimated).length : 0;
      const gross = revenue - salesCost;
      const currentStockValue = canSeeCosts ? articles.reduce((sum, article) => sum + Number(article.stock || 0) * Number(article.price_buy || 0), 0) : 0;
      const purchaseValue = purchases.reduce((sum, purchase) => sum + sumLines(purchase.purchase_lines, 'unit_cost'), 0);
      const dailyCreditValue = ownerDailySales.reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0);
      const dailyReceiptValue = ownerDailyReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
      const advanceAppliedToCashSales = customerPayments.filter(payment => payment.kind === 'advance' && sales.some(sale => sale.id === payment.sale_id && sale.payment !== 'credit')).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const received = canSeeCosts ? sales.filter(sale => sale.payment !== 'credit').reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0) - advanceAppliedToCashSales + customerPayments.filter(payment => payment.kind !== 'advance').reduce((sum, payment) => sum + Number(payment.amount || 0), 0) + customerDeposits.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0) : 0;
      const supplierPaid = supplierPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const paidByPurchase = new Map();
      supplierPaymentsAll.forEach(payment => paidByPurchase.set(payment.purchase_id, (paidByPurchase.get(payment.purchase_id) || 0) + Number(payment.amount || 0)));
      const supplierDebt = supplierBalances.reduce((sum, balance) => sum + Math.max(Number(balance.opening_balance || 0) - (paidByPurchase.get(balance.purchase_id) || 0), 0), 0);
      const cashOut = supplierPaid + expenseTotal;
      const cashNet = received - cashOut;
      const outstanding = credits.reduce((sum, sale) => sum + Math.max(sumLines(sale.sale_lines, 'unit_price') - Number(sale.paid || 0), 0), 0);
      const lowStock = articles.filter(article => Number(article.stock) <= Number(article.min_stock));
      const movementIn = moves.filter(move => Number(move.qty) > 0);
      const movementOut = moves.filter(move => Number(move.qty) < 0);
      const salesBuckets = bucketData(from, to, sales, sale => sale.sold_at, sale => sumLines(sale.sale_lines, 'unit_price'));
      const purchaseBuckets = bucketData(from, to, purchases, purchase => purchase.bought_at, purchase => sumLines(purchase.purchase_lines, 'unit_cost'));
      const inflowBuckets = bucketData(from, to, movementIn, move => move.created_at, () => 1);
      const outflowBuckets = bucketData(from, to, movementOut, move => move.created_at, () => 1);
      const dateLabel = from === to ? fr(from) : `${fr(from)} – ${fr(to)}`;
      const salesSub = `${sales.length} vente(s) · ${fcOnly(revenue)}`;
      const profitDetail = !saleCostsAvailable ? 'Configuration SQL des coûts manquante' : salesCost > 0 ? `Marge brute · ${revenue ? (gross / revenue * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '0'} %` : 'Aucun coût de vente enregistré sur cette période';
      const costHint = canSeeCosts ? `<p class="owner-note">${!saleCostsAvailable ? 'Le calcul du bénéfice sera disponible après installation du script SQL « couts-et-tresorerie.sql » dans Supabase.' : `Le coût est figé au moment de la vente. ${estimatedCostLines ? `${estimatedCostLines} ligne(s) ancienne(s) utilisent une estimation basée sur le prix d’achat actuel.` : 'Les coûts des ventes affichées sont enregistrés au moment de la vente.'} Le bénéfice brut ne déduit pas les dépenses.`}</p>` : '';
      const recentMoves = moves.slice(0, 8);
      const recentCashOut = [
        ...supplierPayments.map(payment => ({ date: payment.paid_at, label: `Paiement ${payment.purchases?.number || 'fournisseur'} · ${payment.purchases?.suppliers?.name || 'Fournisseur'}`, amount: Number(payment.amount), type: 'Fournisseur' })),
        ...expenses.map(expense => ({ date: expense.paid_at, label: `${expense.label} · ${expense.category}`, amount: Number(expense.amount), type: 'Dépense' }))
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
      $('#owner-content').innerHTML = `${canSeeDailyCreditSummary ? `<section class="card owner-panel"><div class="sec-head"><div><h2>Résumé de caisse du jour</h2><p class="muted">${fr(today)} · ventes à crédit et versements encaissés</p></div></div><section class="kpis owner-kpis">${metric('Ventes à crédit', ownerDailyAvailable ? usdOnly(dailyCreditValue) : '—', ownerDailyAvailable ? `${ownerDailySales.length} facture(s)` : 'Suivi des paiements indisponible', 'sales', 't-blue')}${metric('Paiements de crédits reçus', ownerDailyAvailable ? usdOnly(dailyReceiptValue) : '—', ownerDailyAvailable ? `${ownerDailyReceipts.length} versement(s)` : 'Suivi des paiements indisponible', 'coins', 't-green')}</section></section>` : ''}<div class="owner-period-label">Période affichée : <b>${dateLabel}</b></div>
        <section class="kpis owner-kpis">
          ${metric('Chiffre d’affaires', usdOnly(revenue), salesSub, 'sales', 't-blue')}
          ${canSeeCosts ? metric('Coût des articles vendus', saleCostsAvailable ? usdOnly(salesCost) : '—', saleCostsAvailable ? 'Coût d’achat enregistré au moment de la vente' : 'Configuration SQL des coûts requise', 'purchases', 't-green') : ''}
          ${canSeeCosts ? metric('Bénéfice brut', saleCostsAvailable ? usdOnly(gross) : '—', profitDetail, 'coins', 't-purple') : ''}
          ${canSeeCosts ? metric('Entrées de trésorerie', usdOnly(received), 'Ventes cash, paiements de crédit et dépôts reçus', 'coins', 't-teal') : ''}
          ${canSeeCosts ? metric('Sorties de trésorerie', usdOnly(cashOut), `Fournisseurs ${usdOnly(supplierPaid)} · dépenses ${usdOnly(expenseTotal)}`, 'purchases', 't-orange') : ''}
          ${canSeeCosts ? metric('Flux net de trésorerie', usdOnly(cashNet), 'Entrées moins sorties enregistrées', 'sales', cashNet >= 0 ? 't-green' : 't-rose') : ''}
          ${canSeeCosts ? metric('Valeur actuelle du stock', usdOnly(currentStockValue), `Au prix d’achat · ${fcOnly(currentStockValue)}`, 'stock', 't-teal') : ''}
        </section>
        ${costHint}
        <div class="grid-2 owner-charts">
          <section class="card owner-panel"><div class="sec-head"><div><h2>Ventes et achats enregistrés</h2><p class="muted">Valeur des factures, distincte des règlements.</p></div><div class="owner-legend"><span><i class="sale-dot"></i>Ventes</span>${canSeeCosts ? '<span><i class="purchase-dot"></i>Achats</span>' : ''}</div></div>${bars(salesBuckets, canSeeCosts ? purchaseBuckets : null, 'Ventes', 'Achats', 'Comparaison des ventes et achats sur la période')}</section>
          <section class="card owner-panel"><div class="sec-head"><div><h2>Entrées et sorties de stock</h2><p class="muted">Nombre de mouvements · quantités détaillées ci-dessous</p></div><div class="owner-legend"><span><i class="sale-dot"></i>Entrées</span><span><i class="purchase-dot"></i>Sorties</span></div></div>${bars(inflowBuckets, outflowBuckets, 'Entrées', 'Sorties', 'Nombre de mouvements d’entrée et de sortie du stock')}</section>
        </div>
        <div class="grid-2b owner-lower">
          <section class="card owner-panel"><div class="sec-head"><h2>Derniers mouvements de stock</h2><a href="#/rapports">Voir les rapports</a></div>${recentMoves.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Article</th><th>Type</th><th class="r">Quantité</th></tr></thead><tbody>${recentMoves.map(move => `<tr><td>${fr(move.created_at)}</td><td>${esc(move.articles?.name || 'Article')}</td><td><span class="pill ${Number(move.qty) > 0 ? 'ok' : 'warn'}">${Number(move.qty) > 0 ? 'Entrée' : 'Sortie'} · ${stockMoveLabel(move.reason)}</span></td><td class="r">${Number(move.qty) > 0 ? '+' : '−'}${n(Math.abs(Number(move.qty)))} ${esc(move.articles?.unit || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucun mouvement de stock pour cette période.</p>'}</section>
          <section class="card owner-panel"><div class="sec-head"><h2>Points à surveiller</h2></div><div class="owner-watch">
            ${canSeeCosts ? `<div><span>Achats enregistrés sur la période</span><b>${usdOnly(purchaseValue)} <small>${fcOnly(purchaseValue)}</small></b></div><div><span>Paiements fournisseurs de la période</span><b>${usdOnly(supplierPaid)}</b></div><div><span>Dette fournisseur restante</span><b>${supplierBalancesAvailable ? usdOnly(supplierDebt) : '—'}</b></div><div><span>Dépenses de la période</span><b>${usdOnly(expenseTotal)}</b></div><div><span>Valeur du stock au prix d’achat</span><b>${usdOnly(currentStockValue)}</b></div>` : ''}
            <div><span>Créances clients restantes</span><b>${usdOnly(outstanding)}</b></div><div><span>Articles sous le seuil</span><b>${lowStock.length} article(s)</b></div>
          </div><p class="owner-note">La trésorerie reflète les paiements et dépenses enregistrés dans l’application. Les anciennes dettes fournisseur doivent d’abord être initialisées avec leur solde réel.</p></section>
        </div>
        ${canSeeCosts ? `<section class="card owner-panel"><div class="sec-head"><h2>Dernières sorties de trésorerie</h2><span class="muted">${dateLabel}</span></div>${recentCashOut.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>Détail</th><th class="r">Montant</th></tr></thead><tbody>${recentCashOut.map(item => `<tr><td>${fr(item.date)}</td><td>${esc(item.type)}</td><td>${esc(item.label)}</td><td class="r">${usdOnly(item.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucune sortie enregistrée sur cette période.</p>'}</section>` : ''}`;
    } catch (error) {
      $('#owner-content').innerHTML = `<div class="card"><p class="err">Chargement impossible : ${esc(error.message)}</p></div>`;
    }
  }

  $('#owner-period').addEventListener('change', setRangeControls);
  $('#owner-run').addEventListener('click', refresh);
  $('#owner-expense')?.addEventListener('click', openExpenseDialog);
  $('#owner-init-supplier')?.addEventListener('click', openInitialSupplierBalanceDialog);
  $('#owner-supplier-payment')?.addEventListener('click', openSupplierPaymentDialog);
  await refresh();
}
