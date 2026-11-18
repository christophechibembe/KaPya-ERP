// Décision prise pour chaque opération en attente lors de l'envoi au retour du réseau.
// - 'stop'   : toujours hors ligne, ou session à renouveler : on s'arrête et on réessaiera plus tard.
// - 'reject' : le serveur a refusé l'opération (stock, donnée invalide) : elle est gardée pour reprise manuelle.
// Une opération déjà reçue n'est jamais refusée : les créations sont idempotentes côté base.
export function replayOutcome(error) {
  const offline = !error || !error.status;
  if (offline || error.status === 401) return 'stop';
  return 'reject';
}
