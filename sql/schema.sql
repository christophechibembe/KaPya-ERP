-- KaPya ERP — schéma COMPLET (installation neuve uniquement : ne pas relancer sur une base existante).
-- Contient : tables, RLS, stock par mouvements, garde-fou négatif, verrou des ventes, taux figé par pièce, équipe.

-- KaPya ERP — schéma Supabase (multi-organisation, RLS, stock par mouvements)
create extension if not exists pgcrypto;

create table public.organizations(id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table public.profiles(
  id uuid primary key references auth.users on delete cascade,
  org_id uuid references public.organizations on delete cascade,
  full_name text,
  role text not null default 'user' check (role in ('admin','manager','user')),
  created_at timestamptz default now());

create function public.my_org() returns uuid language sql stable security definer set search_path=public as
$$ select org_id from public.profiles where id=auth.uid() $$;
create function public.my_role() returns text language sql stable security definer set search_path=public as
$$ select role from public.profiles where id=auth.uid() $$;

-- Création de l'organisation par le premier utilisateur (devient admin)
create function public.bootstrap_org(org_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare o uuid;
begin
  if (select org_id from profiles where id=auth.uid()) is not null then raise exception 'Organisation déjà définie'; end if;
  insert into organizations(name) values(org_name) returning id into o;
  insert into profiles(id,org_id,role) values(auth.uid(),o,'admin')
    on conflict (id) do update set org_id=o, role='admin';
  return o;
end $$;

create table public.customers(id uuid primary key default gen_random_uuid(), org_id uuid not null default public.my_org() references public.organizations,
  name text not null, phone text, email text, created_at timestamptz default now());
create table public.suppliers(id uuid primary key default gen_random_uuid(), org_id uuid not null default public.my_org() references public.organizations,
  name text not null, phone text, email text, created_at timestamptz default now());
create table public.articles(id uuid primary key default gen_random_uuid(), org_id uuid not null default public.my_org() references public.organizations,
  sku text not null, name text not null, unit text not null default 'pce',
  price_sell numeric(14,2) not null default 0, price_buy numeric(14,2) not null default 0,
  stock numeric(14,3) not null default 0, min_stock numeric(14,3) not null default 0,
  created_at timestamptz default now(), unique(org_id,sku));

create table public.sales(id uuid primary key default gen_random_uuid(), org_id uuid not null default public.my_org() references public.organizations,
  customer_id uuid references public.customers, number text, sold_at date not null default current_date, created_at timestamptz default now());
create table public.sale_lines(id uuid primary key default gen_random_uuid(), org_id uuid not null default public.my_org() references public.organizations,
  sale_id uuid not null references public.sales on delete cascade, article_id uuid not null references public.articles,
  qty numeric(14,3) not null check (qty>0), unit_price numeric(14,2) not null default 0);

create table public.purchases(id uuid primary key default gen_random_uuid(), org_id uuid not null default public.my_org() references public.organizations,
  supplier_id uuid references public.suppliers, number text, bought_at date not null default current_date, created_at timestamptz default now());
create table public.purchase_lines(id uuid primary key default gen_random_uuid(), org_id uuid not null default public.my_org() references public.organizations,
  purchase_id uuid not null references public.purchases on delete cascade, article_id uuid not null references public.articles,
  qty numeric(14,3) not null check (qty>0), unit_cost numeric(14,2) not null default 0);

-- Journal des mouvements : qty signée (+ entrée, - sortie)
create table public.stock_moves(id uuid primary key default gen_random_uuid(), org_id uuid not null default public.my_org() references public.organizations,
  article_id uuid not null references public.articles, qty numeric(14,3) not null,
  reason text not null check (reason in ('sale','purchase','adjustment')), ref_id uuid, created_at timestamptz default now());

create or replace function public.apply_move() returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Garde-fou : le stock ne peut jamais devenir négatif (annulation d'achat après vente, ajustement).
  if new.qty < 0 and (select stock from articles where id=new.article_id) + new.qty < 0 then
    if new.reason = 'adjustment' then raise exception 'Ajustement impossible : le stock ne peut pas devenir négatif.';
    else raise exception 'une partie de ce stock a déjà été vendue ou ajustée.'; end if;
  end if;
  update articles set stock=stock+new.qty where id=new.article_id; return null; end $$;
create trigger t_apply_move after insert on public.stock_moves for each row execute function public.apply_move();

-- Ventes : sortie de stock ; suppression d'une ligne = retour en stock
create function public.sale_line_move() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then insert into stock_moves(org_id,article_id,qty,reason,ref_id) values(new.org_id,new.article_id,-new.qty,'sale',new.id);
  else insert into stock_moves(org_id,article_id,qty,reason,ref_id) values(old.org_id,old.article_id,old.qty,'sale',old.id); end if;
  return null; end $$;
create trigger t_sale_line after insert or delete on public.sale_lines for each row execute function public.sale_line_move();

-- Achats : entrée de stock ; suppression d'une ligne = annulation de l'entrée
create function public.purchase_line_move() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then insert into stock_moves(org_id,article_id,qty,reason,ref_id) values(new.org_id,new.article_id,new.qty,'purchase',new.id);
  else insert into stock_moves(org_id,article_id,qty,reason,ref_id) values(old.org_id,old.article_id,-old.qty,'purchase',old.id); end if;
  return null; end $$;
create trigger t_purchase_line after insert or delete on public.purchase_lines for each row execute function public.purchase_line_move();

-- RLS : lecture/insertion pour l'organisation, modification managers, suppression admins
do $$ declare t text; begin
  foreach t in array array['customers','suppliers','articles','sales','sale_lines','purchases','purchase_lines'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (org_id=public.my_org())',t||'_r',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (org_id=public.my_org())',t||'_i',t);
    execute format('create policy %I on public.%I for update to authenticated using (org_id=public.my_org() and public.my_role() in (''admin'',''manager''))',t||'_u',t);
    execute format('create policy %I on public.%I for delete to authenticated using (org_id=public.my_org() and public.my_role()=''admin'')',t||'_d',t);
  end loop;
end $$;
-- Les managers peuvent corriger une saisie (suppression de lignes)
drop policy sale_lines_d on public.sale_lines;
create policy sale_lines_d on public.sale_lines for delete to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager'));
drop policy purchase_lines_d on public.purchase_lines;
create policy purchase_lines_d on public.purchase_lines for delete to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager'));

alter table public.stock_moves enable row level security;
create policy stock_moves_r on public.stock_moves for select to authenticated using (org_id=public.my_org());
create policy stock_moves_i on public.stock_moves for insert to authenticated with check (org_id=public.my_org() and reason='adjustment' and public.my_role() in ('admin','manager'));

alter table public.organizations enable row level security;
create policy organizations_r on public.organizations for select to authenticated using (id=public.my_org());
alter table public.profiles enable row level security;
create policy profiles_r on public.profiles for select to authenticated using (org_id=public.my_org() or id=auth.uid());
create policy profiles_u on public.profiles for update to authenticated using (org_id=public.my_org() and public.my_role()='admin');
create policy profiles_d on public.profiles for delete to authenticated using (org_id=public.my_org() and public.my_role()='admin');

-- Achat atomique (en-tête + lignes dans une seule transaction, RLS appliquée à l'appelant)
create function public.create_purchase(p_supplier uuid, p_number text, p_date date, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path=public as $$
declare pid uuid;
begin
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  insert into purchases(supplier_id,number,bought_at) values(p_supplier,p_number,coalesce(p_date,current_date)) returning id into pid;
  insert into purchase_lines(purchase_id,article_id,qty,unit_cost)
    select pid,(l->>'article_id')::uuid,(l->>'qty')::numeric,(l->>'unit_cost')::numeric from jsonb_array_elements(p_lines) l;
  return pid;
end $$;

-- Vente atomique avec blocage si stock insuffisant
create function public.create_sale(p_customer uuid, p_number text, p_date date, p_lines jsonb) returns uuid
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
  insert into sales(customer_id,number,sold_at) values(p_customer,p_number,coalesce(p_date,current_date)) returning id into sid;
  insert into sale_lines(sale_id,article_id,qty,unit_price)
    select sid,(l->>'article_id')::uuid,(l->>'qty')::numeric,(l->>'unit_price')::numeric from jsonb_array_elements(p_lines) l;
  return sid;
end $$;

-- Taux du jour (1 USD = x CDF) : une ligne par organisation, modifiable par tous sauf lecture seule
create table public.settings(org_id uuid primary key default public.my_org() references public.organizations on delete cascade,
  usd_cdf numeric(14,2) not null check (usd_cdf > 0), rate_date date not null default current_date);
alter table public.settings enable row level security;
create policy settings_r on public.settings for select to authenticated using (org_id=public.my_org());
create policy settings_i on public.settings for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier','comptable'));
create policy settings_u on public.settings for update to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier','comptable'));

-- Annulation d'une pièce : admin et manager (voir aussi sql/annulation.sql)
drop policy if exists sales_d on public.sales;
create policy sales_d on public.sales for delete to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager'));
drop policy if exists purchases_d on public.purchases;
create policy purchases_d on public.purchases for delete to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager'));

-- ===== Taux figé par pièce =====
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

-- ===== Équipe =====
-- KaPya ERP — équipe : codes d'invitation et rejoindre une entreprise.
-- À exécuter dans Supabase > SQL Editor (une seule fois). Sans danger à relancer.

create table if not exists public.invitations (
  code text primary key default encode(gen_random_bytes(5),'hex'),
  org_id uuid not null references public.organizations on delete cascade default public.my_org(),
  role text not null check (role in ('manager','user')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days');

alter table public.invitations enable row level security;
drop policy if exists invitations_r on public.invitations;
drop policy if exists invitations_i on public.invitations;
drop policy if exists invitations_d on public.invitations;
create policy invitations_r on public.invitations for select to authenticated using (org_id=public.my_org() and public.my_role()='admin');
create policy invitations_i on public.invitations for insert to authenticated with check (org_id=public.my_org() and public.my_role()='admin');
create policy invitations_d on public.invitations for delete to authenticated using (org_id=public.my_org() and public.my_role()='admin');

-- Rejoindre une entreprise avec un code valide (non expiré). L'utilisateur ne doit pas déjà avoir d'entreprise.
create or replace function public.join_org(p_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare inv record;
begin
  if (select org_id from profiles where id=auth.uid()) is not null then raise exception 'Vous appartenez déjà à une entreprise.'; end if;
  select * into inv from invitations where code=upper(trim(p_code)) and expires_at > now();
  if not found then raise exception 'Code d''invitation invalide ou expiré.'; end if;
  insert into profiles(id,org_id,role) values(auth.uid(),inv.org_id,inv.role)
    on conflict (id) do update set org_id=inv.org_id, role=inv.role;
  return inv.org_id;
end $$;

-- Un admin ne peut pas se retirer ses propres droits (évite une entreprise sans admin)
create or replace function public.guard_admin() returns trigger language plpgsql as $$
begin
  if old.id=auth.uid() and new.role<>'admin' and (select count(*) from profiles where org_id=old.org_id and role='admin')<=1 then
    raise exception 'Il doit rester au moins un administrateur.';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_admin on public.profiles;
create trigger t_guard_admin before update of role on public.profiles for each row execute function public.guard_admin();

-- ===== Rôles et droits =====
-- KaPya ERP — rôles et droits : Gérant, Responsable, Facturier, Comptable, Lecture seule.
-- À exécuter dans Supabase > SQL Editor (une fois). Sans danger à relancer.

-- 1. Rôles autorisés
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','manager','facturier','comptable','user'));
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check check (role in ('manager','facturier','comptable','user'));

-- 2. Qui peut CRÉER (ventes et clients : facturier aussi ; achats, articles, fournisseurs : gérant et responsable)
drop policy if exists sales_i on public.sales;
create policy sales_i on public.sales for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));
drop policy if exists sale_lines_i on public.sale_lines;
create policy sale_lines_i on public.sale_lines for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));

drop policy if exists customers_i on public.customers;
create policy customers_i on public.customers for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));
drop policy if exists customers_u on public.customers;
create policy customers_u on public.customers for update to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));

