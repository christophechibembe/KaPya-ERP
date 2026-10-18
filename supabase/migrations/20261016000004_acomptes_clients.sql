-- Acomptes reçus avant la création d'une vente, avec reçu et imputation à une facture future.
create table if not exists public.customer_deposit_counters (
  org_id uuid primary key references public.organizations on delete cascade,
  last_number integer not null default 0
);
alter table public.customer_deposit_counters enable row level security;

create table if not exists public.customer_deposits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  customer_id uuid not null references public.customers on delete restrict,
  receipt_number text not null,
  amount numeric(14,2) not null check (amount > 0),
  remaining numeric(14,2) not null check (remaining >= 0 and remaining <= amount),
  received_at date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, receipt_number)
);
create index if not exists customer_deposits_org_customer_idx
  on public.customer_deposits(org_id, customer_id, received_at desc);
alter table public.customer_deposits enable row level security;
drop policy if exists customer_deposits_r on public.customer_deposits;
create policy customer_deposits_r on public.customer_deposits for select to authenticated
  using (org_id = public.my_org());

create or replace function public.create_customer_deposit(
  p_customer_id uuid, p_amount numeric, p_received_at date default current_date
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_number integer;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_debt numeric := 0;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then raise exception 'Vous n’avez pas le droit d’enregistrer un acompte.'; end if;
  if v_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  perform 1 from public.customers where id = p_customer_id and org_id = public.my_org() for update;
  if not found then
    raise exception 'Client introuvable dans votre entreprise.';
  end if;
  select coalesce(sum(balance), 0) into v_debt from (
    select greatest(coalesce(sum(l.qty * l.unit_price), 0) - coalesce(s.paid, 0), 0) as balance
    from public.sales s left join public.sale_lines l on l.sale_id = s.id and l.org_id = s.org_id
    where s.org_id = public.my_org() and s.customer_id = p_customer_id and s.payment = 'credit'
    group by s.id, s.paid
  ) open_sales;
  if v_debt > 0.005 then
    raise exception 'Dépôt impossible : ce client doit d’abord régler sa dette restante de %.', to_char(v_debt, 'FM999,999,990.00');
  end if;
  insert into public.customer_deposit_counters(org_id, last_number) values (public.my_org(), 1)
    on conflict (org_id) do update set last_number = customer_deposit_counters.last_number + 1
    returning last_number into v_number;
  insert into public.customer_deposits(id, org_id, customer_id, receipt_number, amount, remaining, received_at, created_by)
  values (v_id, public.my_org(), p_customer_id, 'AC-' || lpad(v_number::text, 6, '0'), v_amount, v_amount, coalesce(p_received_at, current_date), auth.uid());
  return v_id;
end $$;

revoke all on function public.create_customer_deposit(uuid, numeric, date) from public, anon;
grant execute on function public.create_customer_deposit(uuid, numeric, date) to authenticated;

-- Add a distinct ledger kind so an advance applied to an invoice remains traceable.
alter table public.sale_payments drop constraint if exists sale_payments_kind_check;
alter table public.sale_payments add constraint sale_payments_kind_check check (kind in ('initial','payment','advance'));
alter table public.sale_payments add column if not exists customer_deposit_id uuid references public.customer_deposits on delete restrict;

create or replace function public.restore_customer_deposit_on_sale_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.customer_deposits d
  set remaining = least(d.amount, d.remaining + p.amount)
  from public.sale_payments p
  where p.sale_id = old.id and p.org_id = old.org_id and p.kind = 'advance'
    and p.customer_deposit_id = d.id and d.org_id = old.org_id;
  return old;
end $$;
drop trigger if exists t_restore_customer_deposit_on_sale_delete on public.sales;
create trigger t_restore_customer_deposit_on_sale_delete before delete on public.sales
  for each row execute function public.restore_customer_deposit_on_sale_delete();

-- Replace the existing 9-argument invoice function with the same signature plus optional advance inputs.
drop function if exists public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric);
drop function if exists public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric);
create function public.create_sale(
  p_customer uuid, p_number text, p_date date, p_lines jsonb,
  p_id uuid default null, p_usd_cdf numeric default null, p_customer_label text default null,
  p_payment text default 'cash', p_paid numeric default null,
  p_deposit_id uuid default null, p_advance_amount numeric default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  r record;
  total numeric := 0;
  v_initial numeric := 0;
  v_advance numeric := round(coalesce(p_advance_amount, 0), 2);
  v_deposit public.customer_deposits%rowtype;
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
  if p_payment = 'credit' then perform 1 from public.customers where id = p_customer and org_id = public.my_org() for update; end if;
  if (select count(*) from jsonb_array_elements(p_lines) l join public.articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org()) <> jsonb_array_length(p_lines) then
    raise exception 'Un article est introuvable dans votre entreprise.';
  end if;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
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
  insert into sales(id, customer_id, customer_label, number, sold_at, usd_cdf, payment, paid)
    values (sid, p_customer, nullif(trim(coalesce(p_customer_label,'')), ''),
      coalesce(p_number, public.next_invoice_number()), coalesce(p_date, current_date),
      coalesce(p_usd_cdf, (select usd_cdf from settings limit 1)), coalesce(p_payment,'cash'), v_initial + v_advance);
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
revoke all on function public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric) from public, anon;
grant execute on function public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric) to authenticated;
notify pgrst, 'reload schema';
