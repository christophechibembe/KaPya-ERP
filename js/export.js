// Exports CSV compatibles avec Excel (UTF-8 BOM, séparateur point-virgule).
const safe = value => {
  if (value == null) return '';
  const text = String(value);
  // Évite qu'un libellé importé soit interprété comme une formule par un tableur.
  const protectedText = /^[\s]*[=+@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
};

export function downloadCsv(filename, headers, rows) {
  const content = '\ufeff' + [headers, ...rows].map(row => row.map(safe).join(';')).join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename.replace(/[^a-z0-9_-]+/gi, '-')}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvNumber = value => Number(value || 0).toFixed(2).replace('.', ',');
