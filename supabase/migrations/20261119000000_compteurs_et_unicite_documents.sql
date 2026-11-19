-- 20261119000000 — Compteurs de documents fiables et numéros de transfert uniques.
--
-- Constat du 19 novembre 2026 : l'entreprise 2f79c9c8… possède 10 transferts
-- (TRF-00001 à TRF-00010) alors que document_counters.last ne vaut que 2, et
-- l'entreprise 93f2feab… a un transfert sans aucun compteur.
--
-- Cause : create_warehouse_transfer calculait son numéro avec count(*) + 1 au lieu
-- d'utiliser next_document_number(). Le compteur n'avançait donc jamais, et la
-- suppression d'un transfert suffisait à réattribuer un numéro déjà utilisé.
--
-- Cette migration :
--   1. aligne chaque compteur sur le plus grand numéro réellement présent
--      (elle ne diminue jamais un compteur existant) ;
--   2. interdit les doublons de numéros formatés par entreprise ;
--   3. fait utiliser next_document_number() par create_warehouse_transfer.
--
-- Rejouable sans effet supplémentaire une fois appliquée.

-- 1. Réparation des compteurs à partir des documents existants.
do $migration$
declare
  r record;
  v record;
begin
  for r in
    select * from (values
      ('avoir',             'AV',  'credit_notes'),
      ('bon_commande',      'BC',  'purchase_orders'),
      ('proforma',          'PRO', 'proformas'),
      ('purchase',          'ACH', 'purchases'),
      ('retour_client',     'RET', 'customer_returns'),
      ('retour_fournisseur','RFO', 'supplier_returns'),
      ('transfer',          'TRF', 'transfers')
    ) as v(kind, prefix, tbl)
  loop
    for v in execute format(
      'select org_id, max(substring(number from %L)::int) as max_num
         from public.%I
        where number ~ %L
        group by org_id',
      '^' || r.prefix || '-([0-9]+)$',
      r.tbl,
      '^' || r.prefix || '-[0-9]+$'
    )
    loop
      insert into public.document_counters as c (org_id, kind, last)
      values (v.org_id, r.kind, v.max_num)
      on conflict (org_id, kind) do update
        set last = greatest(c.last, excluded.last);
    end loop;
  end loop;
end
$migration$;

-- 2. Unicité des numéros formatés, par entreprise. Les anciens numéros importés
--    (par exemple « 11 » ou « 002 » dans purchases) restent hors du contrôle.
create unique index if not exists credit_notes_org_number_uniq
  on public.credit_notes (org_id, number) where number ~ '^AV-[0-9]+$';
create unique index if not exists purchase_orders_org_number_uniq
  on public.purchase_orders (org_id, number) where number ~ '^BC-[0-9]+$';
create unique index if not exists proformas_org_number_uniq
  on public.proformas (org_id, number) where number ~ '^PRO-[0-9]+$';
create unique index if not exists purchases_org_number_uniq
  on public.purchases (org_id, number) where number ~ '^ACH-[0-9]+$';
create unique index if not exists customer_returns_org_number_uniq
  on public.customer_returns (org_id, number) where number ~ '^RET-[0-9]+$';
create unique index if not exists supplier_returns_org_number_uniq
  on public.supplier_returns (org_id, number) where number ~ '^RFO-[0-9]+$';
create unique index if not exists transfers_org_number_uniq
  on public.transfers (org_id, number) where number ~ '^TRF-[0-9]+$';

-- 3. create_warehouse_transfer : numérotation via le compteur partagé.
CREATE OR REPLACE FUNCTION public.create_warehouse_transfer(p_from uuid, p_to uuid, p_date date, p_lines jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := public.my_org();
  v_role text := public.my_role();
  v_tid uuid := gen_random_uuid();
  v_num text;
  v_dest text;
  r record;
begin
  if public.my_role() = 'facturier' and not coalesce((select uw.can_transfer_all from public.user_warehouses uw where uw.user_id = auth.uid()), false) and p_from is distinct from public.my_shop() then
    raise exception 'Vous ne pouvez transférer que depuis votre boutique. Demandez au gérant l’autorisation de transférer depuis les autres dépôts.';
  end if;
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier'), true) then raise exception 'Vous n’avez pas le droit de transférer du stock.'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'Choisissez deux dépôts différents.'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins un produit.'; end if;
  if (select count(*) from jsonb_array_elements(p_lines) l join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = v_org and a.org_id = v_org) <> jsonb_array_length(p_lines) then raise exception 'Un produit est introuvable dans votre entreprise.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where coalesce((l->>'qty')::numeric, 0) <= 0) then raise exception 'Chaque quantité doit être supérieure à zéro.'; end if;
  if (select count(*) from public.warehouses where id in (p_from, p_to) and org_id = v_org and active) <> 2 then
    raise exception 'Dépôt introuvable ou inactif.';
  end if;
  select name into v_dest from public.warehouses where id = p_to;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, coalesce(s.qty, 0) as dispo
           from jsonb_array_elements(p_lines) l
           join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = v_org
           left join public.warehouse_stock s on s.article_id = a.id and s.warehouse_id = p_from
           group by a.id, a.name, s.qty
           having sum((l->>'qty')::numeric) > coalesce(s.qty, 0) loop
    raise exception 'Stock insuffisant dans le dépôt source pour % : % disponible(s).', r.name, r.dispo;
  end loop;
  v_num := public.next_document_number('transfer', 'TRF');
  insert into public.transfers(id, org_id, number, destination, note, moved_at, from_warehouse_id, to_warehouse_id)
    values (v_tid, v_org, v_num, 'Dépôt : ' || v_dest, nullif(trim(coalesce(p_note, '')), ''), coalesce(p_date, current_date), p_from, p_to);
  insert into public.transfer_lines(org_id, transfer_id, article_id, qty)
    select v_org, v_tid, (l->>'article_id')::uuid, (l->>'qty')::numeric from jsonb_array_elements(p_lines) l;
  return v_tid;
end $function$;
