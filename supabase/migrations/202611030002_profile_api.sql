-- All browser writes go through narrow, versioned transactions. No table write grants.
alter table private.instance_config add column eligibility_instructions text not null default
  'Campus eligibility is reviewed by an administrator. Registration alone does not verify university membership.'
  check(length(eligibility_instructions) between 1 and 2000);

create table private.rpc_receipts (
  user_id uuid not null, request_id uuid not null, action text not null, input_hash text not null,
  result jsonb not null, seed_batch_id uuid, created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table private.rpc_receipts enable row level security;
revoke all on private.rpc_receipts from public,anon,authenticated;
create trigger origin_guard before insert or update on private.rpc_receipts for each row execute function private.guard_origin();

create function private.require_user(active_only boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from private.account_controls where user_id = auth.uid() for update;
  perform private.assert(private.account_ok(active_only), 'A confirmed, permitted account is required', '42501');
  return auth.uid();
end $$;
create function private.require_admin() returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform 1 from private.user_roles where user_id = auth.uid() and role = 'admin' for share;
  perform private.assert(private.has_role('admin'), 'Administrator permission required', '42501');
  return auth.uid();
end $$;
create function private.request_begin(action_name text, token uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.rpc_receipts;
begin
  perform private.assert(auth.uid() is not null and token is not null, 'A request identifier is required');
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || token::text,0));
  select * into r from private.rpc_receipts where user_id = auth.uid() and request_id = token;
  if found then
    perform private.assert(r.action = action_name and r.input_hash = md5(payload::text), 'Request identifier was already used for different input', 'PT409');
    return r.result;
  end if;
  return null;
end $$;
create function private.request_finish(action_name text, token uuid, payload jsonb, response jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.rpc_receipts(user_id,request_id,action,input_hash,result,seed_batch_id)
    values(auth.uid(),token,action_name,md5(payload::text),response,private.caller_batch());
  return response;
end $$;
create function private.audit(action_name text, target_name text, subject text, reason_text text, detail jsonb default '{}', batch uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.admin_audit_log(request_id,actor_kind,actor_user_id,action,target_table,target_key,reason,details,seed_batch_id)
    values(gen_random_uuid(),'user',auth.uid(),action_name,target_name,subject,reason_text,detail,batch);
end $$;

create function public.get_app_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('environment',environment,'samples_enabled',environment = 'development' and seed_enabled,
    'stale_after_days',stale_after_days,'eligibility_instructions',eligibility_instructions) from private.instance_config where singleton
$$;
create function public.get_session_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id',c.user_id,'account_status',c.account_status,'eligibility_status',c.eligibility_status,
    'owner_reason',c.owner_reason,'deletion_requested_at',c.close_requested_at,'account_version',c.version,
    'is_admin',private.has_role('admin'),'is_role_manager',private.has_role('role_manager'),
    'is_sample',c.seed_batch_id is not null,'email_confirmed',u.email_confirmed_at is not null)
  from private.account_controls c join auth.users u on u.id = c.user_id where c.user_id = auth.uid()
$$;
create function public.get_reference_data(p_include_inactive boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb := '{}'; t text; rows jsonb; parent_check text;
begin
  perform private.assert(not p_include_inactive or private.has_role('admin'), 'Administrator permission required', '42501');
  foreach t in array array['departments','programmes','skill_categories','skills','food_categories','menu_items','canteens','canteen_offerings'] loop
    -- Identifiers come only from this fixed allowlist.
    parent_check := case t
      when 'programmes' then 'exists(select 1 from public.departments p where p.id = r.department_id and p.is_active and private.compatible_origin(r.seed_batch_id,p.seed_batch_id))'
      when 'skills' then 'exists(select 1 from public.skill_categories p where p.id = r.category_id and p.is_active and private.compatible_origin(r.seed_batch_id,p.seed_batch_id))'
      when 'menu_items' then 'exists(select 1 from public.food_categories p where p.id = r.food_category_id and p.is_active and private.compatible_origin(r.seed_batch_id,p.seed_batch_id))'
      when 'canteen_offerings' then 'exists(select 1 from public.canteens c,public.menu_items m,public.food_categories f where c.id = r.canteen_id and m.id = r.menu_item_id and f.id = m.food_category_id and c.is_active and m.is_active and f.is_active and private.compatible_origin(r.seed_batch_id,c.seed_batch_id) and private.compatible_origin(r.seed_batch_id,m.seed_batch_id) and private.compatible_origin(r.seed_batch_id,f.seed_batch_id))'
      else 'true' end;
    execute format('select coalesce(jsonb_agg(to_jsonb(r) - ''seed_batch_id'' || jsonb_build_object(''is_sample'',r.seed_batch_id is not null) order by coalesce((to_jsonb(r)->>''display_order'')::integer,0),private.norm(to_jsonb(r)->>''name''),r.id),''[]''::jsonb) from public.%I r where private.origin_allowed(r.seed_batch_id) and ($1 or (r.is_active and %s))',t,parent_check)
      into rows using p_include_inactive;
    result := result || jsonb_build_object(t,rows);
  end loop;
  return result;
end $$;

create function private.profile_json(subject uuid, detail boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.id,'display_name',p.display_name,'bio',p.bio,'programme_id',p.programme_id,
    'programme',case when pr.id is null then null else jsonb_build_object('id',pr.id,'name',pr.name,'department_id',pr.department_id,'stage_unit',pr.stage_unit,'stage_count',pr.stage_count) end,
    'department',case when d.id is null then null else jsonb_build_object('id',d.id,'name',d.name) end,
    'member_type',p.member_type,'stage_number',p.stage_number,'graduation_year',p.graduation_year,
    'is_sample',p.seed_batch_id is not null,'is_owner',p.id = auth.uid(),'featured_rank',p.featured_rank,
    'photo_asset_id',case when private.can_read_audience(p.id,p.photo_audience,true) then p.photo_asset_id end,
    'skills',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'category_id',s.category_id,'category',sc.name,'is_active',s.is_active and sc.is_active) order by s.key,s.id)
      from public.profile_skills ps join public.skills s on s.id = ps.skill_id join public.skill_categories sc on sc.id = s.category_id
      where ps.profile_id = p.id and private.compatible_origin(p.seed_batch_id,s.seed_batch_id)
        and private.compatible_origin(p.seed_batch_id,sc.seed_batch_id)), '[]'::jsonb))
    || case when detail then jsonb_build_object('about',p.about,'services',p.services,'interests',p.interests,
      'contacts',coalesce((select jsonb_agg(to_jsonb(c) - 'profile_id' - 'created_at' - 'updated_at' order by c.kind,c.id)
        from public.profile_contacts c where c.profile_id = p.id and private.can_read_audience(p.id,c.audience)), '[]'::jsonb),
      'projects',coalesce((select jsonb_agg(to_jsonb(i) - 'profile_id' - 'created_at' - 'updated_at' order by i.sort_order,i.id)
        from public.portfolio_items i where i.profile_id = p.id and private.can_read_audience(p.id,i.audience,true)), '[]'::jsonb)) else '{}'::jsonb end
    || case when (p.id = auth.uid() and private.account_ok(false)) or (private.has_role('admin') and private.management_origin(p.seed_batch_id)) then jsonb_build_object(
      'write_version',p.write_version,'content_version',p.content_version,'discovery_opt_in',p.discovery_opt_in,
      'visibility',p.visibility,'photo_audience',p.photo_audience,'status',case when c.account_status = 'suspended' then 'suspended' else m.status end,
      'moderation_status',m.status,'owner_reason',m.owner_reason,'submitted_at',m.submitted_at,'reviewed_at',m.reviewed_at,
      'deletion_requested_at',c.close_requested_at,'eligibility_status',c.eligibility_status) else '{}'::jsonb end
  from public.profiles p left join public.programmes pr on pr.id = p.programme_id left join public.departments d on d.id = pr.department_id
    join private.account_controls c on c.user_id = p.id join private.profile_moderation m on m.profile_id = p.id
  where p.id = subject and private.can_read_profile(p.id)
