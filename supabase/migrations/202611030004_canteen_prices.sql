-- Immutable price events and immutable verification events. Current is chosen BEFORE filters.
create function private.current_offerings() returns table (
  offering_id uuid, canteen_id uuid, canteen_name text, menu_item_id uuid, item_name text, variant text,
  category_id uuid, category_name text, serving_quantity numeric, unit_code text, portion_spec text,
  currency text, amount numeric, price_record_id uuid, verification_id uuid, recorded_at timestamptz,
  verified_at timestamptz, verification_event_at timestamptz, status text, is_sample boolean, seed_batch_id uuid
)
language sql stable security definer set search_path = '' as $$
  select o.id,c.id,c.name,m.id,m.name,m.variant,fc.id,fc.name,m.serving_quantity,m.unit_code,m.portion_spec,o.currency,
    r.amount,r.id,v.id,r.recorded_at,case when v.decision = 'verified' then v.observed_at end,v.recorded_at,
    case
      when not o.is_active or not c.is_active or not m.is_active or not fc.is_active then 'retired'
      when not o.is_available then 'unavailable'
      when o.availability_checked_at < now() - make_interval(days => cfg.stale_after_days) then 'availability_stale'
      when r.id is null then 'missing'
      when r.event_kind = 'withdraw' then 'withdrawn'
      when not private.compatible_origin(o.seed_batch_id,r.seed_batch_id) then 'unverified'
      when v.id is null or not private.compatible_origin(r.seed_batch_id,v.seed_batch_id) then 'unverified'
      when v.decision = 'revoked' then 'revoked'
      when a.id is null or a.state <> 'ready' or a.purpose <> 'price_evidence' or not private.compatible_origin(v.seed_batch_id,a.seed_batch_id) then 'evidence_missing'
      when v.observed_at > now() then 'unverified'
      when v.observed_at < now() - make_interval(days => cfg.stale_after_days) then 'stale'
      when not m.is_comparable then 'incomparable'
      else 'eligible'
    end,o.seed_batch_id is not null,o.seed_batch_id
  from public.canteen_offerings o join public.canteens c on c.id = o.canteen_id
  join public.menu_items m on m.id = o.menu_item_id join public.food_categories fc on fc.id = m.food_category_id
  cross join private.instance_config cfg
  left join lateral (select * from private.price_records r where r.offering_id = o.id order by r.recorded_at desc,r.sequence desc limit 1) r on true
  left join lateral (select * from private.price_verifications v where v.price_record_id = r.id order by v.recorded_at desc,v.sequence desc limit 1) v on true
  left join private.assets a on a.id = v.evidence_asset_id
  where cfg.singleton and private.origin_allowed(o.seed_batch_id) and private.compatible_origin(o.seed_batch_id,c.seed_batch_id)
    and private.compatible_origin(o.seed_batch_id,m.seed_batch_id) and private.compatible_origin(o.seed_batch_id,fc.seed_batch_id)
$$;
create function public.get_canteen_prices(p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; page_number integer := coalesce((p_filters->>'page')::integer,1);
  page_size integer := coalesce((p_filters->>'page_size')::integer,12); budget numeric;
begin
  perform private.check_keys(p_filters,array['query','category','canteen','budget','sort','page','page_size']);
  perform private.assert(page_number between 1 and 100000 and page_size between 1 and 48 and length(coalesce(p_filters->>'query','')) <= 160,'Invalid search parameters');
  perform private.assert(coalesce(p_filters->>'sort','lowest') in ('lowest','highest'),'Invalid sort order');
  if nullif(p_filters->>'budget','') is not null then
    perform private.assert(p_filters->>'budget' ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$','Budget must be a non-negative INR amount with at most two decimal places');
    budget := (p_filters->>'budget')::numeric;
  end if;
  with current_prices as materialized (
    select * from private.current_offerings() where status <> 'retired'
      and (nullif(p_filters->>'category','') is null or category_id = (p_filters->>'category')::uuid)
      and (nullif(p_filters->>'canteen','') is null or canteen_id = (p_filters->>'canteen')::uuid)
      and (private.norm(p_filters->>'query') = '' or private.norm(item_name || ' ' || variant || ' ' || category_name) like private.pattern(p_filters->>'query'))
  ), ranked as (
    select *,min(amount) filter(where status = 'eligible') over(partition by menu_item_id,currency,seed_batch_id) as lowest_price,
      count(*) filter(where status = 'eligible') over(partition by menu_item_id,currency,seed_batch_id) as eligible_count from current_prices
  ), filtered as materialized (
    select *,case when status = 'eligible' then amount end as public_amount from ranked
    where budget is null or (status = 'eligible' and amount <= budget)
  ), paged as (
    select * from filtered order by
      case when coalesce(p_filters->>'sort','lowest') = 'lowest' then public_amount end asc nulls last,
      case when p_filters->>'sort' = 'highest' then public_amount end desc nulls last,
      private.norm(item_name),private.norm(canteen_name),offering_id
    offset (page_number - 1) * page_size limit page_size
  )
  select jsonb_build_object('total',(select count(*) from filtered),'page',page_number,'page_size',page_size,
    'stale_after_days',(select stale_after_days from private.instance_config where singleton),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',offering_id,'canteen_id',canteen_id,'canteen_name',canteen_name,
      'menu_item_id',menu_item_id,'name',item_name,'variant',variant,'category_id',category_id,'category',category_name,
      'serving_quantity',serving_quantity,'unit',unit_code,'portion',portion_spec,'currency',currency,'amount',public_amount,
      'status',status,'verified_at',verified_at,'is_sample',is_sample,'lowest_price',lowest_price,'eligible_count',eligible_count,
      'is_cheapest',status = 'eligible' and amount = lowest_price,'difference',case when status = 'eligible' then amount - lowest_price end)
      order by case when coalesce(p_filters->>'sort','lowest') = 'lowest' then public_amount end asc nulls last,
        case when p_filters->>'sort' = 'highest' then public_amount end desc nulls last,private.norm(item_name),private.norm(canteen_name),offering_id) from paged),'[]'::jsonb)) into result;
  return result;