drop policy if exists purchases_i on public.purchases;
create policy purchases_i on public.purchases for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));
drop policy if exists purchase_lines_i on public.purchase_lines;
create policy purchase_lines_i on public.purchase_lines for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));

drop policy if exists suppliers_i on public.suppliers;
create policy suppliers_i on public.suppliers for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));
drop policy if exists articles_i on public.articles;
create policy articles_i on public.articles for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));

-- 3. Qui peut LIRE les achats et fournisseurs : gérant, responsable, comptable, lecture seule (pas le facturier)
drop policy if exists purchases_r on public.purchases;
create policy purchases_r on public.purchases for select to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','comptable','user'));
drop policy if exists purchase_lines_r on public.purchase_lines;
create policy purchase_lines_r on public.purchase_lines for select to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','comptable','user'));
drop policy if exists suppliers_r on public.suppliers;
create policy suppliers_r on public.suppliers for select to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','comptable','user'));

-- ===== Mode hors ligne (pièces sans doublon, taux figé) =====
-- KaPya ERP — mode hors ligne : pièces sans doublon et taux figé à la saisie. Sans danger à relancer.
-- 1) p_id : une vente ou un achat envoyé deux fois n'est enregistré qu'une fois.
-- 2) p_usd_cdf : le taux est celui du moment de la saisie, même si la pièce est synchronisée plus tard.
-- 3) Le stock ne peut toujours pas devenir négatif (ventes et annulations d'achat protégées).
-- À exécuter dans Supabase > SQL Editor.

drop function if exists public.create_sale(uuid, text, date, jsonb);
drop function if exists public.create_purchase(uuid, text, date, jsonb);

create or replace function public.create_purchase(p_supplier uuid, p_number text, p_date date, p_lines jsonb,
  p_id uuid default null, p_usd_cdf numeric default null) returns uuid
language plpgsql security invoker set search_path=public as $$
declare pid uuid;
begin
  if p_id is not null and exists (select 1 from purchases where id = p_id) then return p_id; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  pid := coalesce(p_id, gen_random_uuid());
  insert into purchases(id,supplier_id,number,bought_at,usd_cdf)
    values(pid,p_supplier,p_number,coalesce(p_date,current_date),coalesce(p_usd_cdf,(select usd_cdf from settings limit 1)));
  insert into purchase_lines(purchase_id,article_id,qty,unit_cost)
    select pid,(l->>'article_id')::uuid,(l->>'qty')::numeric,(l->>'unit_cost')::numeric from jsonb_array_elements(p_lines) l;
  return pid;
end $$;

create or replace function public.create_sale(p_customer uuid, p_number text, p_date date, p_lines jsonb,
  p_id uuid default null, p_usd_cdf numeric default null) returns uuid
language plpgsql security invoker set search_path=public as $$
declare sid uuid; r record;
begin
  if p_id is not null and exists (select 1 from sales where id = p_id) then return p_id; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, a.stock from jsonb_array_elements(p_lines) l join articles a on a.id=(l->>'article_id')::uuid
           group by a.id,a.name,a.stock having sum((l->>'qty')::numeric) > a.stock loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  sid := coalesce(p_id, gen_random_uuid());
  insert into sales(id,customer_id,number,sold_at,usd_cdf)
    values(sid,p_customer,p_number,coalesce(p_date,current_date),coalesce(p_usd_cdf,(select usd_cdf from settings limit 1)));
  insert into sale_lines(sale_id,article_id,qty,unit_price)
    select sid,(l->>'article_id')::uuid,(l->>'qty')::numeric,(l->>'unit_price')::numeric from jsonb_array_elements(p_lines) l;
  return sid;
end $$;

notify pgrst, 'reload schema';



-- ===== Facturation =====
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

-- ===== Transferts de marchandise =====
-- KaPya ERP — transferts de marchandise : sortie de stock vers un vendeur, sans prix ni montant, avec traçabilité.
-- Ce n'est pas une vente. Pas de modification ni de suppression (historique conservé). Sans danger à relancer.

alter table public.stock_moves drop constraint if exists stock_moves_reason_check;
alter table public.stock_moves add constraint stock_moves_reason_check check (reason in ('sale','purchase','adjustment','transfer'));

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  number text not null,
  destination text not null,
  note text,
  moved_at date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now());
