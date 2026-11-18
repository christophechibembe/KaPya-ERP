const KEY = 'kp.language';

const EN = {
  'Pilotage': 'Overview', 'Ventes et encaissements': 'Sales and payments', 'Clients et stock': 'Customers and stock', 'Analyse': 'Analytics', 'Administration': 'Administration',
  'Tableau de bord': 'Dashboard', 'Alertes et rappels': 'Alerts and reminders', 'Ventes': 'Sales', 'Crédits clients': 'Customer credit', 'Acomptes clients': 'Customer deposits', 'Clôture de caisse': 'Cash closing',
  'Clients': 'Customers', 'Produits & Stocks': 'Products & Stock', 'Dépôts': 'Warehouses', 'Achats': 'Purchases', 'Fournisseurs': 'Suppliers', 'Rapports': 'Reports', 'Exports comptables': 'Accounting exports', 'Historique des actions': 'Activity history', 'Sauvegarde': 'Backup', 'Paramètres': 'Settings', 'Plus': 'More', 'Se déconnecter': 'Sign out',
  'Langue': 'Language', 'Langue de l’application': 'Application language', 'Choisissez la langue de l’interface.': 'Choose the interface language.', 'Français': 'Français', 'English': 'English',
  'Taux du jour': 'Today’s exchange rate', 'mis à jour le': 'updated on', 'Non renseigné : les montants sont affichés en dollars.': 'Not set: amounts are shown in US dollars.', 'Enregistrer': 'Save', 'Saisissez un taux supérieur à 0.': 'Enter an exchange rate greater than 0.', 'Les membres peuvent modifier le taux, sauf le rôle Lecture seule.': 'Members can change the rate, except for the read-only role.',
  'Espace': 'Workspace', 'Rôle :': 'Role:', 'Simuler un rôle': 'Simulate a role', 'Mode local : pour tester les droits de chaque rôle.': 'Local mode: test the permissions for each role.', 'Mode local': 'Local mode', 'Les données sont enregistrées dans ce navigateur.': 'Data is stored in this browser.', 'Réinitialiser les données': 'Reset data', 'Confirmer la réinitialisation ?': 'Confirm reset?',
  'Équipe et invitations.': 'Team and invitations.', 'Membres': 'Members', 'Les administrateurs peuvent changer le rôle des membres.': 'Administrators can change member roles.', 'Chargement…': 'Loading…', 'Inviter un membre': 'Invite a member', 'Crée un code valable 7 jours. Le membre le saisit à l’inscription.': 'Create a code valid for 7 days. The member enters it when signing up.', 'Créer le code': 'Create code', 'Membre': 'Member', 'Rôle': 'Role', 'Action': 'Action', 'Vous': 'You', 'Retirer': 'Remove', 'Retirer ces pièces': 'Remove these records',
  'Entreprise (en-tête des factures)': 'Business (invoice header)', 'Ces informations apparaissent sur les factures et les bons imprimés.': 'This information appears on invoices and printed receipts.', 'Nom de l’entreprise': 'Business name', 'Téléphone': 'Phone', 'Adresse': 'Address', 'Logo': 'Logo', 'Retirer le logo': 'Remove logo', 'Enregistrer l’entreprise': 'Save business details', 'En-tête enregistré. Il apparaîtra sur les prochaines impressions.': 'Header saved. It will appear on future printouts.', 'Indiquez le nom de l’entreprise.': 'Enter the business name.',
  'Consultez les ventes, l’inventaire et les mouvements d’entrée et de sortie du stock.': 'Review sales, inventory, and incoming and outgoing stock movements.', 'Journalier': 'Daily', 'Entre deux dates': 'Date range', 'Inventaire': 'Inventory', 'Entrées de stock': 'Stock received', 'Sorties de stock': 'Stock issued', 'Synthèse 6 mois': '6-month summary', 'Rapport journalier': 'Daily report', 'Choisissez le jour dont vous voulez consulter les ventes et encaissements.': 'Choose a day to review sales and payments.', 'Date du rapport': 'Report date', 'Afficher le rapport': 'Show report', 'Format d’impression': 'Print format', 'Exporter vers Excel': 'Export to Excel', 'Imprimer / PDF': 'Print / PDF', 'Dans l’impression, choisissez « Enregistrer au format PDF ».': 'In the print dialog, choose “Save as PDF”.', 'Résumé des ventes et des encaissements': 'Sales and payments summary', 'Désignation': 'Description', 'Montant (USD)': 'Amount (USD)', 'Ventes en cash': 'Cash sales', 'Ventes à crédit': 'Credit sales', 'Paiements reçus': 'Payments received', 'TOTAL DES VENTES': 'TOTAL SALES', 'TOTAL DES ENCAISSEMENTS': 'TOTAL PAYMENTS RECEIVED', 'Total des ventes': 'Total sales', 'Total encaissé': 'Total received', 'Paiements des crédits reçus': 'Credit payments received', 'Aucune vente à crédit sur cette période.': 'No credit sales during this period.', 'Aucun paiement de dette sur cette période.': 'No debt payments during this period.',
  'Exports comptables': 'Accounting exports', 'Téléchargez vos données en Excel ou en PDF (impression).': 'Download your data in Excel or PDF (print).', 'Du': 'From', 'Au': 'To', 'La période s’applique aux ventes et aux achats. L’inventaire est pris à la date du jour.': 'The date range applies to sales and purchases. Inventory is as of today.', 'Ventes (Excel)': 'Sales (Excel)', 'Achats (Excel)': 'Purchases (Excel)', 'Inventaire (Excel)': 'Inventory (Excel)', 'Export prêt.': 'Export ready.', 'Préparation de l’export…': 'Preparing export…', 'Exporter vers Excel': 'Export to Excel',
  'Dépôts': 'Warehouses', 'Stock suivi séparément dans chaque dépôt. Le total reste la somme des dépôts.': 'Stock is tracked separately in each warehouse. The total is the sum across warehouses.', 'Exporter le stock (Excel)': 'Export stock (Excel)', 'Rechercher': 'Search', 'Rechercher dans': 'Search', 'Tous': 'All', 'Tous les dépôts': 'All warehouses', 'Date': 'Date', 'Client': 'Customer', 'Fournisseur': 'Supplier', 'Paiement': 'Payment', 'Total': 'Total', 'Quantité': 'Quantity', 'Article': 'Item', 'Produit': 'Product', 'Unité': 'Unit', 'Enregistrer l’entreprise': 'Save business details',
  'Ouvrez l’app via le lanceur': 'Open the app using the launcher', 'Se connecter': 'Sign in', 'Adresse e-mail': 'Email address', 'Mot de passe (8 caractères minimum)': 'Password (at least 8 characters)', 'Pas de compte ?': 'No account?', 'Créer un compte': 'Create an account', 'Réessayer': 'Try again', 'Effacer la session': 'Clear session', 'Configuration requise': 'Configuration required', 'Accès suspendu': 'Access suspended', 'Hors ligne': 'Offline', 'Synchronisé': 'Synced', 'Taux de change et informations de l’espace.': 'Exchange rate and workspace details.'
};

