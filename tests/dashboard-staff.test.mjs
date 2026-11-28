// Tableau de bord du facturier : les trois présentations gardent le même écran
// « Activité du jour » et les mêmes chiffres ; le classique reste inchangé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { staffShell, staffContent } from '../js/dashboard-staff.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jour = {
  dayLabel: '28/11/2026',
  cash: '100,00 $', credit: '200,00 $', receipt: '50,00 $', collected: '150,00 $',
  counts: { cash: 1, credit: 2, receipt: 3, all: 6 },
  rowsHtml: '<div class="tw"><table><tbody><tr><td>FACT-1</td></tr></tbody></table></div>'
};

test('la présentation classique du facturier est inchangée', () => {
  const html = staffShell('classic', { today: '2026-11-28', greet: '<p class="greet">Bonjour Jean</p>' });
  assert.match(html, /class="page-head owner-head"/);
  assert.match(html, /<h1>Activité du jour<\/h1>/);
  assert.match(html, /id="staff-day"/);
  assert.doesNotMatch(html, /id="owner-mode"/, 'aucun bouton de présentation dans l’ancien rendu');
  assert.equal(staffContent('classic', jour), null, 'le contenu classique reste dans accueil.js');
});

test('la présentation moderne mobile garde le même écran avec son bouton de présentation', () => {
  const html = staffShell('modern_mobile', { today: '2026-11-28', greet: '<p class="greet">Bonjour Jean</p>', modeLabel: 'Moderne mobile' });
  assert.match(html, /class="mdm staff-day"/);
  assert.match(html, /<h1>Activité du jour<\/h1>/);
  assert.match(html, /id="staff-day"/);
  assert.match(html, /id="owner-mode"[^>]*>Présentation : Moderne mobile/);
  assert.match(html, /id="staff-day-content" class="mdm-body"/);
  assert.match(html, /Ventes cash, ventes à crédit et paiements de crédits reçus/);
});

test('la présentation moderne PC garde le même écran', () => {
  const html = staffShell('modern_pc', { today: '2026-11-28', modeLabel: 'Moderne PC' });
  assert.match(html, /class="mdp staff-day"/);
  assert.match(html, /<h1>Activité du jour<\/h1>/);
  assert.match(html, /id="staff-day"/);
  assert.match(html, /id="owner-mode"[^>]*>Présentation : Moderne PC/);
});

test('les deux rendus modernes affichent exactement les mêmes chiffres et opérations', () => {
  for (const mode of ['modern_mobile', 'modern_pc']) {
    const html = staffContent(mode, jour);
    for (const valeur of [jour.cash, jour.credit, jour.receipt, jour.collected, '28/11/2026', 'FACT-1']) {
      assert.ok(html.includes(valeur), `${mode} doit afficher ${valeur}`);
    }
    assert.match(html, /Opérations de la journée/);
    assert.match(html, /class="tw"/);
  }
  assert.match(staffContent('modern_mobile', jour), /class="mdm-hero"/);
  assert.match(staffContent('modern_mobile', jour), /class="mdm-kpis"/);
  assert.match(staffContent('modern_pc', jour), /class="mdp-kpis"/);
});

test('le vide reste explicite dans le rendu moderne', () => {
  const html = staffContent('modern_mobile', { ...jour, rowsHtml: '<p class="staff-activity-empty">Aucune vente ni aucun encaissement enregistré pour cette journée.</p>' });
  assert.match(html, /Aucune vente ni aucun encaissement/);
});

test('l’écran du facturier utilise bien ces présentations et le changement est câblé', async () => {
  const source = await readFile(path.join(root, 'js/modules/accueil.js'), 'utf8');
  assert.match(source, /staffShell\(activeMode/, 'la coquille suit la présentation résolue');
  assert.match(source, /staffContent\(activeMode/, 'le contenu suit la présentation résolue');
  const branche = source.slice(source.indexOf("ctx?.role === 'facturier'"), source.indexOf('const classicPage'));
  assert.match(branche, /owner-mode/, 'le bouton de présentation doit exister pour le facturier');
  assert.match(branche, /setDashboardMode\(nextDashboardMode\(\), ctx\?\.id\)/, 'le bouton doit changer la présentation');
});