create table if not exists public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  transfer_id uuid not null references public.transfers on delete cascade,
  article_id uuid not null references public.articles,
  qty numeric(14,3) not null check (qty > 0));

alter table public.transfers enable row level security;
alter table public.transfer_lines enable row level security;
drop policy if exists transfers_r on public.transfers;
create policy transfers_r on public.transfers for select to authenticated using (org_id=public.my_org());
drop policy if exists transfers_i on public.transfers;
create policy transfers_i on public.transfers for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));
drop policy if exists transfer_lines_r on public.transfer_lines;
create policy transfer_lines_r on public.transfer_lines for select to authenticated using (org_id=public.my_org());
drop policy if exists transfer_lines_i on public.transfer_lines;
create policy transfer_lines_i on public.transfer_lines for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));

-- Chaque ligne de transfert sort du stock (mouvement tracé, sans montant)
create or replace function public.transfer_line_move() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into stock_moves(org_id, article_id, qty, reason, ref_id) values(new.org_id, new.article_id, -new.qty, 'transfer', new.transfer_id);
  return null;
end $$;
drop trigger if exists t_transfer_line on public.transfer_lines;
create trigger t_transfer_line after insert on public.transfer_lines for each row execute function public.transfer_line_move();

drop function if exists public.create_transfer(text, date, jsonb, uuid, text);
create function public.create_transfer(p_destination text, p_date date, p_lines jsonb, p_id uuid default null, p_note text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare tid uuid; r record; num text;
begin
  if p_id is not null and exists (select 1 from transfers where id = p_id) then return p_id; end if;
  if nullif(trim(coalesce(p_destination,'')),'') is null then raise exception 'Indiquez le vendeur ou la destination.'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins un produit.'; end if;
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, a.stock from jsonb_array_elements(p_lines) l join articles a on a.id=(l->>'article_id')::uuid
           group by a.id,a.name,a.stock having sum((l->>'qty')::numeric) > a.stock loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  select 'TRF-' || lpad((count(*) + 1)::text, 5, '0') into num from transfers where org_id = public.my_org();
  tid := coalesce(p_id, gen_random_uuid());
  insert into transfers(id, number, destination, note, moved_at)
    values(tid, num, trim(p_destination), nullif(trim(coalesce(p_note,'')),''), coalesce(p_date, current_date));
  insert into transfer_lines(transfer_id, article_id, qty)
    select tid, (l->>'article_id')::uuid, (l->>'qty')::numeric from jsonb_array_elements(p_lines) l;
  return tid;
end $$;

notify pgrst, 'reload schema';

-- ===== Modifier une facture =====
-- KaPya ERP — modifier une facture : les anciennes lignes sont retirées (le stock est rendu),
-- puis les nouvelles sont enregistrées avec contrôle du stock. Tout est annulé en cas d'erreur.
-- Réservé au gérant et au responsable. À exécuter dans Supabase > SQL Editor. Sans danger à relancer.

drop function if exists public.update_sale(uuid, uuid, text, date, jsonb, text, numeric);
create function public.update_sale(p_id uuid, p_customer uuid, p_customer_label text, p_date date, p_lines jsonb,
  p_payment text, p_paid numeric) returns uuid
language plpgsql security invoker set search_path=public as $$
declare r record; total numeric := 0;
begin
  if public.my_role() not in ('admin','manager') then raise exception 'Modification réservée au gérant et au responsable.'; end if;
  if not exists (select 1 from sales where id = p_id) then raise exception 'Facture introuvable.'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins un produit.'; end if;
  if coalesce(p_payment,'cash') not in ('cash','credit') then raise exception 'Mode de paiement invalide.'; end if;
  -- 1. Retirer les anciennes lignes : le stock est rendu (trigger)
  delete from sale_lines where sale_id = p_id;
  -- 2. Verrous et contrôle du stock avec les nouvelles quantités
  for r in select distinct (l->>'article_id') as aid from jsonb_array_elements(p_lines) l order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(r.aid, 0));
  end loop;
  for r in select a.name, a.stock from jsonb_array_elements(p_lines) l join articles a on a.id=(l->>'article_id')::uuid
           group by a.id,a.name,a.stock having sum((l->>'qty')::numeric) > a.stock loop
    raise exception 'Stock insuffisant pour % : % disponible(s).', r.name, r.stock;
  end loop;
  select coalesce(sum((l->>'qty')::numeric * (l->>'unit_price')::numeric), 0) into total from jsonb_array_elements(p_lines) l;
  update sales set customer_id = p_customer, customer_label = nullif(trim(coalesce(p_customer_label,'')),''),
    sold_at = coalesce(p_date, sold_at), payment = coalesce(p_payment,'cash'),
    paid = case when coalesce(p_payment,'cash') = 'cash' then total else least(greatest(coalesce(p_paid,0),0), total) end
  where id = p_id;
  insert into sale_lines(sale_id, article_id, qty, unit_price)
    select p_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric from jsonb_array_elements(p_lines) l;
  return p_id;
