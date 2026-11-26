// Suppression d'un acompte : garde-fous SQL, cohérence avec le schéma de référence,
// câblage de l'écran et refus explicite du mode hors ligne.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await readFile(path.join(root, 'supabase/migrations/20261126000000_supprimer_acompte.sql'), 'utf8');
const schema = await readFile(path.join(root, 'sql/schema-production.sql'), 'utf8');
const ecran = await readFile(path.join(root, 'js/modules/acomptes.js'), 'utf8');
const api = await readFile(path.join(root, 'js/api.js'), 'utf8');
const demo = await readFile(path.join(root, 'js/demo.js'), 'utf8');

test('la migration définit delete_customer_deposit durcie', () => {
  assert.match(migration, /create or replace function public\.delete_customer_deposit\(p_id uuid\)/i);
  assert.match(migration, /security definer/i, 'la fonction doit être SECURITY DEFINER');
  assert.match(migration, /set search_path to/i, 'search_path doit être verrouillé');
  assert.doesNotMatch(migration, /grant\s+execute[^;]*\bto\b[^;]*\banon\b/i, 'anon ne doit jamais exécuter la fonction');
  assert.match(migration, /revoke all on function public\.delete_customer_deposit\(uuid\) from anon/i);
  assert.match(migration, /grant execute on function public\.delete_customer_deposit\(uuid\) to authenticated/i);
});

test('la suppression exige une session, un rôle autorisé et la bonne organisation', () => {
  assert.match(migration, /auth\.uid\(\) is null/, 'hors connexion, la fonction doit refuser');
  assert.match(migration, /'admin','manager','facturier'/, 'rôles alignés sur ventes.cancel (le comptable ne supprime pas)');
  assert.match(migration, /org_id = public\.my_org\(\)/, 'lecture et suppression bornées à l’organisation');
  assert.match(migration, /select \* into v_row from public\.customer_deposits where id = p_id and org_id = public\.my_org\(\)/,
    'la lecture du dépôt ne doit pas ignorer l’organisation');
});

test('un acompte utilisé ou rattaché à une facture ne peut pas être supprimé', () => {
  assert.match(migration, /from public\.sale_payments where customer_deposit_id = p_id/,
    'clé étrangère ON DELETE RESTRICT : on refuse avant le DELETE');
  assert.match(migration, /v_row\.remaining, 0\) < coalesce\(v_row\.amount, 0\)/,
    'un solde déjà entamé signifie que l’acompte a servi');
  assert.match(migration, /delete from public\.customer_deposits where id = p_id and org_id = public\.my_org\(\)/);
});

test('la suppression ne touche pas aux compteurs de reçus', () => {
  assert.doesNotMatch(migration, /update\s+[^;]*customer_deposit_counters/i,
    'un numéro de reçu imprimé ne doit jamais être réattribué');
  assert.doesNotMatch(migration, /update\s+public\.customer_deposits/i, 'la fonction ne fait qu’un DELETE');
});

test('le schéma de référence contient la même fonction', () => {
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.delete_customer_deposit\(p_id uuid\)/);
  assert.match(schema, /grant execute on function public\.delete_customer_deposit\(p_id uuid\) to authenticated/i);
});

test('l’écran des acomptes propose la suppression avec confirmation', () => {
  assert.match(ecran, /data-del=/, 'un bouton Supprimer doit être rendu');
  assert.match(ecran, /confirmDelete\(/, 'la suppression passe par une fenêtre de confirmation');
  assert.match(ecran, /db\.rpc\('delete_customer_deposit', \{ p_id: row\.id \}\)/, 'appel de la fonction serveur');
  assert.match(ecran, /can\(ctx\?\.role, 'ventes\.cancel'\)/, 'droits alignés sur la base');
  assert.match(ecran, /!r\._offline_pending/, 'un acompte en attente de synchronisation ne se supprime pas');
  assert.match(ecran, /Connexion requise pour cette action\./, 'hors ligne, message explicite plutôt qu’une file');
});

test('la file hors ligne ne connaît pas la suppression d’acompte', () => {
  const queue = (api.match(/^const QUEUE = \{[^}]*\}/m) || [''])[0];
  assert.ok(queue, 'la file d’attente doit être déclarée dans js/api.js');
  assert.doesNotMatch(queue, /delete_customer_deposit/, 'la suppression reste en ligne uniquement');
});

test('la démonstration sait supprimer un acompte', () => {
  assert.match(demo, /if \(fn === 'delete_customer_deposit'\)/);
  assert.match(demo, /sale_payments'\)\.some\(p => p\.customer_deposit_id === deposit\.id\)/,
    'la démo applique les mêmes refus que le serveur');
});
