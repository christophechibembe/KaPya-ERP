// Interroge une copie locale (tableau de lignes) avec une syntaxe PostgREST réduite.
// Utilisé uniquement quand le réseau est absent : les colonnes simples, les filtres
// eq/neq/gt/gte/lt/lte/in, le tri et la limite sont appliqués sur l'appareil.
// Les relations déjà embarquées (ex. sale_lines(...), clients(name)) sont renvoyées
// telles quelles ; un filtre ou un tri sur une relation n'est pas simulé.
const splitTopLevel = (value, separator = ',') => {
  let depth = 0, current = '', out = [];
  for (const char of String(value)) {
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) { out.push(current); current = ''; }
    else current += char;
  }
  if (current) out.push(current);
  return out;
};

const numeric = value => (typeof value === 'number' ? value : (value === '' || value == null || isNaN(Number(value)) ? null : Number(value)));

export function localSelect(path, canonicalRows) {
  const [base, qs = ''] = String(path).replace(/^\/rest\/v1\//, '').split('?');
  if (!base) return undefined;
  const params = qs.split('&').filter(Boolean).map(pair => {
    const i = pair.indexOf('=');
    return [pair.slice(0, i), decodeURIComponent(pair.slice(i + 1))];
  });
  let cols = null, order = [], limit = null;
  const filters = [];
  for (const [key, value] of params) {
    if (key === 'select') {
      if (value === '*') cols = null;
      else cols = splitTopLevel(value).map(col => col.trim()).filter(Boolean);
    } else if (key === 'order') {
      order = splitTopLevel(value).map(item => {
        const parts = item.split('.');
        return { c: parts[0], desc: parts[1] === 'desc', relation: parts.length > 2 };
      });
    } else if (key === 'limit') limit = Number(value);
    else if (key === 'offset') return undefined;
    else {
      const match = value.match(/^(eq|neq|gt|gte|lt|lte|in)\.(.*)$/);
      if (!match) return undefined;
      if (key.includes('.')) return undefined; // filtre sur une relation : non simulé
      filters.push({ c: key, op: match[1], v: match[2] });
    }
  }
  if (order.some(item => item.relation || item.c.includes('.'))) return undefined;

  const match = (row, filter) => {
    const actual = row[filter.c];
    if (filter.op === 'in') {
      const set = filter.v.replace(/^\(|\)$/g, '').split(',').map(item => item.trim());
      return set.includes(String(actual));
    }
    if (filter.op === 'eq') return String(actual) === filter.v;
    if (filter.op === 'neq') return String(actual) !== filter.v;
    const na = numeric(actual), nv = numeric(filter.v);
    if (na !== null && nv !== null) return ({ gt: na > nv, gte: na >= nv, lt: na < nv, lte: na <= nv })[filter.op];
    const sa = String(actual ?? ''), sv = filter.v;
    return ({ gt: sa > sv, gte: sa >= sv, lt: sa < sv, lte: sa <= sv })[filter.op];
  };
  let rows = (canonicalRows || []).filter(row => filters.every(filter => match(row, filter)));
  if (order.length) rows = [...rows].sort((left, right) => {
    for (const item of order) {
      const a = left[item.c], b = right[item.c];
      if (a === b) continue;
      const aNum = numeric(a), bNum = numeric(b);
      const result = aNum !== null && bNum !== null ? aNum - bNum : String(a ?? '').localeCompare(String(b ?? ''), 'fr');
      return item.desc ? -result : result;
    }
    return 0;
  });
  if (limit && Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);
  if (cols) rows = rows.map(row => {
    const projected = {};
    for (const col of cols) {
      const name = col.split('(')[0].trim();
      if (row[name] !== undefined) projected[name] = row[name];
    }
    return projected;
  });
  return rows;
}
