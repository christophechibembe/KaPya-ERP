-- Autorise la modification et l'annulation des versements crédit existants.
create or replace function public.update_credit_payment(p_payment_id uuid, p_amount numeric, p_paid_at date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_payment public.sale_payments%rowtype;
  v_sale public.sales%rowtype;
  v_total numeric;
  v_new_paid numeric;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then raise exception 'Vous n’avez pas le droit de modifier un paiement.'; end if;
  p_amount := round(coalesce(p_amount, 0), 2);
  if p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  select * into v_payment from public.sale_payments where id = p_payment_id and org_id = public.my_org() and kind in ('payment', 'initial') for update;
  if not found then raise exception 'Paiement introuvable ou non modifiable.'; end if;
  select * into v_sale from public.sales where id = v_payment.sale_id and org_id = public.my_org() for update;
  if not found then raise exception 'Facture introuvable.'; end if;
  select round(coalesce(sum(l.qty * l.unit_price), 0), 2) into v_total from public.sale_lines l where l.sale_id = v_sale.id and l.org_id = v_sale.org_id;
  v_new_paid := coalesce(v_sale.paid, 0) - v_payment.amount + p_amount;
  if v_new_paid > v_total then raise exception 'Le nouveau montant dépasse le total de la facture.'; end if;
  update public.sale_payments set amount = p_amount, paid_at = coalesce(p_paid_at, current_date) where id = v_payment.id;
  update public.sales set paid = v_new_paid where id = v_sale.id;
end $$;

create or replace function public.cancel_credit_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.sale_payments%rowtype;
  v_sale public.sales%rowtype;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier','comptable'), true) then raise exception 'Vous n’avez pas le droit d’annuler un paiement.'; end if;
  select * into v_payment from public.sale_payments where id = p_payment_id and org_id = public.my_org() and kind in ('payment', 'initial') for update;
  if not found then raise exception 'Paiement introuvable ou non annulable.'; end if;
  select * into v_sale from public.sales where id = v_payment.sale_id and org_id = public.my_org() for update;
  if not found then raise exception 'Facture introuvable.'; end if;
  delete from public.sale_payments where id = v_payment.id;
  update public.sales set paid = greatest(coalesce(paid, 0) - v_payment.amount, 0) where id = v_sale.id;
end $$;

revoke all on function public.update_credit_payment(uuid, numeric, date) from public, anon;
revoke all on function public.cancel_credit_payment(uuid) from public, anon;
grant execute on function public.update_credit_payment(uuid, numeric, date) to authenticated;
grant execute on function public.cancel_credit_payment(uuid) to authenticated;
notify pgrst, 'reload schema';
