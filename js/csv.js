// Export CSV compatible Excel : BOM UTF-8, séparateur « ; », décimales à la virgule (réglage français).
const cell = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000).replace('.', ',') : '';
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
};

export function downloadCsv(name, rows) {
  const text = '\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
