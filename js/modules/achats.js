import { render as doc } from './doc.js';
export const render = (main, ctx) => doc(main, { role: ctx?.role, newCap: 'achats.write', partyCap: 'fournisseurs.write', cancelCap: 'achats.cancel',  one: 'Achat', title: 'Achats', partyTable: 'suppliers', partyLabel: 'Fournisseur', newParty: 'Nouveau fournisseur', newDoc: 'Nouvel achat',
  table: 'purchases', dateCol: 'bought_at', partyIdCol: 'supplier_id', linesTable: 'purchase_lines', priceCol: 'unit_cost', priceLabel: 'Coût unitaire', artPrice: 'price_buy',
  rpc: 'create_purchase', rpcParty: 'p_supplier', checkStock: false, empty: 'Aucun achat. Enregistrez votre premier achat : le stock augmente automatiquement.' });
