-- KaPya ERP — répare la table « invitations » si elle existe avec une ancienne structure.
-- Ajoute uniquement les colonnes manquantes (sans effacer de données). Sans danger à relancer.
-- À exécuter dans Supabase > SQL Editor.

create table if not exists public.invitations (
  code text primary key,
  org_id uuid references public.organizations on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days');

alter table public.invitations add column if not exists code text;
alter table public.invitations add column if not exists org_id uuid references public.organizations on delete cascade;
alter table public.invitations add column if not exists role text;
alter table public.invitations add column if not exists created_at timestamptz not null default now();
alter table public.invitations add column if not exists expires_at timestamptz not null default now() + interval '7 days';


-- Anciennes colonnes obligatoires : clé primaire -> valeur automatique ; autres -> facultatives
do $$ declare r record; pk text[]; begin
  select array_agg(a.attname::text) into pk from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'public.invitations'::regclass and i.indisprimary;
  for r in select column_name, column_default from information_schema.columns
           where table_schema='public' and table_name='invitations' and is_nullable='NO'
             and column_name not in ('code','org_id','role','created_at','expires_at') loop
    if pk is not null and r.column_name = any(pk) then
      if r.column_default is null then
        execute format('alter table public.invitations alter column %I set default gen_random_uuid()', r.column_name);
      end if;
    else
      execute format('alter table public.invitations alter column %I drop not null', r.column_name);
    end if;
  end loop;
end $$;

create unique index if not exists invitations_code_key on public.invitations (code);
alter table public.invitations enable row level security;

-- Recharge le cache de l'API (évite l'erreur « column not found in the schema cache »)
notify pgrst, 'reload schema';
