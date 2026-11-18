-- KaPya ERP : taux du jour réservé à l'admin et au responsable. Idempotent.
-- Réserve la modification du taux de change à l'administrateur de l'entreprise.
drop policy if exists settings_i on public.settings;
drop policy if exists settings_u on public.settings;

create policy settings_i on public.settings
  for insert to authenticated
  with check (org_id=public.my_org() and public.my_role()='admin');

create policy settings_u on public.settings
  for update to authenticated
  using (org_id=public.my_org() and public.my_role()='admin')
  with check (org_id=public.my_org() and public.my_role()='admin');
