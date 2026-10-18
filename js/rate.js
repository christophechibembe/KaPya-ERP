import { db } from './api.js';
import { setRate } from './ui.js';
// Date locale au format AAAA-MM-JJ
const today = () => new Date().toLocaleDateString('sv-SE');
export async function loadRate() {
  try { const [r] = await db.select('settings', 'select=usd_cdf,rate_date&limit=1'); setRate(r || null); }
  catch { setRate(null); }
}
export async function saveRate(usd_cdf) {
  const row = { usd_cdf, rate_date: today() };
  await db.upsert('settings', row, 'org_id');
  setRate(row);
}
