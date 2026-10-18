-- KaPya ERP — modifier une facture : les anciennes lignes sont retirées (le stock est rendu),
-- puis les nouvelles sont enregistrées avec contrôle du stock. Tout est annulé en cas d'erreur.
-- Réservé au gérant et au responsable. À exécuter dans Supabase > SQL Editor. Sans danger à relancer.

drop function if exists public.update_sale(uuid, uuid, text, date, jsonb, text, numeric);
create function public.update_sale(p_id uuid, p_customer uuid, p_customer_label text, p_date date, p_lines jsonb,
  p_payment text, p_paid numeric) returns uuid
language plpgsql security invoker set search_path=public as $$
declare r record; total numeric := 0;
begin
  if public.my_role() not in ('admin','manager') then raise exception 'Modification réservée au gérant et au responsable.'; end if;
  if not exists (select 1 from sales where id = p_id) then raise exception 'Facture introuvable.'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins un produit.'; end if;
  if coalesce(p_payment,'cash') not in ('cash','credit') then raise exception 'Mode de paiement invalide.'; end if;
  -- 1. Retirer les anciennes lignes : le stock est rendu (trigger)
  delete from sale_lines where sale_id = p_id;
  -- 2. Verrous et contrôle du stock avec les nouvelles quantités
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, a.stock from jsonb_array_elements(p_lines) l join articles a on a.id=(l->>'article_id')::uuid
           group by a.id,a.name,a.stock having sum((l->>'qty')::numeric) > a.stock loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  select coalesce(sum((l->>'qty')::numeric * (l->>'unit_price')::numeric), 0) into total from jsonb_array_elements(p_lines) l;
  update sales set customer_id = p_customer, customer_label = nullif(trim(coalesce(p_customer_label,'')),''),
    sold_at = coalesce(p_date, sold_at), payment = coalesce(p_payment,'cash'),
    paid = case when coalesce(p_payment,'cash') = 'cash' then total else least(greatest(coalesce(p_paid,0),0), total) end
  where id = p_id;
  insert into sale_lines(sale_id, article_id, qty, unit_price)
    select p_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric from jsonb_array_elements(p_lines) l;
  return p_id;
end $$;

notify pgrst, 'reload schema';
