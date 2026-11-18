-- KaPya ERP — restreint à `authenticated` les politiques accordées à `public`.
--
-- Ces 7 politiques visaient `public` (tous les rôles). `anon` ne pouvait déjà rien
-- lire ni écrire : my_org() et auth.uid() renvoient null sans session. Les restreindre
-- ferme proprement la porte, sans changer le comportement des comptes connectés ni de
-- service_role (qui contourne RLS).
--
-- Vérifié avant application : 7 politiques, 110 politiques au total en production.
-- Après application : plus aucune politique accordée à `public`.

alter policy number_ranges_org on public.number_ranges to authenticated;
alter policy pay_insert on public.paiements_abonnement to authenticated;
alter policy pay_read_own on public.paiements_abonnement to authenticated;
alter policy push_own on public.push_subscriptions to authenticated;
alter policy warehouse_stock_r on public.warehouse_stock to authenticated;
alter policy worker_payments_admin on public.worker_payments to authenticated;
alter policy workers_admin on public.workers to authenticated;
