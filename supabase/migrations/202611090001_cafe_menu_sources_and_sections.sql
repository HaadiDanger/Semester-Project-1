-- A café's printed/text sections are presentation, independent of shared item identity.
-- Small/Large labels use the existing item variant; unspecified quantities stay unknown.
alter table public.canteens add column menu_subtitle text not null default '' check(length(menu_subtitle) <= 160);
alter table private.canteen_menu_entries
  add column source_kind text not null default 'photograph' check(source_kind in ('photograph','text')),
  add column section_category_id uuid references public.food_categories(id) on delete restrict,
  add column section_order smallint check(section_order between 0 and 1000),
  add constraint menu_section_pair check(num_nonnulls(section_category_id,section_order) in (0,2));

create or replace function private.guard_menu_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert(exists(select 1 from public.canteen_offerings o
    join public.canteens c on c.id=o.canteen_id join public.menu_items m on m.id=o.menu_item_id
    join public.food_categories fc on fc.id=m.food_category_id
    join public.food_categories section on section.id=coalesce(new.section_category_id,m.food_category_id)
    join private.price_records r on r.id=new.price_record_id and r.offering_id=o.id
    where o.id=new.offering_id and o.seed_batch_id is null and c.seed_batch_id is null
      and m.seed_batch_id is null and fc.seed_batch_id is null and section.seed_batch_id is null
      and r.seed_batch_id is null and r.event_kind='set'),
    'Menu publication requires a genuine canteen, item, section and matching set-price record');
  perform private.assert(new.source_observed_on is null or new.source_observed_on <= current_date,'The menu observation date cannot be in the future');
  return new;
end $$;

-- Preserve the original view's column order for existing dependencies; append new fields.
create or replace view private.published_canteen_menu as
  select e.offering_id,e.price_record_id,e.source_label,e.source_observed_on,e.photo_key,e.display_order,
    e.is_published,e.version,e.created_at,e.updated_at,
    o.canteen_id,o.menu_item_id,o.canteen_item_label,o.is_available,o.availability_checked_at,
    m.name,m.variant,m.serving_quantity,m.unit_code,m.portion_spec,fc.id as food_category_id,
    fc.name as category,coalesce(e.section_order,fc.display_order) as category_order,r.amount,o.currency,
    e.source_kind,e.section_category_id,e.section_order
  from private.canteen_menu_entries e
  join public.canteen_offerings o on o.id=e.offering_id and o.is_active and o.seed_batch_id is null
  join public.canteens c on c.id=o.canteen_id and c.is_active and c.seed_batch_id is null
  join public.menu_items m on m.id=o.menu_item_id and m.is_active and m.seed_batch_id is null
  join public.food_categories catalogue on catalogue.id=m.food_category_id and catalogue.is_active and catalogue.seed_batch_id is null
  join public.food_categories fc on fc.id=coalesce(e.section_category_id,m.food_category_id) and fc.is_active and fc.seed_batch_id is null
  join lateral (select r.* from private.price_records r where r.offering_id=o.id order by r.recorded_at desc,r.sequence desc limit 1) r
    on r.id=e.price_record_id and r.event_kind='set' and r.seed_batch_id is null
  left join lateral (select v.decision from private.price_verifications v where v.price_record_id=r.id order by v.recorded_at desc,v.sequence desc limit 1) v on true
  where e.is_published and (v.decision is null or v.decision <> 'revoked');
revoke all on private.published_canteen_menu from public,anon,authenticated;

create or replace function public.get_canteen_menu(p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare selected uuid; cafes jsonb; cafe jsonb; categories jsonb; result jsonb;
  page_number integer := coalesce((p_filters->>'page')::integer,1);
  page_size integer := coalesce((p_filters->>'page_size')::integer,36); budget numeric;
begin
  perform private.check_keys(p_filters,array['query','category','canteen','budget','sort','page','page_size']);
  perform private.assert(page_number between 1 and 100000 and page_size between 1 and 48
    and length(coalesce(p_filters->>'query','')) <= 160,'Invalid search parameters');
  perform private.assert(coalesce(p_filters->>'sort','menu') in ('menu','lowest','highest'),'Invalid sort order');
  if nullif(p_filters->>'budget','') is not null then
    perform private.assert(p_filters->>'budget' ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$','Budget must be a non-negative INR amount with at most two decimal places');
    budget := (p_filters->>'budget')::numeric;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'location',c.location_description,'item_count',s.total) order by c.key,c.id),'[]'::jsonb)
    into cafes from public.canteens c join (select canteen_id,count(*) as total from private.published_canteen_menu group by canteen_id) s on s.canteen_id=c.id;
  selected := case when nullif(p_filters->>'canteen','') is not null then (p_filters->>'canteen')::uuid else (cafes->0->>'id')::uuid end;
  select jsonb_build_object('id',c.id,'name',c.name,'location',c.location_description,'description',c.menu_description,'subtitle',c.menu_subtitle,
    'cover_photo',private.menu_photo_json(c.menu_cover_photo_key),'item_count',count(e.offering_id),'min_price',min(e.amount),'max_price',max(e.amount),
    'updated_at',max(e.updated_at),'source_labels',jsonb_agg(distinct e.source_label),
    'source_kind',case when count(distinct e.source_kind)=1 then min(e.source_kind) else 'mixed' end,
    'source_observed_on',case when count(e.source_observed_on)=count(*) then min(e.source_observed_on) end)
    into cafe from public.canteens c join private.published_canteen_menu e on e.canteen_id=c.id
    where c.id=selected group by c.id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.display_order,t.name,t.id),'[]'::jsonb) into categories from
    (select food_category_id as id,category as name,min(category_order) as display_order,count(*) as item_count
      from private.published_canteen_menu where canteen_id=selected group by food_category_id,category) t;
  with filtered as materialized (
    select * from private.published_canteen_menu where canteen_id=selected
      and (nullif(p_filters->>'category','') is null or food_category_id=(p_filters->>'category')::uuid)
      and (private.norm(p_filters->>'query')='' or private.norm(name || ' ' || variant || ' ' || canteen_item_label || ' ' || category) like private.pattern(p_filters->>'query'))
      and (budget is null or amount <= budget)
  ), paged as (
    select * from filtered order by
      case when p_filters->>'sort'='lowest' then amount end asc,
      case when p_filters->>'sort'='highest' then amount end desc,
      display_order,offering_id offset (page_number-1)*page_size limit page_size
  ) select jsonb_build_object('canteens',cafes,'canteen',cafe,'categories',categories,'total',(select count(*) from filtered),
    'page',page_number,'page_size',page_size,'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',offering_id,'name',coalesce(nullif(canteen_item_label,''),name),'variant',variant,'category',category,'category_id',food_category_id,
      'amount',amount,'currency',currency,'serving_quantity',serving_quantity,'unit',unit_code,'portion',portion_spec,
      'source_label',source_label,'source_kind',source_kind,'source_observed_on',source_observed_on,'updated_at',updated_at,'photo',private.menu_photo_json(photo_key))
      order by case when p_filters->>'sort'='lowest' then amount end asc,
      case when p_filters->>'sort'='highest' then amount end desc,display_order,offering_id) from paged),'[]'::jsonb)) into result;
  return result;
