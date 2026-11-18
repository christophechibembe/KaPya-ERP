-- KaPya ERP — garde-fou : le stock ne peut pas devenir négatif. Sans danger à relancer.
-- Une annulation d'achat déjà partiellement vendu est désormais refusée.

create or replace function public.apply_move() returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Garde-fou : le stock ne peut jamais devenir négatif (annulation d'achat après vente, ajustement).
  if new.qty < 0 and (select stock from articles where id=new.article_id) + new.qty < 0 then
    if new.reason = 'adjustment' then raise exception 'Ajustement impossible : le stock ne peut pas devenir négatif.';
    else raise exception 'une partie de ce stock a déjà été vendue ou ajustée.'; end if;
  end if;
  update articles set stock=stock+new.qty where id=new.article_id; return null; end $$;
