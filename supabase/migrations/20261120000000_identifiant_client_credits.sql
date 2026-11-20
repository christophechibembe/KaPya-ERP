-- Le rappel WhatsApp regroupe par identifiant client, jamais par nom (homonymes).
-- Ajout compatible au JSON de la RPC existante ; aucun changement de droits.
CREATE OR REPLACE FUNCTION public.credit_sales_all()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(q.x order by q.sold desc), '[]'::jsonb) from (
    select s.sold_at as sold,
      jsonb_build_object(
        'id', s.id, 'customer_id', s.customer_id, 'number', s.number, 'sold_at', s.sold_at, 'customer_label', s.customer_label,
        'payment', s.payment, 'paid', s.paid,
        'credit_notes_total', (select coalesce(sum(cn.total_usd), 0) from public.credit_notes cn where cn.sale_id = s.id),
        'usd_cdf', s.usd_cdf,
        'customers', (select jsonb_build_object('name', c.name, 'phone', c.phone) from public.customers c where c.id = s.customer_id),
        'sale_lines', coalesce((select jsonb_agg(jsonb_build_object('qty', l.qty, 'unit_price', l.unit_price,
            'articles', (select jsonb_build_object('sku', a.sku, 'name', a.name) from public.articles a where a.id = l.article_id)))
          from public.sale_lines l where l.sale_id = s.id), '[]'::jsonb),
        'sale_payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'paid_at', p.paid_at, 'kind', p.kind,
            'created_at', p.created_at, 'customer_deposit_id', p.customer_deposit_id,
            'customer_deposits', (select jsonb_build_object('receipt_number', d.receipt_number) from public.customer_deposits d where d.id = p.customer_deposit_id)))
          from public.sale_payments p where p.sale_id = s.id), '[]'::jsonb)
      ) as x
    from public.sales s
    where s.org_id = public.my_org() and s.payment = 'credit'
  ) q
$function$;