$$;
create function public.get_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.profile_json(p_id,true) $$;
create function public.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert(private.account_ok(false),'A confirmed, permitted account is required','42501');
  return private.profile_json(auth.uid(),true);
end $$;
create function public.discover_profiles(p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; page_number integer := coalesce((p_filters->>'page')::integer,1);
  page_size integer := coalesce((p_filters->>'page_size')::integer,12);
begin
  perform private.check_keys(p_filters,array['query','skill','category','department','programme','member_type','stage','page','page_size','featured']);
  perform private.assert(page_number between 1 and 100000 and page_size between 1 and 48 and length(coalesce(p_filters->>'query','')) <= 160,'Invalid search parameters');
  perform private.assert(coalesce(p_filters->>'member_type','') in ('','student','graduate'),'Invalid member filter');
  with filtered as materialized (
    select p.id,p.name_key,p.featured_rank from public.profiles p
    left join public.programmes pr on pr.id = p.programme_id left join public.departments d on d.id = pr.department_id
    where private.profile_visible(p.id)
      and (nullif(p_filters->>'department','') is null or d.id = (p_filters->>'department')::uuid)
      and (nullif(p_filters->>'programme','') is null or pr.id = (p_filters->>'programme')::uuid)
      and (nullif(p_filters->>'member_type','') is null or p.member_type = p_filters->>'member_type')
      and (nullif(p_filters->>'stage','') is null or p.stage_number = (p_filters->>'stage')::integer)
      and (not coalesce((p_filters->>'featured')::boolean,false) or p.featured_rank is not null)
      and (nullif(p_filters->>'skill','') is null or exists(select 1 from public.profile_skills ps where ps.profile_id = p.id and ps.skill_id = (p_filters->>'skill')::uuid))
      and (nullif(p_filters->>'category','') is null or exists(select 1 from public.profile_skills ps join public.skills s on s.id = ps.skill_id where ps.profile_id = p.id and s.category_id = (p_filters->>'category')::uuid))
      and (private.norm(p_filters->>'query') = '' or private.norm(p.display_name || ' ' || p.bio || ' ' || p.about || ' ' || p.services) like private.pattern(p_filters->>'query')
        or private.norm(pr.name || ' ' || d.name) like private.pattern(p_filters->>'query')
        or exists(select 1 from public.profile_skills ps join public.skills s on s.id = ps.skill_id join public.skill_categories sc on sc.id = s.category_id
          where ps.profile_id = p.id and (s.key like private.pattern(p_filters->>'query') or sc.key like private.pattern(p_filters->>'query')
            or exists(select 1 from public.skill_aliases a where a.skill_id = s.id and a.key like private.pattern(p_filters->>'query')))))
  ), paged as (
    select * from filtered order by case when coalesce((p_filters->>'featured')::boolean,false) then featured_rank end nulls last,name_key,id
    offset (page_number - 1) * page_size limit page_size
  )
  select jsonb_build_object('total',(select count(*) from filtered),'page',page_number,'page_size',page_size,
    'items',coalesce((select jsonb_agg(private.profile_json(id) order by case when coalesce((p_filters->>'featured')::boolean,false) then featured_rank end nulls last,name_key,id) from paged),'[]'::jsonb)) into result;
  return result;
end $$;

create function private.check_asset(subject uuid, asset uuid, wanted_purpose text, batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if asset is null then return; end if;
  perform 1 from private.assets where id = asset for share;
  perform private.assert(exists(select 1 from private.assets where id = asset and owner_id = subject and purpose = wanted_purpose
    and state = 'ready' and private.compatible_origin(batch,seed_batch_id)), 'Upload is not ready or does not belong to this account', '42501');
end $$;
create function private.check_profile_complete(subject uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; pr public.programmes;
begin
  select * into p from public.profiles where id = subject;
  select * into pr from public.programmes where id = p.programme_id;
  perform private.assert(length(btrim(p.display_name)) >= 2 and length(btrim(p.bio)) >= 10 and pr.id is not null,
    'Add your name, a short biography (at least 10 characters), and a programme before submitting');
  perform private.assert(pr.is_active and exists(select 1 from public.departments where id = pr.department_id and is_active),'Choose an active programme');
  perform private.assert(p.member_type = 'graduate' or pr.stage_unit = 'none' or p.stage_number between 1 and pr.stage_count,'Choose a valid semester or year');
  perform private.assert(exists(select 1 from public.profile_skills where profile_id = p.id),'Select at least one skill');
  perform private.assert(not exists(select 1 from public.profile_skills ps join public.skills s on s.id = ps.skill_id join public.skill_categories c on c.id = s.category_id
    where ps.profile_id = p.id and (not s.is_active or not c.is_active)), 'Replace inactive skills before submitting');
end $$;

create function public.save_my_profile(p_profile jsonb, p_expected_version bigint, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare subject uuid := auth.uid(); c private.account_controls; p public.profiles; pr public.programmes;
  item jsonb; asset uuid; selected_skills uuid[]; result jsonb; payload jsonb := jsonb_build_object('profile',p_profile,'version',p_expected_version);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform private.require_user();
  result := private.request_begin('save_profile',p_request_id,payload); if result is not null then return result; end if;
  perform private.check_keys(p_profile,array['display_name','programme_id','member_type','stage_number','graduation_year','bio','about','services','interests','visibility','photo_asset_id','photo_audience','skills','projects','contacts']);
  select * into c from private.account_controls where user_id = subject for update;
  perform private.assert(c.close_requested_at is null,'Your deletion request must be cancelled before editing','42501');
  select * into p from public.profiles where id = subject for update;
  if not found then
    perform private.assert(p_expected_version = 0,'The profile changed. Reload before saving.','PT409');
    insert into public.profiles(id,seed_batch_id) values(subject,c.seed_batch_id) returning * into p;
    insert into private.profile_moderation(profile_id) values(subject);
  else
    perform private.assert(p.write_version = p_expected_version,'The profile changed. Reload before saving.','PT409');
    perform private.assert(not exists(select 1 from private.profile_moderation where profile_id = subject and status in ('removed','pending')),'Withdraw a pending submission before editing; removed profiles require an administrator.','42501');
  end if;
  if nullif(p_profile->>'programme_id','') is not null then
    select * into pr from public.programmes where id = (p_profile->>'programme_id')::uuid for share;
    perform private.assert(pr.id is not null and pr.is_active and private.compatible_origin(c.seed_batch_id,pr.seed_batch_id)
      and exists(select 1 from public.departments where id = pr.department_id and is_active and private.compatible_origin(c.seed_batch_id,seed_batch_id)), 'Choose a valid programme');
  end if;
  perform private.assert(jsonb_typeof(coalesce(p_profile->'skills','[]')) = 'array' and jsonb_array_length(coalesce(p_profile->'skills','[]')) <= 20,'Select at most 20 skills');
  select coalesce(array_agg(distinct value::uuid),'{}') into selected_skills from jsonb_array_elements_text(coalesce(p_profile->'skills','[]'));
  perform 1 from public.skills where id = any(selected_skills) order by id for share;
  perform private.assert(cardinality(selected_skills) = (select count(*) from public.skills s join public.skill_categories sc on sc.id = s.category_id
    where s.id = any(selected_skills) and s.is_active and sc.is_active and private.compatible_origin(c.seed_batch_id,s.seed_batch_id)
      and private.compatible_origin(c.seed_batch_id,sc.seed_batch_id)),'Select active, permitted skills');
  perform private.assert(jsonb_typeof(coalesce(p_profile->'projects','[]')) = 'array' and jsonb_array_length(coalesce(p_profile->'projects','[]')) <= 12,'At most 12 portfolio entries are allowed');
  perform private.assert(jsonb_typeof(coalesce(p_profile->'contacts','[]')) = 'array' and jsonb_array_length(coalesce(p_profile->'contacts','[]')) <= 8,'At most 8 contact links are allowed');
  perform private.assert(jsonb_typeof(coalesce(p_profile->'interests','[]')) = 'array' and jsonb_array_length(coalesce(p_profile->'interests','[]')) <= 10
    and not exists(select 1 from jsonb_array_elements_text(coalesce(p_profile->'interests','[]')) v where length(v) > 80),'Invalid interests');
  asset := nullif(p_profile->>'photo_asset_id','')::uuid;
  perform private.check_asset(subject,asset,'photo',c.seed_batch_id);
  update public.profiles set display_name = btrim(coalesce(p_profile->>'display_name','')),name_key = private.norm(p_profile->>'display_name'),
    programme_id = pr.id,member_type = coalesce(p_profile->>'member_type','student'),
    stage_number = nullif(p_profile->>'stage_number','')::smallint,graduation_year = nullif(p_profile->>'graduation_year','')::smallint,
    bio = btrim(coalesce(p_profile->>'bio','')),about = btrim(coalesce(p_profile->>'about','')),services = btrim(coalesce(p_profile->>'services','')),
    interests = array(select jsonb_array_elements_text(coalesce(p_profile->'interests','[]'))),visibility = coalesce(p_profile->>'visibility','public'),
    photo_asset_id = asset,photo_audience = coalesce(p_profile->>'photo_audience','owner'),discovery_opt_in = false,
    write_version = write_version + 1,content_version = content_version + 1 where id = subject returning * into p;
  perform private.assert(p.stage_number is null or (pr.id is not null and pr.stage_unit <> 'none' and p.stage_number <= pr.stage_count),'Semester or year is outside this programme');
  perform private.assert(p.graduation_year is null or p.graduation_year <= extract(year from now()),'Graduation year cannot be in the future');
  delete from public.profile_skills where profile_id = subject;
  insert into public.profile_skills(profile_id,skill_id) select subject,unnest(selected_skills);
  -- Check IDs before replacing owned collections; a supplied ID can never reassign someone else's row.
  for item in select value from jsonb_array_elements(coalesce(p_profile->'projects','[]')) loop
    perform private.check_keys(item,array['id','title','description','external_url','asset_id','audience','sort_order']);
    perform private.assert(not exists(select 1 from public.portfolio_items where id = nullif(item->>'id','')::uuid and profile_id <> subject),'Portfolio entry belongs to another account','42501');
    perform private.check_asset(subject,nullif(item->>'asset_id','')::uuid,'portfolio',c.seed_batch_id);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_profile->'contacts','[]')) loop
    perform private.check_keys(item,array['id','kind','label','value','audience']);
    perform private.assert(not exists(select 1 from public.profile_contacts where id = nullif(item->>'id','')::uuid and profile_id <> subject),'Contact belongs to another account','42501');
    perform private.assert(c.seed_batch_id is null,'Development profiles must not contain contact details');
  end loop;
  delete from public.portfolio_items where profile_id = subject;
  for item in select value from jsonb_array_elements(coalesce(p_profile->'projects','[]')) loop
    insert into public.portfolio_items(id,profile_id,title,description,external_url,asset_id,audience,sort_order)
      values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),subject,btrim(item->>'title'),coalesce(item->>'description',''),
        nullif(item->>'external_url',''),nullif(item->>'asset_id','')::uuid,coalesce(item->>'audience','owner'),coalesce((item->>'sort_order')::smallint,0));
  end loop;
  delete from public.profile_contacts where profile_id = subject;
  for item in select value from jsonb_array_elements(coalesce(p_profile->'contacts','[]')) loop
    insert into public.profile_contacts(id,profile_id,kind,label,value,audience)
      values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),subject,item->>'kind',coalesce(item->>'label',''),btrim(item->>'value'),coalesce(item->>'audience','owner'));
  end loop;
  update private.profile_moderation set status = 'draft',submitted_version = null,submitted_at = null,
    reviewed_version = null,reviewed_at = null,reviewed_by = null,owner_reason = null where profile_id = subject;
  return private.request_finish('save_profile',p_request_id,payload,jsonb_build_object('id',subject,'write_version',p.write_version,'status','draft'));
