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
