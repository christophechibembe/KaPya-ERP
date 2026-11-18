// Guide de démarrage : affiché une seule fois par compte, après l'écran de bienvenue.
// Il ne propose que les étapes permises au rôle de l'utilisateur.
import { esc } from './ui.js';
import { session } from './api.js';

const STEPS = [
  { route: 'accueil', title: 'Votre tableau de bord', text: 'Ici, vous voyez l’activité du jour : ventes, encaissements et points à surveiller. Tout se met à jour automatiquement.' },
  { route: 'clients', title: 'Enregistrer un client', text: 'Cliquez sur « Nouveau client », saisissez son nom et son téléphone. Un client enregistré permet de suivre ses crédits et ses achats.' },
  { route: 'fournisseurs', title: 'Enregistrer un fournisseur', text: 'Cliquez sur « Nouveau fournisseur ». Il servira pour vos achats et leur suivi.' },
  { route: 'stocks', title: 'Ajouter vos articles', text: 'Dans « Produits et stocks », créez chaque article avec sa référence, son nom, son unité et ses prix. Vous pouvez aussi importer une liste en fichier CSV.' },
  { route: 'facture', title: 'Faire une facture', text: 'Dans « Nouvelle facture », choisissez le client, ajoutez les articles et les quantités, puis le paiement : comptant ou à crédit. Le stock diminue automatiquement.' },
  { route: 'credits', title: 'Enregistrer un versement', text: 'Pour une facture à crédit, ouvrez « Crédits », puis « Encaisser ». Choisissez le mode de paiement, et saisissez la référence pour le mobile money.' },
  { route: 'caisse', title: 'Clôturer la caisse', text: 'En fin de journée, comptez l’argent de votre boutique, saisissez le montant compté et enregistrez la clôture.' }
];

const doneKey = () => `kp.onboarding.${session().uid}`;

export function onboardingDone() { return localStorage.getItem(doneKey()) === '1'; }

// allowed(route) : vrai si la page est accessible à cet utilisateur.
export function startOnboarding(allowed, go) {
  if (onboardingDone()) return;
  const steps = STEPS.filter(step => allowed(step.route));
  if (!steps.length) { localStorage.setItem(doneKey(), '1'); return; }
  let index = 0;
  const box = document.createElement('div');
  box.id = 'onboarding';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Guide de démarrage');
  document.body.append(box);

  const finish = () => { localStorage.setItem(doneKey(), '1'); box.remove(); };
  const draw = () => {
    const step = steps[index];
    const last = index === steps.length - 1;
    box.innerHTML = `<div class="ob-card">
      <p class="ob-count">Étape ${index + 1} sur ${steps.length}</p>
      <h2>${esc(step.title)}</h2>
      <p>${esc(step.text)}</p>
      <div class="ob-dots">${steps.map((_, i) => `<span class="${i === index ? 'on' : ''}"></span>`).join('')}</div>
      <div class="ob-acts">
        <button class="ghost" id="ob-skip" type="button">Passer le guide</button>
        <span>
          ${index > 0 ? '<button class="ghost" id="ob-prev" type="button">Précédent</button>' : ''}
          <button class="ghost" id="ob-open" type="button">Ouvrir cette page</button>
          <button class="btn" id="ob-next" type="button">${last ? 'Terminer' : 'Suivant'}</button>
        </span>
      </div></div>`;
    box.querySelector('#ob-skip').onclick = finish;
    box.querySelector('#ob-prev')?.addEventListener('click', () => { index--; draw(); });
    box.querySelector('#ob-open').onclick = () => { go(step.route); };
    box.querySelector('#ob-next').onclick = () => { if (last) finish(); else { index++; draw(); } };
  };
  draw();
}
