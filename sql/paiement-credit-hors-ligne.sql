-- Paiements de crédit hors ligne : même identifiant lors de chaque tentative pour éviter les doublons.
-- Remplace l'ancienne signature à trois paramètres par une signature compatible avec les anciens appels.

drop function if exists public.record_credit_payment(uuid, numeric, date);

create function public.record_credit_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_paid_at date default current_date,
  p_id uuid default gen_random_uuid()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales%rowtype;
  v_payment public.sale_payments%rowtype;
  v_total numeric;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then
    raise exception 'Vous n’avez pas le droit d’enregistrer un paiement.';
  end if;
  if p_id is null then raise exception 'Identifiant de paiement manquant.'; end if;
  if p_amount is null then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  p_amount := round(p_amount, 2);
  if p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;

  select * into v_sale from public.sales
  where id = p_sale_id and org_id = public.my_org()
  for update;
  if not found then raise exception 'Facture introuvable dans votre entreprise.'; end if;

  -- Une réponse réseau perdue peut entraîner une nouvelle tentative après validation côté serveur.
  select * into v_payment from public.sale_payments where id = p_id;
  if found then
    if v_payment.org_id = v_sale.org_id and v_payment.sale_id = p_sale_id
       and v_payment.amount = p_amount and v_payment.paid_at = coalesce(p_paid_at, current_date)
       and v_payment.kind = 'payment' then
      return v_payment.id;
    end if;
    raise exception 'Cet identifiant de paiement est déjà utilisé.';
  end if;

  if v_sale.payment <> 'credit' then raise exception 'Cette facture n’est pas à crédit.'; end if;
  select round(coalesce(sum(l.qty * l.unit_price), 0), 2) into v_total
  from public.sale_lines l where l.sale_id = v_sale.id and l.org_id = v_sale.org_id;
  if p_amount > v_total - coalesce(v_sale.paid, 0) then
    raise exception 'Le paiement dépasse le solde restant (%).', greatest(v_total - coalesce(v_sale.paid, 0), 0);
  end if;

  insert into public.sale_payments(id, org_id, sale_id, amount, paid_at, kind, created_by)
  values (p_id, v_sale.org_id, v_sale.id, p_amount, coalesce(p_paid_at, current_date), 'payment', auth.uid());
  update public.sales set paid = coalesce(paid, 0) + p_amount where id = v_sale.id;
  return p_id;
end $$;

revoke all on function public.record_credit_payment(uuid, numeric, date, uuid) from public, anon;
grant execute on function public.record_credit_payment(uuid, numeric, date, uuid) to authenticated;
notify pgrst, 'reload schema';
