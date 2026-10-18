import { db } from '../api.js';
import { esc, n, usdOnly, fcOnly, ico, barSvg } from '../ui.js';
import { downloadCsv } from '../export.js';

const today = () => new Date().toLocaleDateString('sv-SE');
const fr = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '—';
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const sumLines = (lines, key) => (lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line[key] || 0), 0);
const totalStock = items => items.reduce((sum, item) => sum + Number(item.stock || 0) * Number(item.price_buy || 0), 0);

export async function render(main) {
  const date = today();
  const monthStart = `${date.slice(0, 8)}01`;
  main.innerHTML = `<div class="page-head"><div><h1>Rapports</h1><p class="sub">Consultez les ventes, l’inventaire et les mouvements d’entrée et de sortie du stock.</p></div></div>
    <div class="report-tabs" role="tablist" aria-label="Types de rapports">
      <button class="report-tab active" type="button" data-tab="daily">Journalier</button>
      <button class="report-tab" type="button" data-tab="period">Entre deux dates</button>
      <button class="report-tab" type="button" data-tab="inventory">Inventaire</button>
      <button class="report-tab" type="button" data-tab="entries">Entrées de stock</button>
      <button class="report-tab" type="button" data-tab="exits">Sorties de stock</button>
      <button class="report-tab" type="button" data-tab="summary">Synthèse 6 mois</button>
    </div><div id="report-body" aria-live="polite"></div>`;
  const body = main.querySelector('#report-body');
  let active = 'daily';
  let inventory = [];
  let sequence = 0;

  function tabs() {
    main.querySelectorAll('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === active;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function renderFilters() {
    if (active === 'daily') {
      body.innerHTML = `<section class="card report-filter report-date-filter report-date-single"><header class="report-filter-heading"><span class="report-filter-mark" aria-hidden="true"></span><div><h2>Rapport journalier</h2><p>Choisissez le jour dont vous voulez consulter les ventes et encaissements.</p></div></header><div class="report-date-controls"><label for="report-day"><span>Date du rapport</span><input id="report-day" type="date" value="${date}"></label><button class="btn" id="run-report" type="button">${ico('chart')}<span>Afficher le rapport</span></button></div></section><div id="report-result" aria-live="polite">Choisissez une date.</div>`;
    } else if (active === 'period' || active === 'entries' || active === 'exits') {
      const start = active === 'period' ? monthStart : date;
      const title = active === 'period' ? 'Rapport entre deux dates' : active === 'entries' ? 'Période des entrées de stock' : 'Période des sorties de stock';
      const subtitle = active === 'period' ? 'Définissez une période pour consulter les ventes et les encaissements.' : 'Définissez une période pour consulter les mouvements de stock.';
      const search = active === 'entries' || active === 'exits' ? '<div class="card list-search"><label for="report-search">Rechercher dans le rapport<input id="report-search" type="search" placeholder="Référence, article, client ou numéro…" autocomplete="off"></label></div>' : '';
      body.innerHTML = `<section class="card report-filter report-date-filter"><header class="report-filter-heading"><span class="report-filter-mark" aria-hidden="true"></span><div><h2>${title}</h2><p>${subtitle}</p></div></header><div class="report-date-controls"><label for="report-from"><span>Du</span><input id="report-from" type="date" value="${start}"></label><label for="report-to"><span>Au</span><input id="report-to" type="date" value="${date}"></label><button class="btn" id="run-report" type="button">${ico('chart')}<span>Afficher le rapport</span></button></div></section>${search}<div id="report-result" aria-live="polite">Choisissez une période.</div>`;
    } else if (active === 'inventory') {
      body.innerHTML = `<div class="card report-filter"><label for="inventory-search">Rechercher un article<input id="inventory-search" type="search" placeholder="Référence ou désignation"></label></div><div id="report-result" aria-live="polite">Chargement de l’inventaire…</div>`;
    } else if (active === 'summary') {
      body.innerHTML = `<div class="card list-search"><label for="report-search">Rechercher dans le rapport<input id="report-search" type="search" placeholder="Rechercher un article, un client ou une facture…" autocomplete="off"></label></div><div id="report-result" aria-live="polite">Chargement de la synthèse…</div>`;
    } else {
      body.innerHTML = `<div id="report-result" aria-live="polite">Chargement de la synthèse…</div>`;
    }
    tabs();
    const run = body.querySelector('#run-report');
    if (run) run.onclick = refresh;
    const search = body.querySelector('#inventory-search');
    if (search) search.oninput = () => drawInventory(search.value);
    const reportSearch = body.querySelector('#report-search');
    if (reportSearch) reportSearch.oninput = () => filterReportRows(reportSearch.value);
  }

  function filterReportRows(query = '') {
    const result = body.querySelector('#report-result');
    if (!result) return;
    const q = norm(query.trim());
    result.querySelectorAll('tbody tr').forEach(row => { row.hidden = !!q && !norm(row.textContent).includes(q); });
  }

  function kpi(label, value, detail, icon, tone) {
    return `<div class="card kpi ${tone}"><div class="kh"><span class="kbub">${ico(icon)}</span><span>${label}</span></div><b>${value}</b><span>${detail}</span></div>`;
  }

  function addPrintButton(result) {
    if (!result || result.querySelector('.report-actions')) return;
    const sizes = active === 'daily' || active === 'period'
      ? '<option value="85">Ticket 85 mm (recommandé)</option><option value="55">Ticket 55 mm</option><option value="a4">A4</option>'
      : '<option value="a4">A4 (recommandé pour le détail)</option>';
    result.insertAdjacentHTML('afterbegin', `<div class="report-actions"><label>Format d’impression<select data-print-format aria-label="Format d’impression">${sizes}</select></label><button class="ghost" type="button" data-export-report>Exporter en CSV</button><button class="btn" type="button" data-print-report>Imprimer le rapport</button></div>`);
  }

  function exportReport() {
    const result = body.querySelector('#report-result');
    if (!result) return;
    const tables = [...result.querySelectorAll('table')];
    const rows = [];
    for (const table of tables) {
      const section = table.closest('section')?.querySelector('h2,h3')?.textContent.trim() || 'Résumé';
      const headers = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
      rows.push([section, ...headers]);
      for (const tr of table.querySelectorAll('tbody tr:not([hidden])')) {
        const cells = [...tr.cells].slice(0, headers.length).map(cell => cell.textContent.trim().replace(/\s+/g, ' '));
        rows.push([section, ...cells]);
      }
      rows.push([]);
    }
    const business = result.querySelector('.business-report');
    if (business) {
      const totals = business.querySelectorAll('.business-totals>div strong');
      if (totals[1]) rows.unshift(['Synthèse', 'Total des encaissements', totals[1].textContent.trim()]);
      if (totals[0]) rows.unshift(['Synthèse', 'Total des ventes', totals[0].textContent.trim()]);
    }
    const range = active === 'daily' ? body.querySelector('#report-day')?.value
      : active === 'period' || active === 'entries' || active === 'exits' ? `${body.querySelector('#report-from')?.value || ''}_${body.querySelector('#report-to')?.value || ''}`
        : active;
    const width = Math.max(2, ...rows.map(row => row.length));
    const headers = ['Rapport', ...Array.from({ length: width - 1 }, (_, index) => `Colonne ${index + 1}`)];
    downloadCsv(`kapya-${active}-${range || today()}`, headers, rows);
  }

  function printReport() {
    const result = body.querySelector('#report-result');
    if (!result) return;
    const clone = result.cloneNode(true);
    clone.querySelector('.report-actions')?.remove();
    const format = result.querySelector('[data-print-format]')?.value || '85';
    const title = ({ daily: 'Rapport journalier', period: 'Rapport entre deux dates', inventory: 'Rapport d’inventaire', entries: 'Rapport des entrées de stock', exits: 'Rapport des sorties de stock', summary: 'Synthèse des ventes sur six mois' })[active];
    const style = document.getElementById('pagesize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesize' }));
    style.textContent = format === 'a4' ? '@page{size:A4 portrait;margin:12mm}' : `@page{size:${format}mm auto;margin:${format === '55' ? '2mm' : '3mm'}}`;
    const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
    if (active === 'daily' || active === 'period') {
      const report = clone.querySelector('.business-report');
      const rows = [...(report?.querySelectorAll('.business-summary tbody tr') || [])];
      const cash = rows.find(row => row.cells[0]?.textContent.trim() === 'Ventes en cash')?.cells[1]?.innerHTML || '—';
      const credits = rows.find(row => row.cells[0]?.textContent.trim() === 'Ventes à crédit')?.cells[1]?.innerHTML || '—';
      const received = rows.find(row => row.cells[0]?.textContent.trim().startsWith('Paiements reçus'))?.cells[1]?.innerHTML || '—';
      const salesTotal = report?.querySelector('.business-totals>div:first-child strong')?.innerHTML || '—';
      const cashTotal = report?.querySelector('.business-totals>div:last-child strong')?.innerHTML || '—';
      const company = report?.querySelector('.business-brand')?.cloneNode(true);
      const name = company?.querySelector('b')?.textContent || 'KaPya ERP';
      const dateLabel = report?.querySelector('.business-date b')?.textContent || fr(today());
      const details = report?.querySelector('.business-company-details')?.innerHTML || '';
      const summaryOnly = `<article class="classic-cash-report ${format === 'a4' ? 'paper-a4' : format === '55' ? 'paper-55' : 'paper-85'}"><header><b>${esc(name)}</b>${details ? `<p>${details}</p>` : ''}</header>
        <h1>${active === 'daily' ? 'RAPPORT JOURNALIER' : 'RAPPORT ENTRE DEUX DATES'}</h1><p class="classic-date">${active === 'daily' ? 'Date' : 'Période'} : <b>${esc(dateLabel)}</b></p>
        <table><thead><tr><th>Désignation</th><th class="r">Montant (USD)</th></tr></thead><tbody><tr><td>Ventes au comptant</td><td class="r">${cash}</td></tr><tr><td>Ventes à crédit</td><td class="r">${credits}</td></tr><tr><td>Paiements des crédits reçus</td><td class="r">${received}</td></tr><tr class="classic-total"><th>Total des ventes</th><th class="r">${salesTotal}</th></tr><tr class="classic-total"><th>Total encaissé</th><th class="r">${cashTotal}</th></tr></tbody></table><footer>Copyright © KaPya Digital</footer></article>`;
      area.innerHTML = `<div class="report-print">${summaryOnly}</div>`;
    } else {
      const printHeading = clone.querySelector('.business-report') ? '' : `<h1>KaPya ERP · ${title}</h1><p>Imprimé le ${fr(today())}</p>`;
      area.innerHTML = `<div class="report-print">${printHeading}${clone.innerHTML}<footer>Copyright © KaPya Digital</footer></div>`;
    }
    window.print();
  }

  async function flow(from, to) {
    const dateFilter = (column) => `&${column}=gte.${from}&${column}=lte.${to}`;
    const [sales, payments, organizations] = await Promise.all([
      db.select('sales', `select=id,number,sold_at,customer_label,payment,paid,customers(name),sale_lines(qty,unit_price,articles(sku,name,unit))${dateFilter('sold_at')}&order=sold_at.desc,created_at.desc`),
      db.select('sale_payments', `select=id,amount,paid_at,kind,sales(number,customer_label,customers(name))${dateFilter('paid_at')}&order=paid_at.desc,created_at.desc`),
      db.select('organizations', 'select=name,address,phone,email,tax_id,rc,logo').catch(() => [])
    ]);
    return { sales, payments: payments.filter(item => ['initial', 'payment'].includes(item.kind)), org: organizations[0] || {} };
  }

  function creditSalesTable(sales) {
    const credits = sales.filter(sale => sale.payment === 'credit');
    const rows = credits.map(sale => {
      const total = sumLines(sale.sale_lines, 'unit_price');
      const paid = Number(sale.paid || 0);
      return `<tr><td>${fr(sale.sold_at)}</td><td>${esc(sale.number || '—')}</td><td>${esc(sale.customers?.name || sale.customer_label || 'Client comptoir')}</td><td class="r">${usdOnly(total)}</td><td class="r">${usdOnly(paid)}</td><td class="r"><b>${usdOnly(Math.max(total - paid, 0))}</b></td></tr>`;
    }).join('');
    return `<section class="card report-section"><h2>Ventes à crédit (${credits.length})</h2>${credits.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Facture</th><th>Client</th><th class="r">Total USD</th><th class="r">Versé USD</th><th class="r">Reste dû USD</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">Aucune vente à crédit sur cette période.</p>'}</section>`;
  }

  async function drawActivity(from, to, periodMode, request) {
    if (!from || !to || from > to) throw new Error('Vérifiez les dates : la date de début doit précéder la date de fin.');
    const { sales, payments, org } = await flow(from, to);
    if (request !== sequence) return;
    const cashSales = sales.filter(item => item.payment !== 'credit');
    const creditSales = sales.filter(item => item.payment === 'credit');
    const cashTotal = cashSales.reduce((sum, item) => sum + sumLines(item.sale_lines, 'unit_price'), 0);
    const creditTotal = creditSales.reduce((sum, item) => sum + sumLines(item.sale_lines, 'unit_price'), 0);
    const paymentsTotal = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalSales = cashTotal + creditTotal;
    const totalCollections = cashTotal + paymentsTotal;
    const credits = sales.filter(sale => sale.payment === 'credit');
    const creditBalance = credits.reduce((sum, sale) => sum + Math.max(sumLines(sale.sale_lines, 'unit_price') - Number(sale.paid || 0), 0), 0);
    const label = periodMode ? `${fr(from)} au ${fr(to)}` : fr(from);
    const title = periodMode ? 'Rapport entre deux dates' : 'Rapport journalier';
    const paymentRows = payments.map(item => `<tr><td>${fr(item.paid_at)}</td><td>${esc(item.sales?.number || '—')}</td><td>${esc(item.sales?.customers?.name || item.sales?.customer_label || 'Client comptoir')}</td><td>${item.kind === 'initial' ? 'Versement à la création' : 'Paiement de dette'}</td><td class="r">${usdOnly(item.amount)}</td></tr>`).join('');
    const result = body.querySelector('#report-result');
    const summaryRows = `<tr><td>Ventes en cash</td><td class="r">${usdOnly(cashTotal)}</td></tr><tr><td>Ventes à crédit</td><td class="r">${usdOnly(creditTotal)}</td></tr><tr><td>Paiements reçus <span class="muted">(dettes / crédits)</span></td><td class="r">${usdOnly(paymentsTotal)}</td></tr>`;
    const companyDetails = [org.address, org.phone && `Tél. : ${org.phone}`, org.email && `E-mail : ${org.email}`, org.tax_id && `NIF : ${org.tax_id}`, org.rc && `RC : ${org.rc}`].filter(Boolean).map(item => `<span>${esc(item)}</span>`).join('');
    result.innerHTML = `<article class="business-report" data-period="${periodMode ? 'true' : 'false'}"><header class="business-report-head"><div class="business-brand"><img src="${esc(org.logo || './assets/logo-k.png')}" alt=""><div><b>${esc(org.name || 'KaPya ERP')}</b><span>Rapport de gestion commerciale</span></div></div><div class="business-date"><span>${periodMode ? 'Période' : 'Date'}</span><b>${label}</b></div></header><div class="business-company-details">${companyDetails}</div>
      <h2>${title}</h2><p class="business-subtitle">Résumé des ventes et des encaissements</p>
      <table class="business-summary"><thead><tr><th>Désignation</th><th class="r">Montant (USD)</th></tr></thead><tbody>${summaryRows}</tbody></table>
      <div class="business-totals"><div><b>TOTAL DES VENTES</b><span>Ventes en cash + ventes à crédit</span><strong>${usdOnly(totalSales)}</strong></div><div><b>TOTAL DES ENCAISSEMENTS</b><span>Ventes en cash + paiements reçus</span><strong>${usdOnly(totalCollections)}</strong></div></div>
      ${creditSalesTable(sales)}
      <section class="card report-section"><h3>Paiements reçus (${payments.length})</h3>${payments.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Facture</th><th>Client</th><th>Type</th><th class="r">Montant USD</th></tr></thead><tbody>${paymentRows}</tbody></table></div>` : '<p class="empty">Aucun paiement de dette sur cette période.</p>'}</section>
      </article>`;
    addPrintButton(result);
  }

  async function drawEntries(from, to, request) {
    if (!from || !to || from > to) throw new Error('Vérifiez les dates : la date de début doit précéder la date de fin.');
    const dateFilter = `&bought_at=gte.${from}&bought_at=lte.${to}`;
    const createdFrom = encodeURIComponent(new Date(`${from}T00:00:00`).toISOString());
    const createdTo = encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString());
    const [purchases, adjustments] = await Promise.all([
      db.select('purchases', `select=id,number,bought_at,suppliers(name),purchase_lines(qty,unit_cost,articles(sku,name,unit))${dateFilter}&order=bought_at.desc,created_at.desc`),
      db.select('stock_moves', `select=id,article_id,qty,reason,ref_id,created_at,articles(sku,name,unit)&reason=eq.adjustment&qty=gt.0&created_at=gte.${createdFrom}&created_at=lte.${createdTo}&order=created_at.desc`)
    ]);
    if (request !== sequence) return;
    const entries = [];
    purchases.forEach(p => (p.purchase_lines || []).forEach(line => entries.push({
      date: p.bought_at, source: 'Achat', number: p.number || '—', party: p.suppliers?.name || '—',
      sku: line.articles?.sku || '—', article: line.articles?.name || '—', qty: Number(line.qty), unit: line.articles?.unit || '',
      amount: Number(line.qty) * Number(line.unit_cost)
    })));
    adjustments.forEach(move => entries.push({
      date: move.created_at ? new Date(move.created_at).toLocaleDateString('sv-SE') : '', source: 'Ajustement positif', number: '—', party: '—',
      sku: move.articles?.sku || '—', article: move.articles?.name || '—', qty: Number(move.qty), unit: move.articles?.unit || '', amount: 0
    }));
    entries.sort((a, b) => b.date.localeCompare(a.date));
    const purchaseValue = entries.reduce((sum, row) => sum + row.amount, 0);
    const result = body.querySelector('#report-result');
    result.innerHTML = `<p class="report-range">${fr(from)} au ${fr(to)}</p><div class="kpis">${kpi('Lignes d’entrée', n(entries.length), 'mouvements positifs', 'stock', 't-green')}${kpi('Ajustements manuels', n(adjustments.length), 'entrée(s) ajoutée(s)', 'plus', 't-blue')}${kpi('Valeur des achats', usdOnly(purchaseValue), fcOnly(purchaseValue), 'coins', 't-teal')}</div>
      <section class="card report-section"><h2>Détail des entrées</h2>${entries.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Origine</th><th>N°</th><th>Article</th><th class="r">Quantité</th><th>Fournisseur</th><th class="r">Valeur USD</th></tr></thead><tbody>${entries.map(row => `<tr><td>${fr(row.date)}</td><td>${row.source}</td><td>${esc(row.number)}</td><td>${esc(row.sku)} — ${esc(row.article)}</td><td class="r">${n(row.qty)} ${esc(row.unit)}</td><td>${esc(row.party)}</td><td class="r">${row.amount ? usdOnly(row.amount) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucune entrée de stock sur cette période.</p>'}</section>`;
    filterReportRows(body.querySelector('#report-search')?.value || '');
    addPrintButton(result);
  }

  async function drawExits(from, to, request) {
    if (!from || !to || from > to) throw new Error('Vérifiez les dates : la date de début doit précéder la date de fin.');
    const salesFilter = `&sold_at=gte.${from}&sold_at=lte.${to}`;
    const transferFilter = `&moved_at=gte.${from}&moved_at=lte.${to}`;
    const createdFrom = encodeURIComponent(new Date(`${from}T00:00:00`).toISOString());
    const createdTo = encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString());
    const [sales, transfers, adjustments] = await Promise.all([
      db.select('sales', `select=id,number,sold_at,customer_label,customers(name),sale_lines(qty,articles(sku,name,unit))${salesFilter}&order=sold_at.desc,created_at.desc`),
      db.select('transfers', `select=id,number,destination,moved_at,transfer_lines(qty,articles(sku,name,unit))${transferFilter}&order=moved_at.desc,created_at.desc`).catch(() => []),
      db.select('stock_moves', `select=id,qty,created_at,articles(sku,name,unit)&reason=eq.adjustment&qty=lt.0&created_at=gte.${createdFrom}&created_at=lte.${createdTo}&order=created_at.desc`)
    ]);
    if (request !== sequence) return;
    const exits = [];
    sales.forEach(sale => (sale.sale_lines || []).forEach(line => exits.push({
      date: sale.sold_at, type: 'Vente', ref: sale.number || '—', destination: sale.customers?.name || sale.customer_label || 'Client comptoir',
      sku: line.articles?.sku || '—', article: line.articles?.name || '—', qty: Number(line.qty), unit: line.articles?.unit || ''
    })));
    transfers.forEach(transfer => (transfer.transfer_lines || []).forEach(line => exits.push({
      date: transfer.moved_at, type: 'Transfert', ref: transfer.number || '—', destination: transfer.destination || '—',
      sku: line.articles?.sku || '—', article: line.articles?.name || '—', qty: Number(line.qty), unit: line.articles?.unit || ''
    })));
    adjustments.forEach(move => exits.push({
      date: move.created_at ? new Date(move.created_at).toLocaleDateString('sv-SE') : '', type: 'Ajustement manuel', ref: '—', destination: '—',
      sku: move.articles?.sku || '—', article: move.articles?.name || '—', qty: Math.abs(Number(move.qty)), unit: move.articles?.unit || ''
    }));
    exits.sort((a, b) => b.date.localeCompare(a.date));
    const result = body.querySelector('#report-result');
    result.innerHTML = `<p class="report-range">Période : ${fr(from)} au ${fr(to)}</p><div class="kpis">${kpi('Lignes de sortie', n(exits.length), 'mouvements de stock', 'stock', 't-orange')}${kpi('Ventes', n(sales.length), 'facture(s)', 'sales', 't-blue')}${kpi('Transferts', n(transfers.length), 'sortie(s) vers un vendeur', 'truck', 't-green')}</div>
      <section class="card report-section"><h2>Détail des sorties de stock</h2>${exits.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>N°</th><th>Référence</th><th>Article</th><th class="r">Quantité sortie</th><th>Client / destination</th></tr></thead><tbody>${exits.map(row => `<tr><td>${fr(row.date)}</td><td>${row.type}</td><td>${esc(row.ref)}</td><td>${esc(row.sku)}</td><td>${esc(row.article)}</td><td class="r">${n(row.qty)} ${esc(row.unit)}</td><td>${esc(row.destination)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucune sortie de stock sur cette période.</p>'}</section>`;
    filterReportRows(body.querySelector('#report-search')?.value || '');
    addPrintButton(result);
  }

  async function drawInventory(query = '', request = ++sequence) {
    const result = body.querySelector('#report-result');
    try {
      if (!inventory.length) inventory = await db.select('articles', 'select=sku,name,unit,stock,min_stock,price_buy&order=name');
      if (request !== sequence) return;
      const filtered = inventory.filter(item => `${item.sku} ${item.name}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
      const value = totalStock(filtered);
      result.innerHTML = `<div class="kpis">${kpi('Articles', n(filtered.length), 'dans la sélection', 'stock', 't-green')}${kpi('Valeur du stock', usdOnly(value), fcOnly(value), 'coins', 't-blue')}${kpi('Sous le seuil', n(filtered.filter(item => Number(item.stock) <= Number(item.min_stock)).length), 'à réapprovisionner', 'alert', 't-rose')}</div>
        <section class="card report-section"><h2>État du stock actuel</h2>${filtered.length ? `<div class="tw"><table><thead><tr><th>Référence</th><th>Article</th><th class="r">Stock</th><th class="r">Seuil</th><th>État</th><th class="r">Valeur au prix d’achat</th></tr></thead><tbody>${filtered.map(item => {
          const stock = Number(item.stock || 0), threshold = Number(item.min_stock || 0), price = Number(item.price_buy || 0);
          const status = stock <= 0 ? '<span class="pill bad">Rupture</span>' : stock <= threshold ? '<span class="pill warn">Stock bas</span>' : '<span class="pill ok">Disponible</span>';
          return `<tr><td>${esc(item.sku)}</td><td>${esc(item.name)}</td><td class="r">${n(stock)} ${esc(item.unit || '')}</td><td class="r">${n(threshold)} ${esc(item.unit || '')}</td><td>${status}</td><td class="r">${usdOnly(stock * price)}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="empty">Aucun article ne correspond à la recherche.</p>'}</section>`;
      addPrintButton(result);
    } catch (error) { result.textContent = `Inventaire indisponible : ${error.message}`; }
  }

  async function drawSummary(request) {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const item = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: item.toLocaleDateString('sv-SE').slice(0, 7), label: item.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') };
    });
    const from = `${months[0].key}-01`;
    const sales = await db.select('sales', `select=id,number,sold_at,customer_label,payment,paid,customers(name),sale_lines(qty,unit_price,articles(sku,name,unit))&sold_at=gte.${from}&order=sold_at.desc`);
    if (request !== sequence) return;
    const byMonth = months.map(month => sales.filter(sale => sale.sold_at.slice(0, 7) === month.key).reduce((sum, sale) => sum + sumLines(sale.sale_lines, 'unit_price'), 0));
    const total = byMonth.reduce((sum, amount) => sum + amount, 0);
    const creditBalance = sales.filter(sale => sale.payment === 'credit').reduce((sum, sale) => sum + Math.max(sumLines(sale.sale_lines, 'unit_price') - Number(sale.paid || 0), 0), 0);
    const top = {};
    sales.forEach(sale => (sale.sale_lines || []).forEach(line => {
      const key = line.articles?.sku || line.articles?.name || '?';
      top[key] ||= { name: line.articles?.name || '—', unit: line.articles?.unit || '', qty: 0, amount: 0 };
      top[key].qty += Number(line.qty || 0);
      top[key].amount += Number(line.qty || 0) * Number(line.unit_price || 0);
    }));
    const leaders = Object.values(top).sort((a, b) => b.amount - a.amount).slice(0, 8);
    const result = body.querySelector('#report-result');
    result.innerHTML = `<div class="kpis">${kpi('Total vendu sur 6 mois', usdOnly(total), fcOnly(total), 'coins', 't-blue')}${kpi('Factures', n(sales.length), 'sur 6 mois', 'sales', 't-green')}${kpi('Reste dû à crédit', usdOnly(creditBalance), 'factures à crédit', 'coins', 't-orange')}</div>
      ${creditSalesTable(sales)}<div class="grid-2 report-grids"><section class="card report-section"><h2>Chiffre d’affaires par mois</h2>${barSvg(byMonth, months.map(month => month.label))}</section><section class="card report-section"><h2>Produits les plus vendus</h2>${leaders.length ? `<div class="tw"><table><thead><tr><th>Produit</th><th class="r">Quantité</th><th class="r">Montant USD</th></tr></thead><tbody>${leaders.map(item => `<tr><td>${esc(item.name)}</td><td class="r">${n(item.qty)} ${esc(item.unit)}</td><td class="r">${usdOnly(item.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucune vente sur ces six mois.</p>'}</section></div>`;
    filterReportRows(body.querySelector('#report-search')?.value || '');
    addPrintButton(result);
  }

  async function refresh() {
    const result = body.querySelector('#report-result');
    if (!result) return;
    const request = ++sequence;
    result.innerHTML = '<p class="muted">Chargement du rapport…</p>';
    try {
      if (active === 'daily') await drawActivity(body.querySelector('#report-day').value, body.querySelector('#report-day').value, false, request);
      else if (active === 'period') await drawActivity(body.querySelector('#report-from').value, body.querySelector('#report-to').value, true, request);
      else if (active === 'entries') await drawEntries(body.querySelector('#report-from').value, body.querySelector('#report-to').value, request);
      else if (active === 'exits') await drawExits(body.querySelector('#report-from').value, body.querySelector('#report-to').value, request);
      else if (active === 'summary') await drawSummary(request);
      if (request !== sequence) return;
    } catch (error) {
      if (request === sequence) result.innerHTML = `<p class="err" role="alert">${esc(error.message || 'Impossible de charger le rapport.')}</p>`;
    }
  }

  main.querySelector('.report-tabs').onclick = event => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    active = button.dataset.tab;
    renderFilters();
    if (active === 'inventory') drawInventory();
    else refresh();
  };
  body.addEventListener('click', event => {
    if (event.target.closest('[data-print-report]')) printReport();
    if (event.target.closest('[data-export-report]')) exportReport();
  });
  renderFilters();
  await refresh();
}
