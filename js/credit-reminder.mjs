// Préparation uniquement : aucun appel réseau, aucun envoi WhatsApp automatique.
export function whatsappNumber(phone) {
  const text = String(phone || '').trim();
  if (!/^\+?[\d\s().-]+$/.test(text)) return '';
  const digits = text.replace(/\D/g, '').replace(/^00/, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}
export const whatsappLink = (phone, text) => {
  const number = whatsappNumber(phone);
  return number && text.trim() ? `https://wa.me/${number}?text=${encodeURIComponent(text.trim())}` : '';
};
export function customerCredits(sale, all) {
  return all.filter(row => Number(row.balance) > .005 && (sale.customer_id
    ? row.customer_id === sale.customer_id : row.id === sale.id));
}
export function creditReminder(sale, all, orgName, rate = 0) {
  const invoices = customerCredits(sale, all);
  const debt = Math.round(invoices.reduce((sum, row) => sum + Number(row.balance), 0) * 100) / 100;
  const money = value => Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  const fc = Number(rate) > 0 ? ` (environ ${Math.round(debt * rate).toLocaleString('fr-FR')} FC au taux actuel)` : '';
  return `Bonjour ${sale.customer || 'cher client'},\nSauf erreur ou paiement récent, votre solde restant chez ${orgName || 'notre entreprise'} est de ${money(debt)}${fc}.\n\n`
    + invoices.slice(0, 10).map(row => `• ${row.number || 'Facture'}${row.sold_at ? ` du ${row.sold_at}` : ''} : ${money(row.balance)}`).join('\n')
    + (invoices.length > 10 ? `\nEt ${invoices.length - 10} autre(s) facture(s).` : '')
    + '\n\nMerci de nous contacter pour régulariser ou nous signaler un paiement déjà effectué. Merci de votre confiance.';
}
