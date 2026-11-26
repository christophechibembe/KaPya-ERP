-- Suppression d'un acompte client (26 novembre 2026).
--
-- Motif : un acompte enregistré par erreur (mauvais client, double saisie, montant
-- faux) restait invisible dans l'interface : la table customer_deposits n'a que la
-- politique de lecture. Cette fonction est le seul chemin de suppression, avec les
-- mêmes garde-fous que create_customer_deposit (identifiant, organisation, droits).
--
-- Sécurité :
--   - SECURITY DEFINER avec search_path verrouillé (comme les autres fonctions) ;
--   - exécution refusée hors connexion (auth.uid()) et hors organisation (my_org) ;
--   - rôles autorisés alignés sur ventes.cancel : admin, manager, facturier ;
--   - refus si le dépôt est référencé par une facture (sale_payments, clé étrangère
--     ON DELETE RESTRICT) : on ne casse pas un règlement déjà imputé ;
--   - refus si le dépôt est déjà utilisé (remaining < amount) ;
--   - le décompte customer_deposit_counters n'est pas décrémenté : un numéro de
--     reçu déjà imprimé ne sera jamais réattribué ;
--   - la suppression déclenche le journal d'audit existant (audit_customer_deposits).
create or replace function public.delete_customer_deposit(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row public.customer_deposits%rowtype;
  v_role text := public.my_role();
begin
  if auth.uid() is null then raise exception 'Connexion requise pour cette action.'; end if;
  if coalesce(v_role not in ('admin','manager','facturier'), true) then
    raise exception 'Vous n’avez pas le droit de supprimer un acompte.';
  end if;
  if p_id is null then raise exception 'Identifiant de l’acompte manquant.'; end if;

  select * into v_row from public.customer_deposits where id = p_id and org_id = public.my_org();
  if not found then raise exception 'Acompte introuvable.'; end if;

  if exists (select 1 from public.sale_payments where customer_deposit_id = p_id) then
    raise exception 'Cet acompte est utilisé par une facture : il ne peut pas être supprimé.';
  end if;
  if coalesce(v_row.remaining, 0) < coalesce(v_row.amount, 0) then
    raise exception 'Cet acompte a déjà été utilisé : il ne peut pas être supprimé.';
  end if;

  delete from public.customer_deposits where id = p_id and org_id = public.my_org();
end;
$function$;

revoke all on function public.delete_customer_deposit(uuid) from public;
revoke all on function public.delete_customer_deposit(uuid) from anon;
grant execute on function public.delete_customer_deposit(uuid) to authenticated;
