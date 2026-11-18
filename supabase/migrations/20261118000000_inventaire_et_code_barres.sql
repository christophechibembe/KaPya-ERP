-- KaPya ERP — inventaire physique et réglage du code-barres.
-- Additif et rejouable : ne supprime aucune donnée.
-- L'interface existait déjà (Paramètres > Inventaire physique, réglage code-barres)
-- mais les tables et les fonctions manquaient en production.

-- 1. Inventaires -------------------------------------------------------------
create table if not exists public.inventories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'validated')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  validated_by uuid,
  validated_at timestamptz
);

create table if not exists public.inventory_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations(id) on delete cascade,
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  theoretical numeric(14,3) not null default 0,
  counted numeric(14,3) check (counted is null or counted >= 0),
  unique (inventory_id, article_id)
);

create index if not exists inventory_lines_inventory_idx on public.inventory_lines (inventory_id);
create index if not exists inventories_draft_idx on public.inventories (org_id, warehouse_id) where status = 'draft';

alter table public.inventories enable row level security;
alter table public.inventory_lines enable row level security;

drop policy if exists inventories_r on public.inventories;
create policy inventories_r on public.inventories
  for select to authenticated using (org_id = public.my_org());

drop policy if exists inventory_lines_r on public.inventory_lines;
create policy inventory_lines_r on public.inventory_lines
  for select to authenticated using (org_id = public.my_org());

grant select on public.inventories to authenticated;
grant select on public.inventory_lines to authenticated;
revoke all on public.inventories from anon;
revoke all on public.inventory_lines from anon;

-- 2. Ouvrir un inventaire (gérant et responsable) ----------------------------
create or replace function public.create_inventory(p_warehouse uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- 3. Saisir une quantité comptée --------------------------------------------
create or replace function public.set_inventory_count(p_inventory uuid, p_article uuid, p_counted numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- 4. Valider l'inventaire : corrige les écarts par des mouvements de stock ----
create or replace function public.validate_inventory(p_inventory uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- 5. Réglage du code-barres --------------------------------------------------
alter table public.organizations
  add column if not exists barcode_enabled boolean not null default false;

create or replace function public.set_barcode_enabled(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.my_org();
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() <> 'admin' then raise exception 'Seul le gérant peut modifier ce réglage.'; end if;
  update public.organizations set barcode_enabled = coalesce(p_on, false) where id = v_org;
end;
$$;

-- 6. Droits : rien pour anon, exécution pour les comptes connectés ------------
revoke all on function public.create_inventory(uuid) from public, anon;
revoke all on function public.set_inventory_count(uuid, uuid, numeric) from public, anon;
revoke all on function public.validate_inventory(uuid) from public, anon;
revoke all on function public.set_barcode_enabled(boolean) from public, anon;

grant execute on function public.create_inventory(uuid) to authenticated;
grant execute on function public.set_inventory_count(uuid, uuid, numeric) to authenticated;
grant execute on function public.validate_inventory(uuid) to authenticated;
grant execute on function public.set_barcode_enabled(boolean) to authenticated;

-- PostgREST doit voir les nouvelles tables et fonctions immédiatement.
notify pgrst, 'reload schema';
