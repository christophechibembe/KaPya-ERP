-- KaPya ERP — rôles et droits : Gérant, Responsable, Facturier, Comptable, Lecture seule.
-- À exécuter dans Supabase > SQL Editor (une fois). Sans danger à relancer.

-- 1. Rôles autorisés
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','manager','facturier','comptable','user'));
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check check (role in ('manager','facturier','comptable','user'));

-- 2. Qui peut CRÉER (ventes et clients : facturier aussi ; achats, articles, fournisseurs : gérant et responsable)
drop policy if exists sales_i on public.sales;
create policy sales_i on public.sales for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));
drop policy if exists sale_lines_i on public.sale_lines;
create policy sale_lines_i on public.sale_lines for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));

drop policy if exists customers_i on public.customers;
create policy customers_i on public.customers for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));
drop policy if exists customers_u on public.customers;
create policy customers_u on public.customers for update to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','facturier'));

drop policy if exists purchases_i on public.purchases;
create policy purchases_i on public.purchases for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));
drop policy if exists purchase_lines_i on public.purchase_lines;
create policy purchase_lines_i on public.purchase_lines for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));

drop policy if exists suppliers_i on public.suppliers;
create policy suppliers_i on public.suppliers for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));
drop policy if exists articles_i on public.articles;
create policy articles_i on public.articles for insert to authenticated with check (org_id=public.my_org() and public.my_role() in ('admin','manager'));

-- 3. Qui peut LIRE les achats et fournisseurs : gérant, responsable, comptable, lecture seule (pas le facturier)
drop policy if exists purchases_r on public.purchases;
create policy purchases_r on public.purchases for select to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','comptable','user'));
drop policy if exists purchase_lines_r on public.purchase_lines;
create policy purchase_lines_r on public.purchase_lines for select to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','comptable','user'));
drop policy if exists suppliers_r on public.suppliers;
create policy suppliers_r on public.suppliers for select to authenticated using (org_id=public.my_org() and public.my_role() in ('admin','manager','comptable','user'));
