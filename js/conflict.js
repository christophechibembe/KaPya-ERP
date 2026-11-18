// Détection des conflits de modification : une mise à jour protégée par la version
// (filtre version=eq.N) qui ne modifie aucune ligne signale que la fiche a changé ailleurs.
export function isVersionConflict({ method, path, result }) {
  return (method || '') === 'PATCH' && String(path || '').includes('version=eq.') && Array.isArray(result) && result.length === 0;
}
export function conflictError() {
  const e = new Error('Conflit : cette fiche a été modifiée sur un autre appareil. Rechargez-la, vérifiez les informations, puis réenregistrez.');
  e.conflict = true;
  return e;
}
export const isConflict = error => !!error?.conflict;
