// Contrôle des lignes d'un fichier de clients. Colonnes : nom (ou name), telephone (ou phone), email.
export function checkClientRows(records, existingNames = []) {
  const known = new Set(existingNames.map(n => String(n).trim().toLowerCase()));
  const seen = new Set();
  const ok = [], errors = [];
  records.forEach((r, index) => {
    const line = index + 2;
    const name = (r.nom || r.name || '').trim();
    const phone = (r.telephone || r.phone || '').trim();
    const email = (r.email || '').trim();
    if (!name) return errors.push(`Ligne ${line} : nom manquant.`);
    const key = name.toLowerCase();
    if (seen.has(key)) return errors.push(`Ligne ${line} : nom en double dans le fichier (${name}).`);
    seen.add(key);
    if (known.has(key)) return errors.push(`Ligne ${line} : ce client existe déjà (${name}). Ignoré.`);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errors.push(`Ligne ${line} : e-mail invalide (${name}).`);
    ok.push({ name, phone: phone || null, email: email || null });
  });
  return { ok, errors };
}