end $$;

notify pgrst, 'reload schema';

-- ===== Super admin et en-tête d'entreprise =====
-- KaPya ERP — super admin : codes d'activation pour les abonnés, en-tête d'entreprise (logo, adresse, NIF…).
-- À exécuter dans Supabase > SQL Editor. Sans danger à relancer.
-- Pour devenir super admin, exécuter une fois (remplacer par votre e-mail) :
--   insert into public.platform_admins(user_id) select id from auth.users where email = 'votre@email.com' on conflict do nothing;

create table if not exists public.platform_admins (user_id uuid primary key references auth.users on delete cascade);
alter table public.platform_admins enable row level security;
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from platform_admins where user_id = auth.uid()) $$;

-- En-tête de l'entreprise
alter table public.organizations add column if not exists address text;
alter table public.organizations add column if not exists phone text;
alter table public.organizations add column if not exists email text;
alter table public.organizations add column if not exists tax_id text;
alter table public.organizations add column if not exists rc text;
alter table public.organizations add column if not exists logo text;
drop policy if exists organizations_u on public.organizations;
create policy organizations_u on public.organizations for update to authenticated
  using (id = public.my_org() and public.my_role() = 'admin') with check (id = public.my_org());

-- Codes d'activation (super admin uniquement)
create table if not exists public.company_codes (
  code text primary key default upper(substr(md5(random()::text || clock_timestamp()::text),1,8)),
  company_name text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  org_id uuid references public.organizations on delete set null);
