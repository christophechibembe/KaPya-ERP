-- KaPya ERP — export de production (lecture seule)
-- Projet Supabase : ttplxlobehmwzfnxviej
-- Export : 2026-11-18 07:55
-- Généré par scripts/exporter-supabase.mjs. Ne contient aucun secret.

-- accept_invitation [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.accept_invitation()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  em text;
  inv record;
  v_plan text;
  maxu int;
  used int;
begin
  if me is null then raise exception 'Connexion requise.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  perform 1 from public.profiles p where p.id = me for update;
  if (select p.org_id from public.profiles p where p.id = me) is not null then return null; end if;
  select u.email into em from auth.users u where u.id = me;
  select i.* into inv from public.invitations i
    where lower(i.email) = lower(em) and i.used_at is null and i.expires_at > now()
    order by i.created_at desc limit 1 for update;
  if not found then return null; end if;
  if inv.role not in ('manager','facturier','comptable','user') then
    raise exception 'Le rôle de cette invitation n’est pas autorisé.';
  end if;
  select o.plan into v_plan from public.organizations o where o.id = inv.org_id for update;
  if not found then raise exception 'Entreprise introuvable.'; end if;
  maxu := case v_plan when 'basique' then 3 when 'standard' then 10 else 1000000 end;
  select count(*) into used from public.profiles p where p.org_id = inv.org_id;
  if used >= maxu then raise exception 'Limite de sièges atteinte pour le forfait de cette entreprise.'; end if;
  insert into public.profiles(id, org_id, role) values(me, inv.org_id, inv.role)
    on conflict (id) do update set org_id = inv.org_id, role = inv.role;
  update public.invitations set used_at = now() where id = inv.id and used_at is null;
  return inv.org_id;
end
$function$
;

-- apply_move [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.apply_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_wh numeric(14,3);
begin
  if not exists (select 1 from public.articles a where a.id = new.article_id and a.org_id = new.org_id) then
    raise exception 'Le produit du mouvement doit appartenir à la même entreprise.';
  end if;
  if new.warehouse_id is null or not exists (
    select 1 from public.warehouses w where w.id = new.warehouse_id and w.org_id = new.org_id
  ) then
    raise exception 'Le dépôt du mouvement doit appartenir à la même entreprise.';
  end if;

  insert into public.warehouse_stock(org_id, warehouse_id, article_id, qty)
    values (new.org_id, new.warehouse_id, new.article_id, 0) on conflict do nothing;
  select qty into v_wh from public.warehouse_stock
    where warehouse_id = new.warehouse_id and article_id = new.article_id for update;
  if new.qty < 0 and v_wh + new.qty < 0 then
    raise exception 'Stock insuffisant dans ce dépôt pour ce produit.';
  end if;
  if new.qty < 0 and (select a.stock from public.articles a where a.id = new.article_id and a.org_id = new.org_id) + new.qty < 0 then
    if new.reason = 'adjustment' then raise exception 'Ajustement impossible : le stock ne peut pas devenir négatif.';
    else raise exception 'une partie de ce stock a déjà été vendue ou ajustée.'; end if;
  end if;
  update public.warehouse_stock set qty = qty + new.qty
    where warehouse_id = new.warehouse_id and article_id = new.article_id and org_id = new.org_id;
  update public.articles set stock = stock + new.qty where id = new.article_id and org_id = new.org_id;
  return null;
end
$function$
;

-- article_total_stock [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.article_total_stock()
 RETURNS TABLE(article_id uuid, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.article_id, sum(s.qty)::numeric
  from public.warehouse_stock s
  where s.org_id = public.my_org()
    and public.my_role() in ('admin', 'manager')
  group by s.article_id;
$function$
;

-- audit_row_change [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_id uuid;
  v_row jsonb;
  v_before jsonb := null;
  v_after jsonb := null;
  v_name text := '';
  v_role text := '';
  v_label text;
  v_verb text;
begin
  if tg_op = 'DELETE' then
    v_org := old.org_id; v_id := old.id; v_row := to_jsonb(old);
    v_before := v_row;
  else
    v_org := new.org_id; v_id := new.id; v_row := to_jsonb(new);
    v_after := v_row;
    -- Une mise à jour qui ne change que le montant payé (paiements crédit) est déjà journalisée à part.
    if tg_op = 'UPDATE' and (to_jsonb(old) - 'paid') = (to_jsonb(new) - 'paid') then
      return new;
    end if;
    if tg_op = 'UPDATE' then v_before := to_jsonb(old); end if;
  end if;

  -- Lignes de pièce : conservées avec l'en-tête lors d'une suppression (la suppression est en cascade).
  if tg_op = 'DELETE' and tg_table_name = 'sales' then
    v_before := v_before || jsonb_build_object('lines',
      coalesce((select jsonb_agg(to_jsonb(l)) from public.sale_lines l where l.sale_id = old.id), '[]'::jsonb));
  elsif tg_op = 'DELETE' and tg_table_name = 'purchases' then
    v_before := v_before || jsonb_build_object('lines',
      coalesce((select jsonb_agg(to_jsonb(l)) from public.purchase_lines l where l.purchase_id = old.id), '[]'::jsonb));
  end if;

  if auth.uid() is not null then
    select coalesce(p.full_name, ''), coalesce(p.role, '')
      into v_name, v_role
    from public.profiles p where p.id = auth.uid();
  end if;

  v_label := case tg_table_name
    when 'sales' then 'Vente'
    when 'sale_payments' then 'Paiement de crédit'
    when 'customer_deposits' then 'Acompte client'
    when 'purchases' then 'Achat'
    when 'purchase_payments' then 'Paiement fournisseur'
    when 'business_expenses' then 'Dépense'
    when 'cash_closures' then 'Clôture de caisse'
    else tg_table_name end;
  v_verb := case tg_op when 'INSERT' then 'création' when 'UPDATE' then 'modification' else 'suppression' end;

  insert into public.audit_log (
    org_id, actor_id, actor_name, actor_role, table_name, record_id, action, summary, before_data, after_data
  ) values (
    v_org, auth.uid(), v_name, v_role, tg_table_name, v_id, lower(tg_op), v_label || ' : ' || v_verb,
    v_before, v_after
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$
;

-- backup_now [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.backup_now()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare new_id bigint;
begin
  if auth.uid() is null or public.my_role() <> 'admin' then raise exception 'Réservé au gérant.'; end if;
  new_id := public.make_backup_for_org(public.my_org());
  perform public.push_backup_offsite(new_id);
  return new_id;
end;
$function$
;

-- bootstrap_org [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.bootstrap_org(org_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  o uuid;
begin
  if me is null then raise exception 'Connexion requise.'; end if;
  if not public.is_platform_admin() then raise exception 'Seul le super administrateur peut créer une entreprise. Demandez un code d’activation.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  perform 1 from public.profiles p where p.id = me for update;
  if (select p.org_id from public.profiles p where p.id = me) is not null then
    raise exception 'Organisation déjà définie';
  end if;
  insert into public.organizations(name) values (org_name) returning id into o;
  insert into public.profiles(id, org_id, role) values (me, o, 'admin')
    on conflict (id) do update set org_id = o, role = 'admin';
  return o;
end
$function$
;

-- bump_record_version [search_path=""] [ANON EXECUTE]
CREATE OR REPLACE FUNCTION public.bump_record_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Les ventes et les mouvements de stock ne comptent pas comme une modification de la fiche.
  if (to_jsonb(new) - 'stock' - 'version') = (to_jsonb(old) - 'stock' - 'version') then
    new.version := old.version;
  else
    new.version := coalesce(old.version, 0) + 1;
  end if;
  return new;
end; $function$
;

-- cancel_commercial_due [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.cancel_commercial_due(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès réservé à la plateforme.'
      using errcode = '42501';
  end if;

  if p_reason is null
    or length(trim(p_reason)) not between 3 and 500
  then
    raise exception 'Motif de 3 à 500 caractères requis.';
  end if;

  perform 1
  from public.commercial_dues
  where id = p_id
  for update;

  if not found then
    raise exception 'Appel introuvable.';
  end if;

  if exists(
    select 1
    from public.commercial_payments
    where due_id = p_id and voided_at is null
  ) then
    raise exception 'Annulez d’abord les paiements associés.';
  end if;

  update public.commercial_dues
  set cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancel_reason = trim(p_reason)
  where id = p_id and cancelled_at is null;

  if not found then
    raise exception 'Appel déjà annulé.';
  end if;
end;
$function$
;

-- cancel_credit_payment [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.cancel_credit_payment(p_payment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payment public.sale_payments%rowtype;
  v_sale public.sales%rowtype;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then raise exception 'Vous n’avez pas le droit d’annuler un paiement.'; end if;
  select * into v_payment from public.sale_payments where id = p_payment_id and org_id = public.my_org() and kind = 'payment' for update;
  if not found then raise exception 'Paiement introuvable ou non annulable.'; end if;
  select * into v_sale from public.sales where id = v_payment.sale_id and org_id = public.my_org() for update;
  if not found then raise exception 'Facture introuvable.'; end if;
  delete from public.sale_payments where id = v_payment.id;
  update public.sales set paid = greatest(coalesce(paid, 0) - v_payment.amount, 0) where id = v_sale.id;
end $function$
;

-- cancel_proforma [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.cancel_proforma(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager','facturier') then raise exception 'Non autorisé.'; end if;
  update public.proformas set status = 'cancelled'
  where id = p_id and org_id = public.my_org() and status = 'draft'
    and (public.my_shop() is null or warehouse_id = public.my_shop());
  if not found then raise exception 'Ce proforma ne peut pas être annulé.'; end if;
end;
$function$
;

-- cancel_purchase_order [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager') then raise exception 'Réservé au gérant et au responsable.'; end if;
  update public.purchase_orders set status = 'cancelled' where id = p_id and org_id = public.my_org() and status = 'draft';
  if not found then raise exception 'Ce bon ne peut pas être annulé.'; end if;
end; $function$
;

-- cancel_reseller_commission [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.cancel_reseller_commission(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès plateforme requis.'
      using errcode = '42501';
  end if;

  if p_reason is null
    or length(trim(p_reason)) not between 3 and 500
  then
    raise exception 'Motif requis.';
  end if;

  update public.reseller_commissions
  set status = 'annulee',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancel_reason = trim(p_reason)
  where id = p_id and status = 'a_payer';

  if not found then
    raise exception 'Commission absente, déjà payée ou annulée.';
  end if;
end;
$function$
;

-- cash_close_summary [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.cash_close_summary(p_day date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_role = 'facturier' then raise exception 'La clôture globale est réservée au gérant et au responsable. Clôturez votre boutique.'; end if;
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
  where s.org_id = v_org and s.sold_at = p_day and s.payment = 'cash' and coalesce(payment_method, 'cash') = 'cash';

  -- Un acompte déjà compté le jour de sa réception ne doit pas être recompté lorsqu’il sert une facture.
  select coalesce(sum(p.amount), 0) into v_advance_used
  from public.sale_payments p
  join public.sales s on s.id = p.sale_id and s.org_id = p.org_id
  where p.org_id = v_org and p.paid_at = p_day and p.kind = 'advance' and s.payment = 'cash' and coalesce(payment_method, 'cash') = 'cash';
  v_cash_sales := greatest(v_cash_sales - v_advance_used, 0);

  select coalesce(sum(p.amount), 0) into v_credit_payments
  from public.sale_payments p
  where p.org_id = v_org and p.paid_at = p_day and p.kind in ('initial','payment') and coalesce(p.method, 'cash') = 'cash';

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
$function$
;

-- cash_close_summary_shop [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.cash_close_summary_shop(p_day date, p_warehouse uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.my_org();
  v_rate numeric(14,2);
  v_cash numeric(14,2) := 0;
  v_adv numeric(14,2) := 0;
  v_cred numeric(14,2) := 0;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(public.my_role() not in ('admin','manager','facturier'), true) then raise exception 'Vous n’avez pas accès à la clôture de caisse.'; end if;
  if public.my_role() = 'facturier' and public.my_shop() is distinct from p_warehouse then raise exception 'Vous ne pouvez clôturer que votre boutique.'; end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse and w.org_id = v_org) then raise exception 'Boutique introuvable.'; end if;
  select s.usd_cdf into v_rate from public.settings s where s.org_id = v_org;
  if coalesce(v_rate, 0) <= 0 then raise exception 'Le taux du jour doit être renseigné avant la clôture.'; end if;

  select coalesce(sum(l.qty * l.unit_price), 0) into v_cash
  from public.sales s join public.sale_lines l on l.sale_id = s.id and l.org_id = s.org_id
  where s.org_id = v_org and s.sold_at = p_day and s.payment = 'cash' and coalesce(payment_method, 'cash') = 'cash' and s.warehouse_id = p_warehouse;

  select coalesce(sum(p.amount), 0) into v_adv
  from public.sale_payments p join public.sales s on s.id = p.sale_id and s.org_id = p.org_id
  where p.org_id = v_org and p.paid_at = p_day and p.kind = 'advance' and s.payment = 'cash' and coalesce(payment_method, 'cash') = 'cash' and s.warehouse_id = p_warehouse;
  v_cash := greatest(v_cash - v_adv, 0);

  select coalesce(sum(p.amount), 0) into v_cred
  from public.sale_payments p join public.sales s on s.id = p.sale_id and s.org_id = p.org_id
  where p.org_id = v_org and p.paid_at = p_day and p.kind in ('initial','payment') and coalesce(p.method, 'cash') = 'cash' and s.warehouse_id = p_warehouse;

  return jsonb_build_object(
    'business_date', p_day, 'warehouse_id', p_warehouse, 'exchange_rate', v_rate,
    'cash_sales', round(v_cash, 2), 'credit_payments', round(v_cred, 2), 'cash_in', round(v_cash + v_cred, 2));
end;
$function$
;

-- consume_lots_fefo [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.consume_lots_fefo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_left numeric := -new.qty; r record; v_take numeric; v_to uuid;
begin
  if new.qty >= 0 or new.reason not in ('sale','transfer','adjustment','supplier_return') then return null; end if;
  if not exists (select 1 from public.articles a where a.id = new.article_id and a.track_expiry) then return null; end if;
  if new.reason = 'transfer' then
    select t.to_warehouse_id into v_to from public.transfers t where t.id = new.ref_id;
  end if;
  for r in select id, lot_number, expiry_date, qty_left from public.stock_lots
           where article_id = new.article_id and warehouse_id = new.warehouse_id and qty_left > 0
           order by expiry_date asc nulls last, created_at asc for update loop
    exit when v_left <= 0;
    v_take := least(r.qty_left, v_left);
    update public.stock_lots set qty_left = qty_left - v_take where id = r.id;
    -- Un transfert emporte la date de péremption : le dépôt d'arrivée reçoit le même lot.
    if v_to is not null then
      insert into public.stock_lots (org_id, warehouse_id, article_id, lot_number, expiry_date, qty_left)
      values (new.org_id, v_to, new.article_id, r.lot_number, r.expiry_date, v_take);
    end if;
    v_left := v_left - v_take;
  end loop;
  return null;
end; $function$
;

-- create_commercial_document [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.create_commercial_document(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_seller jsonb;
  v_old public.commercial_documents%rowtype;
  v_amount numeric;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès plateforme requis.'
      using errcode = '42501';
  end if;

  select * into v_old
  from public.commercial_documents
  where id = p_id;

  if found then
    if v_old.created_by <> auth.uid()
      or v_old.kind is distinct from p_data ->> 'kind'
      or v_old.customer_name is distinct from
        trim(p_data ->> 'customer_name')
      or v_old.customer_address is distinct from
        coalesce(p_data ->> 'customer_address', '')
      or v_old.title is distinct from
        trim(p_data ->> 'title')
      or v_old.amount is distinct from
        (p_data ->> 'amount')::numeric
      or v_old.currency is distinct from p_data ->> 'currency'
      or v_old.cycle is distinct from p_data ->> 'cycle'
      or v_old.valid_until is distinct from
        (p_data ->> 'valid_until')::date
      or v_old.conditions is distinct from
        trim(p_data ->> 'conditions')
      or v_old.prospect_id is distinct from
        nullif(p_data ->> 'prospect_id', '')::uuid
      or v_old.org_id is distinct from
        nullif(p_data ->> 'org_id', '')::uuid
    then
      raise exception 'Identifiant déjà utilisé.';
    end if;

    return p_id;
  end if;

  select to_jsonb(s) - 'id' - 'updated_at'
  into v_seller
  from public.commercial_seller s
  where id = 'main';

  if v_seller is null
    or length(trim(v_seller ->> 'name')) = 0
    or length(trim(coalesce(v_seller ->> 'legal_id', ''))) = 0
    or length(trim(coalesce(v_seller ->> 'address', ''))) = 0
  then
    raise exception
      'Complétez le nom, l’adresse et l’identifiant légal du vendeur.';
  end if;

  v_amount := (p_data ->> 'amount')::numeric;

  if v_amount::text in ('NaN', 'Infinity', '-Infinity')
    or v_amount <> round(v_amount, 2)
  then
    raise exception 'Montant invalide.';
  end if;

  insert into public.commercial_documents(
    id, kind, prospect_id, org_id,
    customer_name, customer_address,
    title, amount, currency, cycle,
    valid_until, seller, conditions, created_by
  )
  values (
    p_id,
    p_data ->> 'kind',
    nullif(p_data ->> 'prospect_id', '')::uuid,
    nullif(p_data ->> 'org_id', '')::uuid,
    trim(p_data ->> 'customer_name'),
    coalesce(p_data ->> 'customer_address', ''),
    trim(p_data ->> 'title'),
    v_amount,
    p_data ->> 'currency',
    p_data ->> 'cycle',
    (p_data ->> 'valid_until')::date,
    v_seller,
    trim(p_data ->> 'conditions'),
    auth.uid()
  );

  return p_id;
end;
$function$
;

-- create_commercial_due [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.create_commercial_due(p_id uuid, p_org uuid, p_label text, p_amount numeric, p_currency text, p_due_on date, p_period_start date, p_period_end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old public.commercial_dues%rowtype;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès réservé à la plateforme.'
      using errcode = '42501';
  end if;

  if p_id is null
    or p_amount is null
    or p_amount <= 0
    or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <> round(p_amount, 2)
  then
    raise exception
      'Montant positif avec deux décimales maximum requis.';
  end if;

  insert into public.commercial_dues(
    id, org_id, label, amount, currency,
    due_on, period_start, period_end, created_by
  )
  values(
    p_id, p_org, trim(p_label), p_amount, p_currency,
    p_due_on, p_period_start, p_period_end, auth.uid()
  )
  on conflict(id) do nothing;

  select * into v_old
  from public.commercial_dues
  where id = p_id;

  if v_old.org_id is distinct from p_org
    or v_old.label is distinct from trim(p_label)
    or v_old.amount is distinct from p_amount
    or v_old.currency is distinct from p_currency
    or v_old.due_on is distinct from p_due_on
    or v_old.period_start is distinct from p_period_start
    or v_old.period_end is distinct from p_period_end
  then
    raise exception
      'Identifiant déjà utilisé pour un autre appel de paiement.';
  end if;

  return p_id;
end;
$function$
;

-- create_company_code [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.create_company_code(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c text;
begin
  if not public.is_platform_admin() then raise exception 'Réservé au super administrateur.'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Indiquez le nom de l’entreprise.'; end if;
  insert into company_codes(company_name) values (trim(p_name)) returning code into c;
  return c;
end $function$
;

-- create_credit_note [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.create_credit_note(p_sale uuid, p_lines jsonb, p_note text DEFAULT ''::text, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.my_org();
  v_id uuid;
  v_num text;
  v_total numeric(14,2) := 0;
  v_sale record;
  l jsonb;
  v_qty numeric; v_price numeric; v_sold numeric; v_done numeric;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() not in ('admin','manager') then raise exception 'L’avoir est réservé au gérant et au responsable.'; end if;
  -- idempotence : un avoir déjà reçu (même identifiant) n'est pas recréé
  if p_id is not null and exists (select 1 from public.credit_notes where id = p_id and org_id = v_org) then
    return p_id;
  end if;
  v_id := coalesce(p_id, gen_random_uuid());
  select s.* into v_sale from public.sales s where s.id = p_sale and s.org_id = v_org;
  if v_sale is null then raise exception 'Facture introuvable.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'L’avoir doit contenir au moins une ligne.'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'La note ne peut pas dépasser 500 caractères.'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantité invalide.'; end if;
    select coalesce(sum(sl.qty), 0), coalesce(max(sl.unit_price), 0) into v_sold, v_price
      from public.sale_lines sl where sl.sale_id = p_sale and sl.article_id = (l->>'article_id')::uuid;
    if v_sold = 0 then raise exception 'Cet article ne figure pas sur la facture.'; end if;
    select coalesce(sum(cl.qty), 0) into v_done
      from public.credit_note_lines cl join public.credit_notes cn on cn.id = cl.credit_note_id
      where cn.sale_id = p_sale and cl.article_id = (l->>'article_id')::uuid;
    if v_qty > v_sold - v_done then raise exception 'Quantité supérieure à celle restant sur la facture (%).', v_sold - v_done; end if;
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;
  if v_total <= 0 then raise exception 'Le montant de l’avoir doit être supérieur à zéro.'; end if;
  v_num := public.next_document_number('avoir', 'AV');
  insert into public.credit_notes (id, org_id, number, sale_id, customer_id, total_usd, note, created_by)
  values (v_id, v_org, v_num, p_sale, v_sale.customer_id, v_total, trim(coalesce(p_note, '')), auth.uid());
  insert into public.credit_note_lines (org_id, credit_note_id, article_id, qty, unit_price)
  select v_org, v_id, (x->>'article_id')::uuid, (x->>'qty')::numeric,
    (select max(sl.unit_price) from public.sale_lines sl where sl.sale_id = p_sale and sl.article_id = (x->>'article_id')::uuid)
  from jsonb_array_elements(p_lines) x;
  return v_id;
end;
$function$
;

-- create_customer_deposit [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.create_customer_deposit(p_customer_id uuid, p_amount numeric, p_received_at date DEFAULT CURRENT_DATE, p_id uuid DEFAULT gen_random_uuid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_existing public.customer_deposits%rowtype;
  v_number integer;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_debt numeric := 0;
  v_role text := public.my_role();
  v_received_at date := coalesce(p_received_at, current_date);
begin
  -- idempotence hors ligne : une opération déjà reçue (même identifiant) n'est pas recréée.
  if p_id is not null and exists (select 1 from public.customer_deposits t where t.id = p_id) then return p_id; end if;
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
end $function$
;

-- create_customer_return [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.create_customer_return(p_sale uuid, p_lines jsonb, p_note text DEFAULT ''::text, p_credit boolean DEFAULT false, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.my_org(); v_role text := public.my_role(); v_id uuid; v_num text; v_sale record;
  v_total numeric(14,2) := 0; l jsonb; v_qty numeric; v_sold numeric; v_price numeric; v_before numeric;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier'), true) then raise exception 'Vous ne pouvez pas enregistrer de retour.'; end if;
  -- idempotence : un retour déjà reçu (même identifiant) n'est pas recréé et le stock n'est pas remis deux fois
  if p_id is not null and exists (select 1 from public.customer_returns where id = p_id and org_id = v_org) then
    return p_id;
  end if;
  v_id := coalesce(p_id, gen_random_uuid());
  select s.* into v_sale from public.sales s where s.id = p_sale and s.org_id = v_org;
  if v_sale is null then raise exception 'Facture introuvable.'; end if;
  if v_role = 'facturier' and public.my_shop() is distinct from v_sale.warehouse_id then raise exception 'Vous ne pouvez enregistrer un retour que pour votre boutique.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Le retour doit contenir au moins un article.'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantité invalide.'; end if;
    select coalesce(sum(sl.qty),0), coalesce(max(sl.unit_price),0) into v_sold, v_price from public.sale_lines sl where sl.sale_id = p_sale and sl.article_id = (l->>'article_id')::uuid;
    if v_sold = 0 then raise exception 'Cet article ne figure pas sur la facture.'; end if;
    select coalesce(sum(rl.qty),0) into v_before from public.customer_return_lines rl join public.customer_returns r on r.id = rl.return_id where r.sale_id = p_sale and rl.article_id = (l->>'article_id')::uuid;
    if v_qty > v_sold - v_before then raise exception 'Quantité supérieure à celle restant à retourner (%).', v_sold - v_before; end if;
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;
  v_num := public.next_document_number('retour_client', 'RET');
  insert into public.customer_returns (id, org_id, number, sale_id, warehouse_id, total_usd, note, created_by)
  values (v_id, v_org, v_num, p_sale, v_sale.warehouse_id, v_total, trim(coalesce(p_note,'')), auth.uid());
  insert into public.customer_return_lines (org_id, return_id, article_id, qty, unit_price)
  select v_org, v_id, (x->>'article_id')::uuid, (x->>'qty')::numeric, (select max(sl.unit_price) from public.sale_lines sl where sl.sale_id = p_sale and sl.article_id = (x->>'article_id')::uuid) from jsonb_array_elements(p_lines) x;
  insert into public.stock_moves (org_id, article_id, qty, reason, ref_id, warehouse_id)
  select v_org, (x->>'article_id')::uuid, (x->>'qty')::numeric, 'client_return', v_id, v_sale.warehouse_id from jsonb_array_elements(p_lines) x;
  if p_credit and v_role in ('admin','manager') then
    perform public.create_credit_note(p_sale, p_lines, 'Retour ' || v_num || '. ' || trim(coalesce(p_note,'')));
  end if;
  return v_id;
end;
$function$
;

-- create_inventory [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.create_inventory(p_warehouse uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := public.my_org();
  v_id uuid;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(public.my_role() not in ('admin', 'manager'), true) then
    raise exception 'Seul le gérant ou le responsable peut ouvrir un inventaire.';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse and w.org_id = v_org and w.active) then
    raise exception 'Dépôt introuvable ou inactif.';
  end if;

  -- Un seul brouillon par dépôt : on reprend celui qui existe déjà.
  select i.id into v_id from public.inventories i
  where i.org_id = v_org and i.warehouse_id = p_warehouse and i.status = 'draft'
  order by i.created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.inventories (org_id, warehouse_id, created_by)
  values (v_org, p_warehouse, auth.uid())
  returning id into v_id;

  insert into public.inventory_lines (org_id, inventory_id, article_id, theoretical)
  select v_org, v_id, a.id, coalesce(ws.qty, 0)
  from public.articles a
  left join public.warehouse_stock ws
    on ws.article_id = a.id and ws.warehouse_id = p_warehouse and ws.org_id = v_org
  where a.org_id = v_org and a.archived_at is null;

  return v_id;
end;
$function$
;

-- create_proforma [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.create_proforma(p_customer uuid, p_customer_label text, p_lines jsonb, p_note text DEFAULT ''::text, p_valid_until date DEFAULT NULL::date, p_warehouse uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.my_org();
  v_role text := public.my_role();
  v_wh uuid := coalesce(p_warehouse, public.default_warehouse());
  v_id uuid := gen_random_uuid();
  v_num text;
  v_total numeric(14,2) := 0;
  l jsonb;
  v_qty numeric; v_price numeric;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier'), true) then raise exception 'Vous ne pouvez pas créer de proforma.'; end if;
  if v_role = 'facturier' and public.my_shop() is distinct from v_wh then raise exception 'Vous ne pouvez créer des proformas que pour votre boutique.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Le proforma doit contenir au moins un article.'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'La note ne peut pas dépasser 500 caractères.'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l->>'qty')::numeric; v_price := (l->>'unit_price')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantité invalide.'; end if;
    if v_price is null or v_price < 0 then raise exception 'Prix invalide.'; end if;
    if not exists (select 1 from public.articles a where a.id = (l->>'article_id')::uuid and a.org_id = v_org) then raise exception 'Article introuvable.'; end if;
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;
  v_num := public.next_document_number('proforma', 'PRO');
  insert into public.proformas (id, org_id, warehouse_id, number, customer_id, customer_label, valid_until, total_usd, note, status, created_by)
  values (v_id, v_org, v_wh, v_num, p_customer, nullif(trim(coalesce(p_customer_label, '')), ''), p_valid_until, v_total, trim(coalesce(p_note, '')), 'draft', auth.uid());
  insert into public.proforma_lines (org_id, proforma_id, article_id, qty, unit_price)
  select v_org, v_id, (x->>'article_id')::uuid, (x->>'qty')::numeric, (x->>'unit_price')::numeric from jsonb_array_elements(p_lines) x;
  return v_id;
end;
$function$
;

-- create_purchase [search_path=public]
CREATE OR REPLACE FUNCTION public.create_purchase(p_supplier uuid, p_number text, p_date date, p_lines jsonb, p_id uuid DEFAULT NULL::uuid, p_usd_cdf numeric DEFAULT NULL::numeric, p_warehouse uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_line record;
  v_wh uuid;
begin
  -- idempotence hors ligne : une opération déjà reçue (même identifiant) n'est pas recréée.
  if p_id is not null and exists (select 1 from public.purchases t where t.id = p_id) then return p_id; end if;
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
  values (v_id, p_supplier, coalesce(nullif(trim(coalesce(p_number, '')), ''), public.next_document_number('purchase', 'ACH')), coalesce(p_date, current_date), coalesce(p_usd_cdf, (select usd_cdf from public.settings limit 1)), v_wh);
  insert into public.purchase_lines(purchase_id, article_id, qty, unit_cost)
  select v_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_cost')::numeric
  from jsonb_array_elements(p_lines) l
  join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org();
  return v_id;
end $function$
;

-- create_purchase_order [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.create_purchase_order(p_supplier uuid, p_warehouse uuid, p_lines jsonb, p_note text DEFAULT ''::text, p_expected date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid := public.my_org(); v_id uuid := gen_random_uuid(); v_num text; v_total numeric(14,2) := 0; l jsonb; v_qty numeric; v_cost numeric;
begin
  if auth.uid() is null or v_org is null or public.my_role() not in ('admin','manager') then raise exception 'Réservé au gérant et au responsable.'; end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse and w.org_id = v_org) then raise exception 'Dépôt introuvable.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Le bon doit contenir au moins un article.'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l->>'qty')::numeric; v_cost := (l->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantité invalide.'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'Prix invalide.'; end if;
    if not exists (select 1 from public.articles a where a.id = (l->>'article_id')::uuid and a.org_id = v_org) then raise exception 'Article introuvable.'; end if;
    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;
  v_num := public.next_document_number('bon_commande', 'BC');
  insert into public.purchase_orders (id, org_id, number, supplier_id, warehouse_id, expected_on, total_usd, note)
  values (v_id, v_org, v_num, p_supplier, p_warehouse, p_expected, v_total, trim(coalesce(p_note, '')));
  insert into public.purchase_order_lines (org_id, order_id, article_id, qty, unit_cost)
  select v_org, v_id, (x->>'article_id')::uuid, (x->>'qty')::numeric, (x->>'unit_cost')::numeric from jsonb_array_elements(p_lines) x;
  return v_id;
end; $function$
;

-- create_sale [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.create_sale(p_customer uuid, p_number text, p_date date, p_lines jsonb, p_id uuid DEFAULT NULL::uuid, p_usd_cdf numeric DEFAULT NULL::numeric, p_customer_label text DEFAULT NULL::text, p_payment text DEFAULT 'cash'::text, p_paid numeric DEFAULT NULL::numeric, p_deposit_id uuid DEFAULT NULL::uuid, p_advance_amount numeric DEFAULT 0, p_warehouse uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- idempotence hors ligne : une vente déjà reçue n'est pas recréée.
  if p_id is not null and exists (select 1 from public.sales s where s.id = p_id and s.org_id = public.my_org()) then return p_id; end if;
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(public.my_role() not in ('admin','manager','facturier'), true) then raise exception 'Vous n’avez pas le droit de créer une facture.'; end if;
  if p_id is not null and exists (select 1 from sales where id = p_id and org_id = public.my_org()) then return p_id; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where coalesce((l->>'discount_pct')::numeric,0) > 0) and not coalesce((select o.discounts_enabled from public.organizations o where o.id = public.my_org()), false) then raise exception 'Les remises ne sont pas activées dans les paramètres de votre entreprise.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where coalesce((l->>'discount_pct')::numeric,0) < 0 or coalesce((l->>'discount_pct')::numeric,0) > 100) then raise exception 'La remise doit être comprise entre 0 et 100 %%.'; end if;
  if public.my_role() = 'facturier' and exists (select 1 from jsonb_array_elements(p_lines) l where coalesce((l->>'discount_pct')::numeric,0) > 10) then raise exception 'Un facturier ne peut pas accorder plus de 10 %% de remise. Demandez au gérant.'; end if;
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
  if public.my_shop() = '00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Aucune boutique n’est attribuée à votre compte. Demandez au gérant de vous en attribuer une.'; end if;
  if public.my_shop() is not null and v_wh is distinct from public.my_shop() then raise exception 'Vous ne pouvez vendre que dans votre boutique.'; end if;
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
      coalesce(p_usd_cdf, (select s.usd_cdf from public.settings s where s.org_id = public.my_org())), coalesce(p_payment,'cash'), v_initial + v_advance, v_wh);
  insert into sale_lines(sale_id, article_id, qty, unit_price, discount_pct)
    select sid, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric, coalesce((l->>'discount_pct')::numeric,0) from jsonb_array_elements(p_lines) l
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
end $function$
;

-- create_stock_lot [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.create_stock_lot(p_warehouse uuid, p_article uuid, p_lot text, p_expiry date, p_qty numeric, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid := public.my_org(); v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager') then raise exception 'Réservé au gérant et au responsable.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantité invalide.'; end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse and w.org_id = v_org) then raise exception 'Dépôt introuvable.'; end if;
  if not exists (select 1 from public.articles a where a.id = p_article and a.org_id = v_org) then raise exception 'Article introuvable.'; end if;
  insert into public.stock_lots (id, org_id, warehouse_id, article_id, lot_number, expiry_date, qty_left)
  values (v_id, v_org, p_warehouse, p_article, trim(p_lot), p_expiry, p_qty);
  insert into public.stock_moves (org_id, article_id, qty, reason, ref_id, warehouse_id)
  values (v_org, p_article, p_qty, 'adjustment', v_id, p_warehouse);
  return v_id;
end; $function$
;

-- create_supplier_return [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.create_supplier_return(p_warehouse uuid, p_supplier uuid, p_lines jsonb, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.my_org(); v_id uuid := gen_random_uuid(); v_num text; l jsonb; v_qty numeric; v_have numeric;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() not in ('admin','manager') then raise exception 'Réservé au gérant et au responsable.'; end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse and w.org_id = v_org) then raise exception 'Dépôt introuvable.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Le retour doit contenir au moins un article.'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantité invalide.'; end if;
    select coalesce(ws.qty,0) into v_have from public.warehouse_stock ws where ws.warehouse_id = p_warehouse and ws.article_id = (l->>'article_id')::uuid;
    if coalesce(v_have,0) < v_qty then raise exception 'Stock insuffisant dans ce dépôt (disponible : %).', coalesce(v_have,0); end if;
  end loop;
  v_num := public.next_document_number('retour_fournisseur', 'RFO');
  insert into public.supplier_returns (id, org_id, number, warehouse_id, supplier_id, note, created_by)
  values (v_id, v_org, v_num, p_warehouse, p_supplier, trim(coalesce(p_note,'')), auth.uid());
  insert into public.supplier_return_lines (org_id, return_id, article_id, qty, unit_cost)
  select v_org, v_id, (x->>'article_id')::uuid, (x->>'qty')::numeric, coalesce((select a.price_buy from public.articles a where a.id = (x->>'article_id')::uuid), 0) from jsonb_array_elements(p_lines) x;
  insert into public.stock_moves (org_id, article_id, qty, reason, ref_id, warehouse_id)
  select v_org, (x->>'article_id')::uuid, -(x->>'qty')::numeric, 'supplier_return', v_id, p_warehouse from jsonb_array_elements(p_lines) x;
  return v_id;
end;
$function$
;

-- create_transfer [search_path=public] [ANON EXECUTE]
CREATE OR REPLACE FUNCTION public.create_transfer(p_from uuid, p_to uuid, p_destination text, p_date date, p_lines jsonb, p_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare tid uuid; r record; num text; v_org uuid;
begin
  if p_id is not null and exists (select 1 from transfers where id = p_id) then return p_id; end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'Choisissez deux dépôts différents.';
  end if;
  select org_id into v_org from warehouses where id = p_from;
  if v_org is null or not exists (select 1 from warehouses where id = p_to and org_id = v_org) then
    raise exception 'Les dépôts doivent appartenir à la même entreprise.';
  end if;
  if nullif(trim(coalesce(p_destination,'')),'') is null then raise exception 'Indiquez le vendeur ou la destination.'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins un produit.'; end if;

  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;

  -- Stock du dépôt d'origine
  for r in
    select a.name, coalesce(s.qty, 0) as dispo
    from jsonb_array_elements(p_lines) l
    join articles a on a.id = (l->>'article_id')::uuid
    left join warehouse_stock s on s.article_id = a.id and s.warehouse_id = p_from
    group by a.id, a.name, s.qty
    having sum((l->>'qty')::numeric) > coalesce(s.qty, 0)
  loop
    raise exception 'Stock insuffisant dans le dépôt d’origine pour % : % disponible(s).', r.name, r.dispo;
  end loop;

  num := public.next_document_number('transfer', 'TRF');
  tid := coalesce(p_id, gen_random_uuid());
  insert into transfers(id, number, destination, note, moved_at, from_warehouse_id, to_warehouse_id)
    values(tid, num, trim(p_destination), nullif(trim(coalesce(p_note,'')),''),
           coalesce(p_date, current_date), p_from, p_to);
  insert into transfer_lines(transfer_id, article_id, qty)
    select tid, (l->>'article_id')::uuid, (l->>'qty')::numeric from jsonb_array_elements(p_lines) l;
  return tid;
end
$function$
;

-- create_warehouse_transfer [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.create_warehouse_transfer(p_from uuid, p_to uuid, p_date date, p_lines jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := public.my_org();
  v_role text := public.my_role();
  v_tid uuid := gen_random_uuid();
  v_num text;
  v_dest text;
  r record;
begin
  if public.my_role() = 'facturier' and not coalesce((select uw.can_transfer_all from public.user_warehouses uw where uw.user_id = auth.uid()), false) and p_from is distinct from public.my_shop() then
    raise exception 'Vous ne pouvez transférer que depuis votre boutique. Demandez au gérant l’autorisation de transférer depuis les autres dépôts.';
  end if;
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier'), true) then raise exception 'Vous n’avez pas le droit de transférer du stock.'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'Choisissez deux dépôts différents.'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins un produit.'; end if;
  if (select count(*) from jsonb_array_elements(p_lines) l join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = v_org and a.org_id = v_org) <> jsonb_array_length(p_lines) then raise exception 'Un produit est introuvable dans votre entreprise.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where coalesce((l->>'qty')::numeric, 0) <= 0) then raise exception 'Chaque quantité doit être supérieure à zéro.'; end if;
  if (select count(*) from public.warehouses where id in (p_from, p_to) and org_id = v_org and active) <> 2 then
    raise exception 'Dépôt introuvable ou inactif.';
  end if;
  select name into v_dest from public.warehouses where id = p_to;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, coalesce(s.qty, 0) as dispo
           from jsonb_array_elements(p_lines) l
           join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = v_org
           left join public.warehouse_stock s on s.article_id = a.id and s.warehouse_id = p_from
           group by a.id, a.name, s.qty
           having sum((l->>'qty')::numeric) > coalesce(s.qty, 0) loop
    raise exception 'Stock insuffisant dans le dépôt source pour % : % disponible(s).', r.name, r.dispo;
  end loop;
  select 'TRF-' || lpad((count(*) + 1)::text, 5, '0') into v_num from public.transfers where org_id = v_org;
  insert into public.transfers(id, org_id, number, destination, note, moved_at, from_warehouse_id, to_warehouse_id)
    values (v_tid, v_org, v_num, 'Dépôt : ' || v_dest, nullif(trim(coalesce(p_note, '')), ''), coalesce(p_date, current_date), p_from, p_to);
  insert into public.transfer_lines(org_id, transfer_id, article_id, qty)
    select v_org, v_tid, (l->>'article_id')::uuid, (l->>'qty')::numeric from jsonb_array_elements(p_lines) l;
  return v_tid;
end $function$
;

-- create_worker [search_path=public] [ANON EXECUTE]
CREATE OR REPLACE FUNCTION public.create_worker(p_name text, p_role text, p_kind text, p_usual numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare wid uuid;
begin
  if my_role() <> 'admin' then raise exception 'Accès réservé au gérant.'; end if;
    if not public.plan_allows('personnel') then raise exception 'Le personnel n’est pas inclus dans votre formule.'; end if;
      if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Indiquez le nom.'; end if;
        insert into workers(org_id, name, role_label, pay_kind, usual_amount)
            values (my_org(), trim(p_name), nullif(trim(coalesce(p_role,'')),''), coalesce(p_kind,'fixed'), coalesce(p_usual,0))
                returning id into wid;
                  return wid;
                  end $function$
;

-- credit_sales_all [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.credit_sales_all()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(q.x order by q.sold desc), '[]'::jsonb) from (
    select s.sold_at as sold,
      jsonb_build_object(
        'id', s.id, 'number', s.number, 'sold_at', s.sold_at, 'customer_label', s.customer_label,
        'payment', s.payment, 'paid', s.paid, 'credit_notes_total', (select coalesce(sum(cn.total_usd), 0) from public.credit_notes cn where cn.sale_id = s.id), 'usd_cdf', s.usd_cdf,
        'customers', (select jsonb_build_object('name', c.name, 'phone', c.phone) from public.customers c where c.id = s.customer_id),
        'sale_lines', coalesce((select jsonb_agg(jsonb_build_object('qty', l.qty, 'unit_price', l.unit_price,
            'articles', (select jsonb_build_object('sku', a.sku, 'name', a.name) from public.articles a where a.id = l.article_id)))
          from public.sale_lines l where l.sale_id = s.id), '[]'::jsonb),
        'sale_payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'paid_at', p.paid_at, 'kind', p.kind,
            'created_at', p.created_at, 'customer_deposit_id', p.customer_deposit_id,
            'customer_deposits', (select jsonb_build_object('receipt_number', d.receipt_number) from public.customer_deposits d where d.id = p.customer_deposit_id)))
          from public.sale_payments p where p.sale_id = s.id), '[]'::jsonb)
      ) as x
    from public.sales s
    where s.org_id = public.my_org() and s.payment = 'credit'
  ) q
$function$
;

-- customer_debts [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.customer_debts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
    select k, sum(d) as v from (
      select coalesce(s.customer_id::text, 'label:' || coalesce(s.customer_label, '')) as k,
             greatest(0, coalesce((select sum(sl.qty * sl.unit_price) from public.sale_lines sl where sl.sale_id = s.id), 0) - coalesce(s.paid, 0) - coalesce((select sum(cn.total_usd) from public.credit_notes cn where cn.sale_id = s.id), 0)) as d
      from public.sales s
      where s.org_id = public.my_org() and s.payment = 'credit'
    ) z group by k
  ) x
$function$
;

-- customer_org [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.customer_org()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.org_id
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.status = 'active'
    and (
      o.expires_at is null
      or o.expires_at >= current_date
    )
$function$
;

-- decide_commercial_document [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.decide_commercial_document(p_id uuid, p_status text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès plateforme requis.'
      using errcode = '42501';
  end if;

  if p_status not in ('accepte', 'refuse')
    or p_note is null
    or length(trim(p_note)) not between 3 and 1000
  then
    raise exception 'Décision et référence de preuve requises.';
  end if;

  update public.commercial_documents
  set status = p_status,
      decision_note = trim(p_note),
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_id and status = 'brouillon';

  if not found then
    raise exception 'Document absent ou déjà décidé.';
  end if;
end;
$function$
;

-- default_warehouse [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.default_warehouse()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.warehouse_of_org(public.my_org())
$function$
;

-- delete_company [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.delete_company(p_org uuid, p_confirm text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text; v_own uuid; v_actor uuid := auth.uid(); v_email text; t record; n bigint; total bigint := 0; pass int := 0; left_rows bigint;
begin
  if not public.is_platform_admin() then raise exception 'Réservé au super administrateur de KaPya.'; end if;
  select name into v_name from public.organizations where id = p_org;
  if v_name is null then raise exception 'Entreprise introuvable.'; end if;
  select org_id into v_own from public.profiles where id = v_actor;
  if v_own = p_org then raise exception 'Vous ne pouvez pas supprimer l’entreprise à laquelle votre compte est rattaché.'; end if;
  if trim(coalesce(p_confirm, '')) <> v_name then raise exception 'Le nom saisi ne correspond pas. Suppression annulée.'; end if;
  select email into v_email from auth.users where id = v_actor;
  insert into public.platform_audit (actor_id, actor_email, target_org, action, detail)
  values (v_actor, v_email, p_org, 'suppression', format('entreprise « %s » supprimée avec toutes ses données', v_name));
  -- Suppression table par table, répétée tant qu'une dépendance bloque : les lignes enfants partent avant les parents.
  loop
    pass := pass + 1;
    left_rows := 0;
    for t in select c.relname as tbl from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
             where ns.nspname = 'public' and c.relkind = 'r' and c.relname <> 'organizations'
               and exists (select 1 from information_schema.columns col where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'org_id')
    loop
      begin
        execute format('delete from public.%I where org_id = $1', t.tbl) using p_org;
        get diagnostics n = row_count;
        total := total + n;
      exception when foreign_key_violation then
        left_rows := left_rows + 1;
      end;
    end loop;
    exit when left_rows = 0 or pass >= 12;
  end loop;
  if exists (select 1 from public.profiles where org_id = p_org) then null; end if;
  delete from public.organizations where id = p_org;
  return total::integer;
end; $function$
;

-- delete_worker [search_path=public] [ANON EXECUTE]
CREATE OR REPLACE FUNCTION public.delete_worker(p_worker uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_rows integer;
begin
  -- Réservé au gérant (rôle admin de son profil)
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Réservé au gérant';
  end if;

  if exists (select 1 from public.worker_payments where worker_id = p_worker) then
    update public.workers set active = false where id = p_worker;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'Personne introuvable'; end if;
    return 'archived';
  end if;

  delete from public.workers where id = p_worker;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Personne introuvable'; end if;
  return 'deleted';
end;
$function$
;

-- find_article_by_barcode [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.find_article_by_barcode(p_code text)
 RETURNS TABLE(id uuid, sku text, name text, unit text, price_sell numeric, stock numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.id, a.sku, a.name, a.unit, a.price_sell, a.stock from public.articles a
  where a.org_id = public.my_org() and a.barcode = trim(p_code) limit 1
$function$
;

-- freeze_sale_line_cost [ANON EXECUTE]
CREATE OR REPLACE FUNCTION public.freeze_sale_line_cost()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.unit_cost is null then
    select a.price_buy into new.unit_cost from public.articles a where a.id = new.article_id;
  end if;
  return new;
end;
$function$
;

-- generate_reseller_commission [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.generate_reseller_commission(p_id uuid, p_payment uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payment public.commercial_payments%rowtype;
  v_org uuid;
  v_currency text;
  v_reseller public.commercial_resellers%rowtype;
  v_label text;
  v_reseller_id uuid;
  v_existing uuid;
  v_amount numeric;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès plateforme requis.'
      using errcode = '42501';
  end if;

  select * into v_payment
  from public.commercial_payments
  where id = p_payment
  for update;

  if not found or v_payment.voided_at is not null then
    raise exception 'Paiement absent ou annulé.';
  end if;

  select id into v_existing
  from public.reseller_commissions
  where payment_id = p_payment;

  if found then
    return v_existing;
  end if;

  select org_id, currency into v_org, v_currency
  from public.commercial_dues
  where id = v_payment.due_id;

  select client_label, reseller_id
  into v_label, v_reseller_id
  from public.reseller_clients
  where id = v_org
  for share;

  select * into v_reseller
  from public.commercial_resellers
  where id = v_reseller_id and active
  for share;

  if not found then
    raise exception 'Aucun revendeur actif attribué à ce client.';
  end if;

  v_amount := round(
    v_payment.amount * v_reseller.rate / 100,
    2
  );

  if v_amount <= 0 then
    raise exception 'Commission nulle : vérifiez le taux.';
  end if;

  insert into public.reseller_commissions(
    id, payment_id, reseller_id, client_label,
    base_amount, rate, amount, currency, created_by
  )
  values (
    p_id, p_payment, v_reseller.id, v_label,
    v_payment.amount, v_reseller.rate,
    v_amount, v_currency, auth.uid()
  );

  return p_id;
end;
$function$
;

-- guard_admin [search_path=""]
CREATE OR REPLACE FUNCTION public.guard_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.id = auth.uid() and new.role <> 'admin'
     and (select count(*) from public.profiles where org_id = old.org_id and role = 'admin') <= 1 then
    raise exception 'Il doit rester au moins un administrateur.';
  end if;
  return new;
end $function$
;

-- guard_credit_paid_amount [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.guard_credit_paid_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_receipts numeric;
begin
  select coalesce(sum(p.amount), 0) into v_receipts
  from public.sale_payments p where p.sale_id = old.id and p.org_id = old.org_id;
  if new.paid < v_receipts then
    raise exception 'Le montant payé ne peut pas être inférieur aux versements déjà enregistrés.';
  end if;
  return new;
end $function$
;

-- guard_document_org_links [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.guard_document_org_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_table_name = 'sales' then
    if new.customer_id is not null and not exists (
      select 1 from public.customers c where c.id = new.customer_id and c.org_id = new.org_id
    ) then
      raise exception 'Le client de la vente doit appartenir à la même entreprise.';
    end if;
  elsif tg_table_name = 'purchases' then
    if new.supplier_id is not null and not exists (
      select 1 from public.suppliers s where s.id = new.supplier_id and s.org_id = new.org_id
    ) then
      raise exception 'Le fournisseur de l’achat doit appartenir à la même entreprise.';
    end if;
  else
    raise exception 'Table de document non prise en charge.';
  end if;

  if new.warehouse_id is not null and not exists (
    select 1 from public.warehouses w where w.id = new.warehouse_id and w.org_id = new.org_id
  ) then
    raise exception 'Le dépôt du document doit appartenir à la même entreprise.';
  end if;
  return new;
end
$function$
;

-- guard_org_delete [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.guard_org_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_has_data boolean;
begin
  if coalesce(current_setting('kapya.allow_company_delete', true), '') = 'on' then return old; end if;
  select exists (select 1 from public.profiles where org_id = old.id) or exists (select 1 from public.sales where org_id = old.id) into v_has_data;
  if v_has_data then
    raise exception 'Suppression refusée : cette entreprise a des membres ou des ventes. Pour la supprimer volontairement, une opération de maintenance doit la confirmer.';
  end if;
  return old;
end; $function$
;

-- guard_org_plan [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.guard_org_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.plan is distinct from old.plan or new.status is distinct from old.status or new.expires_at is distinct from old.expires_at)
     and not public.is_platform_admin() then
    raise exception 'Seul l’administrateur de la plateforme peut modifier la formule, le statut ou l’échéance.';
  end if;
  return new;
end $function$
;

-- guard_payment_commissions [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.guard_payment_commissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.voided_at is null
    and new.voided_at is not null
  then
    if exists (
      select 1
      from public.reseller_commissions
      where payment_id = old.id and status = 'payee'
    ) then
      raise exception
        'Commission déjà versée : réconciliez le versement avant toute correction de ce paiement.';
    end if;

    update public.reseller_commissions
    set status = 'annulee',
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        cancel_reason = 'Annulation du paiement associé'
    where payment_id = old.id and status = 'a_payer';
  end if;

  return new;
end;
$function$
;

-- guard_plan_transfers [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.guard_plan_transfers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.plan_allows('transferts') then
    raise exception 'Les transferts entre dépôts ne sont pas inclus dans votre formule.';
  end if;
  if new.from_warehouse_id is null or new.to_warehouse_id is null
     or new.from_warehouse_id = new.to_warehouse_id then
    raise exception 'Choisissez deux dépôts différents.';
  end if;
  if not exists (
    select 1 from public.warehouses w
    where w.id = new.from_warehouse_id and w.org_id = new.org_id and w.active
  ) or not exists (
    select 1 from public.warehouses w
    where w.id = new.to_warehouse_id and w.org_id = new.org_id and w.active
  ) then
    raise exception 'Les dépôts du transfert doivent être actifs et appartenir à la même entreprise.';
  end if;
  return new;
end
$function$
;

-- guard_warehouse_update [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.guard_warehouse_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_default and not old.is_default then raise exception 'Le dépôt principal est fixé à la création de l’entreprise.'; end if;
  if old.is_default and (not new.active or not new.is_default) then
    raise exception 'Le dépôt principal ne peut pas être désactivé.';
  end if;
  if old.active and not new.active and exists (
       select 1 from public.warehouse_stock s where s.warehouse_id = old.id and s.qty <> 0) then
    raise exception 'Ce dépôt contient encore du stock. Transférez-le avant de le désactiver.';
  end if;
  return new;
end $function$
;

-- initialize_new_purchase_balance [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.initialize_new_purchase_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.purchase_payment_balances(purchase_id, org_id, opening_balance)
  select new.purchase_id, new.org_id, (
    select coalesce(sum(l.qty * l.unit_cost), 0) from public.purchase_lines l
    where l.purchase_id = new.purchase_id and l.org_id = new.org_id
  )
  on conflict (purchase_id) do update set opening_balance = excluded.opening_balance;
  return null;
end $function$
;

-- initialize_purchase_balance [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.initialize_purchase_balance(p_purchase_id uuid, p_remaining numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_total numeric(14,2); v_balance numeric(14,2) := round(coalesce(p_remaining, 0), 2);
begin
  if auth.uid() is null or coalesce(public.my_role() <> 'admin', true) then raise exception 'Seul le gérant peut initialiser une dette fournisseur.'; end if;
  select coalesce(sum(qty * unit_cost), 0) into v_total from public.purchase_lines where purchase_id = p_purchase_id and org_id = public.my_org();
  if not exists (select 1 from public.purchases where id = p_purchase_id and org_id = public.my_org()) then raise exception 'Facture fournisseur introuvable.'; end if;
  if v_balance < 0 or v_balance > v_total then raise exception 'Le solde initial doit être compris entre 0 et le total de la facture (%).', to_char(v_total, 'FM999,999,990.00'); end if;
  insert into public.purchase_payment_balances(purchase_id,org_id,opening_balance)
  values (p_purchase_id,public.my_org(),v_balance) on conflict (purchase_id) do nothing;
  if not found then raise exception 'Le solde de cette facture est déjà initialisé.'; end if;
  return p_purchase_id;
end $function$
;

-- is_platform_admin [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select exists (select 1 from platform_admins where user_id = auth.uid()) $function$
;

-- is_reseller [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.is_reseller()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.commercial_resellers
    where user_id = auth.uid() and active
  )
$function$
;

-- join_org [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.join_org(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  inv record;
  v_plan text;
  maxu int;
  used int;
begin
  if me is null then raise exception 'Connexion requise.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  perform 1 from public.profiles p where p.id = me for update;
  if (select p.org_id from public.profiles p where p.id = me) is not null then
    raise exception 'Vous appartenez déjà à une entreprise.';
  end if;
  select i.* into inv from public.invitations i
    where i.code = upper(trim(p_code)) and i.used_at is null and i.expires_at > now()
    for update;
  if not found then raise exception 'Code d''invitation invalide ou expiré.' using errcode = 'KP404'; end if;
  if inv.role not in ('manager','facturier','comptable','user') then
    raise exception 'Le rôle de cette invitation n’est pas autorisé.';
  end if;
  select o.plan into v_plan from public.organizations o where o.id = inv.org_id for update;
  if not found then raise exception 'Entreprise introuvable.'; end if;
  maxu := case v_plan when 'basique' then 3 when 'standard' then 10 else 1000000 end;
  select count(*) into used from public.profiles p where p.org_id = inv.org_id;
  if used >= maxu then raise exception 'Limite de sièges atteinte pour le forfait de cette entreprise.'; end if;
  insert into public.profiles(id, org_id, role) values (me, inv.org_id, inv.role)
    on conflict (id) do update set org_id = inv.org_id, role = inv.role;
  update public.invitations set used_at = now() where id = inv.id and used_at is null;
  return inv.org_id;
end
$function$
;

-- line_takes_document_warehouse [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.line_takes_document_warehouse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parent_org uuid;
  v_parent_warehouse uuid;
begin
  if tg_table_name = 'sale_lines' then
    select s.org_id, s.warehouse_id into v_parent_org, v_parent_warehouse
    from public.sales s where s.id = new.sale_id;
  else
    select p.org_id, p.warehouse_id into v_parent_org, v_parent_warehouse
    from public.purchases p where p.id = new.purchase_id;
  end if;

  if not found or v_parent_org is distinct from new.org_id then
    raise exception 'Le document parent doit appartenir à la même entreprise.';
  end if;
  if not exists (select 1 from public.articles a where a.id = new.article_id and a.org_id = new.org_id) then
    raise exception 'Le produit doit appartenir à la même entreprise.';
  end if;

  if new.warehouse_id is null then new.warehouse_id := v_parent_warehouse; end if;
  if new.warehouse_id is not null and not exists (
    select 1 from public.warehouses w where w.id = new.warehouse_id and w.org_id = new.org_id
  ) then
    raise exception 'Le dépôt doit appartenir à la même entreprise.';
  end if;
  return new;
end
$function$
;

-- log_org_changes [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.log_org_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := auth.uid(); v_email text; v_changes text := '';
begin
  select email into v_email from auth.users where id = v_actor;
  if new.name is distinct from old.name then v_changes := v_changes || format('nom : « %s » → « %s » ; ', old.name, new.name); end if;
  if new.plan is distinct from old.plan then v_changes := v_changes || format('formule : %s → %s ; ', old.plan, new.plan); end if;
  if new.status is distinct from old.status then v_changes := v_changes || format('statut : %s → %s ; ', old.status, new.status); end if;
  if new.expires_at is distinct from old.expires_at then v_changes := v_changes || format('échéance : %s → %s ; ', old.expires_at, new.expires_at); end if;
  if new.address is distinct from old.address or new.phone is distinct from old.phone or new.email is distinct from old.email or new.tax_id is distinct from old.tax_id or new.rc is distinct from old.rc then v_changes := v_changes || 'coordonnées modifiées ; '; end if;
  if (new.logo is distinct from old.logo) then v_changes := v_changes || case when new.logo is null then 'logo retiré ; ' else 'logo modifié ; ' end; end if;
  if new.receipt_footer is distinct from old.receipt_footer then v_changes := v_changes || 'pied de page modifié ; '; end if;
  if v_changes <> '' then
    insert into public.platform_audit (actor_id, actor_email, target_org, action, detail) values (v_actor, v_email, new.id, 'entreprise', v_changes);
  end if;
  return new;
end; $function$
;

-- log_platform_admin_changes [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.log_platform_admin_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := auth.uid(); v_email text;
begin
  select email into v_email from auth.users where id = v_actor;
  if tg_op = 'INSERT' then
    insert into public.platform_audit (actor_id, actor_email, action, detail) values (v_actor, v_email, 'super_admin', format('super administrateur ajouté : %s', new.user_id));
  else
    insert into public.platform_audit (actor_id, actor_email, action, detail) values (v_actor, v_email, 'super_admin', format('super administrateur retiré : %s', old.user_id));
  end if;
  return coalesce(new, old);
end; $function$
;

-- log_profile_changes [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.log_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := auth.uid(); v_email text;
begin
  select email into v_email from auth.users where id = v_actor;
  if new.role is distinct from old.role or new.org_id is distinct from old.org_id then
    insert into public.platform_audit (actor_id, actor_email, target_org, action, detail)
    values (v_actor, v_email, new.org_id, 'membre', format('compte %s : rôle %s → %s, entreprise %s → %s', new.id, old.role, new.role, old.org_id, new.org_id));
  end if;
  return new;
end; $function$
;

-- make_backup_for_org [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.make_backup_for_org(p_org uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tables text[] := array['settings','warehouses','customers','suppliers','articles','invoice_counters','customer_deposit_counters',
    'sales','sale_lines','sale_payments','sale_cost_snapshots','customer_deposits','purchases','purchase_lines','purchase_payments',
    'purchase_payment_balances','stock_moves','business_expenses','cash_closures','transfers','transfer_lines','audit_log'];
  t text;
  rows_json jsonb;
  n int;
  data jsonb := '{}'::jsonb;
  total int := 0;
  new_id bigint;
begin
  foreach t in array tables loop
    execute format('select coalesce(jsonb_agg(x), ''[]''::jsonb), count(*) from (select * from public.%I where org_id = $1) x', t)
      into rows_json, n using p_org;
    data := data || jsonb_build_object(t, rows_json);
    total := total + n;
  end loop;
  insert into public.auto_backups (org_id, tables_count, rows_total, payload)
  values (p_org, array_length(tables, 1), total,
    jsonb_build_object('app', 'KaPya ERP', 'format', 1, 'exported_at', now(), 'data', data))
  returning id into new_id;
  return new_id;
end;
$function$
;

-- mark_proforma_converted [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.mark_proforma_converted(p_id uuid, p_sale uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager','facturier') then raise exception 'Non autorisé.'; end if;
  update public.proformas set status = 'converted', converted_sale_id = p_sale
  where id = p_id and org_id = public.my_org() and status = 'draft';
  if not found then raise exception 'Ce proforma ne peut plus être transformé.'; end if;
end;
$function$
;

-- mark_welcome_seen [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.mark_welcome_seen()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.profiles set welcome_seen_at = coalesce(welcome_seen_at, now()) where id = auth.uid();
$function$
;

-- mobile_money_total [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.mobile_money_total(p_day date, p_warehouse uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v numeric;
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager','facturier') then raise exception 'Non autorisé.'; end if;
  if public.my_role() = 'facturier' and public.my_shop() is distinct from p_warehouse then raise exception 'Vous ne pouvez voir que votre boutique.'; end if;
  select coalesce(sum(l.qty * l.unit_price), 0) into v
  from public.sales s join public.sale_lines l on l.sale_id = s.id and l.org_id = s.org_id
  where s.org_id = public.my_org() and s.sold_at = p_day and s.payment = 'cash' and coalesce(s.payment_method, 'cash') <> 'cash' and s.warehouse_id = p_warehouse;
  return round(v, 2);
end; $function$
;

-- move_takes_default_warehouse [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.move_takes_default_warehouse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.warehouse_id is null then new.warehouse_id := public.warehouse_of_org(new.org_id); end if;
  return new;
end $function$
;

-- my_org [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.my_org()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select o.id from profiles p join organizations o on o.id = p.org_id
  where p.id = auth.uid() and o.status = 'active' and (o.expires_at is null or o.expires_at >= current_date) $function$
;

-- my_role [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select role from public.profiles where id=auth.uid() $function$
;

-- my_shop [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.my_shop()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when public.my_role() is distinct from 'facturier' then null
    else coalesce((select uw.warehouse_id from public.user_warehouses uw where uw.user_id = auth.uid()),
                  '00000000-0000-0000-0000-000000000000'::uuid) end
$function$
;

-- next_document_number [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.next_document_number(p_kind text, p_prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v int; o uuid := public.my_org();
begin
  if o is null then raise exception 'Connexion requise.'; end if;
  insert into public.document_counters as c (org_id, kind, last) values (o, p_kind, 1)
    on conflict (org_id, kind) do update set last = c.last + 1 returning c.last into v;
  return p_prefix || '-' || lpad(v::text, 5, '0');
end
$function$
;

-- next_invoice_number [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.next_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v int;
begin
  insert into invoice_counters as c (org_id, last) values (public.my_org(), 1)
    on conflict (org_id) do update set last = c.last + 1 returning c.last into v;
  return 'FAC-' || lpad(v::text, 5, '0');
end $function$
;

-- open_support_ticket [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.open_support_ticket(p_id uuid, p_org uuid, p_subject text, p_category text, p_priority text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_old public.support_tickets%rowtype;
  v_name text;
begin
  v_org := case
    when public.is_platform_admin() then p_org
    else public.customer_org()
  end;

  if v_org is null
    or (p_org is not null and p_org <> v_org)
  then
    raise exception 'Entreprise non autorisée.'
      using errcode = '42501';
  end if;

  select * into v_old
  from public.support_tickets
  where id = p_id;

  if found then
    if v_old.created_by <> auth.uid()
      or v_old.org_id <> v_org
      or v_old.subject <> trim(p_subject)
      or v_old.category <> p_category
      or v_old.priority <> p_priority
      or not exists (
        select 1
        from public.support_messages
        where id = p_id and body = trim(p_body)
      )
    then
      raise exception 'Identifiant déjà utilisé.';
    end if;

    return p_id;
  end if;

  insert into public.support_tickets(
    id, org_id, subject, category, priority, created_by
  )
  values (
    p_id, v_org, trim(p_subject),
    p_category, p_priority, auth.uid()
  );

  select coalesce(nullif(full_name, ''), 'Utilisateur')
  into v_name
  from public.profiles
  where id = auth.uid();

  insert into public.support_messages(
    id, ticket_id, author_id, author_name, is_staff, body
  )
  values (
    p_id, p_id, auth.uid(),
    coalesce(v_name, 'Équipe KAPYA'),
    public.is_platform_admin(),
    trim(p_body)
  );

  return p_id;
end;
$function$
;

-- paiements_en_attente [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.paiements_en_attente()
 RETURNS TABLE(id uuid, org_id uuid, org_name text, plan text, montant numeric, reference text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.org_id, o.name, p.plan, p.montant, p.reference, p.created_at
  from paiements_abonnement p join organizations o on o.id = p.org_id
  where public.is_platform_admin() and p.statut = 'en_attente'
  order by p.created_at;
$function$
;

-- plan_allows [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.plan_allows(p_feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case (select o.plan from public.organizations o where o.id = public.my_org())
    when 'premium' then true
    when 'standard' then p_feature in ('depots','transferts','alertes','exports','sauvegarde','whatsapp')
    else false
  end
$function$
;

-- plan_max_users [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.plan_max_users()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case (select o.plan from public.organizations o where o.id = public.my_org())
    when 'basique' then 3
    when 'standard' then 10
    else 1000000
  end
$function$
;

-- purchase_line_move [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.purchase_line_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  if tg_op = 'INSERT' then
    select p.org_id into v_org from public.purchases p where p.id = new.purchase_id;
    if not found or v_org is distinct from new.org_id then
      raise exception 'L’achat doit appartenir à la même entreprise que ses lignes.';
    end if;
    if not exists (select 1 from public.articles a where a.id = new.article_id and a.org_id = new.org_id) then
      raise exception 'Le produit doit appartenir à la même entreprise.';
    end if;
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (new.org_id, new.article_id, new.qty, 'purchase', new.id, new.warehouse_id);
  else
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (old.org_id, old.article_id, -old.qty, 'purchase', old.id, old.warehouse_id);
  end if;
  return null;
end
$function$
;

-- push_backup_offsite [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.push_backup_offsite(p_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  token text;
begin
  select b.org_id, b.created_at, b.payload into r from public.auto_backups b where b.id = p_id;
  if r is null then return null; end if;
  select ds.decrypted_secret into token from vault.decrypted_secrets ds where ds.name = 'backup_token';
  if token is null then return null; end if;
  return net.http_post(
    url := 'https://kapya-backup.kapya-erp.workers.dev/backup',
    body := r.payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Content-Type', 'application/json',
      'X-Backup-Org', r.org_id::text,
      'X-Backup-Id', p_id::text,
      'X-Backup-Date', to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24-MI-SS"Z"')
    ),
    timeout_milliseconds := 20000
  );
end;
$function$
;

-- rebuild_warehouse_stock [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.rebuild_warehouse_stock(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.warehouse_stock where org_id = p_org;
  insert into public.warehouse_stock(org_id, warehouse_id, article_id, qty)
    select org_id, warehouse_id, article_id, sum(qty) from public.stock_moves
    where org_id = p_org and warehouse_id is not null group by org_id, warehouse_id, article_id;
end $function$
;

-- receive_purchase_order [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; v_lines jsonb; v_purchase uuid := gen_random_uuid();
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager') then raise exception 'Réservé au gérant et au responsable.'; end if;
  select * into o from public.purchase_orders where id = p_id and org_id = public.my_org();
  if o is null then raise exception 'Bon introuvable.'; end if;
  if o.status <> 'draft' then raise exception 'Ce bon ne peut plus être reçu.'; end if;
  if o.supplier_id is null then raise exception 'Choisissez un fournisseur avant la réception.'; end if;
  select jsonb_agg(jsonb_build_object('article_id', article_id, 'qty', qty, 'unit_cost', unit_cost)) into v_lines from public.purchase_order_lines where order_id = p_id;
  perform public.create_purchase(o.supplier_id, null, current_date, v_lines, v_purchase, null, o.warehouse_id);
  update public.purchase_orders set status = 'received', purchase_id = v_purchase where id = p_id;
  return v_purchase;
end; $function$
;

-- record_business_expense [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.record_business_expense(p_label text, p_category text, p_amount numeric, p_paid_at date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid := gen_random_uuid(); v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
begin
  if auth.uid() is null or coalesce(public.my_role() <> 'admin', true) then raise exception 'Seul le gérant peut enregistrer une dépense.'; end if;
  if length(trim(coalesce(p_label,''))) not between 1 and 120 then raise exception 'Indiquez une description (120 caractères maximum).'; end if;
  if length(trim(coalesce(p_category,''))) not between 1 and 60 then raise exception 'Indiquez une catégorie (60 caractères maximum).'; end if;
  if v_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  insert into public.business_expenses(id, org_id, label, category, amount, paid_at, created_by)
  values (v_id, public.my_org(), trim(p_label), trim(p_category), v_amount, coalesce(p_paid_at,current_date), auth.uid());
  return v_id;
end $function$
;

-- record_commercial_payment [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.record_commercial_payment(p_id uuid, p_due uuid, p_amount numeric, p_received_on date, p_method text, p_reference text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_due public.commercial_dues%rowtype;
  v_old public.commercial_payments%rowtype;
  v_paid numeric;
  v_name text;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès réservé à la plateforme.'
      using errcode = '42501';
  end if;

  if p_id is null
    or p_amount is null
    or p_amount <= 0
    or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <> round(p_amount, 2)
  then
    raise exception
      'Montant positif avec deux décimales maximum requis.';
  end if;

  select * into v_due
  from public.commercial_dues
  where id = p_due
  for update;

  if not found then
    raise exception 'Appel de paiement introuvable.';
  end if;

  select * into v_old
  from public.commercial_payments
  where id = p_id;

  if found then
    if v_old.due_id is distinct from p_due
      or v_old.amount is distinct from p_amount
      or v_old.received_on is distinct from p_received_on
      or v_old.method is distinct from p_method
      or v_old.reference is distinct from coalesce(trim(p_reference), '')
    then
      raise exception
        'Identifiant déjà utilisé pour un autre paiement.';
    end if;

    return p_id;
  end if;

  if v_due.cancelled_at is not null then
    raise exception 'Cet appel de paiement est annulé.';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.commercial_payments
  where due_id = p_due and voided_at is null;

  if p_amount > v_due.amount - v_paid then
    raise exception 'Le paiement dépasse le solde restant.';
  end if;

  select name into v_name
  from public.organizations
  where id = v_due.org_id;

  insert into public.commercial_payments(
    id, due_id, org_name, amount, received_on,
    method, reference, created_by
  )
  values(
    p_id, p_due, v_name, p_amount, p_received_on,
    p_method, coalesce(trim(p_reference), ''), auth.uid()
  );

  return p_id;
end;
$function$
;

-- record_credit_payment [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.record_credit_payment(p_sale_id uuid, p_amount numeric, p_paid_at date DEFAULT CURRENT_DATE, p_id uuid DEFAULT gen_random_uuid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sale public.sales%rowtype;
  v_payment public.sale_payments%rowtype;
  v_total numeric;
  v_role text := public.my_role();
begin
  -- idempotence hors ligne : une opération déjà reçue (même identifiant) n'est pas recréée.
  if p_id is not null and exists (select 1 from public.sale_payments t where t.id = p_id) then return p_id; end if;
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then
    raise exception 'Vous n’avez pas le droit d’enregistrer un paiement.';
  end if;
  if p_id is null then raise exception 'Identifiant de paiement manquant.'; end if;
  if p_amount is null then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  p_amount := round(p_amount, 2);
  if p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;

  select * into v_sale from public.sales
  where id = p_sale_id and org_id = public.my_org()
  for update;
  if not found then raise exception 'Facture introuvable dans votre entreprise.'; end if;

  -- Une réponse réseau perdue peut entraîner une nouvelle tentative après validation côté serveur.
  select * into v_payment from public.sale_payments where id = p_id;
  if found then
    if v_payment.org_id = v_sale.org_id and v_payment.sale_id = p_sale_id
       and v_payment.amount = p_amount and v_payment.paid_at = coalesce(p_paid_at, current_date)
       and v_payment.kind = 'payment' then
      return v_payment.id;
    end if;
    raise exception 'Cet identifiant de paiement est déjà utilisé.';
  end if;

  if v_sale.payment <> 'credit' then raise exception 'Cette facture n’est pas à crédit.'; end if;
  select round(coalesce(sum(l.qty * l.unit_price), 0), 2) into v_total
  from public.sale_lines l where l.sale_id = v_sale.id and l.org_id = v_sale.org_id;
  if p_amount > v_total - coalesce(v_sale.paid, 0) then
    raise exception 'Le paiement dépasse le solde restant (%).', greatest(v_total - coalesce(v_sale.paid, 0), 0);
  end if;

  insert into public.sale_payments(id, org_id, sale_id, amount, paid_at, kind, created_by)
  values (p_id, v_sale.org_id, v_sale.id, p_amount, coalesce(p_paid_at, current_date), 'payment', auth.uid());
  update public.sales set paid = coalesce(paid, 0) + p_amount where id = v_sale.id;
  return p_id;
end $function$
;

-- record_credit_payment_method [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.record_credit_payment_method(p_sale_id uuid, p_amount numeric, p_paid_at date, p_id uuid, p_method text, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if not exists (select 1 from public.sales s where s.id = p_sale_id and s.org_id = public.my_org()) then raise exception 'Facture introuvable.'; end if;
  if p_method not in ('cash','mobile_money','bank') then raise exception 'Mode de paiement inconnu.'; end if;
  if p_method <> 'cash' and (v_ref is null or char_length(v_ref) < 3) then
    raise exception 'Saisissez la référence de la transaction (mobile money ou virement).';
  end if;
  v_id := public.record_credit_payment(p_sale_id, p_amount, p_paid_at, p_id);
  update public.sale_payments set method = p_method, reference = case when p_method = 'cash' then null else v_ref end where id = v_id and org_id = public.my_org();
  return v_id;
end; $function$
;

-- record_purchase_payment [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.record_purchase_payment(p_purchase_id uuid, p_amount numeric, p_paid_at date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_paid numeric(14,2);
  v_opening numeric(14,2);
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or coalesce(public.my_role() <> 'admin', true) then raise exception 'Seul le gérant peut enregistrer un paiement fournisseur.'; end if;
  perform 1 from public.purchases where id = p_purchase_id and org_id = public.my_org() for update;
  if not found then raise exception 'Facture fournisseur introuvable.'; end if;
  if v_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  select opening_balance into v_opening from public.purchase_payment_balances where purchase_id = p_purchase_id and org_id = public.my_org();
  if v_opening is null then raise exception 'Initialisez d’abord le solde restant de cette ancienne facture.'; end if;
  select coalesce(sum(amount), 0) into v_paid from public.purchase_payments where purchase_id = p_purchase_id and org_id = public.my_org();
  if v_amount > v_opening - v_paid + 0.005 then raise exception 'Le paiement dépasse le solde fournisseur restant (%).', to_char(greatest(v_opening-v_paid,0), 'FM999,999,990.00'); end if;
  insert into public.purchase_payments(id, org_id, purchase_id, amount, paid_at, created_by)
  values (v_id, public.my_org(), p_purchase_id, v_amount, coalesce(p_paid_at,current_date), auth.uid());
  return v_id;
end $function$
;

-- record_worker_payment [search_path=public] [ANON EXECUTE]
CREATE OR REPLACE FUNCTION public.record_worker_payment(p_worker uuid, p_amount numeric, p_date date, p_method text, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
                  declare pid uuid;
                  begin
                    if my_role() <> 'admin' then raise exception 'Accès réservé au gérant.'; end if;
                      if not public.plan_allows('personnel') then raise exception 'Le personnel n’est pas inclus dans votre formule.'; end if;
                        if not exists (select 1 from workers where id = p_worker and org_id = my_org()) then raise exception 'Travailleur introuvable.'; end if;
                          if coalesce(p_amount,0) <= 0 then raise exception 'Le montant doit être supérieur à 0.'; end if;
                            insert into worker_payments(org_id, worker_id, paid_on, amount, method, note)
                                values (my_org(), p_worker, coalesce(p_date, current_date), p_amount, coalesce(p_method,'cash'), nullif(trim(coalesce(p_note,'')),''))
                                    returning id into pid;
                                      return pid;
                                      end $function$
;

-- redeem_company_code [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.redeem_company_code(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  cc record;
  o uuid;
begin
  if me is null then raise exception 'Connexion requise.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  perform 1 from public.profiles p where p.id = me for update;
  if (select p.org_id from public.profiles p where p.id = me) is not null then
    raise exception 'Vous appartenez déjà à une entreprise.';
  end if;
  select c.* into cc from public.company_codes c
    where c.code = upper(trim(p_code)) for update;
  if not found then raise exception 'Code invalide.' using errcode = 'KP404'; end if;
  if cc.used_at is not null then raise exception 'Ce code a déjà été utilisé.'; end if;
  insert into public.organizations(name) values (cc.company_name) returning id into o;
  insert into public.profiles(id, org_id, role) values (me, o, 'admin')
    on conflict (id) do update set org_id = o, role = 'admin';
  update public.company_codes set used_at = now(), org_id = o where code = cc.code;
  return o;
end
$function$
;

-- register_purchase_lots [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.register_purchase_lots(p_purchase uuid, p_lots jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.my_org(); v_wh uuid; l jsonb; v_qty numeric; v_bought numeric; v_n int := 0; v_track boolean; v_sum numeric;
begin
  if auth.uid() is null or v_org is null or public.my_role() not in ('admin','manager') then raise exception 'Réservé au gérant et au responsable.'; end if;
  select p.warehouse_id into v_wh from public.purchases p where p.id = p_purchase and p.org_id = v_org;
  if v_wh is null then raise exception 'Achat introuvable.'; end if;
  if jsonb_typeof(p_lots) <> 'array' or jsonb_array_length(p_lots) = 0 then raise exception 'Aucun lot à enregistrer.'; end if;
  for l in select * from jsonb_array_elements(p_lots) loop
    v_qty := (l->>'qty')::numeric;
    select a.track_expiry into v_track from public.articles a where a.id = (l->>'article_id')::uuid and a.org_id = v_org;
    if not found or not v_track then raise exception 'Cet article n''est pas suivi par date de péremption.'; end if;
    select coalesce(sum(pl.qty),0) into v_bought from public.purchase_lines pl where pl.purchase_id = p_purchase and pl.article_id = (l->>'article_id')::uuid;
    if v_bought = 0 then raise exception 'Cet article ne figure pas sur l''achat.'; end if;
    -- Somme de tous les lots de cet article dans la saisie (plusieurs lignes du même produit).
    select coalesce(sum((x->>'qty')::numeric),0) into v_sum from jsonb_array_elements(p_lots) x where (x->>'article_id') = (l->>'article_id');
    if v_qty is null or v_qty <= 0 then raise exception 'Quantité de lot invalide.'; end if;
    if v_sum > v_bought then raise exception 'Les lots dépassent la quantité achetée (%).', v_bought; end if;
    if length(trim(coalesce(l->>'lot_number',''))) = 0 then raise exception 'Le numéro de lot est obligatoire.'; end if;
    insert into public.stock_lots (org_id, warehouse_id, article_id, lot_number, expiry_date, qty_left)
    values (v_org, v_wh, (l->>'article_id')::uuid, trim(l->>'lot_number'), nullif(l->>'expiry_date','')::date, v_qty);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $function$
;

-- rejeter_paiement [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.rejeter_paiement(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then raise exception 'Réservé au super administrateur.'; end if;
  update paiements_abonnement set statut = 'rejete', validated_at = now()
  where id = p_id and statut = 'en_attente';
end $function$
;

-- remove_member [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.remove_member(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if public.my_role() <> 'admin' then raise exception 'Réservé au gérant.'; end if;
  if p_user = auth.uid() then raise exception 'Vous ne pouvez pas vous retirer vous-même.'; end if;
  update profiles set org_id = null, role = 'user'
   where id = p_user and org_id = public.my_org();
  if not found then raise exception 'Membre introuvable dans votre entreprise.'; end if;
end $function$
;

-- renew_commercial_subscription [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.renew_commercial_subscription(p_org uuid, p_expected date)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cycle text;
  v_expiry date;
  v_base date;
  v_new date;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès réservé à l’administrateur de la plateforme.'
      using errcode = '42501';
  end if;

  select expires_at into v_expiry
  from public.organizations
  where id = p_org
  for update;

  if not found then
    raise exception 'Entreprise introuvable.';
  end if;

  if v_expiry is distinct from p_expected then
    raise exception 'Échéance modifiée. Rechargez la liste.';
  end if;

  select cycle into v_cycle
  from public.commercial_accounts
  where id = p_org
  for update;

  if not found then
    raise exception 'Enregistrez la fiche commerciale avant le renouvellement.';
  end if;

  v_base := greatest(
    current_date,
    coalesce(v_expiry, current_date)
  );

  v_new := (
    v_base +
    case when v_cycle = 'annuel'
      then interval '1 year'
      else interval '1 month'
    end
  )::date;

  update public.organizations
  set expires_at = v_new, status = 'active'
  where id = p_org;

  return v_new;
end;
$function$
;

-- reply_support_ticket [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.reply_support_ticket(p_id uuid, p_ticket uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_name text;
  v_old public.support_messages%rowtype;
begin
  select org_id into v_org
  from public.support_tickets
  where id = p_ticket
  for update;

  if not found
    or not (
      public.is_platform_admin()
      or v_org = public.customer_org()
    )
    or (
      not public.is_platform_admin()
      and public.customer_org() is null
    )
  then
    raise exception 'Demande non autorisée.'
      using errcode = '42501';
  end if;

  select * into v_old
  from public.support_messages
  where id = p_id;

  if found then
    if v_old.author_id <> auth.uid()
      or v_old.ticket_id <> p_ticket
      or v_old.body <> trim(p_body)
    then
      raise exception 'Identifiant déjà utilisé.';
    end if;

    return p_id;
  end if;

  select coalesce(nullif(full_name, ''), 'Utilisateur')
  into v_name
  from public.profiles
  where id = auth.uid();

  insert into public.support_messages(
    id, ticket_id, author_id, author_name, is_staff, body
  )
  values (
    p_id, p_ticket, auth.uid(),
    coalesce(v_name, 'Équipe KAPYA'),
    public.is_platform_admin(),
    trim(p_body)
  );

  update public.support_tickets
  set updated_at = now(),
      status = case
        when status = 'resolu' then 'ouvert'
        else status
      end
  where id = p_ticket;

  return p_id;
end;
$function$
;

-- reserve_invoice_range [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.reserve_invoice_range(p_device text, p_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare o uuid := public.my_org(); v int; start_n int;
begin
  if auth.uid() is null or o is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() not in ('admin','manager','facturier') then raise exception 'Droit insuffisant.'; end if;
  if p_size < 1 or p_size > 200 then raise exception 'Taille de plage invalide.'; end if;
  insert into invoice_counters as c (org_id, last) values (o, p_size)
    on conflict (org_id) do update set last = c.last + p_size returning c.last into v;
  start_n := v - p_size + 1;
  insert into number_ranges (org_id, kind, device, from_n, to_n) values (o, 'FAC', p_device, start_n, v);
  return jsonb_build_object('prefix', 'FAC-', 'from', start_n, 'to', v);
end
$function$
;

-- reserve_number_range [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.reserve_number_range(p_kind text, p_prefix text, p_device text, p_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o uuid := public.my_org(); v int; start_n int;
begin
  if o is null then raise exception 'Connexion requise.'; end if;
  if p_size < 1 or p_size > 500 then raise exception 'Taille de plage invalide.'; end if;
  insert into public.document_counters as c (org_id, kind, last) values (o, p_kind, p_size)
    on conflict (org_id, kind) do update set last = c.last + p_size returning c.last into v;
  start_n := v - p_size + 1;
  insert into public.number_ranges (org_id, kind, device, from_n, to_n) values (o, p_kind, p_device, start_n, v);
  return jsonb_build_object('prefix', p_prefix, 'from', start_n, 'to', v);
end
$function$
;

-- restore_backup [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.restore_backup(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.my_org();
  -- Ordre de restauration : chaque table n'arrive qu'après celles qu'elle référence.
  v_tables text[] := array[
    'settings','warehouses','customers','suppliers','articles','invoice_counters','customer_deposit_counters',
    'sales','sale_lines','customer_deposits','sale_payments','sale_cost_snapshots',
    'purchases','purchase_lines','purchase_payments','purchase_payment_balances',
    'stock_moves','business_expenses','cash_closures','transfers','transfer_lines','audit_log'];
  v_name text;
  v_rows jsonb;
  v_fixed jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() <> 'admin' then raise exception 'Seul le gérant peut restaurer une sauvegarde.'; end if;
  if not public.plan_allows('restauration') then raise exception 'La restauration de sauvegarde est réservée à la formule Premium.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Fichier de sauvegarde invalide.'; end if;

  foreach v_name in array v_tables loop
    if p_data ? v_name and jsonb_typeof(p_data -> v_name) <> 'array' then
      raise exception 'Table « % » invalide dans la sauvegarde.', v_name;
    end if;
  end loop;

  -- Les références doivent pointer vers des lignes du même fichier restauré.
  if exists (select 1 from jsonb_array_elements(coalesce(p_data->'sales','[]'::jsonb)) r
             where nullif(r->>'customer_id','') is not null
               and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'customers','[]'::jsonb)) c where c->>'id'=r->>'customer_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'sales','[]'::jsonb)) r
             where nullif(r->>'warehouse_id','') is not null
               and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'warehouses','[]'::jsonb)) w where w->>'id'=r->>'warehouse_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'purchases','[]'::jsonb)) r
             where nullif(r->>'supplier_id','') is not null
               and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'suppliers','[]'::jsonb)) s where s->>'id'=r->>'supplier_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'purchases','[]'::jsonb)) r
             where nullif(r->>'warehouse_id','') is not null
               and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'warehouses','[]'::jsonb)) w where w->>'id'=r->>'warehouse_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'sale_lines','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'sales','[]'::jsonb)) s where s->>'id'=r->>'sale_id')
                or not exists (select 1 from jsonb_array_elements(coalesce(p_data->'articles','[]'::jsonb)) a where a->>'id'=r->>'article_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'purchase_lines','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'purchases','[]'::jsonb)) p where p->>'id'=r->>'purchase_id')
                or not exists (select 1 from jsonb_array_elements(coalesce(p_data->'articles','[]'::jsonb)) a where a->>'id'=r->>'article_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'customer_deposits','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'customers','[]'::jsonb)) c where c->>'id'=r->>'customer_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'sale_payments','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'sales','[]'::jsonb)) s where s->>'id'=r->>'sale_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'purchase_payments','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'purchases','[]'::jsonb)) p where p->>'id'=r->>'purchase_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'purchase_payment_balances','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'purchases','[]'::jsonb)) p where p->>'id'=r->>'purchase_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'transfers','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'warehouses','[]'::jsonb)) w where w->>'id'=r->>'from_warehouse_id')
                or not exists (select 1 from jsonb_array_elements(coalesce(p_data->'warehouses','[]'::jsonb)) w where w->>'id'=r->>'to_warehouse_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'transfer_lines','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'transfers','[]'::jsonb)) t where t->>'id'=r->>'transfer_id')
                or not exists (select 1 from jsonb_array_elements(coalesce(p_data->'articles','[]'::jsonb)) a where a->>'id'=r->>'article_id'))
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'stock_moves','[]'::jsonb)) r
             where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'articles','[]'::jsonb)) a where a->>'id'=r->>'article_id'))
  then
    raise exception 'La sauvegarde contient des références manquantes ou incohérentes.';
  end if;

  -- Verrou sur l'entreprise : deux restaurations simultanées ne peuvent pas se chevaucher.
  perform 1 from public.organizations o where o.id = v_org for update;
  if exists (select 1 from public.sales where org_id = v_org)
     or exists (select 1 from public.purchases where org_id = v_org)
     or exists (select 1 from public.customers where org_id = v_org)
     or exists (select 1 from public.articles where org_id = v_org) then
    raise exception 'La restauration n’est possible que dans une entreprise vide (aucune vente, achat, client ni produit).';
  end if;

  -- Dépôts : ceux de la sauvegarde remplacent le dépôt principal créé à l'avance (entreprise vide).
  delete from public.warehouses where org_id = v_org;

  -- Les déclencheurs métier (stock, coûts, numérotation, historique) sont désactivés le temps de l'import :
  -- stocks et coûts viennent de la sauvegarde telle quelle, sans double comptage.
  -- Les contraintes de clés étrangères restent actives.
  foreach v_name in array v_tables loop
    execute format('alter table public.%I disable trigger user', v_name);
  end loop;

  foreach v_name in array v_tables loop
    v_rows := coalesce(p_data -> v_name, '[]'::jsonb);
    if jsonb_typeof(v_rows) <> 'array' then raise exception 'Table « % » invalide dans la sauvegarde.', v_name; end if;
    if jsonb_array_length(v_rows) > 0 then
      -- Rattache chaque ligne à l'entreprise courante.
      -- Le numéro du journal est attribué par la base (il est unique pour toutes les entreprises).
      select coalesce(jsonb_agg((case when v_name = 'audit_log' then r - 'id' else r end)
                        || jsonb_build_object('org_id', v_org)), '[]'::jsonb)
        into v_fixed
      from jsonb_array_elements(v_rows) r;
      if v_name = 'audit_log' then
        execute 'insert into public.audit_log (org_id, occurred_at, actor_id, actor_name, actor_role, table_name, record_id, action, summary, before_data, after_data)
                 select org_id, occurred_at, actor_id, actor_name, actor_role, table_name, record_id, action, summary, before_data, after_data
                 from jsonb_populate_recordset(null::public.audit_log, $1)'
          using v_fixed;
      else
        execute format(
          'insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I, $1)',
          v_name, v_name)
          using v_fixed;
      end if;
    end if;
    v_counts := v_counts || jsonb_build_object(v_name, jsonb_array_length(v_rows));
  end loop;

  foreach v_name in array v_tables loop
    execute format('alter table public.%I enable trigger user', v_name);
  end loop;

  -- Sauvegardes anciennes (sans dépôts) : tout va au dépôt principal. Puis stock par dépôt recalculé.
  perform public.warehouse_of_org(v_org);
  update public.sales set warehouse_id = public.warehouse_of_org(v_org) where org_id = v_org and warehouse_id is null;
  update public.purchases set warehouse_id = public.warehouse_of_org(v_org) where org_id = v_org and warehouse_id is null;
  update public.sale_lines l set warehouse_id = s.warehouse_id from public.sales s
    where s.id = l.sale_id and l.org_id = v_org and l.warehouse_id is null;
  update public.purchase_lines l set warehouse_id = pu.warehouse_id from public.purchases pu
    where pu.id = l.purchase_id and l.org_id = v_org and l.warehouse_id is null;
  update public.transfers set from_warehouse_id = public.warehouse_of_org(v_org)
    where org_id = v_org and from_warehouse_id is null;
  update public.stock_moves set warehouse_id = public.warehouse_of_org(v_org) where org_id = v_org and warehouse_id is null;
  perform public.rebuild_warehouse_stock(v_org);


  -- Le numéro du journal repart après les lignes restaurées.
  perform setval(pg_get_serial_sequence('public.audit_log', 'id'),
    greatest((select coalesce(max(a.id), 0) from public.audit_log a), 1), true);

  -- Contrôle non bloquant : le stock de chaque produit doit correspondre à la somme de ses mouvements.
  select coalesce(jsonb_agg(jsonb_build_object(
           'produit', a.name, 'stock', a.stock, 'mouvements', coalesce(m.total, 0))), '[]'::jsonb)
    into v_warnings
  from public.articles a
  left join (select article_id, sum(qty) as total from public.stock_moves
             where org_id = v_org group by article_id) m on m.article_id = a.id
  where a.org_id = v_org and a.stock <> coalesce(m.total, 0);

  insert into public.audit_log (org_id, actor_id, actor_name, actor_role, table_name, record_id, action, summary, after_data)
  select v_org, auth.uid(), coalesce(p.full_name, ''), coalesce(p.role, ''), 'sauvegarde', null, 'insert',
         'Restauration de sauvegarde', jsonb_build_object('counts', v_counts)
  from public.profiles p where p.id = auth.uid();

  return jsonb_build_object('counts', v_counts, 'warnings', v_warnings);
end;
$function$
;

-- restore_customer_deposit_on_sale_delete [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.restore_customer_deposit_on_sale_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.customer_deposits d
  set remaining = least(d.amount, d.remaining + p.amount)
  from public.sale_payments p
  where p.sale_id = old.id and p.org_id = old.org_id and p.kind = 'advance'
    and p.customer_deposit_id = d.id and d.org_id = old.org_id;
  return old;
end $function$
;

-- rls_auto_enable [SECURITY DEFINER] [search_path=pg_catalog]
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

-- run_daily_backups [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.run_daily_backups()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; n int := 0; new_id bigint;
begin
  for o in select id from public.organizations where status = 'active' loop
    new_id := public.make_backup_for_org(o.id);
    perform public.push_backup_offsite(new_id);
    n := n + 1;
  end loop;
  delete from public.auto_backups where created_at < now() - interval '14 days';
  return n;
end;
$function$
;

-- sale_line_move [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.sale_line_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  if tg_op = 'INSERT' then
    select s.org_id into v_org from public.sales s where s.id = new.sale_id;
    if not found or v_org is distinct from new.org_id then
      raise exception 'La facture doit appartenir à la même entreprise que ses lignes.';
    end if;
    if not exists (select 1 from public.articles a where a.id = new.article_id and a.org_id = new.org_id) then
      raise exception 'Le produit doit appartenir à la même entreprise.';
    end if;
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (new.org_id, new.article_id, -new.qty, 'sale', new.id, new.warehouse_id);
  else
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (old.org_id, old.article_id, old.qty, 'sale', old.id, old.warehouse_id);
  end if;
  return null;
end
$function$
;

-- save_cash_closure [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.save_cash_closure(p_day date, p_opening_usd numeric, p_opening_fc numeric, p_counted_usd numeric, p_counted_fc numeric, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_role = 'facturier' then raise exception 'La clôture globale est réservée au gérant et au responsable. Clôturez votre boutique.'; end if;
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
  if exists (select 1 from public.warehouses w where w.org_id = v_org and w.active and not exists (select 1 from public.cash_closures_shop c where c.org_id = v_org and c.warehouse_id = w.id and c.business_date = p_day)) then raise exception 'Clôturez d’abord chaque boutique (caisse par boutique) avant la clôture globale.'; end if;
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
$function$
;

-- save_customer_setup [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.save_customer_setup(p_steps jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_key text;
begin
  v_org := public.customer_org();

  if v_org is null or not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'manager')
  ) then
    raise exception
      'Seul le gérant ou responsable peut enregistrer le démarrage.'
      using errcode = '42501';
  end if;

  if p_steps is null
    or jsonb_typeof(p_steps) <> 'object'
  then
    raise exception 'Étapes invalides.';
  end if;

  for v_key in select jsonb_object_keys(p_steps) loop
    if v_key not in (
      'entreprise', 'produits', 'clients', 'vente', 'sauvegarde'
    ) or jsonb_typeof(p_steps -> v_key) <> 'boolean' then
      raise exception 'Étape invalide.';
    end if;
  end loop;

  insert into public.customer_setup(id, steps, updated_by)
  values (v_org, p_steps, auth.uid())
  on conflict(id) do update
    set steps = excluded.steps,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$function$
;

-- save_shop_closure [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.save_shop_closure(p_day date, p_warehouse uuid, p_open_usd numeric, p_open_fc numeric, p_count_usd numeric, p_count_fc numeric, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.my_org();
  v_role text := public.my_role();
  v_data jsonb;
  v_rate numeric(14,2);
  v_oU numeric(14,2) := round(coalesce(p_open_usd, 0), 2);
  v_oF numeric(14,2) := round(coalesce(p_open_fc, 0), 2);
  v_cU numeric(14,2) := round(coalesce(p_count_usd, 0), 2);
  v_cF numeric(14,2) := round(coalesce(p_count_fc, 0), 2);
  v_expected numeric(14,2);
  v_counted numeric(14,2);
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier'), true) then raise exception 'Vous ne pouvez pas clôturer la caisse.'; end if;
  if v_role = 'facturier' and public.my_shop() is distinct from p_warehouse then raise exception 'Vous ne pouvez clôturer que votre boutique.'; end if;
  if p_day < current_date or p_day > current_date + 1 then raise exception 'Seule la clôture de la journée en cours peut être enregistrée.'; end if;
  if v_oU < 0 or v_oF < 0 or v_cU < 0 or v_cF < 0 then raise exception 'Les montants saisis ne peuvent pas être négatifs.'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'La note ne peut pas dépasser 500 caractères.'; end if;

  perform 1 from public.organizations o where o.id = v_org for update;
  if v_role not in ('admin','manager') and exists (select 1 from public.cash_closures_shop c where c.org_id = v_org and c.warehouse_id = p_warehouse and c.business_date = p_day) then
    raise exception 'Cette boutique est déjà clôturée. Demandez au gérant ou au responsable de la corriger.';
  end if;

  v_data := public.cash_close_summary_shop(p_day, p_warehouse);
  v_rate := (v_data->>'exchange_rate')::numeric;
  v_expected := round(v_oU + v_oF / v_rate + (v_data->>'cash_in')::numeric, 2);
  v_counted := round(v_cU + v_cF / v_rate, 2);

  insert into public.cash_closures_shop (org_id, warehouse_id, business_date, opening_usd, opening_fc, counted_usd, counted_fc,
    exchange_rate, expected_usd, counted_total_usd, difference_usd, cash_sales, credit_payments, note, closed_by, closed_at)
  values (v_org, p_warehouse, p_day, v_oU, v_oF, v_cU, v_cF, v_rate, v_expected, v_counted, round(v_counted - v_expected, 2),
    (v_data->>'cash_sales')::numeric, (v_data->>'credit_payments')::numeric, trim(coalesce(p_note, '')), auth.uid(), now())
  on conflict (org_id, warehouse_id, business_date) do update set
    opening_usd = excluded.opening_usd, opening_fc = excluded.opening_fc, counted_usd = excluded.counted_usd, counted_fc = excluded.counted_fc,
    exchange_rate = excluded.exchange_rate, expected_usd = excluded.expected_usd, counted_total_usd = excluded.counted_total_usd,
    difference_usd = excluded.difference_usd, cash_sales = excluded.cash_sales, credit_payments = excluded.credit_payments,
    note = excluded.note, closed_by = excluded.closed_by, closed_at = excluded.closed_at;

  return v_data;
end;
$function$
;

-- search_sales [search_path=public] [ANON EXECUTE]
CREATE OR REPLACE FUNCTION public.search_sales(p_term text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select s.id
  from public.sales s
  where s.org_id = public.my_org()
    and (
      s.number ilike '%' || p_term || '%'
      or s.customer_label ilike '%' || p_term || '%'
      or exists (
        select 1 from public.customers c
        where c.id = s.customer_id and c.name ilike '%' || p_term || '%'
      )
      or exists (
        select 1 from public.sale_lines l
        join public.articles a on a.id = l.article_id
        where l.sale_id = s.id and (a.name ilike '%' || p_term || '%' or a.sku ilike '%' || p_term || '%')
      )
    )
  order by s.sold_at desc, s.created_at desc
  limit p_limit offset p_offset;
$function$
;

-- set_barcode_enabled [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.set_barcode_enabled(p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := public.my_org();
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() <> 'admin' then raise exception 'Seul le gérant peut modifier ce réglage.'; end if;
  update public.organizations set barcode_enabled = coalesce(p_on, false) where id = v_org;
end;
$function$
;

-- set_business_type [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_business_type(p_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.my_role() <> 'admin' then raise exception 'Réservé au gérant.'; end if;
  update public.organizations set business_type = p_type where id = public.my_org();
end; $function$
;

-- set_company_header [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_company_header(p_org uuid, p_name text, p_address text, p_phone text, p_email text, p_tax_id text, p_rc text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_platform_admin() then raise exception 'Réservé au super administrateur de KaPya.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Indiquez le nom de l’entreprise.'; end if;
  update public.organizations set
    name = trim(p_name),
    address = nullif(trim(coalesce(p_address, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    tax_id = nullif(trim(coalesce(p_tax_id, '')), ''),
    rc = nullif(trim(coalesce(p_rc, '')), '')
  where id = p_org;
  if not found then raise exception 'Entreprise introuvable.'; end if;
end; $function$
;

-- set_company_logo [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_company_logo(p_org uuid, p_logo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_platform_admin() then raise exception 'Réservé au super administrateur de KaPya.'; end if;
  if p_logo is not null and p_logo <> '' then
    if p_logo !~* '^data:image/(png|jpeg|jpg|webp);base64,' then raise exception 'Le logo doit être une image PNG, JPEG ou WebP.'; end if;
    if length(p_logo) > 200000 then raise exception 'Le logo est trop lourd (150 Ko maximum).'; end if;
  end if;
  update public.organizations set logo = nullif(p_logo, '') where id = p_org;
  if not found then raise exception 'Entreprise introuvable.'; end if;
end; $function$
;

-- set_discounts_enabled [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_discounts_enabled(p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.my_role() <> 'admin' then raise exception 'Réservé au gérant.'; end if;
  update public.organizations set discounts_enabled = coalesce(p_on, false) where id = public.my_org();
end; $function$
;

-- set_hidden_features [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_hidden_features(p_list text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.my_role() <> 'admin' then raise exception 'Réservé au gérant.'; end if;
  update public.organizations set hidden_features = coalesce(p_list, '{}') where id = public.my_org();
end; $function$
;

-- set_initial_payment_method [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_initial_payment_method(p_sale uuid, p_method text, p_reference text DEFAULT NULL::text, p_operator text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ref text := nullif(trim(coalesce(p_reference, '')), ''); v_sale record;
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager','facturier') then raise exception 'Non autorisé.'; end if;
  if p_method not in ('cash','mobile_money','bank') then raise exception 'Mode de paiement inconnu.'; end if;
  if p_method <> 'cash' and (v_ref is null or char_length(v_ref) < 3) then raise exception 'Saisissez la référence de la transaction (mobile money ou virement).'; end if;
  if p_method = 'mobile_money' and p_operator not in ('airtel','mpesa','orange','autre') then raise exception 'Choisissez l’opérateur mobile money.'; end if;
  select s.* into v_sale from public.sales s where s.id = p_sale and s.org_id = public.my_org();
  if v_sale is null then raise exception 'Facture introuvable.'; end if;
  if public.my_role() = 'facturier' and v_sale.warehouse_id is distinct from public.my_shop() then raise exception 'Vous ne pouvez modifier que les ventes de votre boutique.'; end if;
  update public.sale_payments set method = p_method, reference = case when p_method = 'cash' then null else v_ref end,
    operator = case when p_method = 'mobile_money' then p_operator else null end
  where sale_id = p_sale and kind = 'initial';
end; $function$
;

-- set_inventory_count [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.set_inventory_count(p_inventory uuid, p_article uuid, p_counted numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := public.my_org();
  v_status text;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(public.my_role() not in ('admin', 'manager'), true) then
    raise exception 'Seul le gérant ou le responsable peut compter un inventaire.';
  end if;
  if p_counted is not null and (p_counted < 0 or p_counted <> round(p_counted, 3)) then
    raise exception 'La quantité comptée doit être positive, avec trois décimales au plus.';
  end if;

  select status into v_status from public.inventories
  where id = p_inventory and org_id = v_org for update;
  if not found then raise exception 'Inventaire introuvable.'; end if;
  if v_status <> 'draft' then raise exception 'Cet inventaire est déjà validé.'; end if;

  update public.inventory_lines set counted = p_counted
  where inventory_id = p_inventory and article_id = p_article and org_id = v_org;
  if not found then raise exception 'Ce produit ne fait pas partie de cet inventaire.'; end if;
end;
$function$
;

-- set_receipt_footer [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_receipt_footer(p_org uuid, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_platform_admin() then raise exception 'Réservé au super administrateur de KaPya.'; end if;
  if length(coalesce(p_text, '')) > 500 then raise exception 'Le pied de page ne peut pas dépasser 500 caractères.'; end if;
  update public.organizations set receipt_footer = nullif(trim(coalesce(p_text, '')), '') where id = p_org;
  if not found then raise exception 'Entreprise introuvable.'; end if;
end; $function$
;

-- set_sale_payment_method [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_sale_payment_method(p_sale uuid, p_method text, p_reference text DEFAULT NULL::text, p_operator text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ref text := nullif(trim(coalesce(p_reference, '')), ''); v_sale record;
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager','facturier') then raise exception 'Non autorisé.'; end if;
  if p_method not in ('cash','mobile_money','bank') then raise exception 'Mode de paiement inconnu.'; end if;
  if p_method <> 'cash' and (v_ref is null or char_length(v_ref) < 3) then raise exception 'Saisissez la référence de la transaction (mobile money ou virement).'; end if;
  if p_method = 'mobile_money' and p_operator not in ('airtel','mpesa','orange','autre') then raise exception 'Choisissez l’opérateur mobile money.'; end if;
  select s.* into v_sale from public.sales s where s.id = p_sale and s.org_id = public.my_org();
  if v_sale is null then raise exception 'Facture introuvable.'; end if;
  if public.my_role() = 'facturier' and v_sale.warehouse_id is distinct from public.my_shop() then raise exception 'Vous ne pouvez modifier que les ventes de votre boutique.'; end if;
  update public.sales set payment_method = p_method, payment_reference = case when p_method = 'cash' then null else v_ref end,
    payment_operator = case when p_method = 'mobile_money' then p_operator else null end where id = p_sale;
end; $function$
;

-- set_sale_pickup [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.set_sale_pickup(p_sale uuid, p_pickup boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.my_role() not in ('admin','manager','facturier') then raise exception 'Non autorisé.'; end if;
  update public.sales set to_pickup = coalesce(p_pickup, false) where id = p_sale and org_id = public.my_org();
  if not found then raise exception 'Facture introuvable.'; end if;
end; $function$
;

-- set_support_status [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.set_support_status(p_ticket uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès plateforme requis.'
      using errcode = '42501';
  end if;

  update public.support_tickets
  set status = p_status, updated_at = now()
  where id = p_ticket;

  if not found then
    raise exception 'Demande introuvable.';
  end if;
end;
$function$
;

-- set_vat [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.set_vat(p_on boolean, p_rate numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'Taux de TVA invalide';
  end if;
  -- « role » : colonne du rôle dans profiles
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Réservé à l''administrateur';
  end if;
  update public.organizations
     set vat_enabled = p_on, vat_rate = p_rate
   where id = (select org_id from public.profiles where id = auth.uid());
end;
$function$
;

-- settle_reseller_commission [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.settle_reseller_commission(p_id uuid, p_reference text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès plateforme requis.'
      using errcode = '42501';
  end if;

  if p_reference is null
    or length(trim(p_reference)) not between 3 and 200
  then
    raise exception 'Référence du versement requise.';
  end if;

  perform 1
  from public.commercial_payments
  where id = (
    select payment_id
    from public.reseller_commissions
    where id = p_id
  )
  for update;

  update public.reseller_commissions c
  set status = 'payee',
      settled_at = now(),
      settled_by = auth.uid(),
      settlement_reference = trim(p_reference)
  where c.id = p_id
    and c.status = 'a_payer'
    and exists (
      select 1
      from public.commercial_payments p
      where p.id = c.payment_id
        and p.voided_at is null
    );

  if not found then
    raise exception 'Commission non payable ou paiement annulé.';
  end if;
end;
$function$
;

-- snapshot_sale_line_cost [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.snapshot_sale_line_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.sale_cost_snapshots(sale_line_id,org_id,unit_cost_at_sale,cost_is_estimated)
  select new.id,new.org_id,coalesce(a.price_buy,0),false
  from public.articles a where a.id = new.article_id and a.org_id = new.org_id;
  if not found then raise exception 'Article introuvable dans votre entreprise.'; end if;
  return null;
end $function$
;

-- touch_updated_at [search_path=""] [ANON EXECUTE]
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

-- transfer_line_move [SECURITY DEFINER] [search_path=""]
CREATE OR REPLACE FUNCTION public.transfer_line_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_from uuid; v_to uuid; v_org uuid;
begin
  select t.from_warehouse_id, t.to_warehouse_id, t.org_id
    into v_from, v_to, v_org
  from public.transfers t where t.id = new.transfer_id;

  if not found or v_org is distinct from new.org_id then
    raise exception 'Le transfert doit appartenir à la même entreprise que ses lignes.';
  end if;
  if not exists (select 1 from public.articles a where a.id = new.article_id and a.org_id = new.org_id) then
    raise exception 'Le produit doit appartenir à la même entreprise.';
  end if;
  if coalesce(new.qty, 0) <= 0 then raise exception 'La quantité transférée doit être supérieure à zéro.'; end if;
  if v_from is null or v_to is null or not exists (
    select 1 from public.warehouses w where w.id = v_from and w.org_id = new.org_id
  ) or not exists (
    select 1 from public.warehouses w where w.id = v_to and w.org_id = new.org_id
  ) then
    raise exception 'Les deux dépôts du transfert doivent appartenir à la même entreprise.';
  end if;

  insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
    values (new.org_id, new.article_id, -new.qty, 'transfer', new.transfer_id, v_from);
  insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
    values (new.org_id, new.article_id, new.qty, 'transfer', new.transfer_id, v_to);
  return null;
end
$function$
;

-- update_credit_payment [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.update_credit_payment(p_payment_id uuid, p_amount numeric, p_paid_at date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payment public.sale_payments%rowtype;
  v_sale public.sales%rowtype;
  v_total numeric;
  v_new_paid numeric;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then raise exception 'Vous n’avez pas le droit de modifier un paiement.'; end if;
  p_amount := round(coalesce(p_amount, 0), 2);
  if p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  select * into v_payment from public.sale_payments where id = p_payment_id and org_id = public.my_org() and kind = 'payment' for update;
  if not found then raise exception 'Paiement introuvable ou non modifiable.'; end if;
  select * into v_sale from public.sales where id = v_payment.sale_id and org_id = public.my_org() for update;
  if not found then raise exception 'Facture introuvable.'; end if;
  select round(coalesce(sum(l.qty * l.unit_price), 0), 2) into v_total from public.sale_lines l where l.sale_id = v_sale.id and l.org_id = v_sale.org_id;
  v_new_paid := coalesce(v_sale.paid, 0) - v_payment.amount + p_amount;
  if v_new_paid > v_total then raise exception 'Le nouveau montant dépasse le total de la facture.'; end if;
  update public.sale_payments set amount = p_amount, paid_at = coalesce(p_paid_at, current_date) where id = v_payment.id;
  update public.sales set paid = v_new_paid where id = v_sale.id;
end $function$
;

-- update_sale [search_path=public]
CREATE OR REPLACE FUNCTION public.update_sale(p_id uuid, p_customer uuid, p_customer_label text, p_date date, p_lines jsonb, p_payment text, p_paid numeric, p_deposit_id uuid DEFAULT NULL::uuid, p_advance_amount numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  r record;
  total numeric := 0;
  v_wh uuid;
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

  -- Dépôt de la facture : c'est son stock qui doit suffire
  select warehouse_id into v_wh from public.sales where id = p_id and org_id = public.my_org();

  delete from public.sale_lines where sale_id = p_id;
  for r in
    select distinct (l->>'article_id') as aid
    from jsonb_array_elements(p_lines) l order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;

  for r in
    select a.name, coalesce(s.qty, 0) as dispo
    from jsonb_array_elements(p_lines) l
    join public.articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org()
    left join public.warehouse_stock s on s.article_id = a.id and s.warehouse_id = v_wh
    group by a.id, a.name, s.qty
    having sum((l->>'qty')::numeric) > coalesce(s.qty, 0)
  loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.dispo;
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

  insert into public.sale_lines(sale_id, article_id, qty, unit_price, discount_pct)
    select p_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric, coalesce((l->>'discount_pct')::numeric,0)
    from jsonb_array_elements(p_lines) l
    join public.articles a on a.id=(l->>'article_id')::uuid and a.org_id=public.my_org();
  return p_id;
end
$function$
;

-- validate_inventory [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.validate_inventory(p_inventory uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := public.my_org();
  v_inv public.inventories%rowtype;
  v_ligne record;
  v_actuel numeric(14,3);
  v_ecart numeric(14,3);
  v_corrections integer := 0;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(public.my_role() not in ('admin', 'manager'), true) then
    raise exception 'Seul le gérant ou le responsable peut valider un inventaire.';
  end if;

  select * into v_inv from public.inventories
  where id = p_inventory and org_id = v_org for update;
  if not found then raise exception 'Inventaire introuvable.'; end if;
  if v_inv.status <> 'draft' then raise exception 'Cet inventaire est déjà validé.'; end if;

  for v_ligne in
    select article_id, counted from public.inventory_lines
    where inventory_id = p_inventory and counted is not null order by article_id
  loop
    select qty into v_actuel from public.warehouse_stock
    where org_id = v_org and warehouse_id = v_inv.warehouse_id and article_id = v_ligne.article_id;
    v_ecart := round(v_ligne.counted - coalesce(v_actuel, 0), 3);
    if v_ecart <> 0 then
      -- La contrainte sur stock_moves n'autorise pas de motif dédié : on utilise
      -- 'adjustment' et ref_id pointe vers l'inventaire pour garder la trace.
      insert into public.stock_moves (org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (v_org, v_ligne.article_id, v_ecart, 'adjustment', p_inventory, v_inv.warehouse_id);
      v_corrections := v_corrections + 1;
    end if;
  end loop;

  update public.inventories
  set status = 'validated', validated_by = auth.uid(), validated_at = now()
  where id = p_inventory;

  return v_corrections;
end;
$function$
;

-- valider_paiement [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.valider_paiement(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p paiements_abonnement%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Réservé au super administrateur.'; end if;
  select * into p from paiements_abonnement where id = p_id for update;
  if not found then raise exception 'Paiement introuvable.'; end if;
  if p.statut <> 'en_attente' then raise exception 'Ce paiement a déjà été traité.'; end if;
  update organizations set
    plan = p.plan,
    status = 'active',
    expires_at = (greatest(coalesce(expires_at::timestamptz, now()), now()) + interval '30 days')::date
  where id = p.org_id;
  update paiements_abonnement set statut = 'valide', validated_at = now() where id = p_id;
end $function$
;

-- void_commercial_payment [SECURITY DEFINER] [search_path=public, pg_temp]
CREATE OR REPLACE FUNCTION public.void_commercial_payment(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_due uuid;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Accès réservé à la plateforme.'
      using errcode = '42501';
  end if;

  if p_reason is null
    or length(trim(p_reason)) not between 3 and 500
  then
    raise exception 'Motif de 3 à 500 caractères requis.';
  end if;

  select due_id into v_due
  from public.commercial_payments
  where id = p_id;

  if not found then
    raise exception 'Paiement introuvable.';
  end if;

  perform 1
  from public.commercial_dues
  where id = v_due
  for update;

  update public.commercial_payments
  set voided_at = now(),
      voided_by = auth.uid(),
      void_reason = trim(p_reason)
  where id = p_id and voided_at is null;

  if not found then
    raise exception 'Paiement déjà annulé.';
  end if;
end;
$function$
;

-- warehouse_of_org [SECURITY DEFINER] [search_path=public]
CREATE OR REPLACE FUNCTION public.warehouse_of_org(p_org uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  select id into v_id from public.warehouses where org_id = p_org and is_default;
  if v_id is null then
    insert into public.warehouses(org_id, name, is_default) values (p_org, 'Dépôt principal', true)
      on conflict do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.warehouses where org_id = p_org and is_default;
    end if;
  end if;
  return v_id;
end $function$
;
