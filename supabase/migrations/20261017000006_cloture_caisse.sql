-- KaPya ERP : clôture quotidienne de caisse multi-entreprise.
-- À exécuter une fois dans Supabase > SQL Editor après les migrations du projet.

do $$
declare v_missing text;
begin
  select string_agg(t.name, ', ' order by t.name) into v_missing
  from unnest(array['sales','sale_lines','sale_payments','customer_deposits','purchase_payments','business_expenses','settings','profiles','organizations']) as t(name)
  where to_regclass('public.' || t.name) is null;
  if v_missing is not null then
    raise exception 'Tables manquantes pour la clôture de caisse : %. Installe d’abord les scripts de facturation, acomptes clients et coûts/trésorerie.', v_missing;
  end if;
  if to_regprocedure('public.my_org()') is null or to_regprocedure('public.my_role()') is null then
    raise exception 'Fonctions d’organisation manquantes. Installe d’abord le schéma KaPya de base.';
  end if;
end;
$$;

create table if not exists public.cash_closures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  business_date date not null,
  opening_usd numeric(14,2) not null default 0 check (opening_usd >= 0),
  opening_fc numeric(14,2) not null default 0 check (opening_fc >= 0),
  counted_usd numeric(14,2) not null check (counted_usd >= 0),
  counted_fc numeric(14,2) not null check (counted_fc >= 0),
  exchange_rate numeric(14,2) not null check (exchange_rate > 0),
  expected_usd numeric(14,2) not null,
  counted_total_usd numeric(14,2) not null,
  difference_usd numeric(14,2) not null,
  summary jsonb not null default '{}'::jsonb,
  note text not null default '',
  closed_by uuid references auth.users on delete set null,
  closed_at timestamptz not null default now(),
  unique (org_id, business_date)
);

create index if not exists cash_closures_org_day_idx
  on public.cash_closures (org_id, business_date desc);
alter table public.cash_closures enable row level security;
drop policy if exists cash_closures_read on public.cash_closures;
create policy cash_closures_read on public.cash_closures
  for select to authenticated
  using (org_id = public.my_org() and public.my_role() in ('admin','manager','facturier','comptable'));
revoke all on table public.cash_closures from public, anon, authenticated;
grant select on public.cash_closures to authenticated;

