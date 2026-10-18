-- Correctif KaPya ERP : aligner update_sale sur les paramètres envoyés par le module factures.
-- À exécuter une seule fois dans Supabase > SQL Editor.

drop function if exists public.update_sale(uuid, uuid, text, date, jsonb, text, numeric);
drop function if exists public.update_sale(uuid, uuid, text, date, jsonb, text, numeric, uuid, numeric);

create function public.update_sale(
  p_id uuid,
  p_customer uuid,
  p_customer_label text,
  p_date date,
  p_lines jsonb,
  p_payment text,
  p_paid numeric,
  p_deposit_id uuid default null,
  p_advance_amount numeric default 0
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  r record;
  total numeric := 0;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() not in ('admin','manager','facturier') then
    raise exception 'Vous n’avez pas le droit de modifier cette facture.';
  end if;
  if not exists (select 1 from public.sales where id = p_id and org_id = public.my_org()) then
    raise exception 'Facture introuvable dans votre entreprise.';
  end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then
    raise exception 'Ajoutez au moins un produit.';
  end if;
  if coalesce(p_payment,'cash') not in ('cash','credit') then
    raise exception 'Mode de paiement invalide.';
  end if;
  if coalesce(p_advance_amount,0) <> 0 or p_deposit_id is not null then
    raise exception 'Une facture existante ne peut pas utiliser un nouvel acompte lors de sa modification.';
  end if;

  delete from public.sale_lines where sale_id = p_id;
  for r in
    select distinct (l->>'article_id') as aid
    from jsonb_array_elements(p_lines) l order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in
    select a.name, a.stock
    from jsonb_array_elements(p_lines) l
    join public.articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org()
    group by a.id,a.name,a.stock
    having sum((l->>'qty')::numeric) > a.stock
  loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  if (select count(*) from jsonb_array_elements(p_lines) l
      join public.articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org())
      <> jsonb_array_length(p_lines) then
    raise exception 'Un article est introuvable dans votre entreprise.';
  end if;

  select coalesce(sum((l->>'qty')::numeric * (l->>'unit_price')::numeric),0)
    into total from jsonb_array_elements(p_lines) l;
  update public.sales set
    customer_id = p_customer,
    customer_label = nullif(trim(coalesce(p_customer_label,'')),''),
    sold_at = coalesce(p_date, sold_at),
    payment = coalesce(p_payment,'cash'),
    paid = case when coalesce(p_payment,'cash') = 'cash'
      then total else least(greatest(coalesce(p_paid,0),0), total) end
  where id = p_id and org_id = public.my_org();

  insert into public.sale_lines(sale_id, article_id, qty, unit_price)
    select p_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric
    from jsonb_array_elements(p_lines) l
    join public.articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org();
  return p_id;
end $$;

revoke all on function public.update_sale(uuid, uuid, text, date, jsonb, text, numeric, uuid, numeric) from public, anon;
grant execute on function public.update_sale(uuid, uuid, text, date, jsonb, text, numeric, uuid, numeric) to authenticated;
notify pgrst, 'reload schema';
