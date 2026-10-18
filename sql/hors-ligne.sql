-- KaPya ERP — mode hors ligne : pièces sans doublon et taux figé à la saisie. Sans danger à relancer.
-- 1) p_id : une vente ou un achat envoyé deux fois n'est enregistré qu'une fois.
-- 2) p_usd_cdf : le taux est celui du moment de la saisie, même si la pièce est synchronisée plus tard.
-- 3) Le stock ne peut toujours pas devenir négatif (ventes et annulations d'achat protégées).
-- À exécuter dans Supabase > SQL Editor.

drop function if exists public.create_sale(uuid, text, date, jsonb);
drop function if exists public.create_purchase(uuid, text, date, jsonb);

create or replace function public.create_purchase(p_supplier uuid, p_number text, p_date date, p_lines jsonb,
  p_id uuid default null, p_usd_cdf numeric default null) returns uuid
language plpgsql security invoker set search_path=public as $$
declare pid uuid;
begin
  if p_id is not null and exists (select 1 from purchases where id = p_id) then return p_id; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  pid := coalesce(p_id, gen_random_uuid());
  insert into purchases(id,supplier_id,number,bought_at,usd_cdf)
    values(pid,p_supplier,p_number,coalesce(p_date,current_date),coalesce(p_usd_cdf,(select usd_cdf from settings limit 1)));
  insert into purchase_lines(purchase_id,article_id,qty,unit_cost)
    select pid,(l->>'article_id')::uuid,(l->>'qty')::numeric,(l->>'unit_cost')::numeric from jsonb_array_elements(p_lines) l;
  return pid;
end $$;

create or replace function public.create_sale(p_customer uuid, p_number text, p_date date, p_lines jsonb,
  p_id uuid default null, p_usd_cdf numeric default null) returns uuid
language plpgsql security invoker set search_path=public as $$
declare sid uuid; r record;
begin
  if p_id is not null and exists (select 1 from sales where id = p_id) then return p_id; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, a.stock from jsonb_array_elements(p_lines) l join articles a on a.id=(l->>'article_id')::uuid
           group by a.id,a.name,a.stock having sum((l->>'qty')::numeric) > a.stock loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  sid := coalesce(p_id, gen_random_uuid());
  insert into sales(id,customer_id,number,sold_at,usd_cdf)
    values(sid,p_customer,p_number,coalesce(p_date,current_date),coalesce(p_usd_cdf,(select usd_cdf from settings limit 1)));
  insert into sale_lines(sale_id,article_id,qty,unit_price)
    select sid,(l->>'article_id')::uuid,(l->>'qty')::numeric,(l->>'unit_price')::numeric from jsonb_array_elements(p_lines) l;
  return sid;
end $$;

notify pgrst, 'reload schema';
