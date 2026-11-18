// Saisie et sécurité : politique de mot de passe, lecture des fichiers d'import CSV,
// conversion des nombres au format français ou anglais. Aucun réseau, aucun navigateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { weakPasswordReason } from '../js/password.js';
import { parseCsv, toNumber } from '../js/csv.js';

// export.js charge api.js, qui lit localStorage au démarrage : on fournit un stockage neutre.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { csvNumber } = await import('../js/export.js');

test('mot de passe : trop court ou trop courant est refusé', () => {
  assert.match(weakPasswordReason('court'), /au moins 8 caractères/);
  assert.match(weakPasswordReason(''), /au moins 8 caractères/);
  for (const weak of ['password', 'Password123', 'motdepasse', 'azerty123', 'admin123', 'kapya2026', '12345678']) {
    assert.match(weakPasswordReason(weak), /trop courant/, `${weak} doit être refusé`);
  }
});

test('mot de passe : répétitions et suites évidentes sont refusées', () => {
  assert.match(weakPasswordReason('aaaaaaaa'), /seule lettre ou un seul chiffre/);
  assert.match(weakPasswordReason('xxxxxxxx'), /seule lettre ou un seul chiffre/);
  assert.match(weakPasswordReason('00000000'), /trop courant/);
  for (const weak of ['123456ab', 'abcdefgh', 'qwertyui', 'asdfghjk']) {
    assert.match(weakPasswordReason(weak), /suites évidentes/, `${weak} doit être refusé`);
  }
});

test('mot de passe : l’adresse e-mail ne doit pas y figurer', () => {
  assert.match(weakPasswordReason('Christophe2026', 'christophe@exemple.com'), /adresse e-mail/);
  assert.match(weakPasswordReason('monchristophe2026', 'christophe@exemple.com'), /adresse e-mail/);
  // Une partie locale trop courte n'est pas contrôlée (risque de faux refus).
  assert.equal(weakPasswordReason('Christophe2026', 'cc@exemple.com'), '');
});

test('mot de passe : un mot de passe solide est accepté', () => {
  assert.equal(weakPasswordReason('Bonjour2026'), '');
  assert.equal(weakPasswordReason('Kp-2026-Bukavu!'), '');
  assert.equal(weakPasswordReason('Bonjour2026', 'autre@exemple.com'), '');
});

test('CSV : séparateur point-virgule, virgule ou tabulation détecté', () => {
  const semi = parseCsv('Nom;Prix\nSac;10\n');
  assert.deepEqual(semi.headers, ['nom', 'prix']);
  assert.deepEqual(semi.records, [{ nom: 'Sac', prix: '10' }]);

  const comma = parseCsv('Nom,Ville\nA,B\nC,D\n');
  assert.deepEqual(comma.headers, ['nom', 'ville']);
  assert.equal(comma.records.length, 2);

  const tab = parseCsv('Nom\tVille\nA\tB\n');
  assert.deepEqual(tab.headers, ['nom', 'ville']);
  assert.deepEqual(tab.records, [{ nom: 'A', ville: 'B' }]);
});

test('CSV : guillemets, séparateur et guillemet doublé restent dans la cellule', () => {
  const { records } = parseCsv('Nom;Note\r\n"Sac; grand";12\r\n"Dites ""oui""";7\r\n');
  assert.deepEqual(records, [
    { nom: 'Sac; grand', note: '12' },
    { nom: 'Dites "oui"', note: '7' }
  ]);
});

test('CSV : en-têtes normalisés, lignes vides ignorées, BOM retiré', () => {
  const { headers, records } = parseCsv('\uFEFFCode Postal;Désignation\r\n\r\n123;Chaise\r\n;;\r\n');
  assert.deepEqual(headers, ['code_postal', 'designation']);
  assert.deepEqual(records, [{ code_postal: '123', designation: 'Chaise' }]);
  assert.deepEqual(parseCsv(''), { headers: [], records: [] });
});

test('nombres importés : formats français, anglais, espaces et erreurs', () => {
  assert.equal(toNumber('1 234,50'), 1234.5);
  assert.equal(toNumber('1234.5'), 1234.5);
  assert.equal(toNumber(' 12 '), 12);
  assert.equal(toNumber(''), 0, 'une cellule vide vaut zéro');
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber('abc'), null, 'un texte n’est pas un nombre');
  assert.equal(toNumber(undefined), 0);
});

test('nombres exportés : deux décimales avec virgule', () => {
  assert.equal(csvNumber(12), '12,00');
  assert.equal(csvNumber('7.5'), '7,50');
  assert.equal(csvNumber(0.1 + 0.2), '0,30');
  assert.equal(csvNumber(null), '0,00');
});
