-- KaPya ERP : historique des actions (qui a créé, modifié ou supprimé/annulé une vente, un achat, un paiement).
-- À exécuter une fois dans Supabase > SQL Editor, après le script de clôture de caisse.
-- Sans danger à relancer. N'efface aucune donnée existante.

-- 1) Journal en ajout seul : personne ne peut le modifier ni le vider depuis l'application.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users on delete set null,
  actor_name text not null default '',
  actor_role text not null default '',
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert','update','delete')),
  summary text not null default '',
  before_data jsonb,
  after_data jsonb
);

create index if not exists audit_log_org_time_idx on public.audit_log (org_id, occurred_at desc);
create index if not exists audit_log_record_idx on public.audit_log (record_id);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select to authenticated
  using (org_id = public.my_org() and public.my_role() in ('admin','manager'));
revoke all on table public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;

-- 2) Fonction de journalisation (s'exécute avec les droits du propriétaire pour écrire dans le journal).
create or replace function public.audit_row_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- 3) Déclencheurs. La suppression des pièces est journalisée AVANT l'effacement, pour garder leurs lignes.
drop trigger if exists audit_sales_insert_update on public.sales;
create trigger audit_sales_insert_update after insert or update on public.sales
  for each row execute function public.audit_row_change();
drop trigger if exists audit_sales_delete on public.sales;
create trigger audit_sales_delete before delete on public.sales
  for each row execute function public.audit_row_change();

drop trigger if exists audit_purchases_insert_update on public.purchases;
create trigger audit_purchases_insert_update after insert or update on public.purchases
  for each row execute function public.audit_row_change();
drop trigger if exists audit_purchases_delete on public.purchases;
create trigger audit_purchases_delete before delete on public.purchases
  for each row execute function public.audit_row_change();

drop trigger if exists audit_sale_payments on public.sale_payments;
create trigger audit_sale_payments after insert or update or delete on public.sale_payments
  for each row execute function public.audit_row_change();

drop trigger if exists audit_customer_deposits on public.customer_deposits;
create trigger audit_customer_deposits after insert or update or delete on public.customer_deposits
  for each row execute function public.audit_row_change();

drop trigger if exists audit_purchase_payments on public.purchase_payments;
create trigger audit_purchase_payments after insert or update or delete on public.purchase_payments
  for each row execute function public.audit_row_change();

drop trigger if exists audit_business_expenses on public.business_expenses;
create trigger audit_business_expenses after insert or update or delete on public.business_expenses
  for each row execute function public.audit_row_change();

drop trigger if exists audit_cash_closures on public.cash_closures;
create trigger audit_cash_closures after insert or update on public.cash_closures
  for each row execute function public.audit_row_change();

revoke all on function public.audit_row_change() from public, anon, authenticated;

notify pgrst, 'reload schema';
