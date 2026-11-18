// Exports Excel (HTML reconnu par Excel), avec l'en-tête de l'entreprise.
import { esc } from './ui.js';
import { ownOrgRows } from './own-org.js';
import { db } from './api.js';

const safe = value => {
  if (value == null) return '';
  const text = String(value);
  // Évite qu'un libellé importé soit interprété comme une formule par un tableur.
  return /^[\s]*[=+@]/.test(text) ? `'${text}` : text;
};
const html = value => safe(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const titleCase = value => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toLocaleUpperCase('fr'));

export async function downloadCsv(filename, headers, rows) {
  const [org] = await ownOrgRows('name,address,phone,email,tax_id,rc,logo,receipt_footer').catch(() => []);
  const details = [org?.address, org?.phone && `Tél. : ${org.phone}`, org?.email && `E-mail : ${org.email}`, org?.tax_id && `NIF : ${org.tax_id}`, org?.rc && `RC : ${org.rc}`].filter(Boolean);
  const logo = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(org?.logo || '')
    ? `<img src="${esc(org.logo)}" alt="Logo" style="max-width:180px;max-height:70px">` : '';
  const content = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#172b4d}h1{font-size:20px;margin:8px 0}p{margin:4px 0;color:#52647a}
    table{border-collapse:collapse;margin-top:16px}th,td{border:1px solid #b8c5d3;padding:6px 9px;text-align:left}th{background:#eaf1f8;font-weight:bold}
    </style></head><body><table><tr><td colspan="${headers.length}">${logo}<h1>${html(org?.name || 'KaPya ERP')}</h1>${details.map(item => `<p>${html(item)}</p>`).join('')}<h2>${html(titleCase(filename))}</h2></td></tr></table>
    <table><thead><tr>${headers.map(value => `<th>${html(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${html(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  const blob = new Blob(['\ufeff', content], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename.replace(/[^a-z0-9_-]+/gi, '-')}.xls`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvNumber = value => Number(value || 0).toFixed(2).replace('.', ',');
