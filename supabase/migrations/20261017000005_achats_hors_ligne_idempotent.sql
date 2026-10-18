-- Achats hors ligne : conserve le même identifiant à chaque tentative de synchronisation.
-- Les mouvements de stock restent exécutés par le déclencheur purchase_lines existant.

drop function if exists public.create_purchase(uuid, text, date, jsonb);
drop function if exists public.create_purchase(uuid, text, date, jsonb, uuid, numeric);

create function public.create_purchase(
  p_supplier uuid,
  p_number text,
  p_date date,
  p_lines jsonb,
  p_id uuid default null,
  p_usd_cdf numeric default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_line record;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if public.my_role() not in ('admin','manager') then raise exception 'Vous n’avez pas le droit d’enregistrer un achat.'; end if;
  if p_id is not null and exists (select 1 from public.purchases where id = p_id and org_id = public.my_org()) then return p_id; end if;
  if p_supplier is null or not exists (select 1 from public.suppliers where id = p_supplier and org_id = public.my_org()) then
    raise exception 'Fournisseur introuvable dans votre entreprise.';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Ajoutez au moins une ligne.'; end if;
  if (select count(*) from jsonb_array_elements(p_lines) l
      join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org()) <> jsonb_array_length(p_lines) then
    raise exception 'Un article est introuvable dans votre entreprise.';
  end if;

  insert into public.purchases(id, supplier_id, number, bought_at, usd_cdf)
  values (v_id, p_supplier, p_number, coalesce(p_date, current_date), coalesce(p_usd_cdf, (select usd_cdf from public.settings limit 1)));
  insert into public.purchase_lines(purchase_id, article_id, qty, unit_cost)
  select v_id, (l->>'article_id')::uuid, (l->>'qty')::numeric, (l->>'unit_cost')::numeric
  from jsonb_array_elements(p_lines) l
  join public.articles a on a.id = (l->>'article_id')::uuid and a.org_id = public.my_org();
  return v_id;
end $$;

revoke all on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric) from public, anon;
grant execute on function public.create_purchase(uuid, text, date, jsonb, uuid, numeric) to authenticated;
notify pgrst, 'reload schema';
