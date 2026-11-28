-- Ajustement de stock par un facturier autorisé dans son dépôt (28 novembre 2026).
-- Suite de 20261128000000, même autorisation : le gérant coche « Peut enregistrer les
-- entrées de stock dans son dépôt » ; le facturier peut alors utiliser « Ajuster »
-- dans Produits & Stocks, uniquement sur son dépôt, jamais sur les fiches articles.

-- La politique d'insertion des mouvements réservait l'ajustement aux gérants et
-- responsables. On ajoute le cas du facturier autorisé, borné à son dépôt.
drop policy if exists stock_moves_i on public.stock_moves;
create policy stock_moves_i on public.stock_moves
  as permissive for insert to authenticated
  with check (((org_id = my_org()) and (reason = 'adjustment') and (my_role() = any (array['admin','manager'])))
    or ((org_id = my_org()) and (reason = 'adjustment') and (my_role() = 'facturier')
        and (warehouse_id = my_shop())
        and (exists (select 1 from public.user_warehouses uw
                     where uw.user_id = auth.uid() and uw.warehouse_id = stock_moves.warehouse_id
                       and uw.can_receive_stock))));
