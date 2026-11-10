-- Compare published menu listings, including menus whose exact quantities are unknown.
-- The verification-only get_canteen_prices contract continues to serve exact-portion checks.
create function public.get_canteen_menu_comparisons(p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cafes jsonb; first_id uuid; second_id uuid; result jsonb; budget numeric;
  page_number integer := coalesce((p_filters->>'page')::integer,1);
  page_size integer := coalesce((p_filters->>'page_size')::integer,12);
begin
  perform private.check_keys(p_filters,array['query','category','canteen','compare_with','budget','sort','page','page_size']);
  perform private.assert(page_number between 1 and 100000 and page_size between 1 and 48
    and length(coalesce(p_filters->>'query','')) <= 160,'Invalid search parameters');
  perform private.assert(coalesce(p_filters->>'sort','lowest') in ('lowest','highest','difference'),'Invalid sort order');
  if nullif(p_filters->>'budget','') is not null then
    perform private.assert(p_filters->>'budget' ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$','Budget must be a non-negative INR amount with at most two decimal places');
    budget := (p_filters->>'budget')::numeric;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.key,c.id),'[]'::jsonb)
    into cafes from public.canteens c where exists(select 1 from private.published_canteen_menu e where e.canteen_id=c.id);
  first_id := coalesce(nullif(p_filters->>'canteen','')::uuid,(cafes->0->>'id')::uuid);
  second_id := nullif(p_filters->>'compare_with','')::uuid;
  if second_id is null then
    select (value->>'id')::uuid into second_id from jsonb_array_elements(cafes) where (value->>'id')::uuid <> first_id limit 1;
  end if;
  perform private.assert(first_id is null or second_id is null or first_id <> second_id,'Choose two different cafés');

  with matched as materialized (
    select a.menu_item_id as id,a.name,a.variant,a.serving_quantity,a.unit_code as unit,a.portion_spec as portion,
      category.id as category_id,category.name as category,a.currency,
      least(a.amount,b.amount) as lowest_price,greatest(a.amount,b.amount) as highest_price,abs(a.amount-b.amount) as difference,
      private.norm(a.name || ' ' || a.variant || ' ' || category.name || ' ' || a.category || ' ' || b.category
        || ' ' || a.canteen_item_label || ' ' || b.canteen_item_label) as search_text,
      jsonb_build_array(
        jsonb_build_object('id',a.offering_id,'canteen_id',a.canteen_id,'canteen_name',ca.name,'amount',a.amount,
          'is_lowest',a.amount <= b.amount,'difference',a.amount-least(a.amount,b.amount),
          'source_kind',a.source_kind,'source_label',a.source_label,'source_observed_on',a.source_observed_on,'updated_at',a.updated_at),
        jsonb_build_object('id',b.offering_id,'canteen_id',b.canteen_id,'canteen_name',cb.name,'amount',b.amount,
          'is_lowest',b.amount <= a.amount,'difference',b.amount-least(a.amount,b.amount),
          'source_kind',b.source_kind,'source_label',b.source_label,'source_observed_on',b.source_observed_on,'updated_at',b.updated_at)
      ) as offers
    from private.published_canteen_menu a
    join private.published_canteen_menu b on b.menu_item_id=a.menu_item_id and b.currency=a.currency
    join public.canteens ca on ca.id=a.canteen_id join public.canteens cb on cb.id=b.canteen_id
    join public.menu_items item on item.id=a.menu_item_id join public.food_categories category on category.id=item.food_category_id
    where a.canteen_id=first_id and b.canteen_id=second_id
  ), filtered as materialized (
    select * from matched where (nullif(p_filters->>'category','') is null or category_id=(p_filters->>'category')::uuid)
      and (private.norm(p_filters->>'query')='' or search_text like private.pattern(p_filters->>'query'))
      -- Keep both prices visible when at least one café meets the budget.
      and (budget is null or lowest_price <= budget)
  ), paged as (
    select * from filtered order by
      case when coalesce(p_filters->>'sort','lowest')='lowest' then lowest_price end asc,
      case when p_filters->>'sort'='highest' then lowest_price end desc,
      case when p_filters->>'sort'='difference' then difference end desc,private.norm(name),id
      offset (page_number-1)*page_size limit page_size
  ) select jsonb_build_object('canteens',cafes,
    'first_canteen',(select value from jsonb_array_elements(cafes) where (value->>'id')::uuid=first_id),
    'second_canteen',(select value from jsonb_array_elements(cafes) where (value->>'id')::uuid=second_id),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from
      (select category_id as id,category as name,count(*) as item_count from matched group by category_id,category) c),'[]'::jsonb),
    'total',(select count(*) from filtered),'page',page_number,'page_size',page_size,
    'items',coalesce((select jsonb_agg(to_jsonb(p)-'search_text' order by
      case when coalesce(p_filters->>'sort','lowest')='lowest' then lowest_price end asc,
      case when p_filters->>'sort'='highest' then lowest_price end desc,
      case when p_filters->>'sort'='difference' then difference end desc,private.norm(name),id) from paged p),'[]'::jsonb)) into result;
  return result;
end $$;

revoke all on function public.get_canteen_menu_comparisons(jsonb) from public;
grant execute on function public.get_canteen_menu_comparisons(jsonb) to anon,authenticated;