export const getLanguage = () => localStorage.getItem(KEY) === 'en' ? 'en' : 'fr';
export const setLanguage = value => localStorage.setItem(KEY, value === 'en' ? 'en' : 'fr');

function translateElement(root) {
  if (getLanguage() !== 'en' || !root) return;
  const doc = root.ownerDocument || document;
  const translateText = node => {
    if (node.parentElement?.closest('td,.business-brand,.business-company-details,.avatar')) return;
    const value = node.nodeValue || '';
    const trimmed = value.trim();
    const translated = EN[trimmed];
    if (translated && translated !== trimmed) node.nodeValue = value.replace(trimmed, translated);
  };
  if (root.nodeType === Node.TEXT_NODE) translateText(root);
  else {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateText(walker.currentNode);
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    for (const attr of ['aria-label', 'placeholder', 'title']) {
      const value = root.getAttribute(attr);
      if (value && EN[value]) root.setAttribute(attr, EN[value]);
    }
    root.querySelectorAll?.('[aria-label],[placeholder],[title]').forEach(element => {
      for (const attr of ['aria-label', 'placeholder', 'title']) {
        const value = element.getAttribute(attr);
        if (value && EN[value]) element.setAttribute(attr, EN[value]);
      }
    });
  }
}

export function watchLanguage(root = document.getElementById('root')) {
  document.documentElement.lang = getLanguage();
  translateElement(root);
  if (!root || root.dataset.languageWatcher) return;
  root.dataset.languageWatcher = 'true';
  new MutationObserver(records => {
    if (getLanguage() !== 'en') return;
    records.forEach(record => {
      if (record.type === 'characterData') translateElement(record.target);
      record.addedNodes?.forEach(node => translateElement(node));
    });
  }).observe(root, { childList: true, characterData: true, subtree: true });
}
