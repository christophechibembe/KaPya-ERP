-- KaPya ERP : choix du dépôt pour les ventes et les achats. À exécuter après depots.sql. Sans danger à relancer.
drop function if exists public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric);

create or replace function public.create_sale(
  p_customer uuid, p_number text, p_date date, p_lines jsonb,
  p_id uuid default null, p_usd_cdf numeric default null, p_customer_label text default null,
  p_payment text default 'cash', p_paid numeric default null,
  p_deposit_id uuid default null, p_advance_amount numeric default 0,
  p_warehouse uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  r record;
  total numeric := 0;
  v_initial numeric := 0;
  v_advance numeric := round(coalesce(p_advance_amount, 0), 2);
  v_deposit public.customer_deposits%rowtype;
  v_wh uuid;
  r_wh record;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(public.my_role() not in ('admin','manager','facturier'), true) then raise exception 'Vous n’avez pas le droit de créer une facture.'; end if;
  if p_id is not null and exists (select 1 from sales where id = p_id and org_id = public.my_org()) then return p_id; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  if coalesce(p_payment,'cash') not in ('cash','credit') then raise exception 'Mode de paiement invalide.'; end if;
  if p_payment = 'credit' and p_customer is null then raise exception 'Choisissez un client dans la liste pour une facture à crédit.'; end if;
  if v_advance < 0 then raise exception 'Le montant de l’acompte utilisé est invalide.'; end if;
  if v_advance > 0 and (p_customer is null or p_deposit_id is null) then
    raise exception 'Sélectionnez un acompte du client à imputer sur cette facture.';
  end if;
  if p_customer is not null and not exists (select 1 from public.customers where id = p_customer and org_id = public.my_org()) then
    raise exception 'Client introuvable dans votre entreprise.';
  end if;
  -- Dépôt de sortie : celui choisi (actif, de l'entreprise) ou le dépôt principal.
  if p_warehouse is not null and not exists (select 1 from public.warehouses where id = p_warehouse and org_id = public.my_org() and active) then
    raise exception 'Dépôt introuvable ou inactif.';
  end if;
  v_wh := coalesce(p_warehouse, public.default_warehouse());
  if p_payment = 'credit' then perform 1 from public.customers where id = p_customer and org_id = public.my_org() for update; end if;
  if (select count(*) from jsonb_array_elements(p_lines) l join public.articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org()) <> jsonb_array_length(p_lines) then
    raise exception 'Un article est introuvable dans votre entreprise.';
  end if;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r_wh in select a.name, coalesce(s.qty, 0) as dispo
           from jsonb_array_elements(p_lines) l
           join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org()
           left join public.warehouse_stock s on s.article_id = a.id and s.warehouse_id = v_wh
           group by a.id, a.name, s.qty
           having sum((l->>'qty')::numeric) > coalesce(s.qty, 0) loop
    raise exception 'Stock insuffisant dans ce dépôt pour % : % disponible(s).', r_wh.name, r_wh.dispo;
  end loop;
  for r in select a.name, a.stock from jsonb_array_elements(p_lines) l join articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org()
    group by a.id,a.name,a.stock having sum((l->>'qty')::numeric) > a.stock loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  select coalesce(sum((l->>'qty')::numeric * (l->>'unit_price')::numeric), 0) into total from jsonb_array_elements(p_lines) l;
  v_initial := case when coalesce(p_payment,'cash') = 'cash' then greatest(total - v_advance, 0) else least(greatest(coalesce(p_paid,0),0), total) end;
  if v_initial + v_advance > total then raise exception 'Les montants versé et imputé dépassent le total de la facture.'; end if;
  if v_advance > 0 then
    select * into v_deposit from public.customer_deposits
    where id = p_deposit_id and org_id = public.my_org() and customer_id = p_customer for update;
    if not found then raise exception 'Acompte introuvable pour ce client.'; end if;
    if v_advance > v_deposit.remaining then raise exception 'Le montant imputé dépasse le solde de l’acompte (%).', v_deposit.remaining; end if;
  end if;
  sid := coalesce(p_id, gen_random_uuid());
  insert into sales(id, customer_id, customer_label, number, sold_at, usd_cdf, payment, paid, warehouse_id)
    values (sid, p_customer, nullif(trim(coalesce(p_customer_label,'')), ''),
      coalesce(p_number, public.next_invoice_number()), coalesce(p_date, current_date),
      coalesce(p_usd_cdf, (select usd_cdf from settings limit 1)), coalesce(p_payment,'cash'), v_initial + v_advance, v_wh);
  insert into sale_lines(sale_id, article_id, qty, unit_price)
    select sid, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric from jsonb_array_elements(p_lines) l
    join public.articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org();
  if v_initial > 0 and p_payment = 'credit' then
    insert into public.sale_payments(org_id, sale_id, amount, paid_at, kind, created_by)
    values (public.my_org(), sid, v_initial, coalesce(p_date,current_date), 'initial', auth.uid());
  end if;
  if v_advance > 0 then
    update public.customer_deposits set remaining = remaining - v_advance where id = v_deposit.id;
    insert into public.sale_payments(org_id, sale_id, amount, paid_at, kind, created_by, customer_deposit_id)
    values (public.my_org(), sid, v_advance, coalesce(p_date,current_date), 'advance', auth.uid(), v_deposit.id);
  end if;
  return sid;
end $$;

revoke all on function public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric, uuid) from public, anon;
grant execute on function public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric, uuid) to authenticated;

-- Achats : choix du dépôt d'entrée. Sans danger à relancer.
drop function if exists public.create_purchase(uuid, text, date, jsonb, uuid, numeric);

create or replace function public.create_purchase(
  p_supplier uuid,
  p_number text,
  p_date date,
  p_lines jsonb,
  p_id uuid default null,
  p_usd_cdf numeric default null,
  p_warehouse uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_line record;
  v_wh uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() not in ('admin','manager') then raise exception 'Vous n’avez pas le droit d’enregistrer un achat.'; end if;
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
  insert into public.purchases(id, supplier_id, number, bought_at, usd_cdf, warehouse_id)
  values (v_id, p_supplier, p_number, coalesce(p_date, current_date), coalesce(p_usd_cdf, (select usd_cdf from public.settings limit 1)), v_wh);
  insert into public.purchase_lines(purchase_id, article_id, qty, unit_cost)
  select v_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_cost')::numeric
  from jsonb_array_elements(p_lines) l
  join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org();
  return v_id;
end $$;

revoke all on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric, uuid) from public, anon;
grant execute on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric, uuid) to authenticated;
notify pgrst, 'reload schema';
