// Génère un PDF texte (A4) sans bibliothèque externe. Corps en Courier (chasse fixe) : les colonnes restent alignées.
// Les tableaux du rapport sont envoyés sous forme de lignes alignées par le navigateur.
const WIN = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'Œ': 0x8C, 'œ': 0x9C, '«': 0xAB, '»': 0xBB, '\u00a0': 0xA0 };
function bytesOf(text) {
  const out = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (WIN[ch] !== undefined) out.push(WIN[ch]);
    else if (code < 128) out.push(code);
    else if (code >= 0xA0 && code <= 0xFF) out.push(code);
    else out.push(0x3F);
  }
  return out;
}
const escapePdf = text => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
function wrap(line, max) {
  if (line.length <= max) return [line];
  const parts = []; let rest = line;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart();
  }
  parts.push(rest);
  return parts;
}
// Logo de l'entreprise pour le PDF : converti en JPEG (format lisible par le PDF), sans bibliothèque.
export async function logoForPdf(url) {
  if (!url) return null;
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0);
    const bin = atob(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, w, h };
  } catch { return null; }
}

export function textPdf(title, lines, footer = '', logo = null) {
  const W = 595, H = 842, LH = 13, TOP = 790, BOTTOM = 60, PER_PAGE = Math.floor((TOP - BOTTOM) / LH);
  const LOGO_W = 120, logoH = logo ? Math.round(LOGO_W * logo.h / logo.w) : 0;
  const headRows = logo ? Math.ceil((logoH + 16) / LH) : 0; // place réservée au logo sur la première page
  const rows = [];
  // Espaces conservés : les colonnes du rapport restent alignées.
  for (const line of lines) rows.push(...wrap(String(line).replace(/\t/g, '  ').trimEnd(), 100));
  const pages = [];
  let k = 0, first = true;
  while (k < rows.length || first) {
    const cap = first ? PER_PAGE - headRows : PER_PAGE;
    pages.push(rows.slice(k, k + Math.max(cap, 1)));
    k += Math.max(cap, 1); first = false;
  }
  if (!pages.length) pages.push([]);
  const chunks = []; let size = 0;
  const push = part => { const b = typeof part === 'string' ? bytesOf(part) : part; chunks.push(Uint8Array.from(b)); size += b.length; };
  const offsets = [];
  const object = (id, body) => { offsets[id] = size; push(`${id} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n');
  const pageIds = pages.map((_, i) => 5 + i * 2);
  const imgId = 5 + pages.length * 2;
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  object(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((rowsOfPage, i) => {
    const pageId = pageIds[i], contentId = pageId + 1;
    let stream = '';
    let y = TOP;
    const withLogo = i === 0 && logo;
    if (withLogo) stream += `q ${LOGO_W} 0 0 ${logoH} 50 ${H - 30 - logoH} cm /Im1 Do Q\n`;
    if (i === 0) {
      if (withLogo) y = H - 30 - logoH - 14;
      stream += `BT /F2 14 Tf 50 ${y} Td (${escapePdf(title)}) Tj ET\n`; y -= 26;
      if (footer) { stream += `BT /F1 9 Tf 50 ${y} Td (${escapePdf(footer)}) Tj ET\n`; y -= 22; }
    }
    const startY = y;
    stream += `BT /F1 8 Tf ${LH} TL 50 ${startY} Td\n`;
    // Titres de section (majuscules, sans chiffres) : en gras, avec un filet dessous.
    // Un trait ne peut pas être dessiné dans un bloc de texte : on ferme le bloc, on trace, puis on le rouvre.
    const isHeading = row => row.trim().length >= 4 && row.trim() === row.trim().toUpperCase() && !/[0-9$]/.test(row) && /[A-ZÀ-Ý]/.test(row);
    rowsOfPage.forEach((row, r) => {
      if (isHeading(row)) {
        const base = startY - r * LH;
        stream += `/F2 9 Tf (${escapePdf(row.trim())}) Tj ET\n`;
        stream += `0.6 w 50 ${base - 3} m 545 ${base - 3} l S\n`;
        stream += `BT /F1 8 Tf ${LH} TL 50 ${startY - (r + 1) * LH} Td\n`;
      } else {
        stream += `(${escapePdf(row)}) Tj T*\n`;
      }
    });
    stream += 'ET\n';
    stream += `BT /F1 8 Tf 50 30 Td (Page ${i + 1} / ${pages.length} - KaPya ERP) Tj ET\n`;
    const xobj = withLogo ? ` /XObject << /Im1 ${imgId} 0 R >>` : '';
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> /Contents ${contentId} 0 R >>`);
    const bytes = bytesOf(stream);
    object(contentId, `<< /Length ${bytes.length} >>\nstream\n${stream}endstream`);
  });
  if (logo) {
    offsets[imgId] = size;
    push(`${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`);
    push(logo.bytes);
    push('\nendstream\nendobj\n');
  }
  const xrefAt = size, total = offsets.length;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