end $$;

create function public.profile_action(p_action text, p_expected_version bigint, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; c private.account_controls; m private.profile_moderation; result jsonb;
  payload jsonb := jsonb_build_object('action',p_action,'version',p_expected_version);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform private.require_user(p_action not in ('unpublish','request_deletion','cancel_deletion'));
  result := private.request_begin('profile_action',p_request_id,payload); if result is not null then return result; end if;
  select * into c from private.account_controls where user_id = auth.uid() for update;
  select * into p from public.profiles where id = auth.uid() for update;
  select * into m from private.profile_moderation where profile_id = p.id for update;
  perform private.assert(p.id is not null,'Save a profile first');
  perform private.assert(p.write_version = p_expected_version,'The profile changed. Reload before continuing.','PT409');
  if p_action in ('submit','publish') then
    perform private.assert(c.close_requested_at is null and m.status <> 'removed' and c.eligibility_status <> 'ineligible','This profile cannot be published','42501');
    perform private.check_profile_complete(p.id);
    if p_action = 'submit' then
      perform private.assert(m.status <> 'pending','Profile is already awaiting review','PT409');
      update private.profile_moderation set status = 'pending',submitted_version = p.content_version,submitted_at = clock_timestamp(),owner_reason = null where profile_id = p.id;
    else
      perform private.assert(m.status = 'approved' and m.reviewed_version = p.content_version and c.eligibility_status = 'eligible','Only an approved, eligible profile can be published','42501');
    end if;
    update public.profiles set discovery_opt_in = true where id = p.id;
  elsif p_action = 'unpublish' then
    update public.profiles set discovery_opt_in = false where id = p.id;
    update private.profile_moderation set status = 'draft',submitted_version = null,submitted_at = null where profile_id = p.id and status = 'pending';
  elsif p_action = 'request_deletion' then
    update private.account_controls set close_requested_at = coalesce(close_requested_at,clock_timestamp()),version = version + 1 where user_id = p.id;
    update public.profiles set discovery_opt_in = false where id = p.id;
    perform private.audit('profile.deletion_requested','profiles',p.id::text,'Owner requested profile deletion','{}',p.seed_batch_id);
  elsif p_action = 'cancel_deletion' then
    update private.account_controls set close_requested_at = null,version = version + 1 where user_id = p.id;
  else raise exception 'Unknown profile action';
  end if;
  update public.profiles set write_version = write_version + 1 where id = p.id returning * into p;
  return private.request_finish('profile_action',p_request_id,payload,jsonb_build_object('id',p.id,'write_version',p.write_version));
end $$;

create function public.suggest_skill(p_name text, p_category_id uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; skill uuid; payload jsonb := jsonb_build_object('name',p_name,'category',p_category_id);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform private.require_user();
  result := private.request_begin('suggest_skill',p_request_id,payload); if result is not null then return result; end if;
  perform private.assert((select count(*) from private.skill_requests where requester_id = auth.uid() and created_at > now() - interval '1 day') < 5,'You can suggest up to five skills per day');
  perform private.assert(p_category_id is null or exists(select 1 from public.skill_categories where id = p_category_id and is_active and private.compatible_origin(private.caller_batch(),seed_batch_id)),'Choose a valid category');
  select s.id into skill from public.skills s where s.is_active and private.compatible_origin(private.caller_batch(),s.seed_batch_id)
    and (s.key = private.norm(p_name) or exists(select 1 from public.skill_aliases a where a.skill_id = s.id and a.key = private.norm(p_name)));
  perform private.assert(skill is null,'This skill already exists. Select it from the list.');
  insert into private.skill_requests(requester_id,proposed_name,key,suggested_category_id,request_id,seed_batch_id)
    values(auth.uid(),btrim(p_name),private.norm(p_name),p_category_id,p_request_id,private.caller_batch()) returning jsonb_build_object('id',id,'status',status) into result;
  return private.request_finish('suggest_skill',p_request_id,payload,result);
end $$;
create function public.get_my_skill_requests() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',proposed_name,'status',status,'reason',resolution_reason,'resolved_skill_id',resolved_skill_id) order by created_at desc),'[]'::jsonb)
  from (select * from private.skill_requests where requester_id = auth.uid() and private.account_ok(false) order by created_at desc limit 50) r
$$;
create function public.report_profile(p_profile_id uuid, p_category text, p_description text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; batch uuid; target_batch uuid;
  payload jsonb := jsonb_build_object('profile',p_profile_id,'category',p_category,'description',p_description);
begin
  perform private.require_user();
  result := private.request_begin('report_profile',p_request_id,payload); if result is not null then return result; end if;
  perform private.assert(p_profile_id <> auth.uid() and private.profile_visible(p_profile_id),'Profile is not available','42501');
  select seed_batch_id into target_batch from public.profiles where id = p_profile_id;
  perform private.assert(private.caller_batch() is null or target_batch is null or private.caller_batch() = target_batch,'Report participants belong to different fixture batches','42501');
  batch := coalesce(private.caller_batch(),target_batch);
  perform private.assert((select count(*) from private.moderation_reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') < 5,'You can submit up to five reports per day');
  insert into private.moderation_reports(reporter_id,profile_id,target_subject,category,description,request_id,seed_batch_id)
    values(auth.uid(),p_profile_id,p_profile_id,p_category,btrim(p_description),p_request_id,batch) returning jsonb_build_object('id',id,'status',status) into result;
  return private.request_finish('report_profile',p_request_id,payload,result);
end $$;

revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.origin_allowed(uuid),private.account_ok(boolean),private.can_read_profile(uuid),private.can_read_audience(uuid,text,boolean) to anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.get_app_config(),public.get_reference_data(boolean),public.get_profile(uuid),public.discover_profiles(jsonb) to anon,authenticated;
grant execute on function public.get_session_context(),public.get_my_profile(),public.save_my_profile(jsonb,bigint,uuid),public.profile_action(text,bigint,uuid),
  public.suggest_skill(text,uuid,uuid),public.get_my_skill_requests(),public.report_profile(uuid,text,text,uuid) to authenticated;
