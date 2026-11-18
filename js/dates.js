// Date du jour telle que la voit l'utilisateur (fuseau de l'appareil), au format AAAA-MM-JJ.
// Ne jamais utiliser toISOString().slice(0, 10) pour une date métier : en Afrique centrale (UTC+1/+2),
// une vente saisie entre 00 h et 02 h serait enregistrée la veille et n'apparaîtrait pas dans « Aujourd'hui ».
export const localDay = (date = new Date()) => {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
