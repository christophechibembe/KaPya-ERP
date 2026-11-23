-- TVA historisée par pièce et lien explicite retour → avoir.
--
-- 1. Chaque vente, achat, retour et avoir fige le taux de TVA en vigueur au moment
--    de sa création. Le journal comptable utilise ce taux pour les périodes passées
--    au lieu du taux courant (qui peut avoir changé depuis).
-- 2. Un avoir créé automatiquement pour un retour porte l'identifiant du retour
--    (credit_notes.return_id) : le journal n'annule plus le retour et l'avoir deux fois,
--    sans dépendre de la note « Retour … ».
--
-- Idempotent : les colonnes et la clé étrangère ne sont ajoutées qu'une fois ; les
-- fonctions sont remplacées. Les pièces antérieures gardent un taux nul : le journal
-- retombe alors sur le réglage courant, comme avant.

alter table public.sales add column if not exists vat_rate numeric(5,2);
alter table public.purchases add column if not exists vat_rate numeric(5,2);
alter table public.customer_returns add column if not exists vat_rate numeric(5,2);
alter table public.credit_notes add column if not exists vat_rate numeric(5,2);
alter table public.credit_notes add column if not exists return_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'credit_notes_return_id_fkey') then
    alter table public.credit_notes
      add constraint credit_notes_return_id_fkey
      foreign key (return_id) references public.customer_returns(id);
  end if;
end $$;

-- Taux à figer sur une pièce créée maintenant : 0 si la TVA est désactivée.
create or replace function public.current_vat_rate() returns numeric
 language sql stable security definer set search_path = '' as $$
  select case when coalesce(o.vat_enabled, false) then coalesce(o.vat_rate, 0) else 0 end
  from public.organizations o
  where o.id = public.my_org()
$$;

revoke all on function public.current_vat_rate() from public, anon;
grant execute on function public.current_vat_rate() to authenticated;

