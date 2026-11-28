// Entrées de stock par un facturier autorisé : mêmes garde-fous que les transferts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await readFile(path.join(root, 'supabase/migrations/20261128000000_entrees_depot_facturier.sql'), 'utf8');
const schema = await readFile(path.join(root, 'sql/schema-production.sql'), 'utf8');
const roles = await readFile(path.join(root, 'js/roles.js'), 'utf8');
const doc = await readFile(path.join(root, 'js/modules/doc.js'), 'utf8');
const achats = await readFile(path.join(root, 'js/modules/achats.js'), 'utf8');
const parametres = await readFile(path.join(root, 'js/modules/parametres.js'), 'utf8');
const demo = await readFile(path.join(root, 'js/demo.js'), 'utf8');
const i18n = await readFile(path.join(root, 'js/i18n.js'), 'utf8');
const stockMigration = await readFile(path.join(root, 'supabase/migrations/20261128000001_ajuster_stock_facturier.sql'), 'utf8');
const stocks = await readFile(path.join(root, 'js/modules/stocks.js'), 'utf8');

test('la migration ajoute l’autorisation par dépôt', () => {
  assert.match(migration, /alter table public\.user_warehouses add column if not exists can_receive_stock boolean not null default false/i);
  assert.match(schema, /can_receive_stock boolean not null/);
  assert.match(schema, /alter column can_receive_stock set default false/);
});

test('create_purchase est durci et autorise le facturier uniquement dans son dépôt', () => {
  const corps = (migration.match(/create or replace function public\.create_purchase[\s\S]*?\$function\$;/i) || [''])[0];
  assert.ok(corps, 'la fonction doit être redéfinie dans la migration');
  assert.match(corps, /security definer/i, 'nécessaire car les policies INSERT sont réservées aux gérants');
  assert.match(corps, /set search_path to 'public', 'pg_temp'/i);
  assert.match(corps, /auth\.uid\(\) is null/);
  assert.match(corps, /v_role = 'facturier'/);
  assert.match(corps, /p_warehouse is distinct from public\.my_shop\(\)/, 'le dépôt doit être celui du facturier');
  assert.match(corps, /uw\.can_receive_stock/);
  assert.match(corps, /coalesce\(v_role not in \('admin','manager'\), true\)/, 'les autres rôles restent refusés');
  assert.match(migration, /revoke all[\s\S]*anon/i, 'aucune exécution anonyme');
  assert.match(migration, /grant execute on function public\.create_purchase\(uuid, text, date, jsonb, uuid, numeric, uuid, numeric\) to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+execute[^;]*\bto\b[^;]*\banon\b/i);
});

test('le facturier voit ses achats et lignes d’achat sans voir ceux des autres dépôts', () => {
  assert.match(migration, /drop policy if exists purchases_r on public\.purchases/i);
  assert.match(migration, /my_role\(\) = 'facturier'.*warehouse_id = my_shop\(\)/is);
  assert.match(migration, /drop policy if exists purchase_lines_r on public\.purchase_lines/i);
  assert.match(migration, /where p\.id = purchase_id and p\.warehouse_id = my_shop\(\)/i);
  assert.match(schema, /create policy purchases_r[\s\S]*?my_role\(\) = 'facturier'::text.*warehouse_id = my_shop\(\)/i);
  assert.match(schema, /create policy purchase_lines_r[\s\S]*?p\.warehouse_id = my_shop\(\)/i);
});

test('le schéma de référence contient la même fonction et le même droit', () => {
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.create_purchase[\s\S]*?SECURITY DEFINER[\s\S]*?can_receive_stock/);
  assert.match(schema, /grant execute on function public\.create_purchase\(p_supplier uuid, p_number text, p_date date, p_lines jsonb, p_id uuid, p_usd_cdf numeric, p_warehouse uuid, p_vat_rate numeric\) to authenticated/i);
});

test('les droits de l’interface suivent la base', () => {
  assert.match(roles, /'achats\.receive': \['admin', 'manager', 'facturier'\]/);
  assert.match(roles, /'achats\.view': \['admin', 'manager', 'facturier', 'comptable', 'user'\]/);
  assert.match(roles, /'achats\.cancel': \['admin', 'manager'\]/, 'le facturier ne supprime pas les achats');
  assert.match(achats, /newCap: 'achats\.receive'/);
});

test('l’écran Achats masque la saisie si l’autorisation n’est pas donnée', () => {
  assert.match(doc, /can_receive_stock&user_id=eq\.\$\{session\(\)\?\.uid\}/);
  assert.match(doc, /let mayCreate = can\(c\.role, c\.newCap\)/);
  assert.match(doc, /if \(!mayCreate && \$\('#new'\)\) \$\('#new'\)\.style\.display = 'none'/);
  assert.match(doc, /onlyWarehouse \? list\.filter\(w => w\.id === onlyWarehouse\) : list/, 'le facturier ne choixit que son dépôt');
  assert.match(doc, /fd\.get\('wh'\) \|\| onlyWarehouse/, 'le dépôt du facturier est toujours envoyé au serveur');
});

test('le gérant coche l’autorisation dans Paramètres sans perdre celle des transferts', () => {
  assert.match(parametres, /data-receive=/);
  assert.match(parametres, /can_transfer_all,can_receive_stock/);
  assert.match(parametres, /can_receive_stock: receive/);
  assert.match(parametres, /can_receive_stock: box\.checked/);
  assert.match(parametres, /can_transfer_all: all/);
  assert.match(parametres, /can_transfer_all: box\.checked/);
});

test('la démo et les traductions suivent', () => {
  assert.match(demo, /can_receive_stock: false/);
  assert.match(i18n, /'Peut enregistrer les entrées de stock dans son dépôt':/);
});

test('« Ajuster » est autorisé au facturier uniquement dans son dépôt', () => {
  assert.match(stockMigration, /drop policy if exists stock_moves_i on public\.stock_moves/i);
  assert.match(stockMigration, /reason = 'adjustment'/i);
  assert.match(stockMigration, /my_role\(\) = 'facturier'/i);
  assert.match(stockMigration, /warehouse_id = my_shop\(\)/i);
  assert.match(stockMigration, /uw\.can_receive_stock/i);
  assert.match(schema, /create policy stock_moves_i[\s\S]*?my_role\(\) = 'facturier'::text[\s\S]*?uw\.can_receive_stock/i);
});

test('l’écran Produits & Stocks n’offre au facturier que « Ajuster »', () => {
  assert.match(roles, /'stock\.adjust': \['admin', 'manager', 'facturier'\]/);
  assert.match(roles, /'stock\.write': \['admin', 'manager'\]/, 'créer/modifier/archiver un article reste interdit');
  assert.match(stocks, /can\(ctx\.role, 'stock\.adjust'\)/);
  assert.match(stocks, /select=warehouse_id,can_receive_stock&user_id=eq\.\$\{session\(\)\?\.uid\}/);
  assert.match(stocks, /if \(!canManage\) \$\('#new'\)\.style\.display = 'none'/, 'pas de « Nouvel article » pour le facturier');
  assert.match(stocks, /data-adj=/);
  assert.match(stocks, /warehouse_id: stockWarehouse/, 'le mouvement est bien imputé à son dépôt');
  assert.match(stocks, /\$\{canManage \? `<button class="lnk action-detail"/, 'Modifier et Archiver sont conditionnés au droit de gestion');
});
