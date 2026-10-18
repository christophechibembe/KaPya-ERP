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
