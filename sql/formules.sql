-- KaPya ERP : formules basique / standard / premium. Idempotent : sans danger à relancer.
-- Ordre : ce fichier, puis sql/restauration.sql (version à jour).

-- 1. Valeurs autorisées pour la formule
update public.organizations set plan = 'standard' where plan is null or plan not in ('basique','standard','premium');
alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations add constraint organizations_plan_check check (plan in ('basique','standard','premium'));
alter table public.organizations alter column plan set default 'standard';

-- 2. Fonctions de contrôle (miroir de js/plans.js)
create or replace function public.plan_allows(p_feature text) returns boolean language sql stable security definer set search_path = public as $$
  select case (select o.plan from public.organizations o where o.id = public.my_org())
    when 'premium' then true
    when 'standard' then p_feature in ('depots','transferts','alertes','exports','sauvegarde','whatsapp')
    else false
  end
$$;

create or replace function public.plan_max_users() returns int language sql stable security definer set search_path = public as $$
  select case (select o.plan from public.organizations o where o.id = public.my_org())
    when 'basique' then 3
    when 'standard' then 10
    else 1000000
  end
$$;

-- 3. Seul l'administrateur de la plateforme change la formule, le statut ou l'échéance
create or replace function public.guard_org_plan() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.plan is distinct from old.plan or new.status is distinct from old.status or new.expires_at is distinct from old.expires_at)
     and not public.is_platform_admin() then
    raise exception 'Seul l’administrateur de la plateforme peut modifier la formule, le statut ou l’échéance.';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_org_plan on public.organizations;
create trigger t_guard_org_plan before update on public.organizations
  for each row execute function public.guard_org_plan();

-- 4. Dépôts supplémentaires : formule standard ou premium
drop policy if exists warehouses_i on public.warehouses;
create policy warehouses_i on public.warehouses for insert to authenticated
  with check (org_id = public.my_org() and public.my_role() in ('admin','manager') and not is_default and public.plan_allows('depots'));

-- 5. Transferts entre dépôts : formule standard ou premium
create or replace function public.guard_plan_transfers() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.plan_allows('transferts') then
    raise exception 'Les transferts entre dépôts ne sont pas inclus dans votre formule.';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_plan_transfers on public.transfers;
create trigger t_guard_plan_transfers before insert on public.transfers
  for each row execute function public.guard_plan_transfers();

-- 6. Historique des actions : formule premium
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated
  using (org_id = public.my_org() and public.my_role() in ('admin','manager') and public.plan_allows('historique'));

-- 7. Nombre d'utilisateurs : contrôlé à l'invitation (basique 3, standard 10, premium illimité)
drop policy if exists invitations_i on public.invitations;
create policy invitations_i on public.invitations for insert to authenticated
  with check (org_id = public.my_org() and public.my_role() = 'admin'
    and (select count(*) from public.profiles p where p.org_id = public.my_org()) < public.plan_max_users());
