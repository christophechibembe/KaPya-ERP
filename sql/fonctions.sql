-- KaPya ERP — fonctions de vente et d'achat (version actuelle, avec taux figé). Sans danger à relancer.
-- Utilisé par diagnostic.html. Ne pas relancer une ancienne version de ce fichier.

-- KaPya ERP — taux du jour figé sur chaque vente et achat. Sans danger à relancer.
alter table public.sales add column if not exists usd_cdf numeric(14,2);
alter table public.purchases add column if not exists usd_cdf numeric(14,2);

-- KaPya ERP — (ré)installe les fonctions d'achat et de vente. Sans danger à relancer (create or replace).
-- À exécuter dans Supabase > SQL Editor si le diagnostic signale « fonction absente ».

create or replace function public.create_purchase(p_supplier uuid, p_number text, p_date date, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path=public as $$
declare pid uuid;
begin
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  insert into purchases(supplier_id,number,bought_at,usd_cdf) values(p_supplier,p_number,coalesce(p_date,current_date),(select usd_cdf from settings limit 1)) returning id into pid;
  insert into purchase_lines(purchase_id,article_id,qty,unit_cost)
    select pid,(l->>'article_id')::uuid,(l->>'qty')::numeric,(l->>'unit_cost')::numeric from jsonb_array_elements(p_lines) l;
  return pid;
end $$;

create or replace function public.create_sale(p_customer uuid, p_number text, p_date date, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path=public as $$
declare sid uuid; r record;
begin
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  -- Verrou par article (indépendant des droits RLS) : deux ventes simultanées ne peuvent pas dépasser le stock.
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, a.stock from jsonb_array_elements(p_lines) l join articles a on a.id=(l->>'article_id')::uuid
           group by a.id,a.name,a.stock having sum((l->>'qty')::numeric) > a.stock loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  insert into sales(customer_id,number,sold_at,usd_cdf) values(p_customer,p_number,coalesce(p_date,current_date),(select usd_cdf from settings limit 1)) returning id into sid;
  insert into sale_lines(sale_id,article_id,qty,unit_price)
    select sid,(l->>'article_id')::uuid,(l->>'qty')::numeric,(l->>'unit_price')::numeric from jsonb_array_elements(p_lines) l;
  return sid;
end $$;