end $$;

create or replace function public.admin_save_menu_entry(p_offering_id uuid,p_price_record_id uuid,p_data jsonb,p_expected_version bigint,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_id uuid; entry private.canteen_menu_entries; result jsonb; payload jsonb;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform private.require_admin();
  perform private.assert(private.caller_batch() is null,'A genuine administrator is required','42501');
  perform private.check_keys(p_data,array['source_label','source_kind','source_observed_on','photo_key','display_order','is_published']);
  payload := jsonb_build_object('offering',p_offering_id,'price',p_price_record_id,'data',p_data,'version',p_expected_version,'reason',p_reason);
  result := private.request_begin('save_menu_entry',p_request_id,payload); if result is not null then return result; end if;
  perform 1 from public.canteen_offerings where id=p_offering_id and seed_batch_id is null for update;
  perform private.assert(found,'Genuine offering required','42501');
  perform private.assert(length(btrim(p_reason)) between 1 and 500,'Add a publication reason');
  select * into entry from private.canteen_menu_entries where offering_id=p_offering_id for update;
  perform private.assert(entry.version is not distinct from p_expected_version,'Menu listing changed. Reload before saving.','PT409');
  if coalesce((p_data->>'is_published')::boolean,false) then
    select id into current_id from private.price_records where offering_id=p_offering_id order by recorded_at desc,sequence desc limit 1;
    perform private.assert(current_id=p_price_record_id and exists(select 1 from private.price_records where id=current_id and event_kind='set'),
      'Only the current set-price record can be published','PT409');
    perform private.assert(coalesce((select decision from private.price_verifications where price_record_id=current_id
      order by recorded_at desc,sequence desc limit 1),'') <> 'revoked','A revoked price cannot be published','PT409');
    perform private.assert(exists(select 1 from public.canteen_offerings o join public.canteens c on c.id=o.canteen_id
      join public.menu_items m on m.id=o.menu_item_id join public.food_categories f on f.id=m.food_category_id
      join public.food_categories section on section.id=coalesce(entry.section_category_id,m.food_category_id)
      where o.id=p_offering_id and o.is_active and c.is_active and m.is_active and f.is_active and section.is_active),'Retired entries cannot be published','PT409');
  end if;
  insert into private.canteen_menu_entries(offering_id,price_record_id,source_label,source_kind,source_observed_on,photo_key,display_order,is_published)
    values(p_offering_id,p_price_record_id,btrim(p_data->>'source_label'),coalesce(p_data->>'source_kind',entry.source_kind,'photograph'),nullif(p_data->>'source_observed_on','')::date,
      nullif(p_data->>'photo_key',''),coalesce((p_data->>'display_order')::smallint,0),coalesce((p_data->>'is_published')::boolean,false))
    on conflict(offering_id) do update set price_record_id=excluded.price_record_id,source_label=excluded.source_label,source_kind=excluded.source_kind,
      source_observed_on=excluded.source_observed_on,photo_key=excluded.photo_key,display_order=excluded.display_order,
      is_published=excluded.is_published,version=canteen_menu_entries.version+1
    returning jsonb_build_object('offering_id',offering_id,'version',version) into result;
  perform private.audit('menu.publish','canteen_menu_entries',p_offering_id::text,p_reason,
    jsonb_build_object('price_record_id',p_price_record_id,'is_published',p_data->'is_published','source_kind',coalesce(p_data->>'source_kind',entry.source_kind,'photograph')),null);
  return private.request_finish('save_menu_entry',p_request_id,payload,result);
end $$;

revoke execute on function private.guard_menu_entry() from public,anon,authenticated;
grant execute on function public.get_canteen_menu(jsonb) to anon,authenticated;
grant execute on function public.admin_save_menu_entry(uuid,uuid,jsonb,bigint,text,uuid) to authenticated;
