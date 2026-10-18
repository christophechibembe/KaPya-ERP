-- KaPya ERP — autoriser l'annulation d'une vente ou d'un achat (admin et manager).
-- Supprimer une pièce supprime ses lignes (cascade) ; les triggers remettent les stocks à jour.
-- À exécuter dans Supabase > SQL Editor. Sans danger à relancer.

drop policy if exists sales_d on public.sales;
create policy sales_d on public.sales for delete to authenticated
  using (org_id=public.my_org() and public.my_role() in ('admin','manager'));

drop policy if exists purchases_d on public.purchases;
create policy purchases_d on public.purchases for delete to authenticated
  using (org_id=public.my_org() and public.my_role() in ('admin','manager'));