-- Avoir : reprend le taux figé de la vente d'origine.
create or replace function public.create_credit_note(p_sale uuid, p_lines jsonb, p_note text DEFAULT ''::text, p_id uuid DEFAULT NULL::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  insert into public.credit_notes (id, org_id, number, sale_id, customer_id, total_usd, note, created_by, vat_rate)
  values (v_id, v_org, v_num, p_sale, v_sale.customer_id, v_total, trim(coalesce(p_note, '')), auth.uid(), v_sale.vat_rate);
  insert into public.credit_note_lines (org_id, credit_note_id, article_id, qty, unit_price)
  select v_org, v_id, (x->>'article_id')::uuid, (x->>'qty')::numeric,
    (select max(sl.unit_price) from public.sale_lines sl where sl.sale_id = p_sale and sl.article_id = (x->>'article_id')::uuid)
  from jsonb_array_elements(p_lines) x;
  return v_id;
end;
$function$;

-- Retour : reprend le taux figé de la vente et lie l'avoir automatique au retour.
create or replace function public.create_customer_return(p_sale uuid, p_lines jsonb, p_note text DEFAULT ''::text, p_credit boolean DEFAULT false, p_id uuid DEFAULT NULL::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org uuid := public.my_org(); v_role text := public.my_role(); v_id uuid; v_num text; v_sale record;
  v_total numeric(14,2) := 0; l jsonb; v_qty numeric; v_sold numeric; v_price numeric; v_before numeric;
  v_note_id uuid;
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
  insert into public.customer_returns (id, org_id, number, sale_id, warehouse_id, total_usd, note, created_by, vat_rate)
  values (v_id, v_org, v_num, p_sale, v_sale.warehouse_id, v_total, trim(coalesce(p_note,'')), auth.uid(), v_sale.vat_rate);
  insert into public.customer_return_lines (org_id, return_id, article_id, qty, unit_price)
  select v_org, v_id, (x->>'article_id')::uuid, (x->>'qty')::numeric, (select max(sl.unit_price) from public.sale_lines sl where sl.sale_id = p_sale and sl.article_id = (x->>'article_id')::uuid) from jsonb_array_elements(p_lines) x;
  insert into public.stock_moves (org_id, article_id, qty, reason, ref_id, warehouse_id)
  select v_org, (x->>'article_id')::uuid, (x->>'qty')::numeric, 'client_return', v_id, v_sale.warehouse_id from jsonb_array_elements(p_lines) x;
  if p_credit and v_role in ('admin','manager') then
    v_note_id := public.create_credit_note(p_sale, p_lines, 'Retour ' || v_num || '. ' || trim(coalesce(p_note,'')));
    -- Lien explicite retour → avoir : le journal n'annulera ce retour qu'une fois.
    update public.credit_notes set return_id = v_id where id = v_note_id;
  end if;
  return v_id;
end;
$function$;

-- Achat : nouveau paramètre p_vat_rate (facultatif) pour figer le taux, y compris
-- pour un achat saisi hors ligne puis envoyé après un changement de taux.
drop function if exists public.create_purchase(uuid, text, date, jsonb, uuid, numeric, uuid);

create or replace function public.create_purchase(p_supplier uuid, p_number text, p_date date, p_lines jsonb, p_id uuid DEFAULT NULL::uuid, p_usd_cdf numeric DEFAULT NULL::numeric, p_warehouse uuid DEFAULT NULL::uuid, p_vat_rate numeric DEFAULT NULL::numeric)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_line record;
  v_wh uuid;
begin
  -- idempotence hors ligne : une opération déjà reçue (même identifiant) n'est pas recréée.
  if p_id is not null and exists (select 1 from public.purchases t where t.id = p_id) then return p_id; end if;
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() not in ('admin','manager') then raise exception 'Vous n’avez pas le droit d’enregistrer un achat.'; end if;
  if p_vat_rate is not null and (p_vat_rate < 0 or p_vat_rate > 100) then raise exception 'Taux de TVA invalide (entre 0 et 100).'; end if;
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
  insert into public.purchases(id, supplier_id, number, bought_at, usd_cdf, warehouse_id, vat_rate)
  values (v_id, p_supplier, coalesce(nullif(trim(coalesce(p_number, '')), ''), public.next_document_number('purchase', 'ACH')), coalesce(p_date, current_date), coalesce(p_usd_cdf, (select usd_cdf from public.settings limit 1)), v_wh, coalesce(p_vat_rate, public.current_vat_rate()));
  insert into public.purchase_lines(purchase_id, article_id, qty, unit_cost)
  select v_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_cost')::numeric
  from jsonb_array_elements(p_lines) l
  join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org();
  return v_id;
end $function$;

revoke all on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric, uuid, numeric) from public, anon;
grant execute on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric, uuid, numeric) to authenticated;

-- Vente : nouveau paramètre p_vat_rate (facultatif), même principe que l'achat.
drop function if exists public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric, uuid);

create or replace function public.create_sale(p_customer uuid, p_number text, p_date date, p_lines jsonb, p_id uuid DEFAULT NULL::uuid, p_usd_cdf numeric DEFAULT NULL::numeric, p_customer_label text DEFAULT NULL::text, p_payment text DEFAULT 'cash'::text, p_paid numeric DEFAULT NULL::numeric, p_deposit_id uuid DEFAULT NULL::uuid, p_advance_amount numeric DEFAULT 0, p_warehouse uuid DEFAULT NULL::uuid, p_vat_rate numeric DEFAULT NULL::numeric)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  if p_vat_rate is not null and (p_vat_rate < 0 or p_vat_rate > 100) then raise exception 'Taux de TVA invalide (entre 0 et 100).'; end if;
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
  insert into sales(id, customer_id, customer_label, number, sold_at, usd_cdf, payment, paid, warehouse_id, vat_rate)
    values (sid, p_customer, nullif(trim(coalesce(p_customer_label,'')), ''),
      coalesce(p_number, public.next_invoice_number()), coalesce(p_date, current_date),
      coalesce(p_usd_cdf, (select s.usd_cdf from public.settings s where s.org_id = public.my_org())), coalesce(p_payment,'cash'), v_initial + v_advance, v_wh, coalesce(p_vat_rate, public.current_vat_rate()));
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
end $function$;

revoke all on function public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric, uuid, numeric) from public, anon;
grant execute on function public.create_sale(uuid, text, date, jsonb, uuid, numeric, text, text, numeric, uuid, numeric, uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