alter table public.company_codes enable row level security;
drop policy if exists company_codes_r on public.company_codes;
create policy company_codes_r on public.company_codes for select to authenticated using (public.is_platform_admin());
drop policy if exists company_codes_i on public.company_codes;
create policy company_codes_i on public.company_codes for insert to authenticated with check (public.is_platform_admin());

create or replace function public.create_company_code(p_name text) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  if not public.is_platform_admin() then raise exception 'Réservé au super administrateur.'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Indiquez le nom de l’entreprise.'; end if;
  insert into company_codes(company_name) values (trim(p_name)) returning code into c;
  return c;
end $$;

-- L'abonné crée son entreprise avec le code reçu (il devient administrateur)
create or replace function public.redeem_company_code(p_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare cc record; o uuid;
begin
  if (select org_id from profiles where id = auth.uid()) is not null then raise exception 'Vous appartenez déjà à une entreprise.'; end if;
  select * into cc from company_codes where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Code invalide.'; end if;
  if cc.used_at is not null then raise exception 'Ce code a déjà été utilisé.'; end if;
  insert into organizations(name) values (cc.company_name) returning id into o;
  insert into profiles(id, org_id, role) values (auth.uid(), o, 'admin')
    on conflict (id) do update set org_id = o, role = 'admin';
  update company_codes set used_at = now(), org_id = o where code = cc.code;
  return o;
end $$;

notify pgrst, 'reload schema';

-- ===== Contrôle de la plateforme =====
-- KaPya ERP — contrôle de la plateforme : statut et échéance par entreprise, super admin voit toutes les entreprises.
-- Une entreprise suspendue ou expirée n'a plus accès à aucune donnée (toutes les règles passent par my_org()).
-- À exécuter dans Supabase > SQL Editor. Sans danger à relancer.

alter table public.organizations add column if not exists status text not null default 'active';
alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations add constraint organizations_status_check check (status in ('active','suspended'));
alter table public.organizations add column if not exists expires_at date;
alter table public.organizations add column if not exists plan text not null default 'standard';

-- Point de contrôle unique : une entreprise active et non expirée, sinon aucun accès
create or replace function public.my_org() returns uuid language sql stable security definer set search_path=public as $$
  select o.id from profiles p join organizations o on o.id = p.org_id
  where p.id = auth.uid() and o.status = 'active' and (o.expires_at is null or o.expires_at >= current_date) $$;

-- Super admin : voit et gère toutes les entreprises
drop policy if exists organizations_pa on public.organizations;
create policy organizations_pa on public.organizations for select to authenticated using (public.is_platform_admin());
drop policy if exists organizations_pu on public.organizations;
create policy organizations_pu on public.organizations for update to authenticated using (public.is_platform_admin()) with check (true);

notify pgrst, 'reload schema';
-- KaPya ERP — suivi des crédits et enregistrement des versements.

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  sale_id uuid not null references public.sales on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  kind text not null default 'payment' check (kind in ('initial','payment')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists sale_payments_initial_uq
  on public.sale_payments(sale_id) where kind = 'initial';
create index if not exists sale_payments_org_date_idx
  on public.sale_payments(org_id, paid_at desc);

alter table public.sale_payments enable row level security;
drop policy if exists sale_payments_r on public.sale_payments;
create policy sale_payments_r on public.sale_payments
  for select to authenticated using (org_id = public.my_org());

-- Reconstitue les acomptes déjà saisis avant l'installation du suivi des paiements.
insert into public.sale_payments(org_id, sale_id, amount, paid_at, kind, created_by)
select s.org_id, s.id, s.paid, s.sold_at, 'initial', null
from public.sales s
where s.payment = 'credit' and s.paid > 0
on conflict (sale_id) where kind = 'initial' do nothing;

create or replace function public.guard_credit_paid_amount() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_receipts numeric;
begin
  select coalesce(sum(p.amount), 0) into v_receipts
  from public.sale_payments p where p.sale_id = old.id and p.org_id = old.org_id;
  if new.paid < v_receipts then
    raise exception 'Le montant payé ne peut pas être inférieur aux versements déjà enregistrés.';
  end if;
  return new;
end $$;

drop trigger if exists t_guard_credit_paid_amount on public.sales;
create trigger t_guard_credit_paid_amount before update of paid on public.sales
  for each row execute function public.guard_credit_paid_amount();

create or replace function public.record_credit_payment(
  p_sale_id uuid, p_amount numeric, p_paid_at date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales%rowtype;
  v_total numeric;
  v_payment_id uuid;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then
    raise exception 'Vous n’avez pas le droit d’enregistrer un paiement.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;

  select * into v_sale from public.sales
  where id = p_sale_id and org_id = public.my_org()
  for update;
  if not found then raise exception 'Facture introuvable dans votre entreprise.'; end if;
  if v_sale.payment <> 'credit' then raise exception 'Cette facture n’est pas à crédit.'; end if;

  select coalesce(sum(l.qty * l.unit_price), 0) into v_total
  from public.sale_lines l where l.sale_id = v_sale.id and l.org_id = v_sale.org_id;
  if p_amount > v_total - coalesce(v_sale.paid, 0) then
    raise exception 'Le paiement dépasse le solde restant (%).', greatest(v_total - coalesce(v_sale.paid, 0), 0);
  end if;

  insert into public.sale_payments(org_id, sale_id, amount, paid_at, kind, created_by)
  values (v_sale.org_id, v_sale.id, p_amount, coalesce(p_paid_at, current_date), 'payment', auth.uid())
  returning id into v_payment_id;

  update public.sales set paid = coalesce(paid, 0) + p_amount where id = v_sale.id;
  return v_payment_id;
end $$;

revoke all on function public.record_credit_payment(uuid, numeric, date) from public, anon;
grant execute on function public.record_credit_payment(uuid, numeric, date) to authenticated;

notify pgrst, 'reload schema';

-- KaPya ERP — suivi des crédits et enregistrement des versements.

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  sale_id uuid not null references public.sales on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  kind text not null default 'payment' check (kind in ('initial','payment')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists sale_payments_initial_uq
  on public.sale_payments(sale_id) where kind = 'initial';
create index if not exists sale_payments_org_date_idx
  on public.sale_payments(org_id, paid_at desc);

alter table public.sale_payments enable row level security;
drop policy if exists sale_payments_r on public.sale_payments;
create policy sale_payments_r on public.sale_payments
  for select to authenticated using (org_id = public.my_org());

-- Reconstitue les acomptes déjà saisis avant l'installation du suivi des paiements.
insert into public.sale_payments(org_id, sale_id, amount, paid_at, kind, created_by)
select s.org_id, s.id, s.paid, s.sold_at, 'initial', null
from public.sales s
where s.payment = 'credit' and s.paid > 0
on conflict (sale_id) where kind = 'initial' do nothing;

create or replace function public.guard_credit_paid_amount() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_receipts numeric;
begin
  select coalesce(sum(p.amount), 0) into v_receipts
  from public.sale_payments p where p.sale_id = old.id and p.org_id = old.org_id;
  if new.paid < v_receipts then
    raise exception 'Le montant payé ne peut pas être inférieur aux versements déjà enregistrés.';
  end if;
  return new;
end $$;

drop trigger if exists t_guard_credit_paid_amount on public.sales;
create trigger t_guard_credit_paid_amount before update of paid on public.sales
  for each row execute function public.guard_credit_paid_amount();

create or replace function public.record_credit_payment(
  p_sale_id uuid, p_amount numeric, p_paid_at date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales%rowtype;
  v_total numeric;
  v_payment_id uuid;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then
    raise exception 'Vous n’avez pas le droit d’enregistrer un paiement.';
  end if;
  if p_amount is null then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  p_amount := round(p_amount, 2);
  if p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;

  select * into v_sale from public.sales
  where id = p_sale_id and org_id = public.my_org()
  for update;
  if not found then raise exception 'Facture introuvable dans votre entreprise.'; end if;
  if v_sale.payment <> 'credit' then raise exception 'Cette facture n’est pas à crédit.'; end if;

  select round(coalesce(sum(l.qty * l.unit_price), 0), 2) into v_total
  from public.sale_lines l where l.sale_id = v_sale.id and l.org_id = v_sale.org_id;
  if p_amount > v_total - coalesce(v_sale.paid, 0) then
    raise exception 'Le paiement dépasse le solde restant (%).', greatest(v_total - coalesce(v_sale.paid, 0), 0);
  end if;

  insert into public.sale_payments(org_id, sale_id, amount, paid_at, kind, created_by)
  values (v_sale.org_id, v_sale.id, p_amount, coalesce(p_paid_at, current_date), 'payment', auth.uid())
  returning id into v_payment_id;

  update public.sales set paid = coalesce(paid, 0) + p_amount where id = v_sale.id;
  return v_payment_id;
end $$;

revoke all on function public.record_credit_payment(uuid, numeric, date) from public, anon;
grant execute on function public.record_credit_payment(uuid, numeric, date) to authenticated;

notify pgrst, 'reload schema';

-- Paiements de crédit hors ligne : même identifiant lors de chaque tentative pour éviter les doublons.
-- Remplace l'ancienne signature à trois paramètres par une signature compatible avec les anciens appels.

drop function if exists public.record_credit_payment(uuid, numeric, date);

create function public.record_credit_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_paid_at date default current_date,
  p_id uuid default gen_random_uuid()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales%rowtype;
  v_payment public.sale_payments%rowtype;
  v_total numeric;
  v_role text := public.my_role();
begin
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
end $$;

revoke all on function public.record_credit_payment(uuid, numeric, date, uuid) from public, anon;
grant execute on function public.record_credit_payment(uuid, numeric, date, uuid) to authenticated;
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

