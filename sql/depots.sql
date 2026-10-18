-- KaPya ERP : plusieurs dépôts, avec stock séparé par dépôt.
-- Le stock total par produit (articles.stock) est conservé : il reste la somme des dépôts.
-- Sans danger à relancer. Chaque entreprise garde un « Dépôt principal » qui reçoit tout l'existant.

-- 1) Dépôts
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  address text not null default '',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists warehouses_one_default on public.warehouses (org_id) where is_default;
create unique index if not exists warehouses_name_uq on public.warehouses (org_id, lower(name));

alter table public.warehouses enable row level security;
drop policy if exists warehouses_r on public.warehouses;
create policy warehouses_r on public.warehouses for select to authenticated using (org_id = public.my_org());
drop policy if exists warehouses_i on public.warehouses;
create policy warehouses_i on public.warehouses for insert to authenticated
  with check (org_id = public.my_org() and public.my_role() in ('admin','manager') and not is_default);
drop policy if exists warehouses_u on public.warehouses;
create policy warehouses_u on public.warehouses for update to authenticated
  using (org_id = public.my_org() and public.my_role() in ('admin','manager'))
  with check (org_id = public.my_org() and public.my_role() in ('admin','manager'));
revoke delete on public.warehouses from public, anon, authenticated;

-- Dépôt par défaut d'une entreprise : créé à la demande, une seule fois.
create or replace function public.warehouse_of_org(p_org uuid) returns uuid
language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function public.default_warehouse() returns uuid
language sql security definer set search_path = public as $$
  select public.warehouse_of_org(public.my_org())
$$;

-- Les entreprises existantes reçoivent leur dépôt principal.
insert into public.warehouses(org_id, name, is_default)
select o.id, 'Dépôt principal', true from public.organizations o
where not exists (select 1 from public.warehouses w where w.org_id = o.id and w.is_default);

-- Le dépôt par défaut ne peut pas être désactivé ni supprimé ; un dépôt ne se désactive que s'il est vide.
create or replace function public.guard_warehouse_update() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;

-- 2) Stock par dépôt
create table if not exists public.warehouse_stock (
  org_id uuid not null references public.organizations on delete cascade,
  warehouse_id uuid not null references public.warehouses on delete cascade,
  article_id uuid not null references public.articles on delete cascade,
  qty numeric(14,3) not null default 0,
  primary key (warehouse_id, article_id)
);
alter table public.warehouse_stock enable row level security;
drop policy if exists warehouse_stock_r on public.warehouse_stock;
create policy warehouse_stock_r on public.warehouse_stock for select to authenticated using (org_id = public.my_org());
revoke all on public.warehouse_stock from public, anon, authenticated;
grant select on public.warehouse_stock to authenticated;

-- 3) Colonnes de dépôt sur les pièces et les mouvements
alter table public.stock_moves add column if not exists warehouse_id uuid references public.warehouses on delete restrict;
alter table public.sales add column if not exists warehouse_id uuid references public.warehouses on delete restrict;
alter table public.purchases add column if not exists warehouse_id uuid references public.warehouses on delete restrict;
alter table public.sale_lines add column if not exists warehouse_id uuid references public.warehouses on delete restrict;
alter table public.purchase_lines add column if not exists warehouse_id uuid references public.warehouses on delete restrict;
alter table public.transfers add column if not exists from_warehouse_id uuid references public.warehouses on delete restrict;
alter table public.transfers add column if not exists to_warehouse_id uuid references public.warehouses on delete restrict;

-- Rattrapage des données existantes : tout va au dépôt principal, puis stock par dépôt recalculé.
update public.sales s set warehouse_id = public.warehouse_of_org(s.org_id) where s.warehouse_id is null;
update public.purchases p set warehouse_id = public.warehouse_of_org(p.org_id) where p.warehouse_id is null;
update public.sale_lines l set warehouse_id = s.warehouse_id from public.sales s where s.id = l.sale_id and l.warehouse_id is null;
update public.purchase_lines l set warehouse_id = p.warehouse_id from public.purchases p where p.id = l.purchase_id and l.warehouse_id is null;
update public.transfers t set from_warehouse_id = public.warehouse_of_org(t.org_id) where t.from_warehouse_id is null;
update public.stock_moves m set warehouse_id = public.warehouse_of_org(m.org_id) where m.warehouse_id is null;

-- Valeurs par défaut pour les nouvelles pièces (l'application n'a pas à les envoyer).
alter table public.sales alter column warehouse_id set default public.default_warehouse();
alter table public.purchases alter column warehouse_id set default public.default_warehouse();
alter table public.transfers alter column from_warehouse_id set default public.default_warehouse();

-- Les lignes prennent le dépôt de leur pièce à la création (la pièce existe toujours à ce moment).
create or replace function public.line_takes_document_warehouse() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.warehouse_id is null then
    if tg_table_name = 'sale_lines' then
      select warehouse_id into new.warehouse_id from public.sales where id = new.sale_id;
    else
      select warehouse_id into new.warehouse_id from public.purchases where id = new.purchase_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_sale_line_warehouse on public.sale_lines;
create trigger t_sale_line_warehouse before insert on public.sale_lines
  for each row execute function public.line_takes_document_warehouse();
drop trigger if exists t_purchase_line_warehouse on public.purchase_lines;
create trigger t_purchase_line_warehouse before insert on public.purchase_lines
  for each row execute function public.line_takes_document_warehouse();

