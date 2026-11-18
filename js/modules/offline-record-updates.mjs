// Mises à jour locales de fiches mises en attente de synchronisation.
export function applyCachedRecordUpdate(rows, patch, pending = true) {
  let changed = false;
  rows.forEach(row => {
    if (row.id !== patch.id) return;
    Object.assign(row, patch);
    if (pending) row._offline_pending = true;
    else delete row._offline_pending;
    changed = true;
  });
  return changed;
}

export function restoreCachedRecord(rows, id, previous) {
  if (!previous) return false;
  let changed = false;
  rows.forEach((row, index) => {
    if (row.id !== id) return;
    rows[index] = JSON.parse(JSON.stringify(previous));
    changed = true;
  });
  return changed;
}

export function setCachedRecordPending(rows, id, pending) {
  let changed = false;
  rows.forEach(row => {
    if (row.id !== id) return;
    if (pending && !row._offline_pending) { row._offline_pending = true; changed = true; }
    else if (!pending && row._offline_pending) { delete row._offline_pending; changed = true; }
  });
  return changed;
}
