-- Preserve the exchange-rate date used when a cash closure is recorded.
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
    'rate_date', v_data->'rate_date',
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
