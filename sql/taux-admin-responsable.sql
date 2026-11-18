-- KaPya ERP : taux du jour modifiable par l'admin ET le responsable (aligné sur roles.js). Idempotent.
drop policy if exists settings_i on public.settings;
drop policy if exists settings_u on public.settings;

create policy settings_i on public.settings
  for insert to authenticated
  with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));

create policy settings_u on public.settings
  for update to authenticated
  using (org_id=public.my_org() and public.my_role() in ('admin','manager'))
  with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));
