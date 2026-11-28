-- Entrées de stock par un facturier autorisé dans son dépôt (28 novembre 2026).
--
-- Modèle identique aux transferts : le gérant coche une option pour le facturier
-- dans Paramètres > Équipe, en plus de lui attribuer une boutique. La fonction
-- create_purchase vérifie l'option et limite strictement le dépôt d'entrée à celui
-- du facturier ; les gérants et responsables ne changent pas de comportement.
--
-- La fonction passe en SECURITY DEFINER (comme create_warehouse_transfer) car les
-- politiques INSERT de purchases/purchase_lines étaient réservées aux
-- gérants/responsables : sans cela, l'autorisation serait contournée par la RLS.

alter table public.user_warehouses add column if not exists can_receive_stock boolean not null default false;

-- Lecture : un facturier ne voit que les achats (et lignes d'achat) de son dépôt.
drop policy if exists purchases_r on public.purchases;
create policy purchases_r on public.purchases
  as permissive for select to authenticated
  using (((org_id = my_org()) and (my_role() = any (array['admin','manager','comptable','user'])))
      or ((org_id = my_org()) and (my_role() = 'facturier') and (warehouse_id = my_shop())));

drop policy if exists purchase_lines_r on public.purchase_lines;
create policy purchase_lines_r on public.purchase_lines
  as permissive for select to authenticated
  using (((org_id = my_org()) and (my_role() = any (array['admin','manager','comptable','user'])))
      or ((org_id = my_org()) and (my_role() = 'facturier') and (exists (select 1 from public.purchases p where p.id = purchase_id and p.warehouse_id = my_shop()))));

create or replace function public.create_purchase(p_supplier uuid, p_number text, p_date date, p_lines jsonb, p_id uuid default null::uuid, p_usd_cdf numeric default null::numeric, p_warehouse uuid default null::uuid, p_vat_rate numeric default null::numeric)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_line record;
  v_wh uuid;
  v_role text := public.my_role();
begin
  -- idempotence hors ligne : une opération déjà reçue (même identifiant) n'est pas recréée.
  if p_id is not null and exists (select 1 from public.purchases t where t.id = p_id) then return p_id; end if;
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;

  if v_role = 'facturier' then
    if p_warehouse is null or p_warehouse is distinct from public.my_shop() then
      raise exception 'Vous ne pouvez enregistrer une entrée de stock que dans votre dépôt.';
    end if;
    if not coalesce((select uw.can_receive_stock from public.user_warehouses uw
                     where uw.user_id = auth.uid() and uw.warehouse_id = p_warehouse), false) then
      raise exception 'Votre gérant ne vous a pas autorisé à enregistrer les entrées de stock. Demandez-lui de cocher l’option dans Paramètres.';
    end if;
  elsif coalesce(v_role not in ('admin','manager'), true) then
    raise exception 'Vous n’avez pas le droit d’enregistrer un achat.';
  end if;

  if p_vat_rate is not null and (p_vat_rate < 0 or p_vat_rate > 100) then raise exception 'Taux de TVA invalide (entre 0 et 100).'; end if;
  if p_id is not null and exists (select 1 from public.purchases where id = p_id and org_id = public.my_org()) then return p_id; end if;
  if p_supplier is null or not exists (select 1 from public.suppliers where id = p_supplier and org_id = public.my_org()) then
    raise exception 'Fournisseur introuvable dans votre entreprise.';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  if (select count(*) from jsonb_array_elements(p_lines) l
      join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org()) <> jsonb_array_length(p_lines) then
    raise exception 'Un article est introuvable dans votre entreprise.';
  end if;

  if p_warehouse is not null and not exists (select 1 from public.warehouses where id = p_warehouse and org_id = public.my_org() and active) then
    raise exception 'Dépôt introuvable ou inactif.';
  end if;
  v_wh := coalesce(p_warehouse, public.default_warehouse());
  insert into public.purchases(id, supplier_id, number, bought_at, usd_cdf, warehouse_id, vat_rate)
  values (v_id, p_supplier, coalesce(nullif(trim(coalesce(p_number, '')), ''), public.next_document_number('purchase', 'ACH')), coalesce(p_date, current_date), coalesce(p_usd_cdf, (select usd_cdf from public.settings limit 1)), v_wh, coalesce(p_vat_rate, public.current_vat_rate()));
  insert into public.purchase_lines(purchase_id, article_id, qty, unit_cost)
  select v_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_cost')::numeric
  from jsonb_array_elements(p_lines) l
  join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org();
  return v_id;
end;
$function$;

revoke all on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric, uuid, numeric) from public;
revoke all on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric, uuid, numeric) from anon;
grant execute on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric, uuid, numeric) to authenticated;
