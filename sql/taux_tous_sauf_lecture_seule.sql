-- Autorise tous les rôles opérationnels à modifier le taux, sauf Lecture seule.
drop policy if exists settings_i on public.settings;
drop policy if exists settings_u on public.settings;

create policy settings_i on public.settings
  for insert to authenticated
  with check (
    org_id = public.my_org()
    and public.my_role() in ('admin', 'manager', 'facturier', 'comptable')
  );

create policy settings_u on public.settings
  for update to authenticated
  using (
    org_id = public.my_org()
    and public.my_role() in ('admin', 'manager', 'facturier', 'comptable')
  )
  with check (
    org_id = public.my_org()
    and public.my_role() in ('admin', 'manager', 'facturier', 'comptable')
  );