-- Un mouvement sans dépôt va au dépôt principal de l'entreprise.
create or replace function public.move_takes_default_warehouse() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.warehouse_id is null then new.warehouse_id := public.warehouse_of_org(new.org_id); end if;
  return new;
end $$;
drop trigger if exists t_move_warehouse on public.stock_moves;
create trigger t_move_warehouse before insert on public.stock_moves
  for each row execute function public.move_takes_default_warehouse();

-- 4) Garde-fous et mise à jour du stock : total (comme avant) ET dépôt.
create or replace function public.apply_move() returns trigger language plpgsql security definer set search_path = public as $$
declare v_wh numeric(14,3);
begin
  insert into public.warehouse_stock(org_id, warehouse_id, article_id, qty)
    values (new.org_id, new.warehouse_id, new.article_id, 0) on conflict do nothing;
  select qty into v_wh from public.warehouse_stock
    where warehouse_id = new.warehouse_id and article_id = new.article_id for update;
  if new.qty < 0 and v_wh + new.qty < 0 then
    raise exception 'Stock insuffisant dans ce dépôt pour ce produit.';
  end if;
  if new.qty < 0 and (select stock from public.articles where id = new.article_id) + new.qty < 0 then
    if new.reason = 'adjustment' then raise exception 'Ajustement impossible : le stock ne peut pas devenir négatif.';
    else raise exception 'une partie de ce stock a déjà été vendue ou ajustée.'; end if;
  end if;
  update public.warehouse_stock set qty = qty + new.qty
    where warehouse_id = new.warehouse_id and article_id = new.article_id;
  update public.articles set stock = stock + new.qty where id = new.article_id;
  return null;
end $$;

create or replace function public.sale_line_move() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (new.org_id, new.article_id, -new.qty, 'sale', new.id, new.warehouse_id);
  else
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (old.org_id, old.article_id, old.qty, 'sale', old.id, old.warehouse_id);
  end if;
  return null;
end $$;

create or replace function public.purchase_line_move() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (new.org_id, new.article_id, new.qty, 'purchase', new.id, new.warehouse_id);
  else
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (old.org_id, old.article_id, -old.qty, 'purchase', old.id, old.warehouse_id);
  end if;
  return null;
end $$;

-- Transfert (vendeur ou dépôt) : sortie du dépôt source, et entrée dans le dépôt cible si le transfert en a un.
create or replace function public.transfer_line_move() returns trigger language plpgsql security definer set search_path = public as $$
declare v_from uuid; v_to uuid;
begin
  select from_warehouse_id, to_warehouse_id into v_from, v_to from public.transfers where id = new.transfer_id;
  insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
    values (new.org_id, new.article_id, -new.qty, 'transfer', new.transfer_id, coalesce(v_from, public.warehouse_of_org(new.org_id)));
  if v_to is not null then
    insert into public.stock_moves(org_id, article_id, qty, reason, ref_id, warehouse_id)
      values (new.org_id, new.article_id, new.qty, 'transfer', new.transfer_id, v_to);
  end if;
  return null;
end $$;

-- 5) Transfert entre deux dépôts (même entreprise, deux dépôts actifs et différents).
create or replace function public.create_warehouse_transfer(p_from uuid, p_to uuid, p_date date, p_lines jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org();
  v_role text := public.my_role();
  v_tid uuid := gen_random_uuid();
  v_num text;
  v_dest text;
  r record;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier'), true) then raise exception 'Vous n’avez pas le droit de transférer du stock.'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'Choisissez deux dépôts différents.'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins un produit.'; end if;
  if (select count(*) from public.warehouses where id in (p_from, p_to) and org_id = v_org and active) <> 2 then
    raise exception 'Dépôt introuvable ou inactif.';
  end if;
  select name into v_dest from public.warehouses where id = p_to;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, coalesce(s.qty, 0) as dispo
           from jsonb_array_elements(p_lines) l
           join public.articles a on a.id = (l->>'article_id')::uuid
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
end $$;

-- Le transfert entre dépôts se fait uniquement par cette fonction.
revoke all on function public.create_warehouse_transfer(uuid, uuid, date, jsonb, text) from public, anon;
grant execute on function public.create_warehouse_transfer(uuid, uuid, date, jsonb, text) to authenticated;
revoke all on function public.warehouse_of_org(uuid) from public, anon, authenticated;
revoke all on function public.default_warehouse() from public, anon;
grant execute on function public.default_warehouse() to authenticated;

drop trigger if exists t_guard_warehouse_update on public.warehouses;
create trigger t_guard_warehouse_update before update on public.warehouses
  for each row execute function public.guard_warehouse_update();

-- 6) Stock par dépôt recalculé à partir des mouvements (utilisé après rattrapage et restauration).
create or replace function public.rebuild_warehouse_stock(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.warehouse_stock where org_id = p_org;
  insert into public.warehouse_stock(org_id, warehouse_id, article_id, qty)
    select org_id, warehouse_id, article_id, sum(qty) from public.stock_moves
    where org_id = p_org and warehouse_id is not null group by org_id, warehouse_id, article_id;
end $$;

-- Rattrapage initial du stock par dépôt, à partir de l'historique existant.
select public.rebuild_warehouse_stock(o.id) from public.organizations o;
revoke all on function public.rebuild_warehouse_stock(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