end $$;

create function public.admin_record_price(p_offering_id uuid, p_event_kind text, p_amount text, p_expected_price_id uuid,
  p_corrects_price_id uuid, p_reason text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.canteen_offerings; current_id uuid; result jsonb;
  payload jsonb := jsonb_build_object('offering',p_offering_id,'event',p_event_kind,'amount',p_amount,'expected',p_expected_price_id,'corrects',p_corrects_price_id,'reason',p_reason);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform private.require_admin();
  result := private.request_begin('record_price',p_request_id,payload); if result is not null then return result; end if;
  select * into o from public.canteen_offerings where id = p_offering_id for update;
  perform private.assert(o.id is not null and private.management_origin(o.seed_batch_id),'Offering is not available','42501');
  perform private.assert(length(btrim(p_reason)) between 1 and 500,'Add a source or change reason');
  perform private.assert(p_event_kind in ('set','withdraw'),'Unknown price event');
  perform private.assert((p_event_kind = 'withdraw' and p_amount is null) or
    (p_event_kind = 'set' and p_amount ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'),'Price must be a non-negative INR amount with at most two decimal places');
  select id into current_id from private.price_records where offering_id = o.id order by recorded_at desc,sequence desc limit 1;
  perform private.assert(current_id is not distinct from p_expected_price_id,'The current price changed. Reload the history.','PT409');
  perform private.assert(p_corrects_price_id is null or p_corrects_price_id = current_id,'A correction must reference the current price of this offering');
  insert into private.price_records(offering_id,event_kind,amount,recorded_by,corrects_price_id,source_note,request_id,seed_batch_id)
    values(o.id,p_event_kind,p_amount::numeric,auth.uid(),p_corrects_price_id,p_reason,p_request_id,o.seed_batch_id)
    returning jsonb_build_object('id',id,'recorded_at',recorded_at) into result;
  perform private.audit('price.' || p_event_kind,'price_records',result->>'id',p_reason,jsonb_build_object('offering_id',o.id,'corrects',p_corrects_price_id),o.seed_batch_id);
  return private.request_finish('record_price',p_request_id,payload,result);
end $$;
create function public.admin_verify_price(p_price_id uuid, p_decision text, p_observed_at timestamptz, p_source_method text,
  p_evidence_asset_id uuid, p_expected_verification_id uuid, p_reason text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.price_records; o public.canteen_offerings; current_id uuid; verification uuid; result jsonb;
  payload jsonb := jsonb_build_object('price',p_price_id,'decision',p_decision,'observed',p_observed_at,'method',p_source_method,'evidence',p_evidence_asset_id,'expected',p_expected_verification_id,'reason',p_reason);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform private.require_admin();
  result := private.request_begin('verify_price',p_request_id,payload); if result is not null then return result; end if;
  select * into r from private.price_records where id = p_price_id;
  select * into o from public.canteen_offerings where id = r.offering_id for update;
  perform private.assert(r.id is not null and private.management_origin(r.seed_batch_id),'Price record is not available','42501');
  select id into current_id from private.price_records where offering_id = o.id order by recorded_at desc,sequence desc limit 1;
  perform private.assert(current_id = p_price_id and r.event_kind = 'set','Only the current set-price event can be verified or revoked','PT409');
  select id into verification from private.price_verifications where price_record_id = r.id order by recorded_at desc,sequence desc limit 1;
  perform private.assert(verification is not distinct from p_expected_verification_id,'Verification changed. Reload before continuing.','PT409');
  perform private.assert(p_decision in ('verified','revoked') and length(btrim(p_reason)) between 1 and 500,'Choose a decision and provide a reason');
  if p_decision = 'verified' then
    perform private.assert(p_observed_at is not null and p_observed_at <= clock_timestamp() and p_observed_at > '1900-01-01'::timestamptz,'Verification needs a non-future observation time');
    perform private.assert((r.seed_batch_id is null and p_source_method in ('displayed_menu','supplier_confirmation'))
      or (r.seed_batch_id is not null and p_source_method = 'simulated'),'Sample verification must be labelled simulated; genuine verification requires a real source');
    perform private.assert(p_evidence_asset_id is not null,'Upload private evidence before verifying');
    perform private.check_asset(auth.uid(),p_evidence_asset_id,'price_evidence',r.seed_batch_id);
  else
    perform private.assert(p_observed_at is null and p_evidence_asset_id is null and p_source_method is null,'Revocation contains a reason, not a new verification');
  end if;
  insert into private.price_verifications(price_record_id,decision,observed_at,actor_user_id,source_method,evidence_asset_id,reason,request_id,seed_batch_id)
    values(r.id,p_decision,p_observed_at,auth.uid(),p_source_method,p_evidence_asset_id,p_reason,p_request_id,r.seed_batch_id)
    returning jsonb_build_object('id',id,'recorded_at',recorded_at) into result;
  perform private.audit('price.' || p_decision,'price_verifications',result->>'id',p_reason,jsonb_build_object('price_record_id',r.id),r.seed_batch_id);
  return private.request_finish('verify_price',p_request_id,payload,result);
end $$;
create function public.admin_price_history(p_offering_id uuid, p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert(private.has_role('admin'),'Administrator permission required','42501');
  perform private.assert(p_page between 1 and 100000,'Invalid page');
  perform private.assert(exists(select 1 from public.canteen_offerings where id = p_offering_id and private.management_origin(seed_batch_id)),'Offering is not available','42501');
  return (select jsonb_build_object('total',(select count(*) from private.price_records where offering_id = p_offering_id),
    'items',coalesce(jsonb_agg(to_jsonb(r) - 'seed_batch_id' || jsonb_build_object('is_sample',r.seed_batch_id is not null,
      'verifications',(select coalesce(jsonb_agg(to_jsonb(v) - 'seed_batch_id' order by v.recorded_at desc,v.sequence desc),'[]'::jsonb)
        from private.price_verifications v where v.price_record_id = r.id)) order by r.recorded_at desc,r.sequence desc),'[]'::jsonb))
    from (select * from private.price_records where offering_id = p_offering_id order by recorded_at desc,sequence desc offset (p_page - 1) * 20 limit 20) r);
end $$;

create function public.get_admin_snapshot(p_section text default 'overview', p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; page_number integer := coalesce((p_filters->>'page')::integer,1);
begin
  perform private.assert(private.has_role('admin'),'Administrator permission required','42501');
  perform private.check_keys(p_filters,array['query','status','page']);
  perform private.assert(page_number between 1 and 100000 and length(coalesce(p_filters->>'query','')) <= 160,'Invalid filters');
  if p_section = 'overview' then
    return jsonb_build_object('registered_users',(select count(*) from private.account_controls where private.management_origin(seed_batch_id)),
      'published_profiles',(select count(*) from public.profiles where private.profile_visible(id) and private.management_origin(seed_batch_id)),
      'pending_profiles',(select count(*) from private.profile_moderation m join public.profiles p on p.id = m.profile_id where m.status = 'pending' and private.management_origin(p.seed_batch_id)),
      'deletion_requests',(select count(*) from private.account_controls where close_requested_at is not null and private.management_origin(seed_batch_id)),
      'active_canteens',(select count(*) from public.canteens where is_active and private.management_origin(seed_batch_id)),
      'food_items',(select count(*) from public.menu_items where is_active and private.management_origin(seed_batch_id)),
      'prices_requiring_verification',(select count(*) from private.current_offerings() where status in ('missing','unverified','revoked','stale','evidence_missing','availability_stale') and private.management_origin(seed_batch_id)),
      'open_reports',(select count(*) from private.moderation_reports r where status = 'open' and target_subject <> auth.uid()
        and reporter_id is distinct from auth.uid() and private.management_origin(r.seed_batch_id)
        and (private.caller_batch() is null or exists(select 1 from private.account_controls where user_id = r.target_subject and private.management_origin(seed_batch_id)))));
  elsif p_section = 'profiles' then
    with filtered as materialized (
      select c.*,u.email,p.display_name,p.write_version,m.status as moderation_status,m.staff_note as moderation_note
      from private.account_controls c join auth.users u on u.id = c.user_id left join public.profiles p on p.id = c.user_id
      left join private.profile_moderation m on m.profile_id = c.user_id
      where private.management_origin(c.seed_batch_id) and private.norm(coalesce(p.display_name,'') || ' ' || u.email || ' ' || c.user_id::text) like private.pattern(p_filters->>'query')
        and (coalesce(p_filters->>'status','') in ('','all') or
          (p_filters->>'status' = 'deletion' and c.close_requested_at is not null) or
          (p_filters->>'status' = 'suspended' and c.account_status = 'suspended') or
          (p_filters->>'status' = 'eligibility' and c.eligibility_status = 'pending') or m.status = p_filters->>'status')
    ), paged as (select * from filtered order by created_at desc,user_id offset (page_number - 1) * 20 limit 20)
    select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'email',email,
      'account_status',account_status,'eligibility_status',eligibility_status,'eligibility_basis',eligibility_basis,'account_version',version,
      'deletion_requested_at',close_requested_at,'owner_reason',owner_reason,'staff_note',staff_note,'moderation_note',moderation_note,
      'is_sample',seed_batch_id is not null,'profile',private.profile_json(user_id,true)) order by created_at desc,user_id) from paged),'[]'::jsonb)) into result;
  elsif p_section = 'prices' then
    with filtered as materialized (select * from private.current_offerings() where private.management_origin(seed_batch_id)
      and private.norm(canteen_name || ' ' || item_name) like private.pattern(p_filters->>'query')
      and (coalesce(p_filters->>'status','') in ('','all') or status = p_filters->>'status')),
    paged as (select * from filtered order by item_name,canteen_name,offering_id offset (page_number - 1) * 20 limit 20)
    select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(p) - 'seed_batch_id' order by item_name,canteen_name,offering_id) from paged p),'[]'::jsonb)) into result;
  elsif p_section = 'reports' then
    with filtered as materialized (select * from private.moderation_reports r where private.management_origin(r.seed_batch_id) and r.target_subject <> auth.uid()
       and r.reporter_id is distinct from auth.uid()
      and (private.caller_batch() is null or exists(select 1 from private.account_controls where user_id = r.target_subject and private.management_origin(seed_batch_id)))
      and (coalesce(p_filters->>'status','') in ('','all') or status = p_filters->>'status')),
    paged as (select * from filtered order by created_at desc,id offset (page_number - 1) * 20 limit 20)
    select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(p) - 'reporter_id' - 'seed_batch_id' - 'request_id' order by created_at desc,id) from paged p),'[]'::jsonb)) into result;
  elsif p_section = 'skill_requests' then
    with filtered as materialized (select * from private.skill_requests where private.management_origin(seed_batch_id)
      and (coalesce(p_filters->>'status','') in ('','all') or status = p_filters->>'status')),
    paged as (select * from filtered order by created_at desc,id offset (page_number - 1) * 20 limit 20)
    select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(p) - 'requester_id' - 'seed_batch_id' - 'request_id' order by created_at desc,id) from paged p),'[]'::jsonb)) into result;
  elsif p_section = 'audit' then
    with filtered as materialized (select * from private.admin_audit_log where private.management_origin(seed_batch_id)
      and private.norm(action || ' ' || target_table) like private.pattern(p_filters->>'query')),
    paged as (select * from filtered order by occurred_at desc,id offset (page_number - 1) * 20 limit 20)
    select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(p) - 'seed_batch_id' order by occurred_at desc,id) from paged p),'[]'::jsonb)) into result;
  else raise exception 'Unknown administrator section';
  end if;
  return result;
end $$;

revoke execute on function private.current_offerings() from public,anon,authenticated;
grant execute on function public.get_canteen_prices(jsonb) to anon,authenticated;
grant execute on function public.admin_record_price(uuid,text,text,uuid,uuid,text,uuid),
  public.admin_verify_price(uuid,text,timestamptz,text,uuid,uuid,text,uuid),public.admin_price_history(uuid,integer),public.get_admin_snapshot(text,jsonb) to authenticated;
