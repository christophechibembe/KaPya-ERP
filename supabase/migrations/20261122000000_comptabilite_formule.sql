-- Comptabilité : incluse dans les formules Standard et Premium.
-- Idempotent : remplace uniquement la fonction de contrôle des formules.
-- L'écran est en lecture seule ; cette migration prépare le contrôle côté base
-- pour les futurs exports ou traitements comptables.

create or replace function public.plan_allows(p_feature text) returns boolean language sql stable security definer set search_path = public as $$
  select case (select o.plan from public.organizations o where o.id = public.my_org())
    when 'premium' then true
    when 'standard' then p_feature in ('depots','transferts','alertes','exports','comptabilite','sauvegarde','whatsapp')
    else false
  end
$$;

grant execute on function public.plan_allows(p_feature text) to authenticated;
