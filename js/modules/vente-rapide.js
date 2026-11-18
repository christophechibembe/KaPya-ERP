// Vente rapide : seul le panier défile sur ordinateur. Les RPC métier restent partagés avec les factures.
import { db, newId, session, takeInvoiceNumber } from '../api.js';
import { esc, n, usdOnly, notify, getRate, fmtDate, articleLabel, attachCombo, unitLabel, openScanner, unknownCodeMessage, scanGuard, askConfirm, findArticle, matchArticle, ico } from '../ui.js';
import { listeOuErreur } from '../ui.js';
import { searchArticles } from '../localdb.js';
import { loadShops } from '../shops.js';
import { can } from '../roles.js';
import { cartTotal, stockAllows, netPrice, lineTotal, round2 } from '../sale-math.js';
import { pendingCount, rejectedItems } from '../api.js';
import { validatePayment, OPERATORS, depositApplied, settle, validateDeposit } from '../payment-rules.js';
import { receiptHtml } from '../receipt.js';
import { printHtml } from '../print.js';
import { companyLogo } from '../print.js';
import { localDay } from '../dates.js';
import { loadCart, saveCart, recentCustomers, rememberCustomer } from '../cart-store.js';

const PAY_MODES = [['cash', 'Espèces'], ['mobile_money', 'Mobile money'], ['bank', 'Virement'], ['credit', 'Acompte / crédit']];
const PAY_METHODS = [['cash', 'Espèces'], ['mobile_money', 'Mobile money'], ['bank', 'Virement']];

