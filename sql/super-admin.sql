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
