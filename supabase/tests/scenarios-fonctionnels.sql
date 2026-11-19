-- Scénarios fonctionnels KaPya — test manuel sur un projet Supabase de test.
--
-- Prérequis :
--   1. Un projet Supabase dédié, restauré depuis le dump de production du 2026-11-18
--      (schéma + données) ;
--   2. Insérer le compte de test dans auth.users (le dump ne contient pas le schéma
--      auth) :
--        insert into auth.users (id, email, created_at, updated_at)
--        values ('131ad7a7-e2cf-428d-8797-e97c1bb6ec0a', 'test-admin@kapya.local', now(), now());
--   3. Se connecter avec psql au pooler de la région et lancer :
--        psql ... -f supabase/tests/scenarios-fonctionnels.sql
--
-- Les identifiants (entreprise, admin, articles, dépôts, client) sont ceux du dump du
-- 2026-11-18 ; les adapter si les données de référence changent.
-- Tout se passe dans une transaction annulée : aucune donnée n'est conservée.
-- Validé le 2026-11-19 sur le projet de test : 19 contrôles OK.
--
-- Utilisateur : admin de l'entreprise 2f79c9c8… (projet de test).

begin;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"131ad7a7-e2cf-428d-8797-e97c1bb6ec0a","role":"authenticated"}', true) as claims;

create temp table etat_initial on commit drop as
select a.stock as stock_article,
       coalesce((select qty from public.warehouse_stock ws
                  where ws.article_id = a.id and ws.warehouse_id = 'a7568b07-ae94-4dce-a77c-2b4d75c84509'), 0) as stock_depot,
       coalesce((select qty from public.warehouse_stock ws
                  where ws.article_id = a.id and ws.warehouse_id = '7cb1f2d9-5a1b-435e-b79b-5a13c7c3555d'), 0) as stock_beata
from public.articles a
where a.id = '1ad31a9e-0b72-452f-a6ed-b78c43fafc45';

create temp table verifs (nom text, attendu text, obtenu text);

-- 0. Cloisonnement : aucune vente d'une autre entreprise n'est visible.
insert into verifs
select 'RLS ventes autres entreprises', '0', count(*)::text
from public.sales where org_id <> '2f79c9c8-d7e6-474e-bcd1-af3e261453a0';

-- 1. Vente comptant : 2 × 10 = 20.
select public.create_sale(
  null, null, current_date,
  '[{"article_id":"1ad31a9e-0b72-452f-a6ed-b78c43fafc45","qty":2,"unit_price":10}]'::jsonb,
  '11111111-1111-4111-8111-111111111111', null, null, 'cash', null, null, 0,
  'a7568b07-ae94-4dce-a77c-2b4d75c84509');

-- 2. Vente à crédit : 3 × 10 = 30, acompte initial 5.
select public.create_sale(
  '2e25e520-0354-4fe4-91e4-50989c4ef4eb', null, current_date,
  '[{"article_id":"1ad31a9e-0b72-452f-a6ed-b78c43fafc45","qty":3,"unit_price":10}]'::jsonb,
  '22222222-2222-4222-8222-222222222222', null, null, 'credit', 5, null, 0,
  'a7568b07-ae94-4dce-a77c-2b4d75c84509');

-- 3. Règlement du solde : 25.
select public.record_credit_payment(
  '22222222-2222-4222-8222-222222222222', 25, current_date,
  '33333333-3333-4333-8333-333333333333');

-- 4. Rejeu du même règlement (réseau perdu) : ne doit rien créer de plus.
select public.record_credit_payment(
  '22222222-2222-4222-8222-222222222222', 25, current_date,
  '33333333-3333-4333-8333-333333333333');

-- 5. Avoir de 1 article sur la vente comptant.
select public.create_credit_note(
  '11111111-1111-4111-8111-111111111111',
  '[{"article_id":"1ad31a9e-0b72-452f-a6ed-b78c43fafc45","qty":1}]'::jsonb,
  'test avoir');

-- 6. Transfert de 4 du dépôt principal vers RESTO-BAR BEATA.
select public.create_warehouse_transfer(
  'a7568b07-ae94-4dce-a77c-2b4d75c84509',
  '7cb1f2d9-5a1b-435e-b79b-5a13c7c3555d',
  current_date,
  '[{"article_id":"1ad31a9e-0b72-452f-a6ed-b78c43fafc45","qty":4}]'::jsonb,
  'test transfert');

-- 7. Refus attendu : vente au-delà du stock disponible.
do $bloc$
declare v_refuse boolean := false;
begin
  begin
    perform public.create_sale(
      null, null, current_date,
      '[{"article_id":"1ad31a9e-0b72-452f-a6ed-b78c43fafc45","qty":99999,"unit_price":10}]'::jsonb,
      '44444444-4444-4444-8444-444444444444', null, null, 'cash', null, null, 0,
      'a7568b07-ae94-4dce-a77c-2b4d75c84509');
  exception when others then
    v_refuse := true;
  end;
  if not v_refuse then raise exception 'ECHEC: une vente au-delà du stock a été acceptée'; end if;
end $bloc$;

-- 8. Refus attendu : trop-perçu sur une facture à crédit déjà soldée.
do $bloc$
declare v_refuse boolean := false;
begin
  begin
    perform public.record_credit_payment(
      '22222222-2222-4222-8222-222222222222'::uuid, 100, current_date, gen_random_uuid());
  exception when others then
    v_refuse := true;
  end;
  if not v_refuse then raise exception 'ECHEC: un paiement supérieur au solde a été accepté'; end if;