export async function render(main, ctx) {
  main._venteEvents?.abort();
  const events = new AbortController();
  main._venteEvents = events;
  const viewToken = Symbol('vente');
  main._venteToken = viewToken;
  const role = ctx?.role;
  const [articles, customers, shops, profile, mine] = await Promise.all([
    listeOuErreur(db.select('articles', 'select=id,sku,name,unit,price_sell,barcode,unit_weight&archived_at=is.null&order=name'), 'les produits'),
    listeOuErreur(db.select('customers', 'select=id,name,phone&order=name'), 'les clients'),
    loadShops(),
    db.select('profiles', `select=organizations(discounts_enabled,barcode_enabled)&id=eq.${session().uid}`).catch(() => []),
    db.select('user_warehouses', `select=warehouse_id&user_id=eq.${session().uid}`).catch(() => [])
  ]);
  if (main._venteToken !== viewToken || !main.isConnected || (main.dataset.page && main.dataset.page !== 'vente')) return;
  main.dataset.page = 'vente';
  const discountsOn = !!profile?.[0]?.organizations?.discounts_enabled;
  const barOn = !!profile?.[0]?.organizations?.barcode_enabled;
  // Un facturier ne peut sélectionner que ses dépôts affectés, même si la liste générale est plus large.
  const allowedShops = role === 'facturier' ? shops.filter(s => mine.some(w => w.warehouse_id === s.id)) : shops;
  const defaultShop = allowedShops.find(s => s.is_default)?.id || allowedShops[0]?.id || '';
  const uid = session().uid;
  const cart = loadCart(uid);
  const recent = recentCustomers(uid);
  customers.sort((a, b) => (recent.indexOf(a.id) < 0 ? 99 : recent.indexOf(a.id)) - (recent.indexOf(b.id) < 0 ? 99 : recent.indexOf(b.id)));
  let mode = 'cash';
  let lastSale = null;
  let custOpen = false;
  let saving = false, adding = false, printing = false;
  let stockLoading = false, stockError = '', stockToken = 0;
  let deposits = [], depAuto = true, depToken = 0, depositsLoading = false;

  const net = l => netPrice(l.price, discountsOn ? l.discount : 0);
  const total = () => cartTotal(cart.map(l => ({ qty: l.qty, price: net(l) })));

  main.innerHTML = `<div class="page-head vr-page-head"><div class="vr-heading"><span class="vr-heading-icon">${ico('cart')}</span><div><h1>Vente rapide</h1><p class="sub">Recherchez un article, ajoutez-le au panier et enregistrez la vente.</p></div></div>
      <div class="acts"><a class="lnk" href="guide.html#s4" target="_blank" rel="noopener">Aide</a> <a class="lnk" href="#/facture">Vente avancée</a></div></div>
    <section class="vr-pos" aria-label="Saisie de la vente">
      <fieldset class="vr-fields" id="vr-fields">
        <legend class="sr">Articles, client et paiement</legend>
        <label class="vr-wh">${ico('warehouse')}<span class="sr">Dépôt de sortie</span><select id="vr-wh" ${allowedShops.length < 2 ? 'disabled' : ''}>${allowedShops.length ? allowedShops.map(s => `<option value="${esc(s.id)}"${s.id === defaultShop ? ' selected' : ''}>${esc(s.name)}</option>`).join('') : '<option value="">Aucun dépôt autorisé</option>'}</select></label>
        <div class="vr-entry">
          <div class="vr-prodrow">
            <label class="vr-search"><span class="sr">Rechercher un article</span><span class="vr-search-icon">${ico('search')}</span><input id="vr-prod" type="search" placeholder="Rechercher un article (nom, référence ou code-barres)…" autocomplete="off"></label>
            <div class="vr-qtyin"><span class="vr-qlabel">Qté</span><div class="vr-step"><button type="button" class="vr-sbtn" id="vr-qmin" aria-label="Diminuer la quantité">−</button><input id="vr-qty" type="number" min="0.001" step="0.001" value="1" inputmode="decimal" aria-label="Quantité à ajouter"><button type="button" class="vr-sbtn" id="vr-qplus" aria-label="Augmenter la quantité">+</button></div></div>
            <button class="btn vr-add" id="vr-add" type="button">${ico('plus')} Ajouter</button>
          </div>
          <p class="vr-stock muted" id="vr-stock" aria-live="polite"></p>
        </div>
        <div id="vr-cart" class="vr-cart" tabindex="0" role="region" aria-label="Articles du panier">
          <table class="vr-table"><colgroup><col class="vr-col-name"><col class="vr-col-price"><col class="vr-col-qty"><col class="vr-col-sub"><col class="vr-col-del"></colgroup>
            <thead><tr><th scope="col">Article</th><th scope="col">Prix unitaire</th><th scope="col">Quantité</th><th scope="col" class="r">Sous-total</th><th scope="col"><span class="sr">Supprimer</span></th></tr></thead>
            <tbody id="vr-lines"></tbody>
          </table>
        </div>
        <div class="vr-total-row">
          <div class="vr-cart-tools"><button class="ghost vr-clear" id="vr-clear" type="button" title="Vider le panier" aria-label="Vider le panier" hidden>${ico('trash')}</button><span class="muted" id="vr-sum-count"></span></div>
          <div class="vr-total"><span>Total</span><b id="vr-total" aria-live="polite">${usdOnly(0)}</b></div>
        </div>
        <div class="vr-details">
          <section class="vr-panel vr-client" aria-labelledby="vr-client-title">
            <div class="vr-client-heading">
              <h2 id="vr-client-title">${ico('users')} Client <small>(facultatif)</small></h2>
              <button class="lnk vr-cust-toggle" id="vr-cust-toggle" type="button" aria-expanded="false" title="Choisir un client enregistré">+ Client enregistré</button>
            </div>
            <label id="vr-name-wrap"><span class="sr">Nom du client (facultatif)</span><input id="vr-cname" type="text" maxlength="120" placeholder="Nom du client ou laisser vide : Client comptoir" autocomplete="off"></label>
            <div id="vr-cust-wrap" class="vr-custwrap" hidden>
              <label><span class="sr">Rechercher un client enregistré</span><input id="vr-cust-search" type="search" placeholder="Nom ou téléphone…" autocomplete="off"></label>
              <label><span class="sr">Client enregistré</span><select id="vr-cust"><option value="">Choisir un client enregistré…</option>${customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.phone ? ` · ${esc(c.phone)}` : ''}</option>`).join('')}</select></label>
            </div>
            <div class="vr-client-footer">
              <label class="vr-pickup"><input type="checkbox" id="vr-pickup"> À retirer en boutique</label>
              <button class="lnk vr-dep-open" id="vr-dep-open" type="button" aria-controls="vr-payment-options" hidden>Acomptes disponibles</button>
            </div>
          </section>
          <section class="vr-panel vr-payment" aria-labelledby="vr-payment-title">
            <div class="vr-payment-heading">
              <h2 id="vr-payment-title">${ico('card')} Paiement et acompte</h2>
              <button class="lnk vr-options-open" id="vr-options-open" type="button" aria-controls="vr-payment-options">Détails</button>
            </div>
            <div class="vr-payment-grid">
              <label class="vr-mode-field"><span class="sr">Mode de paiement</span><select id="vr-mode">${PAY_MODES.map(([v, l]) => `<option value="${v}"${v === mode ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            </div>
            <dl class="vr-settlement">
              <div id="vr-sum-dep-row" hidden><dt title="Acompte client imputé">Acompte</dt><dd id="vr-sum-dep">0</dd></div>
              <div><dt id="vr-now-label">À encaisser</dt><dd id="vr-sum-now">0</dd></div>
              <div class="vr-balance"><dt title="Reste à payer">Reste dû</dt><dd id="vr-sum-rest">0</dd></div>
            </dl>
          </section>
        </div>
        <div class="vr-status">
          <p class="err" id="vr-err" role="alert"></p>
          <div class="vr-statusline">
            <p id="vr-zero-warning" class="vr-zero-warning" role="status" hidden></p>
            <p class="vr-lastitem muted" id="vr-lastitem" aria-live="polite"></p>
            <p class="vr-last muted" id="vr-last" aria-live="polite"></p>
            <p class="vr-offline" id="vr-offline" hidden>Hors connexion : vente conservée sur cet appareil, puis synchronisée.</p>
            <p class="vr-restored" id="vr-restored" hidden>Panier restauré.</p>
            <p class="vr-queue" id="vr-queue" aria-live="polite" hidden></p>
          </div>
        </div>
        <dialog class="vr-options" id="vr-payment-options" aria-labelledby="vr-options-title">
          <h2 id="vr-options-title">Détails du règlement</h2>
          <p class="muted vr-payment-hint" id="vr-payment-hint">Paiement intégral. Pour un versement partiel, choisissez « Acompte / crédit ».</p>
          <p class="err" id="vr-options-error" role="alert"></p>
          <div class="vr-option-grid">
            <div class="vr-option-mode"><span>Mode de paiement</span><b id="vr-options-mode">Espèces</b></div>
            <div id="vr-ref-wrap" class="vr-ref" hidden>
              <label id="vr-op-wrap">Opérateur<select id="vr-op"><option value="">— choisir —</option>${OPERATORS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
              <label>Référence de la transaction<input id="vr-ref" type="text" maxlength="80" placeholder="Numéro de transaction"></label>
            </div>
            <div id="vr-adv-wrap" class="vr-advance-fields" hidden>
              <label class="vr-paid-field">Acompte reçu maintenant<input id="vr-paid" type="number" min="0" step="0.01" value="0" inputmode="decimal" aria-label="Acompte reçu maintenant"></label>
              <label class="vr-amode-field">Mode de réception<select id="vr-amode">${PAY_METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
              <label id="vr-aop-wrap" hidden>Opérateur<select id="vr-aop"><option value="">— choisir —</option>${OPERATORS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
              <label id="vr-aref-wrap" hidden>Référence de l’acompte<input id="vr-aref" type="text" maxlength="80" placeholder="Numéro de transaction"></label>
            </div>
          </div>
          <div id="vr-dep" class="vr-dep" hidden>
            <label>Acompte déjà déposé<select id="vr-dep-sel"><option value="">Ne pas utiliser d’acompte</option></select></label>
            <div class="vr-dep-grid">
              <label>Montant à imputer<input id="vr-dep-amt" type="number" min="0" step="0.01" value="0" inputmode="decimal"></label>
              <div class="vr-dep-info"><span>Disponible <b id="vr-dep-avail">0</b></span><span>Après utilisation <b id="vr-dep-left">0</b></span></div>
            </div>
          </div>
          <p id="vr-dep-hint" class="muted" aria-live="polite"></p>
          <dl class="vr-options-summary">
            <div><dt>Total</dt><dd id="vr-options-total">0</dd></div>
            <div><dt>Couvert par acompte</dt><dd id="vr-options-deposit">0</dd></div>
            <div><dt>Reste à payer</dt><dd id="vr-options-rest">0</dd></div>
          </dl>
          <div class="row"><button class="btn" id="vr-options-done" type="button">Terminer</button></div>
        </dialog>
      </fieldset>
      <div class="vr-actions" role="region" aria-label="Actions de la vente">
        <button class="btn vr-save" id="vr-save" type="button">${ico('check')}<span id="vr-save-label">Enregistrer la vente</span></button>
        <button class="ghost vr-print" id="vr-print" type="button" title="Enregistrer la vente puis imprimer son reçu"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7z"/></svg><span id="vr-print-label">Imprimer</span></button>
      </div>
    </section>`;

  const $ = id => main.querySelector('#' + id);
  const active = () => main.isConnected && main._venteToken === viewToken && main.contains(err);
  const err = $('vr-err');
  // Les messages longs restent consultables sans agrandir la ligne réservée.
  const errorTitle = new MutationObserver(() => { err.title = err.textContent; });
  errorTitle.observe(err, { childList: true, characterData: true, subtree: true });
  events.signal.addEventListener('abort', () => errorTitle.disconnect(), { once: true });
  const paymentOptions = $('vr-payment-options');
  function openPaymentOptions(focusId = '', message = '') {
    if (saving || !active()) return;
    $('vr-options-error').textContent = message;
    if (!paymentOptions.open) paymentOptions.showModal();
    const target = focusId && $(focusId);
    if (target && !target.disabled && target.getClientRects().length) target.focus();
  }
  $('vr-options-open').addEventListener('click', () => openPaymentOptions(mode === 'credit' ? 'vr-paid' : mode === 'mobile_money' ? 'vr-op' : mode === 'bank' ? 'vr-ref' : 'vr-options-done'));
  $('vr-dep-open').addEventListener('click', () => openPaymentOptions('vr-dep-sel'));
  $('vr-options-done').addEventListener('click', () => paymentOptions.close());
  paymentOptions.addEventListener('input', () => { $('vr-options-error').textContent = ''; });
  events.signal.addEventListener('abort', () => { if (paymentOptions.open) paymentOptions.close(); }, { once: true });
  const whSel = $('vr-wh');
  const warehouse = () => (whSel ? whSel.value : defaultShop) || null;
  // Stock du dépôt de sortie (et non le total de toutes les boutiques) : sert à la vérification affichée et au panier
  let whStock = {};
  const stockFor = a => (whStock[a.id] ?? 0);
  async function loadWhStock() {
    const token = ++stockToken;
    const wh = warehouse();
    stockLoading = true;
    stockError = '';
    whStock = {};
    stockLine();
    try {
      if (!allowedShops.some(s => s.id === wh)) throw new Error('Aucun dépôt de sortie autorisé. Vérifiez vos affectations.');
      const rows = await db.select('warehouse_stock', `select=article_id,qty&warehouse_id=eq.${wh}`);
      if (token !== stockToken || !active()) return;
      whStock = Object.fromEntries(rows.map(r => [r.article_id, Number(r.qty) || 0]));
    } catch (error) {
      if (token !== stockToken || !active()) return;
      stockError = error?.message || 'Impossible de vérifier le stock de ce dépôt.';
    } finally {
      if (token === stockToken && active()) {
        stockLoading = false;
        cart.forEach(l => { l.stock = whStock[l.article_id] ?? 0; });
        checkStock();
        stockLine();
        saveCart(uid, cart);
      }
    }
  }
  whSel.addEventListener('change', loadWhStock);

  function checkStock() {
    const short = cart.find(l => !stockAllows(l.qty, l.stock));
    err.textContent = stockError || (short && !stockLoading ? `Stock insuffisant pour ${short.name} (disponible : ${n(short.stock)}).` : '');
  }
  function updateTotals() {
    saveCart(uid, cart);
    const units = cart.reduce((t, l) => t + (Number(l.qty) || 0), 0);
    $('vr-sum-count').textContent = `${cart.length} article${cart.length > 1 ? 's' : ''} · ${n(units)} unité${units > 1 ? 's' : ''}`;
    $('vr-sum-count').hidden = !cart.length;
    $('vr-clear').hidden = !cart.length;
    $('vr-total').textContent = usdOnly(total());
    updateZeroWarning();
    $('vr-print').title = cart.length ? 'Enregistrer la vente puis imprimer son reçu' : lastSale ? 'Réimprimer la dernière vente, sans créer une nouvelle vente' : 'Ajoutez des articles pour enregistrer et imprimer';
    updateDeposit(true);
  }
  const zeroPriceLines = () => cart.filter(l => net(l) === 0);
  function updateZeroWarning() {
    const zero = zeroPriceLines();
    const warning = $('vr-zero-warning');
    warning.hidden = !zero.length;
    warning.textContent = zero.length ? `Attention : ${zero.length === 1 ? '1 article a un prix nul' : `${zero.length} articles ont un prix nul`}. Confirmation requise.` : '';
    warning.title = zero.map(l => l.name).join(' · ');
    $('vr-lines').querySelectorAll('[data-zero]').forEach(label => { label.hidden = net(cart[Number(label.dataset.zero)]) !== 0; });
  }

  // Acompte client existant : seulement pour un client enregistré (son solde doit rester suivi).
  const depSelected = () => deposits.find(d => d.id === $('vr-dep-sel')?.value) || null;
  async function loadDeposits() {
    const token = ++depToken;
    const cid = $('vr-cust').value;
    deposits = [];
    depositsLoading = !!cid;
    $('vr-dep-sel').innerHTML = '<option value="">Ne pas utiliser d’acompte</option>';
    $('vr-dep-amt').value = 0;
    depAuto = true;
    updateDeposit();
    $('vr-dep-hint').textContent = cid ? 'Chargement des acomptes…' : '';
    try {
      const rows = cid ? await db.select('customer_deposits', `select=id,receipt_number,remaining,received_at&customer_id=eq.${cid}&remaining=gt.0&order=received_at.asc`) : [];
      if (token !== depToken || !active()) return;
      deposits = (rows || []).filter(d => Number(d.remaining) > 0.005);
      $('vr-dep-sel').innerHTML += deposits.map(d => `<option value="${esc(d.id)}">${esc(d.receipt_number)} · ${usdOnly(Number(d.remaining))}</option>`).join('');
      $('vr-dep-hint').textContent = cid && !deposits.length ? 'Ce client n’a pas d’acompte disponible.' : '';
    } catch {
      if (token !== depToken || !active()) return;
      $('vr-dep-hint').textContent = 'Acomptes indisponibles. Aucun acompte ne sera utilisé.';
    } finally {
      if (token === depToken && active()) { depositsLoading = false; updateDeposit(); }
    }
  }
  // Affiche le bloc acompte, le montant imputé (borné) et les soldes. Recalcule à chaque changement de panier ou de mode.
  function updateDeposit(clamp = false) {
    const dep = depSelected();
    $('vr-dep').hidden = !($('vr-cust').value && deposits.length);
    $('vr-dep-open').hidden = !($('vr-cust').value && deposits.length);
    $('vr-dep-open').textContent = `Acomptes (${deposits.length})`;
    const t = total();
    if (dep && depAuto) $('vr-dep-amt').value = String(Math.min(Number(dep.remaining), t));
    const applied = dep ? depositApplied({ total: t, requested: $('vr-dep-amt').value, available: dep.remaining }) : 0;
    main.querySelector('.vr-pos').dataset.deposit = applied > 0 ? 'yes' : 'no';
    if (clamp && !$('vr-dep-amt').validity.badInput && Number($('vr-dep-amt').value) >= 0) $('vr-dep-amt').value = String(applied);
    $('vr-dep-amt').disabled = !dep;
    $('vr-dep-amt').max = String(Math.min(Number(dep?.remaining) || 0, t));
    const st = settle({ total: t, deposit: applied, mode, advance: mode === 'credit' ? $('vr-paid').value : 0 });
    $('vr-dep-avail').textContent = usdOnly(dep ? Number(dep.remaining) : 0);
    $('vr-dep-left').textContent = usdOnly(dep ? Math.max(0, Number(dep.remaining) - applied) : 0);
    $('vr-sum-dep-row').hidden = applied <= 0;
    $('vr-sum-dep').textContent = usdOnly(applied);
    $('vr-sum-now').textContent = usdOnly(st.paidNow);
    $('vr-sum-rest').textContent = usdOnly(st.rest);
    $('vr-sum-rest').classList.toggle('vr-due', st.rest > 0);
    $('vr-now-label').textContent = mode === 'credit' ? 'Versé' : 'À encaisser';
    $('vr-paid').max = String(Math.max(0, round2(t - applied)));
    $('vr-options-total').textContent = usdOnly(t);
    $('vr-options-deposit').textContent = usdOnly(applied);
    $('vr-options-rest').textContent = usdOnly(st.rest);
  }

  function draw() {
    const box = $('vr-cart');
    const scroll = box.scrollTop;
    const focused = box.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.getAttributeNames().find(k => /^data-(minus|plus|price|qty|disc|del)$/.test(k));
    $('vr-lines').innerHTML = cart.length ? cart.map((l, i) => {
      const a = articles.find(a => a.id === l.article_id);
      return `<tr class="vr-line">
        <td data-label="Article"><div class="vr-name"><b>${esc(l.name)}</b><span class="muted">${a?.sku ? `Réf. : ${esc(a.sku)} · ` : ''}${esc(unitLabel(l.unit) || 'pièce')}<span data-weight="${i}">${l.unit_weight ? ` · ${n(l.qty * l.unit_weight)} kg` : ''}</span></span></div></td>
        <td data-label="Prix unitaire"><label class="vr-pr"><input type="number" min="0" step="0.01" value="${esc(l.price)}" data-price="${i}" inputmode="decimal" aria-label="Prix unitaire de ${esc(l.name)}"><span>$</span></label><small class="vr-zero-price" data-zero="${i}"${net(l) === 0 ? '' : ' hidden'}>Prix à 0</small>${discountsOn ? `<label class="vr-disc">Remise %<input type="number" min="0" max="100" step="any" value="${esc(l.discount || 0)}" data-disc="${i}" aria-label="Remise sur ${esc(l.name)}"></label>` : ''}</td>
        <td data-label="Quantité"><div class="vr-qty"><button class="ghost" data-minus="${i}" type="button" aria-label="Diminuer la quantité de ${esc(l.name)}">−</button><input type="number" min="0.001" step="0.001" value="${esc(l.qty)}" data-qty="${i}" inputmode="decimal" aria-label="Quantité de ${esc(l.name)}"><button class="ghost" data-plus="${i}" type="button" aria-label="Augmenter la quantité de ${esc(l.name)}">+</button></div></td>
        <td data-label="Sous-total" class="vr-sub" data-sub="${i}">${usdOnly(lineTotal(l.qty, net(l)))}</td>
        <td class="vr-delete-cell"><button class="lnk vr-delete" data-del="${i}" type="button" aria-label="Supprimer ${esc(l.name)}">${ico('trash')}</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="vr-empty">Aucun article ajouté</td></tr>';
    box.scrollTop = scroll;
    if (focusKey) box.querySelector(`[${focusKey}="${focused.getAttribute(focusKey)}"]`)?.focus({ preventScroll: true });
    updateTotals();
    checkStock();
  }

  // Mise à jour sans recréer les champs : la saisie et la position du panier ne sautent pas.
  $('vr-lines').addEventListener('input', e => {
    if (saving) return;
    const input = e.target;
    const key = ['price', 'qty', 'disc'].find(k => input.dataset[k] != null);
    if (!key) return;
    const l = cart[Number(input.dataset[key])];
    const value = Number(input.value);
    if (!l || input.value === '' || !input.validity.valid || !Number.isFinite(value)) return;
    l[key === 'disc' ? 'discount' : key] = value;
    $('vr-lines').querySelector(`[data-sub="${input.dataset[key]}"]`).textContent = usdOnly(lineTotal(l.qty, net(l)));
    $('vr-lines').querySelector(`[data-weight="${input.dataset[key]}"]`).textContent = l.unit_weight ? ` · ${n(l.qty * l.unit_weight)} kg` : '';
    updateTotals();
    checkStock();
  });
  $('vr-lines').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b || saving) return;
    const key = ['minus', 'plus', 'del'].find(k => b.dataset[k] != null);
    if (!key) return;
    const line = cart[Number(b.dataset[key])];
    if (!line) return;
    if (key === 'del') {
      if (!(await askConfirm(`Retirer « ${line.name} » (${n(line.qty)}) du panier ?`)) || saving || !active()) return;
      const index = cart.indexOf(line);
      if (index < 0) return;
      cart.splice(index, 1);
    } else {
      line.qty = Math.round(Math.max(0.001, Number(line.qty) + (key === 'plus' ? 1 : -1)) * 1000) / 1000;
    }
    draw();
  });
  // Vider le panier (avec confirmation)
  $('vr-clear')?.addEventListener('click', async () => {
    if (!cart.length || saving) return;
    if (!(await askConfirm('Vider tout le panier ? Toutes les lignes seront retirées.')) || saving || !active()) return;
    cart.splice(0, cart.length);
    $('vr-lastitem').textContent = '';
    draw();
  });

  // Ajout : la quantité saisie est toujours prise en compte. Entrée et le scanner ajoutent aussi.
  async function addProduct() {
    if (saving || adding || !active()) return;
    if (stockLoading) { err.textContent = 'Vérification du stock en cours…'; return; }
    if (stockError) { err.textContent = stockError; return; }
    const field = $('vr-prod');
    const text = field.value;
    const quantity = $('vr-qty');
    if (!quantity.value || !quantity.validity.valid || !Number.isFinite(Number(quantity.value))) {
      err.textContent = 'Saisissez une quantité positive (au moins 0,001).'; quantity.focus(); return;
    }
    const q = Math.round(Number(quantity.value) * 1000) / 1000;
    adding = true;
    try {
      const a = await findArticle(articles, text, barOn);
      if (saving || !active()) return;
      if (!a) { err.textContent = unknownCodeMessage(text); return; }
      err.textContent = '';
      field.value = '';
      $('vr-qty').value = 1;
      const line = cart.find(l => l.article_id === a.id);
      if (line) line.qty = Math.round((Number(line.qty) + q) * 1000) / 1000;
      else cart.push({ article_id: a.id, name: a.name, unit: a.unit, unit_weight: Number(a.unit_weight) || 0, price: Number(a.price_sell) || 0, qty: q, stock: stockFor(a), discount: 0 });
      db.select('stock_lots', 'select=expiry_date,article_id,qty_left&qty_left=gt.0&order=expiry_date.asc')
        .then(lots => { if (!active()) return; const limit = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10); const nearLot = lots.filter(l => l.article_id === a.id && String(l.expiry_date) <= limit).slice(0, 1); if (nearLot[0]) notify(`Attention : un lot de ${a.name} périme le ${fmtDate(String(nearLot[0].expiry_date))}. La vente reste possible.`); })
        .catch(() => {});
      const undo = () => {
        if (saving) return;
        const i = cart.findIndex(l => l.article_id === a.id);
        if (i < 0) return;
        if (line) cart[i].qty = Math.round(Math.max(0, cart[i].qty - q) * 1000) / 1000;
        if (!line || cart[i].qty <= 0) cart.splice(i, 1);
        draw();
      };
      showAdded(`${a.name} × ${q}`, undo);
      draw(); field.focus();
      stockLine();
    } catch (error) {
      if (active()) err.textContent = error?.message || 'Impossible d’ajouter cet article.';
    } finally { adding = false; }
  }
  $('vr-add').addEventListener('click', addProduct);
  // Message « Ajouté » avec bouton Annuler pendant 6 secondes : corrige un ajout fait par erreur
  let addedTimer = 0;
  function showAdded(label, undo) {
    const box = $('vr-lastitem');
    box.innerHTML = `Ajouté : ${esc(label)} <button class="lnk vr-undo" id="vr-undo" type="button">Annuler</button>`;
    clearTimeout(addedTimer);
    addedTimer = setTimeout(() => { box.textContent = ''; }, 6000);
    $('vr-undo').onclick = () => { undo(); box.textContent = ''; clearTimeout(addedTimer); };
  }
  const stepQuantity = delta => { const q = $('vr-qty'); q.value = String(Math.round(Math.max(0.001, (Number(q.value) || 0) + delta) * 1000) / 1000); };
  $('vr-qplus').addEventListener('click', () => stepQuantity(1));
  $('vr-qmin').addEventListener('click', () => stepQuantity(-1));
  // Le choix utilise l'identifiant, jamais le nom (deux clients peuvent être homonymes).
  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  $('vr-cust-search').addEventListener('input', () => {
    const query = norm($('vr-cust-search').value.trim());
    [...$('vr-cust').options].forEach(option => {
      option.hidden = !!option.value && !norm(option.textContent).includes(query);
    });
  });
  if (barOn) {
    const sb = document.createElement('button');
    sb.type = 'button'; sb.className = 'ghost scan-btn'; sb.textContent = 'Scanner';
    $('vr-prod').insertAdjacentElement('afterend', sb);
    $('vr-prod').parentElement.classList.add('vr-has-scanner');
    const guard = scanGuard();
    sb.addEventListener('click', () => openScanner(code => { if (!guard(code)) return notify('Code déjà scanné. Relancez Scanner pour ajouter une seconde unité.'); $('vr-prod').value = code; addProduct(); }));
  }
  attachCombo($('vr-prod'), async q => {
    const cached = await searchArticles(q, 40, barOn).catch(() => []);
    const matches = [...articles, ...cached.filter(a => !articles.some(row => row.id === a.id))];
    return matches.map(a => ({ label: articleLabel(a), keys: [a.sku, a.name, barOn ? a.barcode : '', unitLabel(a.unit), articleLabel(a)] }));
  });
  $('vr-prod').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addProduct(); } });
  function stockLine() {
    const box = $('vr-stock');
    if (!box) return;
    if (stockLoading || stockError) {
      box.textContent = stockLoading ? 'Vérification du stock du dépôt…' : stockError;
      box.className = 'vr-stock ' + (stockError ? 'bad' : 'muted');
      return;
    }
    const typed = $('vr-prod').value.trim();
    const a = typed ? matchArticle(articles, typed) : null;
    if (!a) { box.textContent = ''; box.className = 'vr-stock muted'; return; }
    const qty = stockFor(a);
    const unit = unitLabel(a.unit) ? ' ' + unitLabel(a.unit) : '';
    box.className = 'vr-stock ' + (qty > 0 ? 'ok' : 'bad');
    box.textContent = qty > 0 ? `En stock dans ce dépôt : ${n(qty)}${unit}.` : `Rupture dans ce dépôt (0${unit}).`;
  }
  // Stock du dépôt de sortie affiché dès que le produit est choisi (sans l'ajouter au panier)
  $('vr-prod').addEventListener('input', stockLine);
  $('vr-prod').addEventListener('change', stockLine);
  // Entrée dans la quantité : ajout direct, puis retour au champ produit pour le suivant.
  main.addEventListener('keydown', e => {
    if (!active() || document.querySelector('dialog[open],[aria-modal=true]')) return;
    if (e.key === 'F2') { e.preventDefault(); if (cart.length) save(); }
    if (e.key === 'Escape' && document.activeElement === $('vr-prod')) { $('vr-prod').value = ''; stockLine(); }
  }, { signal: events.signal });
  $('vr-qty').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addProduct(); $('vr-prod').focus(); } });

  // Un seul choix de paiement.
  function setMode(v) {
    mode = v;
    $('vr-mode').value = v;
    main.querySelector('.vr-pos').dataset.mode = v;
    $('vr-options-mode').textContent = $('vr-mode').selectedOptions[0]?.textContent || '';
    $('vr-options-open').textContent = v === 'credit' ? 'Saisir l’acompte' : v === 'mobile_money' || v === 'bank' ? 'Référence' : 'Détails';
    $('vr-ref-wrap').hidden = !(v === 'mobile_money' || v === 'bank');
    $('vr-op-wrap').hidden = v !== 'mobile_money';
    $('vr-adv-wrap').hidden = v !== 'credit';
    if (v === 'credit') custOpen = true;
    updateClientFields();
    $('vr-payment-hint').textContent = v === 'credit'
      ? 'Client enregistré obligatoire. Saisissez 0 pour une vente entièrement à crédit.'
      : 'Paiement intégral. Pour un versement partiel, choisissez « Acompte / crédit ».';
    refreshAdvanceRef();
    updateDeposit();
  }
  function updateClientFields() {
    $('vr-cust-wrap').hidden = !custOpen;
    $('vr-name-wrap').hidden = custOpen;
    const button = $('vr-cust-toggle');
    button.disabled = mode === 'credit';
    button.hidden = mode === 'credit';
    button.textContent = mode === 'credit' ? 'Client requis' : custOpen ? 'Client comptoir' : '+ Client enregistré';
    button.title = mode === 'credit' ? 'Un client enregistré est obligatoire pour une vente à crédit' : custOpen ? 'Utiliser un nom libre ou le client comptoir' : 'Choisir un client enregistré';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(custOpen));
    $('vr-client-title').querySelector('small').textContent = mode === 'credit' ? '(requis)' : '(facultatif)';
  }
  function refreshAdvanceRef() {
    const am = $('vr-amode')?.value;
    main.querySelector('.vr-pos').dataset.advanceMode = am;
    if ($('vr-aref-wrap')) $('vr-aref-wrap').hidden = !(am === 'mobile_money' || am === 'bank');
    if ($('vr-aop-wrap')) $('vr-aop-wrap').hidden = am !== 'mobile_money';
  }
  $('vr-mode').addEventListener('change', e => setMode(e.target.value));
  $('vr-cust-toggle').addEventListener('click', () => {
    custOpen = !custOpen;
    if (!custOpen) { $('vr-cust').value = ''; loadDeposits(); }
    updateClientFields();
  });
  $('vr-amode').addEventListener('change', refreshAdvanceRef);
  $('vr-cust').addEventListener('change', loadDeposits);
  $('vr-dep-sel').addEventListener('change', () => { depAuto = true; $('vr-dep-amt').value = 0; updateDeposit(true); });
  $('vr-dep-amt').addEventListener('input', () => { depAuto = false; updateDeposit(); });
  $('vr-dep-amt').addEventListener('change', () => updateDeposit(true));
  $('vr-paid').addEventListener('input', () => updateDeposit());

  async function save({ printAfter = false } = {}) {
    if (saving || printing || !active()) return;
    if (paymentOptions.open) paymentOptions.close();
    err.textContent = '';
    if (!can(role, 'ventes.write')) { err.textContent = 'Vous n’avez pas l’autorisation d’enregistrer une vente.'; return; }
    if (adding || stockLoading || depositsLoading) { err.textContent = 'Patientez : les données de la vente sont en cours de vérification.'; return; }
    if (!cart.length) { err.textContent = 'Ajoutez au moins un produit.'; return; }
    const wh = warehouse();
    if (stockError || !allowedShops.some(s => s.id === wh)) { err.textContent = stockError || 'Choisissez un dépôt de sortie autorisé.'; return; }
    const invalidLine = [...$('vr-lines').querySelectorAll('input')].find(input => input.value === '' || !input.validity.valid || !Number.isFinite(Number(input.value)));
    if (invalidLine || cart.some(l => !Number.isFinite(l.qty) || l.qty <= 0 || !Number.isFinite(l.price) || l.price < 0)) {
      err.textContent = 'Corrigez les lignes : prix positif ou nul, quantité positive et remise entre 0 et 100.';
      invalidLine?.focus({ preventScroll: true }); return;
    }
    if (cart.some(l => !stockAllows(l.qty, l.stock))) { err.textContent = 'Corrigez les quantités : le stock ne suffit pas.'; return; }
    if (!(total() > 0) && zeroPriceLines().length) {
      err.textContent = 'Tous les prix sont à zéro : renseignez au moins un prix avant de valider.';
      $('vr-lines').querySelector('[data-price]')?.focus();
      return;
    }
    const customer = $('vr-cust').value || null;
    const ref = $('vr-ref').value.trim();
    const isCredit = mode === 'credit';
    const dep = depSelected();
    const applied = dep ? depositApplied({ total: total(), requested: $('vr-dep-amt').value, available: dep.remaining }) : 0;
    const requestedAdvance = isCredit ? ($('vr-paid').validity.badInput ? NaN : Number($('vr-paid').value)) : 0;
    if (dep && ($('vr-dep-amt').validity.badInput || Number($('vr-dep-amt').value) < 0)) { err.textContent = 'Saisissez un montant d’acompte valide, positif ou nul.'; return; }
    const st = settle({ total: total(), deposit: applied, mode, advance: requestedAdvance });
    const advance = st.paidNow;
    const amode = $('vr-amode').value;
    const aref = $('vr-aref').value.trim();
    const operator = $('vr-op').value;
    const aoperator = $('vr-aop').value;
    const ruleError = validatePayment({ mode, total: total(), advance: requestedAdvance, deposit: applied, ref, aref, amode, operator, aoperator, customer })
      || validateDeposit({ total: total(), applied, available: dep ? Number(dep.remaining) : 0, customer });
    if (ruleError) {
      err.textContent = ruleError;
      if (isCredit && !customer) $('vr-cust').focus();
      else if (isCredit && requestedAdvance > 0 && (amode === 'mobile_money' || amode === 'bank')) openPaymentOptions(amode === 'mobile_money' && !aoperator ? 'vr-aop' : 'vr-aref', ruleError);
      else if (!isCredit && (mode === 'mobile_money' || mode === 'bank')) openPaymentOptions(mode === 'mobile_money' && !operator ? 'vr-op' : 'vr-ref', ruleError);
      else if (isCredit) openPaymentOptions('vr-paid', ruleError);
      return;
    }
    const typedName = $('vr-cname') ? $('vr-cname').value.trim() : '';
    const cname = customer ? (customers.find(c => c.id === customer)?.name || 'Client') : (typedName || 'Client comptoir');
    const paid = st.paidTotal;
    const saveBtn = $('vr-save');
    const fields = $('vr-fields'), printBtn = $('vr-print');
    const sold = total(), saleMode = mode, pickup = $('vr-pickup').checked;
    const snapshot = cart.map(l => ({ ...l }));
    const date = new Date().toLocaleString('fr-FR');
    let confirmedSale = null, correctZeroPrice = false;
    saving = true;
    fields.disabled = saveBtn.disabled = printBtn.disabled = true;
    $('vr-save-label').textContent = 'Enregistrement…';
    try {
      const zero = zeroPriceLines();
      if (zero.length) {
        const names = zero.slice(0, 5).map(l => l.name).join(', ') + (zero.length > 5 ? '…' : '');
        const accepted = await askConfirm(`Attention : ${zero.length === 1 ? '1 article a un prix net à zéro' : `${zero.length} articles ont un prix net à zéro`} : ${names}.\nIls seront vendus sans montant facturé. Voulez-vous enregistrer cette vente ?`, { ok: 'Enregistrer quand même', cancel: 'Corriger les prix', danger: true });
        if (!accepted || !active()) {
          if (active()) {
            err.textContent = 'Vente non enregistrée : vérifiez les articles à prix nul.';
            correctZeroPrice = true;
          }
          return;
        }
      }
      const sid = await db.rpc('create_sale', { p_number: takeInvoiceNumber(), p_id: newId(), p_usd_cdf: getRate()?.usd_cdf ?? null,
        p_date: localDay(),
        p_lines: snapshot.map(l => ({ article_id: l.article_id, qty: l.qty, unit_price: net(l), discount_pct: discountsOn ? (l.discount || 0) : 0 })),
        p_customer: customer, p_customer_label: cname, p_payment: isCredit ? 'credit' : 'cash', p_paid: advance,
        p_deposit_id: applied > 0 ? dep.id : null, p_advance_amount: applied, ...(wh ? { p_warehouse: wh } : {}) });
      if (!sid) throw new Error('Enregistrement non confirmé. Le panier a été conservé.');
      // Dès que la vente est confirmée, le brouillon ne doit plus pouvoir être restauré ni revendu.
      confirmedSale = { id: sid, number: '', date, pickup, cart: snapshot, total: sold, paid, paidNow: advance, deposit: applied, depositNumber: applied ? dep.receipt_number : '', kind: isCredit ? 'credit' : 'cash', cname, method: isCredit ? 'cash' : saleMode, operator: saleMode === 'mobile_money' ? operator : null, ref: isCredit ? '' : ref, initialPayment: isCredit && advance > 0 ? { method: amode, operator: aoperator, ref: aref } : null };
      lastSale = confirmedSale;
      cart.length = 0;
      saveCart(uid, cart);
      snapshot.forEach(l => { whStock[l.article_id] = Math.max(0, (whStock[l.article_id] || 0) - l.qty); });
      if (active()) resetSoldCart();
      if (sid && pickup) await db.rpc('set_sale_pickup', { p_sale: sid, p_pickup: true }).catch(() => notify('Vente enregistrée, mais la marque « à retirer » n’a pas pu être notée.'));
      const online = navigator.onLine;
      const saleRows = sid && online ? await db.select('sales', `select=number&id=eq.${sid}`).catch(() => []) : [];
      const number = saleRows?.[0]?.number || '';
      if (isCredit && advance > 0) {
        await db.rpc('set_initial_payment_method', { p_sale: sid, p_method: amode, p_reference: aref, p_operator: amode === 'mobile_money' ? aoperator : null }).catch(() => notify('Acompte enregistré en espèces : son mode n’a pas pu être noté. Corrigez-le dans Ventes.'));
      }
      if (!isCredit && advance > 0 && (saleMode === 'mobile_money' || saleMode === 'bank')) {
        await db.rpc('set_sale_payment_method', { p_sale: sid, p_method: saleMode, p_reference: ref, p_operator: saleMode === 'mobile_money' ? operator : null }).catch(() => notify('Vente enregistrée en espèces : le mode n’a pas pu être noté. Corrigez-le dans Ventes.'));
      }
      confirmedSale.number = number;
      const label = `${isCredit ? 'Vente à crédit' : 'Vente'} : ${usdOnly(sold)}${isCredit && paid ? ` (acompte ${usdOnly(paid)})` : ''}`;
      if (!printAfter) notify(online ? `${number ? number + ' · ' : ''}${label} enregistrée.` : `${label} enregistrée sur ce téléphone. Elle sera envoyée dès le retour du réseau.`, 'Vente');
      if (customer) rememberCustomer(uid, customer);
      if (!active()) return;
      $('vr-last').textContent = online
        ? `Dernière vente : ${number || 'enregistrée'} · ${usdOnly(sold)}${isCredit ? ' (crédit)' : ''}`
        : `Dernière vente (en attente d'envoi) : ${usdOnly(sold)}${isCredit ? ' (crédit)' : ''}`;
      refreshQueue(); loadDeposits();
      if (online) loadWhStock();
      if (printAfter) {
        $('vr-print-label').textContent = 'Impression…';
        await printReceipt(confirmedSale);
      }
      return confirmedSale;
    } catch (error) {
      if (active()) err.textContent = confirmedSale
        ? `Vente enregistrée. Impression ou suivi incomplet : ${error?.message || 'réessayez Imprimer sans recréer la vente.'}`
        : error?.message || 'Vente impossible. Vérifiez la connexion et le stock.';
    } finally {
      saving = false;
      fields.disabled = saveBtn.disabled = printBtn.disabled = false;
      if (active()) {
        $('vr-save-label').textContent = 'Enregistrer la vente';
        $('vr-print-label').textContent = 'Imprimer';
        if (correctZeroPrice) {
          const index = cart.findIndex(l => net(l) === 0);
          $('vr-lines').querySelector(`[data-price="${index}"]`)?.focus();
        }
      }
    }
  }
  function resetSoldCart() {
    clearTimeout(addedTimer);
    $('vr-lastitem').textContent = '';
    $('vr-restored').hidden = true;
    $('vr-prod').value = ''; $('vr-qty').value = 1;
    $('vr-ref').value = ''; $('vr-aref').value = ''; $('vr-paid').value = 0;
    main.querySelectorAll('.combo-list').forEach(box => { box.hidden = true; });
    draw();
    stockLine();
  }
  $('vr-save').addEventListener('click', () => save());
  // État de l'envoi : ce qui attend le réseau, et ce qui a été refusé à l'envoi.
  async function refreshQueue() {
    const box = $('vr-queue');
    const [waiting, refused] = await Promise.all([pendingCount().catch(() => 0), rejectedItems().catch(() => [])]);
    if (!active()) return;
    const parts = [];
    if (waiting) parts.push(`${waiting} en attente d’envoi (réseau à retrouver)`);
    if (refused.length) parts.push(`${refused.length} refusée(s) par le serveur : à reprendre, le stock ou une donnée ne correspondait pas`);
    box.hidden = !parts.length;
    box.textContent = parts.join(' · ');
    box.title = box.textContent;
    box.className = refused.length ? 'vr-queue bad' : 'vr-queue';
  }
  const offlineBox = $('vr-offline');
  const showNet = () => { offlineBox.hidden = navigator.onLine; };
  window.addEventListener('online', () => { if (active()) { showNet(); refreshQueue(); loadWhStock(); loadDeposits(); } }, { signal: events.signal });
  window.addEventListener('offline', () => { if (active()) showNet(); }, { signal: events.signal });
  showNet();
  if (cart.length) $('vr-restored').hidden = false;
  refreshQueue();

  // Reçu d'une vente enregistrée : la copie reste indépendante du panier déjà vidé.
  async function printReceipt(sale) {
    if (!sale) { err.textContent = 'Rien à imprimer.'; return; }
    const profile = await db.select('profiles', `select=organizations(name,address,phone,tax_id,rc,receipt_footer,logo)&id=eq.${session().uid}`).catch(() => []);
    const org = profile?.[0]?.organizations || {};
    const num = sale.number || (sale.id ? ((await db.select('sales', `select=number&id=eq.${sale.id}`).catch(() => []))?.[0]?.number || '') : '');
    const lines = (sale.cart || []).map(l => {
      const price = netPrice(l.price, discountsOn ? l.discount : 0);
      return { name: l.name, unit: l.unit, unit_weight: l.unit_weight, qty: l.qty, price, sub: lineTotal(l.qty, price) };
    });
    printHtml(receiptHtml({
      org, logo: companyLogo(org.logo), number: num, rate: getRate()?.usd_cdf || null, date: sale.date || new Date().toLocaleString('fr-FR'),
      client: sale.cname || 'Client comptoir', method: sale.method || 'cash', operator: sale.operator || null, ref: sale.ref || '',
      lines, total: Number(sale.total) || 0, paid: Number(sale.paid) || 0, kind: sale.kind || 'cash',
      paidNow: sale.paidNow, deposit: sale.deposit, depositNumber: sale.depositNumber, initialPayment: sale.initialPayment, draft: !!sale.draft,
      footer: org.receipt_footer || '', pickup: !!sale.pickup, money: v => usdOnly(v)
    }));
  }
  $('vr-print').addEventListener('click', async () => {
    if (saving || printing) return;
    if (cart.length) {
      await save({ printAfter: true });
    } else if (lastSale) {
      printing = true;
      const button = $('vr-print');
      button.disabled = true;
      try { await printReceipt(lastSale); }
      catch (error) { if (active()) err.textContent = `La vente reste enregistrée. Impression impossible : ${error?.message || 'réessayez.'}`; }
      finally { printing = false; button.disabled = false; }
    } else {
      err.textContent = 'Le panier est vide : rien à imprimer.';
    }
  });

  setMode('cash');
  draw();
  loadWhStock();
}
