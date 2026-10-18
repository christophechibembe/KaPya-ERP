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