end $bloc$;

-- 9. Clôtures de chaque boutique, puis clôture globale de la journée.
select public.save_shop_closure(current_date, 'a7568b07-ae94-4dce-a77c-2b4d75c84509', 0, 0, 0, 0, 'test');
select public.save_shop_closure(current_date, '7cb1f2d9-5a1b-435e-b79b-5a13c7c3555d', 0, 0, 0, 0, 'test');
select public.save_shop_closure(current_date, '3a099dd3-1511-498f-bc78-74a251e24191', 0, 0, 0, 0, 'test');
select public.save_cash_closure(current_date, 0, 0, 0, 0, 'test');

reset role;

-- ASSERTIONS (exécutées hors RLS, en tant que propriétaire)

insert into verifs
select 'Vente comptant : total lignes', '20.00', round(sum(qty * unit_price), 2)::numeric(14,2)::text
from public.sale_lines where sale_id = '11111111-1111-4111-8111-111111111111';

insert into verifs
select 'Vente comptant : montant payé', '20.00', paid::numeric(14,2)::text
from public.sales where id = '11111111-1111-4111-8111-111111111111';

insert into verifs
select 'Vente comptant : mode', 'cash', payment
from public.sales where id = '11111111-1111-4111-8111-111111111111';

insert into verifs
select 'Vente crédit : montant payé', '30.00', paid::numeric(14,2)::text
from public.sales where id = '22222222-2222-4222-8222-222222222222';

insert into verifs
select 'Vente crédit : nombre de paiements', '2', count(*)::text
from public.sale_payments where sale_id = '22222222-2222-4222-8222-222222222222';

insert into verifs
select 'Vente crédit : somme des paiements', '30.00', round(sum(amount), 2)::numeric(14,2)::text
from public.sale_payments where sale_id = '22222222-2222-4222-8222-222222222222';

insert into verifs
select 'Rejeu du règlement : une seule ligne', '1', count(*)::text
from public.sale_payments where id = '33333333-3333-4333-8333-333333333333';

insert into verifs
select 'Avoir : numéro', 'AV-', case when number like 'AV-%' then 'AV-' else coalesce(number, 'nul') end
from public.credit_notes where sale_id = '11111111-1111-4111-8111-111111111111';

insert into verifs
select 'Avoir : total', '10.00', total_usd::numeric(14,2)::text
from public.credit_notes where sale_id = '11111111-1111-4111-8111-111111111111';

insert into verifs
select 'Transfert : numéro', 'TRF-00011', number
from public.transfers
where from_warehouse_id = 'a7568b07-ae94-4dce-a77c-2b4d75c84509'
  and to_warehouse_id = '7cb1f2d9-5a1b-435e-b79b-5a13c7c3555d'
  and note = 'test transfert';

insert into verifs
select 'Compteur transferts après création', '11',
       max(last)::text
from public.document_counters
where org_id = '2f79c9c8-d7e6-474e-bcd1-af3e261453a0' and kind = 'transfer';

insert into verifs
select 'Stock article après 5 sorties', (stock_article - 5)::numeric(14,2)::text,
       a.stock::numeric(14,2)::text
from public.articles a, etat_initial i
where a.id = '1ad31a9e-0b72-452f-a6ed-b78c43fafc45';

insert into verifs
select 'Stock dépôt principal après 9 sorties', (stock_depot - 9)::numeric(14,2)::text,
       ws.qty::numeric(14,2)::text
from public.warehouse_stock ws, etat_initial i
where ws.article_id = '1ad31a9e-0b72-452f-a6ed-b78c43fafc45'
  and ws.warehouse_id = 'a7568b07-ae94-4dce-a77c-2b4d75c84509';

insert into verifs
select 'Stock BEATA après 4 entrées', (stock_beata + 4)::numeric(14,2)::text,
       ws.qty::numeric(14,2)::text
from public.warehouse_stock ws, etat_initial i
where ws.article_id = '1ad31a9e-0b72-452f-a6ed-b78c43fafc45'
  and ws.warehouse_id = '7cb1f2d9-5a1b-435e-b79b-5a13c7c3555d';

insert into verifs
select 'Clôtures boutique du jour', '3', count(*)::text
from public.cash_closures_shop
where org_id = '2f79c9c8-d7e6-474e-bcd1-af3e261453a0' and business_date = current_date;

insert into verifs
select 'Clôture globale du jour', '1', count(*)::text
from public.cash_closures
where org_id = '2f79c9c8-d7e6-474e-bcd1-af3e261453a0' and business_date = current_date;

-- 20 encaissés au comptant + 5 d'acompte + 25 réglés à crédit = 50 attendus, 0 comptés.
insert into verifs
select 'Clôture globale : attendu', '50.00', expected_usd::numeric(14,2)::text
from public.cash_closures
where org_id = '2f79c9c8-d7e6-474e-bcd1-af3e261453a0' and business_date = current_date;

insert into verifs
select 'Clôture globale : écart', '-50.00', difference_usd::numeric(14,2)::text
from public.cash_closures
where org_id = '2f79c9c8-d7e6-474e-bcd1-af3e261453a0' and business_date = current_date;

select nom, attendu, obtenu,
       case when obtenu is not distinct from attendu then 'OK' else 'ECHEC' end as resultat
from verifs order by nom;

rollback;
