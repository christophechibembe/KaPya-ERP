import { render as doc } from './doc.js';
export const render = (main, ctx) => doc(main, { role: ctx?.role, newHref: '#/facture', editHref: '#/facture?edit=', editCap: 'ventes.edit', extraSelect: 'customer_label,', newCap: 'ventes.write', partyCap: 'clients.write', cancelCap: 'ventes.cancel',  one: 'Vente', title: 'Ventes', partyTable: 'customers', partyLabel: 'Client', newParty: 'Nouveau client', newDoc: 'Nouvelle vente',
  table: 'sales', dateCol: 'sold_at', partyIdCol: 'customer_id', linesTable: 'sale_lines', priceCol: 'unit_price', priceLabel: 'Prix unitaire', artPrice: 'price_sell', paymentCol: 'payment', paidCol: 'paid',
  rpc: 'create_sale', rpcParty: 'p_customer', checkStock: true, empty: 'Aucune vente. Enregistrez votre première vente : le stock diminue automatiquement.' });
