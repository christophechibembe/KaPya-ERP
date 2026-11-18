-- KaPya ERP : restauration d'une sauvegarde (fichier JSON exporté depuis l'écran Sauvegarde).
-- À exécuter une fois dans Supabase > SQL Editor, après historique-actions.sql.
-- Sans danger à relancer. N'écrit que dans une entreprise vide, dans une seule transaction :
-- en cas d'erreur, rien n'est enregistré.

create or replace function public.restore_backup(p_data jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.my_org();
  -- Ordre de restauration : chaque table n'arrive qu'après celles qu'elle référence.
  v_tables text[] := array[
    'settings','warehouses','customers','suppliers','articles','invoice_counters','customer_deposit_counters',
    'sales','sale_lines','customer_deposits','sale_payments','sale_cost_snapshots',
    'purchases','purchase_lines','purchase_payments','purchase_payment_balances',
    'stock_moves','business_expenses','cash_closures','transfers','transfer_lines','audit_log'];
  v_name text;
  v_rows jsonb;
  v_fixed jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or v_org is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() <> 'admin' then raise exception 'Seul le gérant peut restaurer une sauvegarde.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Fichier de sauvegarde invalide.'; end if;

  -- Verrou sur l'entreprise : deux restaurations simultanées ne peuvent pas se chevaucher.
  perform 1 from public.organizations o where o.id = v_org for update;
  if exists (select 1 from public.sales where org_id = v_org)
     or exists (select 1 from public.purchases where org_id = v_org)
     or exists (select 1 from public.customers where org_id = v_org)
     or exists (select 1 from public.articles where org_id = v_org) then
    raise exception 'La restauration n’est possible que dans une entreprise vide (aucune vente, achat, client ni produit).';
  end if;

  -- Dépôts : ceux de la sauvegarde remplacent le dépôt principal créé à l'avance (entreprise vide).
  delete from public.warehouses where org_id = v_org;

  -- Les déclencheurs métier (stock, coûts, numérotation, historique) sont désactivés le temps de l'import :
  -- stocks et coûts viennent de la sauvegarde telle quelle, sans double comptage.
  -- Les contraintes de clés étrangères restent actives.
  foreach v_name in array v_tables loop
    execute format('alter table public.%I disable trigger user', v_name);
  end loop;

  foreach v_name in array v_tables loop
    v_rows := coalesce(p_data -> v_name, '[]'::jsonb);
    if jsonb_typeof(v_rows) <> 'array' then raise exception 'Table « % » invalide dans la sauvegarde.', v_name; end if;
    if jsonb_array_length(v_rows) > 0 then
      -- Rattache chaque ligne à l'entreprise courante.
      -- Le numéro du journal est attribué par la base (il est unique pour toutes les entreprises).
      select coalesce(jsonb_agg((case when v_name = 'audit_log' then r - 'id' else r end)
                        || jsonb_build_object('org_id', v_org)), '[]'::jsonb)
        into v_fixed
      from jsonb_array_elements(v_rows) r;
      if v_name = 'audit_log' then
        execute 'insert into public.audit_log (org_id, occurred_at, actor_id, actor_name, actor_role, table_name, record_id, action, summary, before_data, after_data)
                 select org_id, occurred_at, actor_id, actor_name, actor_role, table_name, record_id, action, summary, before_data, after_data
                 from jsonb_populate_recordset(null::public.audit_log, $1)'
          using v_fixed;
      else
        execute format(
          'insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I, $1)',
          v_name, v_name)
          using v_fixed;
      end if;
    end if;
    v_counts := v_counts || jsonb_build_object(v_name, jsonb_array_length(v_rows));
  end loop;

  foreach v_name in array v_tables loop
    execute format('alter table public.%I enable trigger user', v_name);
  end loop;

  -- Sauvegardes anciennes (sans dépôts) : tout va au dépôt principal. Puis stock par dépôt recalculé.
  perform public.warehouse_of_org(v_org);
  update public.sales set warehouse_id = public.warehouse_of_org(v_org) where org_id = v_org and warehouse_id is null;
  update public.purchases set warehouse_id = public.warehouse_of_org(v_org) where org_id = v_org and warehouse_id is null;
  update public.sale_lines l set warehouse_id = s.warehouse_id from public.sales s
    where s.id = l.sale_id and l.org_id = v_org and l.warehouse_id is null;
  update public.purchase_lines l set warehouse_id = pu.warehouse_id from public.purchases pu
    where pu.id = l.purchase_id and l.org_id = v_org and l.warehouse_id is null;
  update public.transfers set from_warehouse_id = public.warehouse_of_org(v_org)
    where org_id = v_org and from_warehouse_id is null;
  update public.stock_moves set warehouse_id = public.warehouse_of_org(v_org) where org_id = v_org and warehouse_id is null;
  perform public.rebuild_warehouse_stock(v_org);


  -- Le numéro du journal repart après les lignes restaurées.
  perform setval(pg_get_serial_sequence('public.audit_log', 'id'),
    greatest((select coalesce(max(a.id), 0) from public.audit_log a), 1), true);

  -- Contrôle non bloquant : le stock de chaque produit doit correspondre à la somme de ses mouvements.
  select coalesce(jsonb_agg(jsonb_build_object(
           'produit', a.name, 'stock', a.stock, 'mouvements', coalesce(m.total, 0))), '[]'::jsonb)
    into v_warnings
  from public.articles a
  left join (select article_id, sum(qty) as total from public.stock_moves
             where org_id = v_org group by article_id) m on m.article_id = a.id
  where a.org_id = v_org and a.stock <> coalesce(m.total, 0);

  insert into public.audit_log (org_id, actor_id, actor_name, actor_role, table_name, record_id, action, summary, after_data)
  select v_org, auth.uid(), coalesce(p.full_name, ''), coalesce(p.role, ''), 'sauvegarde', null, 'insert',
         'Restauration de sauvegarde', jsonb_build_object('counts', v_counts)
  from public.profiles p where p.id = auth.uid();

  return jsonb_build_object('counts', v_counts, 'warnings', v_warnings);
end;
$$;

revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;

notify pgrst, 'reload schema';