-- Résumé agrégé seulement : ne divulgue pas les lignes de dépenses ou les détails fournisseurs.
create or replace function public.cash_close_summary(p_day date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.my_org();
  v_role text := public.my_role();
  v_rate numeric(14,2);
  v_rate_date date;
  v_cash_sales numeric(14,2) := 0;
  v_advance_used numeric(14,2) := 0;
  v_credit_payments numeric(14,2) := 0;
  v_deposits numeric(14,2) := 0;
  v_supplier_payments numeric(14,2) := 0;
  v_expenses numeric(14,2) := 0;
  v_previous jsonb := null;
  v_closure jsonb := null;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then
    raise exception 'Vous n’avez pas accès à la clôture de caisse.';
  end if;
  -- Tolère le décalage UTC lorsque l'entreprise est déjà passée au jour suivant localement.
  if p_day is null or p_day > current_date + 1 then raise exception 'La date doit être aujourd’hui ou antérieure.'; end if;

  select s.usd_cdf, s.rate_date into v_rate, v_rate_date
  from public.settings s where s.org_id = v_org;
  if coalesce(v_rate, 0) <= 0 then raise exception 'Le taux du jour doit être renseigné avant la clôture.'; end if;

  select coalesce(sum(l.qty * l.unit_price), 0) into v_cash_sales
  from public.sales s
  join public.sale_lines l on l.sale_id = s.id and l.org_id = s.org_id
  where s.org_id = v_org and s.sold_at = p_day and s.payment = 'cash';

  -- Un acompte déjà compté le jour de sa réception ne doit pas être recompté lorsqu’il sert une facture.
  select coalesce(sum(p.amount), 0) into v_advance_used
  from public.sale_payments p
  join public.sales s on s.id = p.sale_id and s.org_id = p.org_id
  where p.org_id = v_org and p.paid_at = p_day and p.kind = 'advance' and s.payment = 'cash';
  v_cash_sales := greatest(v_cash_sales - v_advance_used, 0);

  select coalesce(sum(p.amount), 0) into v_credit_payments
  from public.sale_payments p
  where p.org_id = v_org and p.paid_at = p_day and p.kind in ('initial','payment');

  select coalesce(sum(d.amount), 0) into v_deposits
  from public.customer_deposits d
  where d.org_id = v_org and d.received_at = p_day;

  select coalesce(sum(p.amount), 0) into v_supplier_payments
  from public.purchase_payments p
  where p.org_id = v_org and p.paid_at = p_day;

  select coalesce(sum(e.amount), 0) into v_expenses
  from public.business_expenses e
  where e.org_id = v_org and e.paid_at = p_day;

  select jsonb_build_object(
    'business_date', c.business_date,
    'opening_usd', c.opening_usd, 'opening_fc', c.opening_fc,
    'counted_usd', c.counted_usd, 'counted_fc', c.counted_fc,
    'exchange_rate', c.exchange_rate, 'expected_usd', c.expected_usd,
    'counted_total_usd', c.counted_total_usd, 'difference_usd', c.difference_usd,
    'summary', c.summary, 'note', c.note, 'closed_at', c.closed_at,
    'closed_by_name', p.full_name
  ) into v_previous
  from public.cash_closures c
  left join public.profiles p on p.id = c.closed_by and p.org_id = c.org_id
  where c.org_id = v_org and c.business_date < p_day
  order by c.business_date desc limit 1;

  select jsonb_build_object(
    'business_date', c.business_date,
    'opening_usd', c.opening_usd, 'opening_fc', c.opening_fc,
    'counted_usd', c.counted_usd, 'counted_fc', c.counted_fc,
    'exchange_rate', c.exchange_rate, 'expected_usd', c.expected_usd,
    'counted_total_usd', c.counted_total_usd, 'difference_usd', c.difference_usd,
    'summary', c.summary, 'note', c.note, 'closed_at', c.closed_at,
    'closed_by_name', p.full_name
  ) into v_closure
  from public.cash_closures c
  left join public.profiles p on p.id = c.closed_by and p.org_id = c.org_id
  where c.org_id = v_org and c.business_date = p_day;

  return jsonb_build_object(
    'business_date', p_day,
    'exchange_rate', v_rate, 'rate_date', v_rate_date,
    'cash_sales', round(v_cash_sales, 2),
    'credit_payments', round(v_credit_payments, 2),
    'customer_deposits', round(v_deposits, 2),
    'cash_in', round(v_cash_sales + v_credit_payments + v_deposits, 2),
    'supplier_payments', round(v_supplier_payments, 2),
    'expenses', round(v_expenses, 2),
    'cash_out', round(v_supplier_payments + v_expenses, 2),
    'previous_close', v_previous,
    'closure', v_closure
  );
end;
$$;

create or replace function public.save_cash_closure(
  p_day date,
  p_opening_usd numeric,
  p_opening_fc numeric,
  p_counted_usd numeric,
  p_counted_fc numeric,
  p_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.my_org();
  v_role text := public.my_role();
  v_data jsonb;
  v_rate numeric(14,2);
  v_open_usd numeric(14,2) := round(coalesce(p_opening_usd, 0), 2);
  v_open_fc numeric(14,2) := round(coalesce(p_opening_fc, 0), 2);
  v_count_usd numeric(14,2) := round(coalesce(p_counted_usd, 0), 2);
  v_count_fc numeric(14,2) := round(coalesce(p_counted_fc, 0), 2);
  v_in numeric(14,2);
  v_out numeric(14,2);
  v_expected numeric(14,2);
  v_counted_total numeric(14,2);
  v_difference numeric(14,2);
  v_old public.cash_closures%rowtype;
  v_summary jsonb;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier'), true) then
    raise exception 'Seul le gérant, le responsable ou le facturier peut clôturer la caisse.';
  end if;
  -- Supabase peut rester sur la veille UTC pendant les premières heures du jour local.
  if p_day < current_date or p_day > current_date + 1 then raise exception 'Seule la clôture de la journée en cours peut être enregistrée ou corrigée.'; end if;
  if v_open_usd < 0 or v_open_fc < 0 or v_count_usd < 0 or v_count_fc < 0 then
    raise exception 'Les montants saisis ne peuvent pas être négatifs.';
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'La note ne peut pas dépasser 500 caractères.'; end if;

  -- Sérialise les tentatives de clôture pour l’entreprise afin qu’un deuxième facturier ne puisse pas écraser la première.
  perform 1 from public.organizations o where o.id = v_org for update;
  select * into v_old from public.cash_closures
  where org_id = v_org and business_date = p_day for update;
  if found and v_role not in ('admin','manager') then
    raise exception 'Cette journée est déjà clôturée. Demandez au gérant ou au responsable de la corriger.';
  end if;

  v_data := public.cash_close_summary(p_day);
  v_rate := (v_data->>'exchange_rate')::numeric;
  v_in := (v_data->>'cash_in')::numeric;
  v_out := (v_data->>'cash_out')::numeric;
  v_expected := round(v_open_usd + v_open_fc / v_rate + v_in - v_out, 2);
  v_counted_total := round(v_count_usd + v_count_fc / v_rate, 2);
  v_difference := round(v_counted_total - v_expected, 2);
  v_summary := jsonb_build_object(
    'cash_sales', v_data->'cash_sales',
    'credit_payments', v_data->'credit_payments',
    'customer_deposits', v_data->'customer_deposits',
    'cash_in', v_data->'cash_in',
    'supplier_payments', v_data->'supplier_payments',
    'expenses', v_data->'expenses', 'cash_out', v_data->'cash_out'
  );

  insert into public.cash_closures (
    org_id, business_date, opening_usd, opening_fc, counted_usd, counted_fc,
    exchange_rate, expected_usd, counted_total_usd, difference_usd,
    summary, note, closed_by, closed_at
  ) values (
    v_org, p_day, v_open_usd, v_open_fc, v_count_usd, v_count_fc,
    v_rate, v_expected, v_counted_total, v_difference,
    v_summary, trim(coalesce(p_note, '')), auth.uid(), now()
  )
  on conflict (org_id, business_date) do update set
    opening_usd = excluded.opening_usd, opening_fc = excluded.opening_fc,
    counted_usd = excluded.counted_usd, counted_fc = excluded.counted_fc,
    exchange_rate = excluded.exchange_rate, expected_usd = excluded.expected_usd,
    counted_total_usd = excluded.counted_total_usd, difference_usd = excluded.difference_usd,
    summary = excluded.summary, note = excluded.note,
    closed_by = excluded.closed_by, closed_at = excluded.closed_at;

  return public.cash_close_summary(p_day);
end;
$$;

revoke all on function public.cash_close_summary(date) from public, anon;
revoke all on function public.save_cash_closure(date, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.cash_close_summary(date) to authenticated;
grant execute on function public.save_cash_closure(date, numeric, numeric, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';
