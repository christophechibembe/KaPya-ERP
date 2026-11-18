-- KaPya ERP — correctif des invitations : règles simples, sans fonctions auxiliaires.
-- À exécuter dans Supabase > SQL Editor. Sans danger à relancer.

drop policy if exists invitations_i on public.invitations;
create policy invitations_i on public.invitations for insert to authenticated
  with check (org_id in (select p.org_id from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists invitations_r on public.invitations;
create policy invitations_r on public.invitations for select to authenticated
  using (org_id in (select p.org_id from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists invitations_d on public.invitations;
create policy invitations_d on public.invitations for delete to authenticated
  using (org_id in (select p.org_id from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
