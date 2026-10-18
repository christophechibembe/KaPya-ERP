-- KaPya ERP — facturation : numéro automatique, client libre (« Client comptoir » par défaut), comptant ou crédit.
-- À exécuter dans Supabase > SQL Editor. Sans danger à relancer.

alter table public.sales add column if not exists customer_label text;
alter table public.sales add column if not exists payment text not null default 'cash';
alter table public.sales drop constraint if exists sales_payment_check;
alter table public.sales add constraint sales_payment_check check (payment in ('cash','credit'));
alter table public.sales add column if not exists paid numeric(14,2) not null default 0;

-- Compteur de factures par entreprise (accès uniquement via next_invoice_number)
create table if not exists public.invoice_counters (org_id uuid primary key references public.organizations on delete cascade, last int not null default 0);
alter table public.invoice_counters enable row level security;

create or replace function public.next_invoice_number() returns text language plpgsql security definer set search_path=public as $$
declare v int;
begin
  insert into invoice_counters as c (org_id, last) values (public.my_org(), 1)
    on conflict (org_id) do update set last = c.last + 1 returning c.last into v;
  return 'FAC-' || lpad(v::text, 5, '0');
end $$;

drop function if exists public.create_sale(uuid, text, date, jsonb, uuid, numeric);
create function public.create_sale(p_customer uuid, p_number text, p_date date, p_lines jsonb,
  p_id uuid default null, p_usd_cdf numeric default null, p_customer_label text default null,
  p_payment text default 'cash', p_paid numeric default null) returns uuid
language plpgsql security invoker set search_path=public as $$
declare sid uuid; r record; total numeric := 0;
begin
  if p_id is not null and exists (select 1 from sales where id = p_id) then return p_id; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  if coalesce(p_payment,'cash') not in ('cash','credit') then raise exception 'Mode de paiement invalide.'; end if;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, a.stock from jsonb_array_elements(p_lines) l join articles a on a.id=(l->>'article_id')::uuid
           group by a.id,a.name,a.stock having sum((l->>'qty')::numeric) > a.stock loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  select coalesce(sum((l->>'qty')::numeric * (l->>'unit_price')::numeric), 0) into total from jsonb_array_elements(p_lines) l;
  sid := coalesce(p_id, gen_random_uuid());
  insert into sales(id, customer_id, customer_label, number, sold_at, usd_cdf, payment, paid)
    values (sid, p_customer, nullif(trim(coalesce(p_customer_label,'')), ''),
            coalesce(p_number, public.next_invoice_number()), coalesce(p_date, current_date),
            coalesce(p_usd_cdf, (select usd_cdf from settings limit 1)), coalesce(p_payment,'cash'),
            case when coalesce(p_payment,'cash') = 'cash' then total else least(greatest(coalesce(p_paid,0),0), total) end);
  insert into sale_lines(sale_id, article_id, qty, unit_price)
    select sid, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric from jsonb_array_elements(p_lines) l;
  return sid;
end $$;

notify pgrst, 'reload schema';
