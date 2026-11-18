// Clôture de caisse par boutique. Chaque boutique clôture sa propre caisse chaque jour.
// La clôture globale (toute l'entreprise) reste celle de l'écran principal.
import { db, session } from '../api.js';
import { esc, usdOnly, fcOnly } from '../ui.js';
import { loadShops } from '../shops.js';


export async function renderShopClosures(box, ctx, day) {
  const role = ctx?.role;
  if (!['admin', 'manager', 'facturier'].includes(role)) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="card empty">Chargement des clôtures par boutique…</div>';
  try {
    let shops = await loadShops();
    if (role === 'facturier') {
      const mine = await db.select('user_warehouses', `select=warehouse_id&user_id=eq.${session().uid}`).catch(() => []);
      shops = shops.filter(shop => shop.id === mine[0]?.warehouse_id);
    }
    const closures = await db.select('cash_closures_shop', `select=warehouse_id,counted_total_usd,expected_usd,difference_usd,note,closed_at&business_date=eq.${day}`).catch(() => []);
    if (!shops.length) { box.innerHTML = '<div class="card empty">Aucune boutique à clôturer.</div>'; return; }
    const cards = await Promise.all(shops.map(async shop => {
      const done = closures.find(c => c.warehouse_id === shop.id);
      const summary = await db.rpc('cash_close_summary_shop', { p_day: day, p_warehouse: shop.id }).catch(() => null);
      const mobile = summary ? await db.rpc('mobile_money_total', { p_day: day, p_warehouse: shop.id }).catch(() => null) : null;
      if (summary) summary.mobile_money = mobile;
      if (done) {
        return `<article class="card shop-close"><h3>${esc(shop.name)} <span class="pill ok">Clôturée</span></h3>
          <p>Attendu : <b>${usdOnly(done.expected_usd)}</b> · Compté : <b>${usdOnly(done.counted_total_usd)}</b> · Écart : <b>${usdOnly(done.difference_usd)}</b></p>
          ${done.note ? `<p class="muted">${esc(done.note)}</p>` : ''}
          ${canClose(role) ? formHtml(shop, day, summary, true) : ''}</article>`;
      }
      return `<article class="card shop-close"><h3>${esc(shop.name)} <span class="pill">À clôturer</span></h3>${formHtml(shop, day, summary, false)}</article>`;
    }));
    box.innerHTML = `<section class="shop-closures-head"><h2>Clôture par boutique</h2><p class="muted">Chaque boutique clôture sa caisse. La clôture globale est la somme des boutiques, plus les acomptes, dépenses et paiements fournisseurs de l'entreprise.</p></section>${cards.join('')}<p class="err" id="shop-close-error" role="alert"></p>`;
    box.querySelectorAll('form[data-shop-close]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const f = new FormData(form), err = box.querySelector('#shop-close-error');
      try {
        await db.rpc('save_shop_closure', {
          p_day: day, p_warehouse: form.dataset.shopClose,
          p_open_usd: Number(f.get('opening_usd') || 0), p_open_fc: Number(f.get('opening_fc') || 0),
          p_count_usd: Number(f.get('counted_usd') || 0), p_count_fc: Number(f.get('counted_fc') || 0),
          p_note: String(f.get('note') || '').trim()
        });
        renderShopClosures(box, ctx, day);
      } catch (error) { err.textContent = error.message || 'La clôture n’a pas pu être enregistrée.'; }
    }));
  } catch (error) {
    box.innerHTML = `<div class="card"><p class="err">Clôture par boutique indisponible : ${esc(error.message || 'erreur')}.</p></div>`;
  }
}

const canClose = role => ['admin', 'manager', 'facturier'].includes(role);

function formHtml(shop, day, summary, replacing) {
  const line = summary
    ? `<p class="shop-close-flow">Encaissé aujourd’hui : <span>ventes comptant ${usdOnly(Number(summary.cash_sales) || 0)}</span><span>versements de crédits ${usdOnly(Number(summary.credit_payments) || 0)}</span><b>total ${usdOnly(Number(summary.cash_in) || 0)}</b></p>`
    : '<p class="shop-close-flow muted">Hors connexion : les encaissements seront calculés à la synchronisation.</p>';
  const mobileLine = summary && summary.mobile_money != null ? `<p class="shop-close-flow"><span>Mobile money : ${usdOnly(Number(summary.mobile_money) || 0)} (hors caisse, à vérifier sur le téléphone)</span></p>` : '';
  return `${line}${mobileLine}
    <form data-shop-close="${esc(shop.id)}" class="shop-form">
      <div class="grid-form">
        <label>Montant compté USD<input name="counted_usd" type="number" min="0" step="any" value="0" inputmode="decimal" required></label>
        <label>Montant compté FC<input name="counted_fc" type="number" min="0" step="any" value="0" inputmode="decimal" required></label>
      </div>
      <details class="shop-more"><summary>Plus d’options (fond de caisse, note)</summary>
        <div class="grid-form">
          <label>Fond d’ouverture USD<input name="opening_usd" type="number" min="0" step="any" value="0"></label>
          <label>Fond d’ouverture FC<input name="opening_fc" type="number" min="0" step="any" value="0"></label>
          <label class="span-2">Note<input name="note" type="text" maxlength="500"></label>
        </div>
      </details>
      <button class="btn shop-close-btn" type="submit">${replacing ? 'Corriger la clôture' : 'Clôturer cette boutique'}</button>
    </form>`;
}
