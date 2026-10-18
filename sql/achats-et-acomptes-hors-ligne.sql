-- Achats hors ligne : conserve le même identifiant à chaque tentative de synchronisation.
-- Les mouvements de stock restent exécutés par le déclencheur purchase_lines existant.

drop function if exists public.create_purchase(uuid, text, date, jsonb);
drop function if exists public.create_purchase(uuid, text, date, jsonb, uuid, numeric);

create function public.create_purchase(
  p_supplier uuid,
  p_number text,
  p_date date,
  p_lines jsonb,
  p_id uuid default null,
  p_usd_cdf numeric default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_line record;
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

  insert into public.purchases(id, supplier_id, number, bought_at, usd_cdf)
  values (v_id, p_supplier, p_number, coalesce(p_date, current_date), coalesce(p_usd_cdf, (select usd_cdf from public.settings limit 1)));
  insert into public.purchase_lines(purchase_id, article_id, qty, unit_cost)
  select v_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_cost')::numeric
  from jsonb_array_elements(p_lines) l
  join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org();
  return v_id;
end $$;

revoke all on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric) from public, anon;
grant execute on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric) to authenticated;
notify pgrst, 'reload schema';

-- Dépôts hors ligne : identifiant fourni par l'application pour éviter les doublons après une coupure réseau.
-- À exécuter une seule fois dans Supabase > SQL Editor.

drop function if exists public.create_customer_deposit(uuid, numeric, date);

create function public.create_customer_deposit(
  p_customer_id uuid,
  p_amount numeric,
  p_received_at date default current_date,
  p_id uuid default gen_random_uuid()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_existing public.customer_deposits%rowtype;
  v_number integer;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_debt numeric := 0;
  v_role text := public.my_role();
  v_received_at date := coalesce(p_received_at, current_date);
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then
    raise exception 'Vous n’avez pas le droit d’enregistrer un acompte.';
  end if;
  if p_id is null then raise exception 'Identifiant de dépôt manquant.'; end if;
  if v_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;

  -- Une réponse perdue peut provoquer une nouvelle tentative après la validation du dépôt.
  select * into v_existing from public.customer_deposits where id = p_id;
  if found then
    if v_existing.org_id = public.my_org() and v_existing.customer_id = p_customer_id
       and v_existing.amount = v_amount and v_existing.received_at = v_received_at then
      return v_existing.id;
    end if;
    raise exception 'Cet identifiant de dépôt est déjà utilisé.';
  end if;

  perform 1 from public.customers where id = p_customer_id and org_id = public.my_org() for update;
  if not found then raise exception 'Client introuvable dans votre entreprise.'; end if;

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
  values (p_id, public.my_org(), p_customer_id, 'AC-' || lpad(v_number::text, 6, '0'), v_amount, v_amount, v_received_at, auth.uid());
  return p_id;
end $$;

revoke all on function public.create_customer_deposit(uuid, numeric, date, uuid) from public, anon;
grant execute on function public.create_customer_deposit(uuid, numeric, date, uuid) to authenticated;
notify pgrst, 'reload schema';

