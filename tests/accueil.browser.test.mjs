// Tableau de bord : filtre des dates et mise à jour automatique. Navigateur réel, API simulée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath, openBrowser } from './browser-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

test('Tableau de bord dans Chromium (données isolées)', { skip: !browserPath, timeout: 90000 }, async t => {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      let file = pathname;
      if (pathname === '/') file = '/tests/fixtures/accueil.html';
      if (pathname === '/js/api.js') file = '/tests/fixtures/accueil-api.mjs';
      const full = path.resolve(root, '.' + file);
      if (!full.startsWith(root + path.sep)) throw new Error('Chemin interdit');
      res.setHeader('Content-Type', (mime[path.extname(file)] || 'text/plain') + '; charset=utf-8');
      res.end(await readFile(full));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const page = await openBrowser(t);
  await page.viewport(1440, 900);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate('window.ready');

  await t.test('les ventes du jour comptent, même si sold_at contient une heure', async () => {
    const text = await page.evaluate('window.text()');
    assert.match(text, /25,00 \$/, `chiffre d’affaires attendu 25,00 $ : ${text.slice(0, 400)}`);
    assert.match(text, /2 vente\(s\)/, 'les deux ventes du jour doivent être comptées');
  });

  await t.test('les ventes cash seules ne sont pas des paiements de créances', async () => {
    const receipt = await page.evaluate(`(() => {
      const card = [...document.querySelectorAll('.mdp-kpis .mdp-kpi')].find(el => el.querySelector('.mdp-kpi-label').textContent === 'Paiements reçus');
      return { amount: card.querySelector('b').textContent, note: card.querySelector('.mdp-kpi-note').textContent };
    })()`);
    assert.equal(receipt.amount, '0,00 $');
    assert.equal(receipt.note, '0 encaissement(s)');
  });

  await t.test('le résultat net déduit les dépenses de la période', async () => {
    await page.evaluate(`window.addExpense({ amount: 5 })`);
    await page.evaluate(`window.fireSync()`);
    assert.equal(await page.evaluate(`window.waitFor('Résultat net')`), true, 'l’indicateur « Résultat net » doit être affiché');
    assert.equal(await page.evaluate(`window.waitFor('Bénéfice brut moins 5,00 $ de dépenses')`), true, 'bénéfice brut 25,00 $ moins 5,00 $ de dépenses');
    const text = await page.evaluate('window.text()');
    assert.match(text, /20,00 \$/);
    assert.match(text, /Bénéfice brut moins 5,00 \$ de dépenses/);
  });

  await t.test('un bouton Actualiser est toujours visible et l’heure du dernier calcul est affichée', async () => {
    assert.equal(await page.evaluate(`document.querySelector('#owner-refresh') !== null`), true);
    assert.equal(await page.evaluate(`document.querySelector('#owner-refresh').hidden`), false);
    assert.equal(await page.evaluate(`document.querySelector('#owner-updated').hidden`), false);
    assert.match(await page.evaluate(`document.querySelector('#owner-updated').textContent`), /Chiffres à jour/);
  });

  await t.test('une synchronisation (nouvelle vente) recharge les chiffres sans changer de page', async () => {
    await page.evaluate(`window.addSale({ qty: 1, unit: 10 })`);
    assert.match(await page.evaluate('window.text()'), /25,00 \$/, 'rien ne doit changer avant l’événement');
    await page.evaluate(`window.fireSync()`);
    assert.equal(await page.evaluate(`window.waitFor('35,00 $')`), true, 'le tableau de bord doit se mettre à jour tout seul');
    assert.match(await page.evaluate('window.text()'), /3 vente\(s\)/);
  });

  await t.test('le retour sur l’onglet ne recharge pas en boucle et garde les chiffres', async () => {
    const before = await page.evaluate(`document.querySelector('#owner-updated').textContent`);
    await page.evaluate(`window.dispatchEvent(new Event('focus'))`);
    assert.match(await page.evaluate('window.text()'), /35,00 \$/);
    assert.equal(await page.evaluate(`document.querySelector('#owner-updated').textContent`), before);
  });

  await t.test('le commutateur de présentation change l’habillage sans recharger', async () => {
    const label = () => page.evaluate(`document.querySelector('#owner-mode').textContent`);
    const bodyClass = name => page.evaluate(`document.body.classList.contains(${JSON.stringify(name)})`);

    // Sur ordinateur, la présentation moderne est appliquée automatiquement.
    assert.equal(await bodyClass('dashboard-mode-pc'), true);
    assert.equal(await label(), 'Présentation : Moderne PC');
    assert.equal(await page.evaluate(`document.querySelector('.mdp') !== null`), true, 'le rendu moderne PC doit être affiché');
    assert.equal(await page.evaluate(`document.querySelector('.mdp-kpis .mdp-kpi') !== null`), true, 'les indicateurs modernes doivent être affichés');
    assert.equal(await page.evaluate(`document.querySelector('svg.md-chart') !== null`), true, 'la courbe des ventes doit être affichée');
    assert.equal(await page.evaluate(`document.querySelectorAll('#owner-period option').length`), 7, 'les sept périodes doivent être proposées');
    const callsBefore = await page.evaluate('window.fixture.calls.length');

    // Clic 1 : version mobile, immédiatement.
    await page.evaluate(`document.querySelector('#owner-mode').click()`);
    assert.equal(await bodyClass('dashboard-mode-mobile'), true);
    assert.equal(await bodyClass('dashboard-mode-pc'), false);
    assert.equal(await label(), 'Présentation : Moderne mobile');
    assert.equal(await page.evaluate(`document.querySelector('.mdm-header') !== null`), true, 'l’en-tête mobile doit être affiché');
    assert.equal(await page.evaluate(`document.querySelectorAll('.mdm-kpis .mdp-kpi').length`), 4, 'quatre cartes KPI sur téléphone');
    assert.equal(await page.evaluate(`document.querySelector('#owner-period').value`), '7', 'la période choisie est conservée');
    assert.equal(await page.evaluate(`document.querySelector('#nav a[data-r=accueil] span').textContent`), 'Accueil');
    assert.equal(await page.evaluate(`document.querySelector('#nav a[data-r=ventes] span').textContent`), 'Ventes');
    assert.equal(await page.evaluate(`document.querySelector('#nav a[data-r=stocks] span').textContent`), 'Stock');

    // Clic 2 : retour au tableau de bord classique, sans rechargement.
    await page.evaluate(`document.querySelector('#owner-mode').click()`);
    assert.equal(await bodyClass('dashboard-mode-mobile'), false);
    assert.equal(await bodyClass('dashboard-mode-pc'), false);
    assert.equal(await label(), 'Présentation : Classique');
    assert.equal(await page.evaluate(`document.querySelector('.owner-head') !== null`), true, 'le rendu classique doit être restauré');
    assert.equal(await page.evaluate(`document.querySelector('.mdp') === null && document.querySelector('.mdm') === null`), true, 'aucun reste du rendu moderne');
    assert.equal(await page.evaluate(`document.querySelector('#nav a[data-r=accueil] span').textContent`), 'Tableau de bord', 'le libellé classique doit être restauré');
    assert.equal(await page.evaluate(`document.querySelector('#owner-content').textContent.includes('35,00 $')`), true,
      'les chiffres restent identiques après le changement de présentation');

    // Clic 3 : de nouveau la version PC, et le choix est mémorisé.
    await page.evaluate(`document.querySelector('#owner-mode').click()`);
    assert.equal(await bodyClass('dashboard-mode-pc'), true);
    assert.equal(await label(), 'Présentation : Moderne PC');
    assert.equal(await page.evaluate(`localStorage.getItem('kp.dashboard.mode')`), 'modern_pc');
    assert.equal(await page.evaluate('window.fixture.calls.length'), callsBefore, 'changer de rendu ne doit pas refaire les requêtes');
  });

  await t.test('paiements de crédits, avances et dépôts restent distincts dans les deux modes modernes', async () => {
    await page.evaluate(`(async () => {
      await window.boot({ mode: 'modern_pc' });
      const old = new Date(); old.setDate(old.getDate() - 40);
      const older = old.toLocaleDateString('sv-SE');
      const oldCredit = window.addSale({ payment: 'credit', unit: 60, soldAt: older, paid: 12 });
      const credit = window.addSale({ payment: 'credit', unit: 40, paid: 13 });
      window.addPayment({ saleId: oldCredit, amount: 12 });
      window.addPayment({ saleId: credit, amount: 5, kind: 'initial' });
      window.addPayment({ saleId: credit, amount: 8, kind: 'advance' });
      window.addPayment({ saleId: oldCredit, amount: 100, paidAt: older });
      window.fixture.deposits.push({ id: 'deposit', amount: 30, received_at: new Date().toLocaleDateString('sv-SE') });
      document.querySelector('#owner-refresh').click();
      await window.waitFor('65,00 $');
    })()`);
    const receipt = () => page.evaluate(`(() => {
      const card = [...document.querySelectorAll('.mdp-kpi')].find(el => el.querySelector('.mdp-kpi-label').textContent === 'Paiements reçus');
      return { amount: card.querySelector('b').textContent, note: card.querySelector('.mdp-kpi-note').textContent };
    })()`);
    assert.deepEqual(await receipt(), { amount: '17,00 $', note: '2 encaissement(s)' });
    assert.match(await page.evaluate(`document.querySelector('.mdp-activity').textContent`), /Paiement de crédit/);
    const cashIn = await page.evaluate(`[...document.querySelectorAll('.mdp-kpi')].find(el => el.querySelector('.mdp-kpi-label').textContent === 'Entrées de trésorerie').querySelector('b').textContent`);
    assert.equal(cashIn, '72,00 $', 'la trésorerie conserve les ventes cash, règlements et dépôts réels');
    await page.evaluate(`document.querySelector('#owner-mode').click()`);
    assert.deepEqual(await receipt(), { amount: '17,00 $', note: '2 encaissement(s)' });
    assert.match(await page.evaluate(`document.querySelector('.mdm-activity').textContent`), /Paiement de crédit/);
  });

  await t.test('le donut utilise payment_method pour les ventes comptant', async () => {
    await page.evaluate(`(async () => {
      await window.boot({ mode: 'modern_pc' });
      window.addSale({ unit: 10, method: 'mobile_money' });
      window.addSale({ unit: 15, method: 'bank' });
      window.addSale({ unit: 20, payment: 'credit' });
      document.querySelector('#owner-refresh').click();
      await window.waitFor('70,00 $');
    })()`);
    const legend = await page.evaluate(`[...document.querySelectorAll('.mdp-donut-legend li')].map(li => ({ label: li.children[1].textContent, amount: li.querySelector('b').textContent }))`);
    assert.deepEqual(legend, [
      { label: 'Espèces', amount: '25,00 $' },
      { label: 'Mobile money', amount: '10,00 $' },
      { label: 'Virement', amount: '15,00 $' },
      { label: 'À crédit', amount: '20,00 $' }
    ]);
  });

  await t.test('une période personnalisée conserve ses dates et son bouton Afficher au changement de rendu', async () => {
    await page.evaluate(`(async () => {
      await window.boot({ mode: 'modern_pc' });
      document.querySelector('#owner-period').value = 'custom';
      document.querySelector('#owner-period').dispatchEvent(new Event('change'));
      document.querySelector('#owner-from').value = document.querySelector('#owner-to').value;
      document.querySelector('#owner-run').click();
      await window.waitFor('25,00 $');
    })()`);
    const before = await page.evaluate(`({ from: document.querySelector('#owner-from').value, to: document.querySelector('#owner-to').value })`);
    for (const mode of ['modern_mobile', 'classic', 'modern_pc']) {
      await page.evaluate(`document.querySelector('#owner-mode').click()`);
      assert.equal(await page.evaluate('document.documentElement.dataset.dashboardMode'), mode);
      assert.deepEqual(await page.evaluate(`({ from: document.querySelector('#owner-from').value, to: document.querySelector('#owner-to').value })`), before);
      assert.equal(await page.evaluate(`document.querySelector('#owner-run').hidden`), false);
      assert.equal(await page.evaluate(`document.querySelector('#owner-period').value`), 'custom');
    }
  });

  await t.test('les blocs masqués ne réapparaissent pas dans les détails modernes', async () => {
    for (const mode of ['modern_pc', 'modern_mobile']) {
      await page.evaluate(`window.boot({ mode: ${JSON.stringify(mode)}, blocks: ['charts'] })`);
      assert.equal(await page.evaluate(`document.querySelectorAll('.mdp-kpi, .mdm-hero, .mdm-more').length`), 0);
      const text = await page.evaluate('window.text()');
      assert.doesNotMatch(text, /Résumé de caisse du jour|Points à surveiller/);
      assert.equal(await page.evaluate(`document.querySelector('svg.md-chart') !== null`), true);
    }
  });

  await t.test('les rôles sans accès aux coûts ne voient aucun montant protégé', async () => {
    await page.evaluate(`window.boot({ mode: 'modern_pc', role: 'manager' })`);
    assert.doesNotMatch(await page.evaluate('window.text()'), /Bénéfice brut|Résultat net|Valeur du stock|Sorties de trésorerie/);
    assert.equal(await page.evaluate(`window.fixture.calls.some(call => ['sale_cost_snapshots', 'purchase_payments', 'business_expenses'].includes(call.table))`), false);
  });

  await t.test('les deux rendus s’adaptent sans modifier le choix ni déborder de 320 à 1440 px', async () => {
    for (const mode of ['modern_pc', 'modern_mobile']) {
      await page.evaluate(`window.boot({ mode: ${JSON.stringify(mode)} })`);
      await page.evaluate(`document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close())`);
      for (const width of [320, 360, 390, 767, 768, 1199, 1200, 1440]) {
        await page.viewport(width, 900);
        await page.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
        const geometry = await page.evaluate(`(() => {
          const selectors = ['main', '.mdp-filters', '.mdp-kpi', '.mdm-filters', '.mdm-header', '.mdm-avatar', '#owner-period', '#shop-select'];
          const clipped = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(el => {
            const box = el.getBoundingClientRect();
            return box.width && (box.left < -1 || box.right > innerWidth + 1);
          }).map(el => el.className || el.id));
          const smallTargets = [...document.querySelectorAll('#nav a')].filter(el => {
            const box = el.getBoundingClientRect();
            return box.width && (box.width < 44 || box.height < 44);
          }).map(el => el.dataset.r);
          return { mode: document.documentElement.dataset.dashboardMode, stored: localStorage.getItem('kp.dashboard.mode'), clipped, smallTargets, scrollWidth: document.documentElement.scrollWidth, width: innerWidth };
        })()`);
        assert.equal(geometry.mode, mode, `mode conservé à ${width}px`);
        assert.equal(geometry.stored, mode);
        assert.deepEqual(geometry.clipped, [], `${mode} : éléments rognés à ${width}px`);
        assert.deepEqual(geometry.smallTargets, [], `${mode} : cibles de navigation trop petites à ${width}px`);
        assert.ok(geometry.scrollWidth <= geometry.width, `${mode} : défilement horizontal à ${width}px`);
        if (width >= 768 && width < 1200) {
          assert.equal(await page.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(mode === 'modern_pc' ? '.mdp-kpis' : '.mdm-kpis')})).gridTemplateColumns.split(' ').length`), 2, 'deux colonnes sur tablette');
        }
      }
    }
    assert.deepEqual(page.errors, [], 'aucune exception JavaScript dans le navigateur');
  });

  await t.test('le menu mobile reste utilisable au clavier avec des cibles de 44 px', async () => {
    await page.viewport(390, 900);
    await page.evaluate(`(async () => {
      await window.boot({ mode: 'modern_mobile' });
      document.querySelector('#owner-period').value = 'custom';
      document.querySelector('#owner-period').dispatchEvent(new Event('change'));
    })()`);
    await page.evaluate(`document.querySelector('.mdm-menu > summary').focus()`);
    await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.equal(await page.evaluate(`document.querySelector('.mdm-menu').open`), true);
    await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert.equal(await page.evaluate('document.activeElement.id'), 'owner-refresh');
    for (const width of [320, 360, 390]) {
      await page.viewport(width, 900);
      const targets = await page.evaluate(`['.mdm-menu > summary', '#owner-period', '#shop-select', '#owner-from', '#owner-to', '.mdm-avatar', '.mdm-iconbtn', '#owner-refresh'].map(selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { selector, width: box.width, height: box.height, left: box.left, right: box.right, viewport: innerWidth };
      })`);
      for (const target of targets) {
        assert.ok(target.width >= 44 && target.height >= 44, `cible tactile : ${JSON.stringify(target)}`);
        assert.ok(target.left >= 0 && target.right <= target.viewport, `cible rognée : ${JSON.stringify(target)}`);
      }
    }
  });
});
