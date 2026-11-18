import { db, selectArticlesWithTotal } from '../api.js';
import { ownOrgRows } from '../own-org.js';
import { esc, n, usdOnly, fcOnly, ico, barSvg, notify } from '../ui.js';
import { downloadCsv } from '../export.js';
import { textPdf, logoForPdf } from '../pdf.js';
import { buildFullReport } from '../full-report.js';
import { can } from '../roles.js';
import { companyLogo } from '../print.js';
import { loadShops, shopSelectHtml, shopSalesFilter, shopPaymentsSelect, shopPaymentsFilter, setShop, getShop, canSeeAllShops } from '../shops.js';

const today = () => new Date().toLocaleDateString('sv-SE');
const fr = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '—';
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const sumLines = (lines, key) => (lines || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line[key] || 0), 0);
const totalStock = items => items.reduce((sum, item) => sum + Number(item.stock || 0) * Number(item.price_buy || 0), 0);

export async function render(main, ctx) {
  // Rôles sans accès complet (ex. facturier) : rapports journalier et entre deux dates seulement (ventes et encaissements, sans coûts ni stock).
  const fullAccess = can(ctx?.role, 'rapports.view');
  // Bénéfices et marges : gérant et responsable seulement
  const canSeeProfit = ['admin', 'manager'].includes(ctx?.role);
  const allShops = canSeeAllShops(ctx?.role);
  if (!allShops) setShop('');
  const shopList = allShops ? await loadShops() : [];
  const date = today();
  const monthStart = `${date.slice(0, 8)}01`;
  main.innerHTML = `<div class="page-head"><div><h1>Rapports</h1><p class="sub">Consultez les ventes, l’inventaire et les mouvements d’entrée et de sortie du stock.</p></div></div>
    <div class="report-tabs" role="tablist" aria-label="Types de rapports">
      <button class="report-tab active" type="button" data-tab="daily">Journalier</button>
      <button class="report-tab" type="button" data-tab="period">Entre deux dates</button>
      ${fullAccess ? `<button class="report-tab" type="button" data-tab="inventory">Inventaire</button>
      <button class="report-tab" type="button" data-tab="entries">Entrées de stock</button>
      <button class="report-tab" type="button" data-tab="exits">Sorties de stock</button>
      <button class="report-tab" type="button" data-tab="summary">Synthèse 6 mois</button>
      ${canSeeProfit ? '<button class="report-tab" type="button" data-tab="performance">Produits et marges</button>' : ''}` : ''}
    </div><div id="report-body" aria-live="polite"></div>`;
  const body = main.querySelector('#report-body');
  let active = 'daily';
  let inventory = [];
  let inventoryTotalsMissing = false, inventoryView = [];
  let sequence = 0;
  let printOrg = {};
  ownOrgRows('name,address,phone,email,tax_id,rc,logo,receipt_footer').then(rows => { printOrg = rows[0] || {}; }).catch(() => {});

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
    } else if (active === 'period' || active === 'entries' || active === 'exits' || active === 'performance') {
      const start = active === 'period' ? monthStart : date;
      const title = active === 'period' ? 'Rapport entre deux dates' : active === 'entries' ? 'Période des entrées de stock' : active === 'performance' ? 'Produits et marges' : 'Période des sorties de stock';
      const subtitle = active === 'period' ? 'Définissez une période pour consulter les ventes et les encaissements.' : active === 'performance' ? 'Produits les plus vendus et marge brute sur la période.' : 'Définissez une période pour consulter les mouvements de stock.';
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
    if ((active === 'daily' || active === 'period') && shopList.length > 1) {
      body.querySelector('.report-filter-heading')?.insertAdjacentHTML('afterend', shopSelectHtml(shopList, 'report-shop'));
      body.querySelector('#report-shop')?.addEventListener('change', event => { setShop(event.target.value); body.querySelector('#run-report')?.click(); });
    }
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
      ? '<option value="a4" selected>A4 (recommandé)</option><option value="80">Ticket 80 mm</option><option value="85">Ticket 85 mm</option><option value="55">Ticket 55 mm</option>'
      : '<option value="a4">A4 (recommandé pour le détail)</option>';
    result.insertAdjacentHTML('afterbegin', `<div class="report-actions"><label>Format d’impression<select data-print-format aria-label="Format d’impression">${sizes}</select></label><button class="ghost" type="button" data-export-report>Exporter vers Excel</button><button class="btn" type="button" data-print-report>Imprimer / PDF</button>${active === 'daily' || active === 'period' ? '<button class="ghost" type="button" data-whatsapp-report>Envoyer par WhatsApp</button>' : ''}<small class="muted">Dans l’impression, choisissez « Enregistrer au format PDF ».</small></div>`);
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

  // Envoi du rapport en PDF : partage natif (WhatsApp dans la liste) ; repli : téléchargement puis WhatsApp.
  async function shareReportWhatsApp() {
    const result = body.querySelector('#report-result');
    if (!result) return;
    const report = result.querySelector('.business-report') || result;
    const title = active === 'daily' ? 'Rapport journalier' : 'Rapport entre deux dates';
    const dateLabel = report.querySelector('.business-date b')?.textContent?.trim() || fr(today());
    const company = report.querySelector('.business-brand b')?.textContent?.trim() || 'KaPya ERP';
    // Journalier et période : rapport complet, construit à partir des données (toutes les sections, avec les tableaux en texte).
    // Les autres onglets gardent le rendu affiché à l'écran.
    let lines;
    if (active === 'daily' || active === 'period') {
      const from = active === 'daily' ? body.querySelector('#report-day')?.value : body.querySelector('#report-from')?.value;
      const to = active === 'daily' ? from : body.querySelector('#report-to')?.value;
      lines = await buildFullReport({ from, to, title, company, warehouse: getShop() || null });
    } else {
      lines = report.innerText.split('\n').map(line => line.replace(/\s+$/, ''));
    }
    const logo = await logoForPdf(companyLogo(printOrg?.logo));
    const blob = textPdf(`${title} - ${company}`, lines, `${active === 'daily' ? 'Date' : 'Période'} : ${dateLabel}`, logo);
    const stamp = dateLabel.replace(/[^0-9A-Za-zÀ-ÿ]+/g, '-').replace(/^-|-$/g, '');
    const name = `kapya-${active}-${stamp}.pdf`;
    const file = new File([blob], name, { type: 'application/pdf' });
    const message = `${title} - ${company} (${dateLabel})`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title, text: message }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    window.open(`https://wa.me/?text=${encodeURIComponent(`${message}. Le fichier PDF vient d’être téléchargé : joignez-le dans la conversation.`)}`, '_blank', 'noopener');
  }
  function printReport() {
    const result = body.querySelector('#report-result');
    if (!result) return;
    const clone = result.cloneNode(true);
    const org = printOrg;
    clone.querySelector('.report-actions')?.remove();
    const format = result.querySelector('[data-print-format]')?.value || ((active === 'daily' || active === 'period') ? 'a4' : '85');
    const title = ({ daily: 'Rapport journalier', period: 'Rapport entre deux dates', inventory: 'Rapport d’inventaire', entries: 'Rapport des entrées de stock', exits: 'Rapport des sorties de stock', summary: 'Synthèse des ventes sur six mois' })[active];
    const style = document.getElementById('pagesize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesize' }));
    style.textContent = format === 'a4' ? '@page{size:A4 portrait;margin:12mm}' : `@page{size:${format}mm auto;margin:${format === '55' ? '2mm' : '3mm'}}`;
    const area = document.getElementById('print-area') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-area' }));
    if ((active === 'daily' || active === 'period') && format !== 'a4') {
      const report = clone.querySelector('.business-report');
      const rows = [...(report?.querySelectorAll('.business-summary tbody tr') || [])];
      const cash = rows.find(row => row.cells[0]?.textContent.trim() === 'Ventes en cash')?.cells[1]?.innerHTML || '—';
      const credits = rows.find(row => row.cells[0]?.textContent.trim() === 'Ventes à crédit')?.cells[1]?.innerHTML || '—';
      const received = rows.find(row => row.cells[0]?.textContent.trim().startsWith('Paiements reçus'))?.cells[1]?.innerHTML || '—';
      const salesTotal = report?.querySelector('.business-totals>div:first-child strong')?.innerHTML || '—';
      const cashTotal = report?.querySelector('.business-totals>div:last-child strong')?.innerHTML || '—';
      const company = report?.querySelector('.business-brand')?.cloneNode(true);
      const name = company?.querySelector('b')?.textContent || 'KaPya ERP';
      const logo = company?.querySelector('img')?.outerHTML || '';
      const dateLabel = report?.querySelector('.business-date b')?.textContent || fr(today());
      const details = report?.querySelector('.business-company-details')?.innerHTML || '';
      const summaryOnly = `<article class="classic-cash-report ${format === 'a4' ? 'paper-a4' : format === '55' ? 'paper-55' : 'paper-85'}"><header>${logo}<b>${esc(name)}</b>${details ? `<p>${details}</p>` : ''}</header>
        <h1>${active === 'daily' ? 'RAPPORT JOURNALIER' : 'RAPPORT ENTRE DEUX DATES'}</h1><p class="classic-date">${active === 'daily' ? 'Date' : 'Période'} : <b>${esc(dateLabel)}</b></p>
        <table><thead><tr><th>Désignation</th><th class="r">Montant (USD)</th></tr></thead><tbody><tr><td>Ventes au comptant</td><td class="r">${cash}</td></tr><tr><td>Ventes à crédit</td><td class="r">${credits}</td></tr><tr><td>Paiements des crédits reçus</td><td class="r">${received}</td></tr><tr class="classic-total"><th>Total des ventes</th><th class="r">${salesTotal}</th></tr><tr class="classic-total"><th>Total encaissé</th><th class="r">${cashTotal}</th></tr></tbody></table><footer>Copyright © KaPya Digital</footer></article>`;
      area.innerHTML = `<div class="report-print">${summaryOnly}</div>`;
    } else {
      const printHeading = clone.querySelector('.business-report') ? '' : `<header class="export-company-head"><img src="${esc(companyLogo(org?.logo))}" alt=""><div><b>${esc(org?.name || 'KaPya ERP')}</b>${[org?.address, org?.phone && `Tél. : ${org.phone}`, org?.email && `E-mail : ${org.email}`, org?.tax_id && `NIF : ${org.tax_id}`, org?.rc && `RC : ${org.rc}`].filter(Boolean).map(item => `<p>${esc(item)}</p>`).join('')}</div></header><h1>${esc(title)}</h1><p>Imprimé le ${fr(today())}</p>`;
      area.innerHTML = `<div class="report-print">${printHeading}${clone.innerHTML}<footer>Copyright © KaPya Digital</footer></div>`;
    }
    window.print();
  }

  async function flow(from, to) {
    const dateFilter = (column) => `&${column}=gte.${from}&${column}=lte.${to}`;
    const [sales, payments, organizations] = await Promise.all([
      db.select('sales', `select=id,number,sold_at,customer_label,payment,paid,warehouse_id,customers(name),sale_lines(qty,unit_price,articles(sku,name,unit))${dateFilter('sold_at')}${shopSalesFilter()}&order=sold_at.desc,created_at.desc`),
      db.select('sale_payments', `${shopPaymentsSelect('select=id,amount,paid_at,kind,sales(number,customer_label,customers(name))')}${dateFilter('paid_at')}${shopPaymentsFilter()}&order=paid_at.desc,created_at.desc`),
      ownOrgRows('name,address,phone,email,tax_id,rc,logo,receipt_footer').catch(() => [])
    ]);
    printOrg = organizations[0] || printOrg;
    return { sales, payments: payments.filter(item => ['initial', 'payment'].includes(item.kind)), org: printOrg };
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

  // Tableau comparatif des boutiques (quand aucune boutique n'est choisie).
  const shopFilter = column => (getShop() ? `&${column}=eq.${getShop()}` : '');
  let inventoryShop = null;
  function shopTable(sales) {
    const rows = shopList.map(shop => {
      const mine = sales.filter(item => item.warehouse_id === shop.id);
      const total = mine.reduce((sum, item) => sum + sumLines(item.sale_lines, 'unit_price'), 0);
      return `<tr><td>${esc(shop.name)}</td><td class="r">${usdOnly(total)}</td><td class="r">${mine.length}</td></tr>`;
    }).join('');
    const grand = sales.reduce((sum, item) => sum + sumLines(item.sale_lines, 'unit_price'), 0);
    return `<section class="card report-section"><h2>Ventes par boutique</h2><div class="tw"><table><thead><tr><th>Boutique</th><th class="r">Ventes (USD)</th><th class="r">Factures</th></tr></thead><tbody>${rows}<tr class="total"><td><b>Total toutes boutiques</b></td><td class="r"><b>${usdOnly(grand)}</b></td><td class="r"><b>${sales.length}</b></td></tr></tbody></table></div></section>`;
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
    if (!getShop() && shopList.length > 1) result.insertAdjacentHTML('beforeend', shopTable(sales));
    addPrintButton(result);
  }

  async function drawEntries(from, to, request) {
    if (!from || !to || from > to) throw new Error('Vérifiez les dates : la date de début doit précéder la date de fin.');
    const dateFilter = `&bought_at=gte.${from}&bought_at=lte.${to}`;
    const createdFrom = encodeURIComponent(new Date(`${from}T00:00:00`).toISOString());
    const createdTo = encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString());
    const [purchases, adjustments] = await Promise.all([
      db.select('purchases', `select=id,number,bought_at,warehouse_id,suppliers(name),purchase_lines(qty,unit_cost,articles(sku,name,unit))${dateFilter}${shopFilter('warehouse_id')}&order=bought_at.desc,created_at.desc`),
      db.select('stock_moves', `select=id,article_id,qty,reason,ref_id,created_at,articles(sku,name,unit)&reason=in.(adjustment,client_return)&qty=gt.0&created_at=gte.${createdFrom}&created_at=lte.${createdTo}${shopFilter('warehouse_id')}&order=created_at.desc`)
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
      db.select('sales', `select=id,number,sold_at,customer_label,customers(name),sale_lines(qty,articles(sku,name,unit))${salesFilter}${shopSalesFilter()}&order=sold_at.desc,created_at.desc`),
      db.select('transfers', `select=id,number,destination,moved_at,transfer_lines(qty,articles(sku,name,unit))${transferFilter}${shopFilter('from_warehouse_id')}&order=moved_at.desc,created_at.desc`).catch(() => []),
      db.select('stock_moves', `select=id,qty,created_at,articles(sku,name,unit)&reason=in.(adjustment,supplier_return)&qty=lt.0&created_at=gte.${createdFrom}&created_at=lte.${createdTo}${shopFilter('warehouse_id')}&order=created_at.desc`)
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

  // Stock total de tous les dépôts. Si le total n'est pas disponible pour ce rôle, on le signale au lieu de montrer des zéros.
  async function inventoryAllShops() {
    const rows = await db.select('articles', 'select=id,sku,name,unit,min_stock,price_buy,price_sell&order=name');
    const totals = await db.rpc('article_total_stock', {}).then(t => (Array.isArray(t) ? t : null)).catch(() => null);
    inventoryTotalsMissing = totals === null;
    const m = new Map((totals || []).map(t => [t.article_id, Number(t.total) || 0]));
    return rows.map(r => ({ ...r, stock: m.get(r.id) ?? 0 }));
  }

  async function drawInventory(query = '', request = ++sequence) {
    const result = body.querySelector('#report-result');
    try {
      const shop = getShop();
      if (shop !== inventoryShop || !inventory.length) {
        inventory = shop
          ? (await db.select('warehouse_stock', `select=qty,articles(sku,name,unit,min_stock,price_buy,price_sell)&warehouse_id=eq.${shop}`)).map(row => ({ sku: row.articles?.sku, name: row.articles?.name, unit: row.articles?.unit, min_stock: row.articles?.min_stock, price_buy: row.articles?.price_buy, price_sell: row.articles?.price_sell, stock: row.qty }))
          : await inventoryAllShops();
        inventoryShop = shop;
      }
      if (request !== sequence) return;
      const filtered = inventory.filter(item => `${item.sku} ${item.name}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
      inventoryView = filtered;
      const value = totalStock(filtered);
      result.innerHTML = `<p class="report-range">Au ${fr(today())} · ${n(filtered.length)} article(s) · Valeur au prix d’achat : ${usdOnly(value)}</p><div class="kpis">${kpi('Articles', n(filtered.length), 'dans la sélection', 'stock', 't-green')}${kpi('Valeur du stock', usdOnly(value), fcOnly(value), 'coins', 't-blue')}${kpi('Sous le seuil', n(filtered.filter(item => Number(item.stock) <= Number(item.min_stock)).length), 'à réapprovisionner', 'alert', 't-rose')}</div>
        <section class="card report-section"><h2>État du stock actuel</h2>${filtered.length ? `<div class="tw"><table><thead><tr><th>Référence</th><th>Article</th><th class="r">Stock</th><th class="r">Seuil</th><th>État</th><th class="r">Valeur au prix d’achat</th>${canSeeProfit ? '<th class="r">Prix de vente</th><th class="r">Marge unitaire</th><th class="r">Bénéfice potentiel du stock</th>' : ''}</tr></thead><tbody>${filtered.map(item => {
          const stock = Number(item.stock || 0), threshold = Number(item.min_stock || 0), price = Number(item.price_buy || 0);
          const status = stock <= 0 ? '<span class="pill bad">Rupture</span>' : stock <= threshold ? '<span class="pill warn">Stock bas</span>' : '<span class="pill ok">Disponible</span>';
          return `<tr><td>${esc(item.sku)}</td><td>${esc(item.name)}</td><td class="r">${n(stock)} ${esc(item.unit || '')}</td><td class="r">${n(threshold)} ${esc(item.unit || '')}</td><td>${status}</td><td class="r">${usdOnly(stock * price)}</td>${canSeeProfit ? `<td class="r">${usdOnly(Number(item.price_sell || 0))}</td><td class="r">${usdOnly(Number(item.price_sell || 0) - price)}</td><td class="r">${usdOnly(stock * (Number(item.price_sell || 0) - price))}</td>` : ''}</tr>`;
        }).join('')}</tbody></table></div>` : '<p class="empty">Aucun article ne correspond à la recherche.</p>'}</section>`;
      if (inventoryTotalsMissing && !shop) result.insertAdjacentHTML('afterbegin', '<p class="err" role="alert">Les quantités totales ne sont pas disponibles pour votre rôle. Choisissez un dépôt pour voir le stock.</p>');
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
    const sales = await db.select('sales', `select=id,number,sold_at,customer_label,payment,paid,customers(name),sale_lines(qty,unit_price,articles(sku,name,unit))&sold_at=gte.${from}${shopSalesFilter()}&order=sold_at.desc`);
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

  // ---- Bénéfices : calculs partagés ----
  // Coût de la ligne : coût figé à la vente (sale_lines.unit_cost) ; à défaut, le prix d'achat actuel.
  const lineCost = line => (line.unit_cost != null ? Number(line.unit_cost) : (Number(line.articles?.price_buy) || 0));
  const addDays = (iso, k) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + k); return d.toLocaleDateString('sv-SE'); };
  const pct = (part, whole) => (whole ? part / whole * 100 : 0);

  function profitOfSales(sales) {
    let revenue = 0, cost = 0, collected = 0;
    sales.forEach(sale => {
      const lines = sale.sale_lines || [];
      const saleRevenue = lines.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
      const saleCost = lines.reduce((t, l) => t + (Number(l.qty) || 0) * lineCost(l), 0);
      revenue += saleRevenue; cost += saleCost;
      const ratio = saleRevenue > 0 ? Math.min(1, Math.max(0, Number(sale.paid || 0) / saleRevenue)) : 0;
      collected += (saleRevenue - saleCost) * ratio;
    });
    return { revenue, cost, profit: revenue - cost, collected };
  }

  // Période : ventes, retours, avoirs et bénéfice net (retours et avoirs déduits)
  async function periodFigures(from, to) {
    const [sales, returns, notes] = await Promise.all([
      db.select('sales', `select=id,number,sold_at,paid,payment,customer_label,customers(name),sale_lines(qty,unit_price,unit_cost,articles(id,sku,name,unit,price_buy))&sold_at=gte.${from}&sold_at=lte.${to}${shopSalesFilter()}&order=sold_at.desc`),
      db.select('customer_returns', `select=sale_id,returned_on,total_usd,customer_return_lines(qty,unit_price,articles(id,price_buy))&returned_on=gte.${from}&returned_on=lte.${to}`).catch(() => []),
      db.select('credit_notes', `select=sale_id,total_usd,issued_on&issued_on=gte.${from}&issued_on=lte.${to}`).catch(() => [])
    ]);
    // Coût de chaque article vendu dans chaque facture : sert à remettre le coût des articles retournés
    const costOf = new Map();
    (sales || []).forEach(sale => (sale.sale_lines || []).forEach(l => { if (l.articles) costOf.set(`${sale.id}|${l.articles.id}`, lineCost(l)); }));
    const base = profitOfSales(sales || []);
    let returnValue = 0, returnCost = 0;
    (returns || []).forEach(r => {
      returnValue += Number(r.total_usd) || 0;
      (r.customer_return_lines || []).forEach(l => {
        const key = `${r.sale_id}|${l.articles?.id}`;
        const unitCost = costOf.has(key) ? costOf.get(key) : (Number(l.articles?.price_buy) || 0);
        returnCost += (Number(l.qty) || 0) * unitCost;
      });
    });
    const credits = (notes || []).reduce((t, c) => t + (Number(c.total_usd) || 0), 0);
    const netRevenue = base.revenue - returnValue - credits;
    const netCost = base.cost - returnCost;
    return { sales: sales || [], base, returnValue, returnCost, credits, netRevenue, netCost, netProfit: netRevenue - netCost };
  }

  // Bénéfice brut des six derniers mois (pour le graphique)
  async function monthlyProfit() {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: d.toLocaleDateString('sv-SE').slice(0, 7), label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') };
    });
    const sales = await db.select('sales', `select=id,sold_at,sale_lines(qty,unit_price,unit_cost,articles(price_buy))&sold_at=gte.${months[0].key}-01${shopSalesFilter()}`).catch(() => []);
    return { labels: months.map(m => m.label), values: months.map(m => profitOfSales(sales.filter(s => s.sold_at.slice(0, 7) === m.key)).profit) };
  }

  // Produits et marges : tableau par article ; un clic sur un article affiche son détail.
  async function drawPerformance(from, to, request) {
    if (!from || !to || from > to) throw new Error('Vérifiez les dates : la date de début doit précéder la date de fin.');
    const result = body.querySelector('#report-result');
    if (!result) return;
    const days = Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000) + 1;
    const prevFrom = addDays(from, -days), prevTo = addDays(from, -1);
    const createdFrom = encodeURIComponent(new Date(`${from}T00:00:00`).toISOString());
    const createdTo = encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString());
    const [cur, prev, purchases, adjustments, monthly] = await Promise.all([
      periodFigures(from, to),
      periodFigures(prevFrom, prevTo),
      db.select('purchases', `select=id,number,bought_at,purchase_lines(qty,unit_cost,articles(id,sku,name,unit))&bought_at=gte.${from}&bought_at=lte.${to}${shopFilter('warehouse_id')}&order=bought_at.desc`).catch(() => []),
      db.select('stock_moves', `select=id,article_id,qty,reason,created_at,articles(id,sku,name,unit)&reason=in.(adjustment,client_return)&qty=gt.0&created_at=gte.${createdFrom}&created_at=lte.${createdTo}${shopFilter('warehouse_id')}&order=created_at.desc`).catch(() => []),
      monthlyProfit()
    ]);
    if (request !== sequence) return;

    // Par article : ventes (avec leur facture) et entrées de stock
    const items = new Map();
    const get = a => {
      const key = a.id || a.sku || a.name;
      if (!items.has(key)) items.set(key, { id: key, sku: a.sku || '', name: a.name || '', unit: a.unit || '', qty: 0, revenue: 0, cost: 0, sales: [], entries: [] });
      return items.get(key);
    };
    cur.sales.forEach(sale => (sale.sale_lines || []).forEach(line => {
      if (!line.articles) return;
      const row = get(line.articles);
      const qty = Number(line.qty) || 0, price = Number(line.unit_price) || 0, unitCost = lineCost(line);
      row.qty += qty; row.revenue += qty * price; row.cost += qty * unitCost;
      row.sales.push({ date: sale.sold_at, number: sale.number || '—', qty, price, amount: qty * price, profit: qty * (price - unitCost), collected: sale.paid != null });
    }));
    (purchases || []).forEach(p => (p.purchase_lines || []).forEach(line => {
      if (!line.articles) return;
      get(line.articles).entries.push({ date: p.bought_at, source: 'Achat', number: p.number || '—', qty: Number(line.qty) || 0, unitCost: Number(line.unit_cost) || 0 });
    }));
    (adjustments || []).forEach(move => {
      if (!move.articles) return;
      get(move.articles).entries.push({ date: (move.created_at || '').slice(0, 10), source: move.reason === 'client_return' ? 'Retour client' : 'Ajustement positif', number: '—', qty: Number(move.qty) || 0, unitCost: 0 });
    });

    const rows = [...items.values()].map(r => ({ ...r, margin: r.revenue - r.cost, pct: pct(r.revenue - r.cost, r.revenue), loss: r.revenue - r.cost < 0 }))
      .sort((x, y) => y.margin - x.margin);
    // Top 80 % : les premiers articles qui font 80 % du bénéfice positif
    const positive = rows.reduce((t, r) => t + Math.max(r.margin, 0), 0);
    let running = 0, top80 = 0;
    rows.forEach(r => { r.top = false; if (r.margin > 0 && running < 0.8 * positive) { r.top = true; running += r.margin; top80++; } });

    // Clients
    const clients = new Map();
    cur.sales.forEach(sale => {
      const name = sale.customers?.name || sale.customer_label || 'Client comptoir';
      const revenue = (sale.sale_lines || []).reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
      const profit = profitOfSales([sale]).profit;
      const c = clients.get(name) || { name, revenue: 0, profit: 0, count: 0 };
      c.revenue += revenue; c.profit += profit; c.count += 1;
      clients.set(name, c);
    });
    const clientRows = [...clients.values()].sort((x, y) => y.profit - x.profit);

    const evolution = prev.netProfit ? (cur.netProfit - prev.netProfit) / Math.abs(prev.netProfit) * 100 : null;
    const byId = new Map(rows.map(r => [r.id, r]));
    const best = rows.find(r => r.margin > 0);
    const losers = rows.filter(r => r.loss).length;

    const detail = row => {
      const entered = row.entries.reduce((t, e) => t + e.qty, 0);
      const entriesHtml = row.entries.length
        ? `<div class="tw"><table><thead><tr><th>Date</th><th>Origine</th><th>N°</th><th class="r">Quantité</th><th class="r">Coût unitaire</th></tr></thead><tbody>${row.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).map(e => `<tr><td>${fr(e.date)}</td><td>${esc(e.source)}</td><td>${esc(e.number)}</td><td class="r">${n(e.qty)} ${esc(row.unit)}</td><td class="r">${e.unitCost ? usdOnly(e.unitCost) : '—'}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Aucune entrée de stock sur cette période.</p>';
      const salesHtml = row.sales.length
        ? `<div class="tw"><table><thead><tr><th>Date</th><th>Facture</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Montant</th><th class="r">Bénéfice</th></tr></thead><tbody>${row.sales.map(s => `<tr><td>${fr(String(s.date).slice(0, 10))}</td><td>${esc(s.number)}</td><td class="r">${n(s.qty)} ${esc(row.unit)}</td><td class="r">${usdOnly(s.price)}</td><td class="r">${usdOnly(s.amount)}</td><td class="r">${usdOnly(s.profit)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Aucune vente sur cette période.</p>';
      return `<section class="card report-section perf-detail"><h2>${esc(row.name)}${row.sku ? ` <span class="muted">(${esc(row.sku)})</span>` : ''}</h2>
        <div class="kpis">${kpi('Entré sur la période', n(entered) + ' ' + esc(row.unit), 'achats et ajustements', 'stock', 't-blue')}${kpi('Vendu', n(row.qty) + ' ' + esc(row.unit), usdOnly(row.revenue) + ' de ventes', 'chart', 't-green')}${kpi('Bénéfice réalisé', usdOnly(row.margin), `${n(row.pct)} % de marge`, 'chart', row.loss ? 't-orange' : 't-green')}</div>
        <h3>Entrées de stock</h3>${entriesHtml}
        <h3>Ventes</h3>${salesHtml}</section>`;
    };

    const delta = evolution === null ? '—' : `${evolution >= 0 ? '+' : ''}${n(evolution)} %`;
    result.innerHTML = `<p class="report-range">${fr(from)} au ${fr(to)} · comparé à ${fr(prevFrom)} au ${fr(prevTo)}</p>
      <div class="kpis">
        ${kpi('Bénéfice net', usdOnly(cur.netProfit), `${n(pct(cur.netProfit, cur.netRevenue))} % du CA net`, 'chart', cur.netProfit >= 0 ? 't-green' : 't-orange')}
        ${kpi('Bénéfice encaissé', usdOnly(cur.base.collected), 'part des ventes déjà payée', 'coins', 't-blue')}
        ${kpi('Évolution du bénéfice net', delta, `période précédente : ${usdOnly(prev.netProfit)}`, 'chart', evolution === null || evolution >= 0 ? 't-green' : 't-orange')}
        ${kpi('Articles à perte', n(losers), losers ? 'à revoir' : 'aucun', 'chart', losers ? 't-orange' : 't-green')}
      </div>
      <section class="card report-section"><h2>Du chiffre d’affaires au bénéfice net</h2>
        <div class="tw"><table><thead><tr><th>Élément</th><th class="r">Montant</th></tr></thead><tbody>
          <tr><td>Ventes facturées</td><td class="r">${usdOnly(cur.base.revenue)}</td></tr>
          <tr><td>Retours clients</td><td class="r">− ${usdOnly(cur.returnValue)}</td></tr>
          <tr><td>Avoirs</td><td class="r">− ${usdOnly(cur.credits)}</td></tr>
          <tr><td><b>Chiffre d’affaires net</b></td><td class="r"><b>${usdOnly(cur.netRevenue)}</b></td></tr>
          <tr><td>Coût des articles vendus (net des retours)</td><td class="r">− ${usdOnly(cur.netCost)}</td></tr>
          <tr><td><b>Bénéfice net</b></td><td class="r"><b>${usdOnly(cur.netProfit)}</b></td></tr>
        </tbody></table></div>
        <p class="muted">Bénéfice facturé brut : ${usdOnly(cur.base.profit)} · encaissé : ${usdOnly(cur.base.collected)}. Les avoirs réduisent le chiffre d’affaires sans changer le coût.</p></section>
      <section class="card report-section"><h2>Bénéfice brut par mois (six derniers mois)</h2>${barSvg(monthly.values, monthly.labels)}</section>
      <div id="perf-detail-zone"></div>
      <section class="card report-section"><h2>Articles : ventes et bénéfice</h2>
        <p class="muted">${top80 ? `${top80} article(s) font 80 % du bénéfice (surlignés). ` : ''}${losers ? `${losers} article(s) vendu(s) à perte (en orange). ` : ''}Cliquez sur un article pour voir ses entrées et ses ventes.</p>
        ${rows.length ? `<div class="tw"><table><thead><tr><th>Référence</th><th>Article</th><th class="r">Quantité vendue</th><th class="r">Chiffre d’affaires</th><th class="r">Coût</th><th class="r">Bénéfice</th><th class="r">Marge %</th></tr></thead><tbody>${rows.map(r => `<tr class="perf-row${r.loss ? ' perf-loss' : ''}${r.top ? ' perf-top' : ''}" data-art="${esc(r.id)}" tabindex="0"><td>${esc(r.sku || '—')}</td><td>${esc(r.name)}${r.loss ? ' <span class="pill bad">À perte</span>' : ''}</td><td class="r">${n(r.qty)} ${esc(r.unit)}</td><td class="r">${usdOnly(r.revenue)}</td><td class="r">${usdOnly(r.cost)}</td><td class="r">${usdOnly(r.margin)}</td><td class="r">${n(r.pct)} %</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune vente sur cette période.</p>'}
      </section>
      <section class="card report-section"><h2>Bénéfice par client</h2>${clientRows.length ? `<div class="tw"><table><thead><tr><th>Client</th><th class="r">Factures</th><th class="r">Chiffre d’affaires</th><th class="r">Bénéfice</th></tr></thead><tbody>${clientRows.map(c => `<tr><td>${esc(c.name)}</td><td class="r">${n(c.count)}</td><td class="r">${usdOnly(c.revenue)}</td><td class="r">${usdOnly(c.profit)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune vente sur cette période.</p>'}</section>
      <p class="muted">Le coût est figé au moment de chaque vente. Les ventes antérieures à cette mise à jour utilisent le prix d’achat actuel de l’article.</p>`;

    const zone = result.querySelector('#perf-detail-zone');
    const open = id => { const row = byId.get(id); if (row) zone.innerHTML = detail(row); zone.scrollIntoView?.({ block: 'nearest' }); };
    result.querySelectorAll('.perf-row').forEach(tr => {
      tr.onclick = () => open(tr.dataset.art);
      tr.onkeydown = e => { if (e.key === 'Enter') open(tr.dataset.art); };
    });
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
      else if (active === 'performance') await drawPerformance(body.querySelector('#report-from').value, body.querySelector('#report-to').value, request);
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
    if (event.target.closest('[data-whatsapp-report]')) shareReportWhatsApp();
    if (event.target.closest('[data-export-report]')) exportReport();
  });
  renderFilters();
  await refresh();
}
