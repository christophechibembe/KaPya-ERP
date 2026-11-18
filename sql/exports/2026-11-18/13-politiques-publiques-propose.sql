-- KaPya ERP — restriction des politiques accordées au rôle public.
-- PROPOSITION — fichier non appliqué.
-- Ces 7 politiques visent `public` (tous les rôles). anon ne peut rien lire
-- ni écrire : my_org() et auth.uid() renvoient null sans session. Les restreindre à
-- authenticated ferme proprement la porte, sans changer le comportement des comptes
-- connectés ni de service_role (qui contourne RLS).
-- À relire, tester sur un projet de test, puis appliquer en une transaction.

alter policy number_ranges_org on public.number_ranges to authenticated;
alter policy pay_insert on public.paiements_abonnement to authenticated;
alter policy pay_read_own on public.paiements_abonnement to authenticated;
alter policy push_own on public.push_subscriptions to authenticated;
alter policy warehouse_stock_r on public.warehouse_stock to authenticated;
alter policy worker_payments_admin on public.worker_payments to authenticated;
alter policy workers_admin on public.workers to authenticated;
