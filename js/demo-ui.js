import { isDemo } from './demo-mode.js';
import { resetLocal, DEMO_BUSINESSES, demoBusiness } from './demo.js';
import { esc } from './escape.js';
import { askConfirm } from './ui.js';

export function mountDemoBar() {
  if (!isDemo) return;
  document.getElementById('demo-bar')?.remove();
  const bar = document.createElement('aside');
  bar.id = 'demo-bar'; bar.className = 'demo-bar'; bar.setAttribute('aria-label', 'Commandes de la démonstration');
  bar.innerHTML = `<div><strong>DÉMONSTRATION</strong><span>Données fictives · rien n’est envoyé au serveur</span></div>
    <label><span class="sr">Métier de démonstration</span><select id="demo-business">${Object.entries(DEMO_BUSINESSES).map(([key, title]) => `<option value="${key}"${key === demoBusiness() ? ' selected' : ''}>${esc(title)}</option>`).join('')}</select></label>
    <button class="ghost" id="demo-guide-open" type="button">Guide 2 min</button>
    <button class="ghost" id="demo-reset" type="button">Réinitialiser</button>
    <a class="btn" href="/?inscription=1">Demander un accès</a><a href="/">Quitter la démo</a>`;
  document.querySelector('.content').prepend(bar);
  document.getElementById('sync').textContent = 'Simulation locale';
  for (const key of ['lock-now', 'lock-m']) document.getElementById(key).hidden = true;
  bar.querySelector('#demo-reset').onclick = async () => {
    if (await askConfirm('Réinitialiser uniquement les données fictives de la démo ? Vos données réelles ne seront pas modifiées.')) await resetLocal();
  };
  const selector = bar.querySelector('#demo-business');
  selector.onchange = async () => {
    if (await askConfirm('Changer de métier réinitialise les données fictives de la démo. Continuer ?')) await resetLocal(selector.value);
    else selector.value = demoBusiness();
  };
  bar.querySelector('#demo-guide-open').onclick = () => {
    document.getElementById('demo-guide')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'demo-guide';
    dialog.innerHTML = `<h2>Découvrez KaPya en 2 minutes</h2><p>Aucune inscription, aucun vrai paiement. Vous pouvez tout recommencer.</p>
      <ol class="demo-steps">
        <li><b>Faites une vente</b><p>Recherchez un produit, cliquez sur Ajouter, puis Enregistrer la vente. Observez le nouveau stock.</p><button class="btn" data-demo-route="vente">Essayer une vente</button></li>
        <li><b>Encaissez un crédit</b><p>Ouvrez une facture à recouvrer puis Encaisser. Le solde du client diminue.</p><button class="ghost" data-demo-route="credits">Voir les crédits</button></li>
        <li><b>Consultez les résultats</b><p>Comparez les ventes, les encaissements et le résultat net dans les rapports.</p><button class="ghost" data-demo-route="rapports">Voir les rapports</button></li>
        <li><b>Clôturez la caisse</b><p>Clôturez chaque boutique, puis la journée globale. La démo permet de comprendre les écarts.</p><button class="ghost" data-demo-route="caisse">Essayer la clôture</button></li>
      </ol><p class="notice">Les écrans administratifs et les intégrations réelles ne font pas partie de la démo. Les opérations fictives ne seront jamais transférées à votre futur compte.</p>
      <div class="row"><button class="ghost" data-demo-close>Fermer</button></div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-demo-close]').onclick = () => dialog.close();
    dialog.querySelectorAll('[data-demo-route]').forEach(button => { button.onclick = () => { location.hash = `#/${button.dataset.demoRoute}`; dialog.close(); }; });
    dialog.showModal();
  };
}
