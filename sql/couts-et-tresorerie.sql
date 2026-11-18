-- KaPya ERP : coût d'achat figé par vente et journal des sorties de trésorerie.
-- À exécuter dans Supabase > SQL Editor. Les coûts historiques sont marqués estimatifs.

create table if not exists public.sale_cost_snapshots (
  sale_line_id uuid primary key references public.sale_lines on delete cascade,
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  unit_cost_at_sale numeric(14,2) not null default 0,
  cost_is_estimated boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.sale_cost_snapshots enable row level security;
drop policy if exists sale_cost_snapshots_r on public.sale_cost_snapshots;
create policy sale_cost_snapshots_r on public.sale_cost_snapshots for select to authenticated
  using (org_id = public.my_org() and public.my_role() = 'admin');

-- Les anciennes ventes n'ont pas de coût historique : leur prix actuel est un repère estimatif.
insert into public.sale_cost_snapshots(sale_line_id,org_id,unit_cost_at_sale,cost_is_estimated)
select sl.id,sl.org_id,coalesce(a.price_buy,0),true
from public.sale_lines sl join public.articles a on a.id = sl.article_id
on conflict (sale_line_id) do nothing;

create or replace function public.snapshot_sale_line_cost() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.sale_cost_snapshots(sale_line_id,org_id,unit_cost_at_sale,cost_is_estimated)
  select new.id,new.org_id,coalesce(a.price_buy,0),false
  from public.articles a where a.id = new.article_id and a.org_id = new.org_id;
  if not found then raise exception 'Article introuvable dans votre entreprise.'; end if;
  return null;
end $$;
drop trigger if exists t_snapshot_sale_line_cost on public.sale_lines;
create trigger t_snapshot_sale_line_cost after insert on public.sale_lines
for each row execute function public.snapshot_sale_line_cost();

-- Anciennes factures : le montant réellement encore dû est inconnu, donc il doit être initialisé explicitement.
-- Le solde est isolé dans une table réservée au gérant, car les autres rôles peuvent lire les achats.
create table if not exists public.purchase_payment_balances (
  purchase_id uuid primary key references public.purchases on delete restrict,
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  opening_balance numeric(14,2) not null check (opening_balance >= 0),
  created_at timestamptz not null default now()
);
alter table public.purchase_payment_balances enable row level security;
drop policy if exists purchase_payment_balances_r on public.purchase_payment_balances;
create policy purchase_payment_balances_r on public.purchase_payment_balances for select to authenticated
  using (org_id = public.my_org() and public.my_role() = 'admin');

create or replace function public.initialize_new_purchase_balance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.purchase_payment_balances(purchase_id, org_id, opening_balance)
  select new.purchase_id, new.org_id, (
    select coalesce(sum(l.qty * l.unit_cost), 0) from public.purchase_lines l
    where l.purchase_id = new.purchase_id and l.org_id = new.org_id
  )
  on conflict (purchase_id) do update set opening_balance = excluded.opening_balance;
  return null;
end $$;
drop trigger if exists t_initialize_new_purchase_balance on public.purchase_lines;
create trigger t_initialize_new_purchase_balance after insert on public.purchase_lines
for each row execute function public.initialize_new_purchase_balance();

create table if not exists public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  purchase_id uuid not null references public.purchases on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists purchase_payments_org_paid_idx on public.purchase_payments(org_id, paid_at desc);
alter table public.purchase_payments enable row level security;
drop policy if exists purchase_payments_r on public.purchase_payments;
create policy purchase_payments_r on public.purchase_payments for select to authenticated
  using (org_id = public.my_org() and public.my_role() = 'admin');

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org() references public.organizations on delete cascade,
  label text not null check (length(trim(label)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 60),
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists business_expenses_org_paid_idx on public.business_expenses(org_id, paid_at desc);
alter table public.business_expenses enable row level security;
drop policy if exists business_expenses_r on public.business_expenses;
create policy business_expenses_r on public.business_expenses for select to authenticated
  using (org_id = public.my_org() and public.my_role() = 'admin');

create or replace function public.initialize_purchase_balance(p_purchase_id uuid, p_remaining numeric)
returns uuid language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public.initialize_purchase_balance(uuid,numeric) from public, anon;
grant execute on function public.initialize_purchase_balance(uuid,numeric) to authenticated;

create or replace function public.record_purchase_payment(p_purchase_id uuid, p_amount numeric, p_paid_at date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public.record_purchase_payment(uuid,numeric,date) from public, anon;
grant execute on function public.record_purchase_payment(uuid,numeric,date) to authenticated;

create or replace function public.record_business_expense(p_label text, p_category text, p_amount numeric, p_paid_at date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
begin
  if auth.uid() is null or coalesce(public.my_role() <> 'admin', true) then raise exception 'Seul le gérant peut enregistrer une dépense.'; end if;
  if length(trim(coalesce(p_label,''))) not between 1 and 120 then raise exception 'Indiquez une description (120 caractères maximum).'; end if;
  if length(trim(coalesce(p_category,''))) not between 1 and 60 then raise exception 'Indiquez une catégorie (60 caractères maximum).'; end if;
  if v_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  insert into public.business_expenses(id, org_id, label, category, amount, paid_at, created_by)
  values (v_id, public.my_org(), trim(p_label), trim(p_category), v_amount, coalesce(p_paid_at,current_date), auth.uid());
  return v_id;
end $$;
revoke all on function public.record_business_expense(text,text,numeric,date) from public, anon;
grant execute on function public.record_business_expense(text,text,numeric,date) to authenticated;

notify pgrst, 'reload schema';
