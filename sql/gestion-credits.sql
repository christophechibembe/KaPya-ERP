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

create or replace function public.update_credit_payment(p_payment_id uuid, p_amount numeric, p_paid_at date)
returns void language plpgsql security definer set search_path = public as $$
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
  select * into v_payment from public.sale_payments where id = p_payment_id and org_id = public.my_org() and kind in ('payment', 'initial') for update;
  if not found then raise exception 'Paiement introuvable ou non modifiable.'; end if;
  select * into v_sale from public.sales where id = v_payment.sale_id and org_id = public.my_org() for update;
  if not found then raise exception 'Facture introuvable.'; end if;
  select round(coalesce(sum(l.qty * l.unit_price), 0), 2) into v_total from public.sale_lines l where l.sale_id = v_sale.id and l.org_id = v_sale.org_id;
  v_new_paid := coalesce(v_sale.paid, 0) - v_payment.amount + p_amount;
  if v_new_paid > v_total then raise exception 'Le nouveau montant dépasse le total de la facture.'; end if;
  update public.sale_payments set amount = p_amount, paid_at = coalesce(p_paid_at, current_date) where id = v_payment.id;
  update public.sales set paid = v_new_paid where id = v_sale.id;
end $$;

create or replace function public.cancel_credit_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.sale_payments%rowtype;
  v_sale public.sales%rowtype;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then raise exception 'Vous n’avez pas le droit d’annuler un paiement.'; end if;
  select * into v_payment from public.sale_payments where id = p_payment_id and org_id = public.my_org() and kind in ('payment', 'initial') for update;
  if not found then raise exception 'Paiement introuvable ou non annulable.'; end if;
  select * into v_sale from public.sales where id = v_payment.sale_id and org_id = public.my_org() for update;
  if not found then raise exception 'Facture introuvable.'; end if;
  delete from public.sale_payments where id = v_payment.id;
  update public.sales set paid = greatest(coalesce(paid, 0) - v_payment.amount, 0) where id = v_sale.id;
end $$;

revoke all on function public.update_credit_payment(uuid, numeric, date) from public, anon;
revoke all on function public.cancel_credit_payment(uuid) from public, anon;
grant execute on function public.update_credit_payment(uuid, numeric, date) to authenticated;
grant execute on function public.cancel_credit_payment(uuid) to authenticated;

notify pgrst, 'reload schema';
