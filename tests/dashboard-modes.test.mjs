// Présentation du tableau de bord : détection, préférences et application.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const storage = new MemoryStorage();
globalThis.localStorage = storage;

const win = new EventTarget();
win.innerWidth = 1440;
globalThis.window = win;

const classes = new Set();
globalThis.document = {
  documentElement: { dataset: {} },
  body: {
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    }
  }
};

const modes = await import('../js/dashboard-modes.js');

test('détection automatique aux points d’arrêt 320 / 768 / 1024', () => {
  assert.equal(modes.detectMode(319), 'classic');
  assert.equal(modes.detectMode(320), 'modern_mobile');
  assert.equal(modes.detectMode(767), 'modern_mobile');
  assert.equal(modes.detectMode(768), 'modern_pc');
  assert.equal(modes.detectMode(1023), 'modern_pc');
  assert.equal(modes.detectMode(1024), 'modern_pc');
  assert.equal(modes.detectMode(1440), 'modern_pc');
});

test('le choix est enregistré pour le compte et pour l’appareil', () => {
  modes.setMode('modern_pc', 'compte-a');
  assert.equal(modes.getUserMode('compte-a'), 'modern_pc');
  assert.equal(modes.getDeviceMode(), 'modern_pc');
  assert.equal(modes.resolveMode('compte-a'), 'modern_pc');
});

test('un autre compte sur le même appareil reprend la préférence de l’appareil', () => {
  assert.equal(modes.getUserMode('compte-b'), null);
  assert.equal(modes.resolveMode('compte-b'), 'modern_pc');
});

test('un choix explicite « Classique » est respecté, même sur grand écran', () => {
  modes.setMode('classic', 'compte-b');
  assert.equal(modes.resolveMode('compte-b'), 'classic');
});

test('« Moderne PC » choisi sur un téléphone bascule en mobile pour rester lisible', () => {
  modes.setMode('modern_pc', 'compte-c');
  const previous = win.innerWidth;
  win.innerWidth = 390;
  assert.equal(modes.resolveMode('compte-c'), 'modern_mobile');
  win.innerWidth = previous;
});

test('sur téléphone, choisir « Moderne PC » applique la version mobile', () => {
  const previous = win.innerWidth;
  win.innerWidth = 390;
  assert.equal(modes.setMode('modern_pc', 'compte-f'), 'modern_mobile');
  assert.equal(modes.getDeviceMode(), 'modern_mobile');
  assert.equal(modes.getUserMode('compte-f'), 'modern_pc');
  win.innerWidth = previous;
  modes.setMode('classic', 'compte-f');
});

test('le commutateur fait le tour Classique → PC → mobile → Classique', () => {
  modes.setMode('classic', 'compte-d');
  assert.equal(modes.nextMode('compte-d'), 'modern_pc');
  modes.setMode('modern_pc', 'compte-d');
  assert.equal(modes.nextMode('compte-d'), 'modern_mobile');
  modes.setMode('modern_mobile', 'compte-d');
  assert.equal(modes.nextMode('compte-d'), 'classic');
});

test('appliquer une présentation ne touche qu’aux classes d’habillage', () => {
  modes.applyMode('modern_mobile');
  assert.equal(document.documentElement.dataset.dashboardMode, 'modern_mobile');
  assert.equal(classes.has('dashboard-mode-mobile'), true);
  assert.equal(classes.has('dashboard-mode-pc'), false);

  modes.applyMode('modern_pc');
  assert.equal(document.documentElement.dataset.dashboardMode, 'modern_pc');
  assert.equal(classes.has('dashboard-mode-pc'), true);
  assert.equal(classes.has('dashboard-mode-mobile'), false);

  modes.applyMode('classic');
  assert.equal(classes.has('dashboard-mode-pc'), false);
  assert.equal(classes.has('dashboard-mode-mobile'), false);
});

test('un mode inconnu est refusé', () => {
  assert.throws(() => modes.setMode('autre', 'compte-e'), /inconnue/);
});

test('le choix est proposé sur les deux pages Paramètres (équipe et standard)', async () => {
  const source = await readFile(new URL('../js/modules/parametres.js', import.meta.url), 'utf8');
  const cards = source.match(/\$\{section\('Présentation du tableau de bord', dashboardModeCard\(ctx\), true\)\}/g) || [];
  const binds = source.match(/bindDashboardMode\(main, ctx\);/g) || [];
  assert.equal(cards.length, 2, 'la section doit apparaître dans render() et renderTeam()');
  assert.equal(binds.length, 2, 'les boutons doivent être reliés dans les deux cas');
});
