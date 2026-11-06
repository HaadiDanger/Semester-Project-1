create function public.admin_moderate_profile(p_user_id uuid, p_action text, p_expected_version bigint, p_data jsonb, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c private.account_controls; p public.profiles; m private.profile_moderation; result jsonb;
  payload jsonb := jsonb_build_object('subject',p_user_id,'action',p_action,'version',p_expected_version,'data',p_data);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform pg_advisory_xact_lock(hashtextextended('iust.role_management',0));
  perform private.require_admin();
  result := private.request_begin('moderate_profile',p_request_id,payload); if result is not null then return result; end if;
  perform private.check_keys(p_data,array['reason','staff_note','eligibility_status','featured_rank']);
  perform private.assert(length(btrim(p_data->>'reason')) between 1 and 500,'Add a reason (1–500 characters)');
  perform private.assert(p_user_id <> auth.uid(),'Administrators cannot moderate their own account','42501');
  select * into c from private.account_controls where user_id = p_user_id for update;
  perform private.assert(c.user_id is not null and private.management_origin(c.seed_batch_id),'Account is not available','42501');
  select * into p from public.profiles where id = p_user_id for update;
  select * into m from private.profile_moderation where profile_id = p_user_id for update;
  perform private.assert(coalesce(p.write_version,c.version) = p_expected_version,'This account changed. Reload before reviewing.','PT409');
  if p_action = 'eligibility' then
    perform private.assert(p_data->>'eligibility_status' in ('pending','eligible','ineligible'),'Invalid eligibility status');
    perform private.assert(not exists(select 1 from private.user_roles where user_id = p_user_id) or p_data->>'eligibility_status' = 'eligible','Revoke protected roles before restricting this account','42501');
    update private.account_controls set eligibility_status = p_data->>'eligibility_status',eligibility_basis = p_data->>'reason',
      eligibility_decided_by = auth.uid(),eligibility_decided_at = clock_timestamp(),owner_reason = p_data->>'reason',
      staff_note = p_data->>'staff_note',version = version + 1 where user_id = p_user_id;
  elsif p_action = 'suspend' then
    perform private.assert(not exists(select 1 from private.user_roles where user_id = p_user_id),'Revoke protected roles before suspending this account','42501');
    update private.account_controls set account_status = 'suspended',owner_reason = p_data->>'reason',staff_note = p_data->>'staff_note',version = version + 1 where user_id = p_user_id;
  elsif p_action = 'restore' then
    perform private.assert(c.account_status <> 'closed','Closed accounts require operator review','42501');
    update private.account_controls set account_status = 'active',owner_reason = p_data->>'reason',version = version + 1 where user_id = p_user_id;
    update private.profile_moderation set status = 'draft',removed_at = null,submitted_version = null,submitted_at = null,
      reviewed_version = null,reviewed_at = null,reviewed_by = null,owner_reason = p_data->>'reason',staff_note = p_data->>'staff_note' where profile_id = p_user_id;
    update public.profiles set discovery_opt_in = false where id = p_user_id;
  else
    perform private.assert(p.id is not null,'This account has no profile');
    if p_action = 'approve' then
      perform private.assert(m.status = 'pending' and m.submitted_version = p.content_version,'Only the current pending submission can be approved','PT409');
      perform private.assert(c.account_status = 'active' and c.eligibility_status = 'eligible' and c.close_requested_at is null
        and exists(select 1 from auth.users where id = p.id and email_confirmed_at is not null),'Confirm eligibility and account status before approval','42501');
      perform private.check_profile_complete(p.id);
      update private.profile_moderation set status = 'approved',reviewed_version = p.content_version,reviewed_at = clock_timestamp(),
        reviewed_by = auth.uid(),owner_reason = p_data->>'reason',staff_note = p_data->>'staff_note' where profile_id = p.id;
    elsif p_action = 'reject' then
      perform private.assert(m.status = 'pending','Only a pending submission can be rejected','PT409');
      update private.profile_moderation set status = 'rejected',reviewed_version = p.content_version,reviewed_at = clock_timestamp(),
        reviewed_by = auth.uid(),owner_reason = p_data->>'reason',staff_note = p_data->>'staff_note' where profile_id = p.id;
      update public.profiles set discovery_opt_in = false where id = p.id;
    elsif p_action = 'remove' then
      update private.profile_moderation set status = 'removed',removed_at = clock_timestamp(),owner_reason = p_data->>'reason',staff_note = p_data->>'staff_note' where profile_id = p.id;
      update public.profiles set discovery_opt_in = false,featured_rank = null where id = p.id;
    elsif p_action = 'feature' then
      perform private.assert(m.status = 'approved' and c.account_status = 'active','Only active approved profiles can be featured');
      perform private.assert(p_data->>'featured_rank' is null or (p_data->>'featured_rank')::integer between 1 and 3,'Invalid spotlight position');
      perform private.assert(not exists(select 1 from public.profiles where featured_rank = (p_data->>'featured_rank')::smallint
        and id <> p.id and not private.management_origin(seed_batch_id)),'That spotlight position belongs to another data origin','42501');
      update public.profiles set featured_rank = null,write_version = write_version + 1 where featured_rank = (p_data->>'featured_rank')::smallint and id <> p.id;
      update public.profiles set featured_rank = (p_data->>'featured_rank')::smallint where id = p.id;
    elsif p_action = 'delete' then
      perform private.assert(c.close_requested_at is not null,'Permanent deletion requires an owner deletion request; use Remove for moderation','42501');
      -- Remove personal profile content immediately. Authentication remains a separate account.
      delete from public.profiles where id = p.id;
      update private.assets set state = 'delete_pending' where owner_id = p.id and purpose in ('photo','portfolio') and state <> 'deleted';
      update private.account_controls set close_requested_at = null,version = version + 1 where user_id = p.id;
    else raise exception 'Unknown moderation action';
    end if;
  end if;
  update public.profiles set write_version = write_version + 1 where id = p_user_id;
  perform private.audit('profile.' || p_action,'profiles',p_user_id::text,p_data->>'reason',jsonb_build_object('previous_status',m.status,'previous_version',p.write_version),c.seed_batch_id);
  return private.request_finish('moderate_profile',p_request_id,payload,jsonb_build_object('id',p_user_id,'action',p_action));
end $$;

create function public.admin_save_reference(p_table text, p_id uuid, p_data jsonb, p_expected_updated_at timestamptz, p_reason text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare allowed text[]; old_row jsonb; combined jsonb; change jsonb := p_data; batch uuid; subject uuid := coalesce(p_id,gen_random_uuid());
  columns_sql text; values_sql text; result jsonb;
  payload jsonb := jsonb_build_object('table',p_table,'id',p_id,'data',p_data,'version',p_expected_updated_at,'reason',p_reason);
begin
  perform pg_advisory_xact_lock(hashtextextended('iust.taxonomy',0));
  perform private.require_admin();
  result := private.request_begin('save_reference',p_request_id,payload); if result is not null then return result; end if;
  perform private.assert(length(btrim(p_reason)) between 1 and 500,'Add a change reason');
  allowed := case p_table
    when 'departments' then array['name','is_active']
    when 'programmes' then array['name','department_id','stage_unit','stage_count','is_active']
    when 'skill_categories' then array['name','display_order','is_active']
    when 'skills' then array['name','category_id','is_active']
    when 'food_categories' then array['name','display_order','is_active']
    when 'menu_items' then array['name','food_category_id','variant','serving_quantity','unit_code','portion_spec','is_comparable','is_active']
    when 'canteens' then array['name','location_description','is_active']
    when 'canteen_offerings' then array['canteen_id','menu_item_id','canteen_item_label','is_available','is_active'] end;
  perform private.assert(allowed is not null,'Unknown reference collection');
  perform private.check_keys(p_data,allowed);
  execute format('select to_jsonb(r) from public.%I r where id = $1 for update',p_table) into old_row using subject;
  if p_id is not null then
    perform private.assert(old_row is not null and (old_row->>'updated_at')::timestamptz = p_expected_updated_at,'Reference changed. Reload before saving.','PT409');
    batch := (old_row->>'seed_batch_id')::uuid;
  else batch := private.caller_batch();
  end if;
  perform private.assert(private.management_origin(batch),'Reference is not available','42501');
  combined := coalesce(old_row,'{}') || p_data;
  if p_table <> 'canteen_offerings' and p_data ? 'name' then
    change := change || jsonb_build_object(case when p_table = 'menu_items' then 'name_key' else 'key' end,private.norm(p_data->>'name'),'name',btrim(p_data->>'name'));
  end if;
  if p_table = 'programmes' then
    perform private.assert(exists(select 1 from public.departments where id = (combined->>'department_id')::uuid and private.compatible_origin(batch,seed_batch_id)),'Choose a valid department');
    perform private.assert(not exists(select 1 from public.profiles where programme_id = subject and stage_number is not null
      and (combined->>'stage_unit' = 'none' or stage_number > (combined->>'stage_count')::integer)),'Existing students have stages outside that range');
    perform private.assert(old_row is null or old_row->>'stage_unit' = combined->>'stage_unit' or not exists(select 1 from public.profiles where programme_id = subject),'Create a new programme to change the stage unit of an occupied programme');
  elsif p_table = 'skills' then
    perform private.assert(exists(select 1 from public.skill_categories where id = (combined->>'category_id')::uuid and private.compatible_origin(batch,seed_batch_id)),'Choose a valid skill category');
    perform private.assert(not exists(select 1 from public.skill_aliases where key = private.norm(combined->>'name') and skill_id <> subject),'That name is already an alias for another skill');
  elsif p_table = 'menu_items' then
    perform private.assert(exists(select 1 from public.food_categories where id = (combined->>'food_category_id')::uuid and private.compatible_origin(batch,seed_batch_id)),'Choose a valid food category');
    if p_data ? 'variant' then change := change || jsonb_build_object('variant_key',private.norm(p_data->>'variant')); end if;
    if p_data ? 'portion_spec' then change := change || jsonb_build_object('portion_key',private.norm(p_data->>'portion_spec')); end if;
    perform private.assert(old_row is null or not exists(select 1 from private.price_records r join public.canteen_offerings o on o.id = r.offering_id where o.menu_item_id = subject)
      or jsonb_build_array(private.norm(old_row->>'name'),private.norm(old_row->>'variant'),old_row->'serving_quantity',old_row->'unit_code',private.norm(old_row->>'portion_spec'))
        = jsonb_build_array(private.norm(combined->>'name'),private.norm(combined->>'variant'),combined->'serving_quantity',combined->'unit_code',private.norm(combined->>'portion_spec')),
      'An item with price history has an immutable comparison identity. Create a new item.');
  elsif p_table = 'canteen_offerings' then
    perform private.assert(exists(select 1 from public.canteens where id = (combined->>'canteen_id')::uuid and private.compatible_origin(batch,seed_batch_id))
      and exists(select 1 from public.menu_items where id = (combined->>'menu_item_id')::uuid and private.compatible_origin(batch,seed_batch_id)),'Choose a valid canteen and menu item');
    perform private.assert(old_row is null or (old_row->>'canteen_id' = combined->>'canteen_id' and old_row->>'menu_item_id' = combined->>'menu_item_id'),'Offering identity is immutable');
    if p_data ? 'is_available' then change := change || jsonb_build_object('availability_checked_at',clock_timestamp()); end if;
  end if;
  if p_id is null then change := change || jsonb_build_object('id',subject,'seed_batch_id',batch); end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k) into columns_sql,values_sql from jsonb_object_keys(change) k;
  perform private.assert(columns_sql is not null,'No changes supplied');
  if p_id is null then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning jsonb_build_object(''id'',id,''updated_at'',updated_at)',p_table,columns_sql,values_sql,p_table) into result using change;
  else
    execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I,$1) r) where id = $2 returning jsonb_build_object(''id'',id,''updated_at'',updated_at)',p_table,columns_sql,values_sql,p_table) into result using change,subject;
  end if;
  perform private.audit('reference.save',p_table,subject::text,p_reason,jsonb_build_object('fields',array(select jsonb_object_keys(p_data))),batch);
  return private.request_finish('save_reference',p_request_id,payload,result);
end $$;

create function public.admin_merge_taxonomy(p_table text, p_source uuid, p_target uuid, p_reason text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a jsonb; b jsonb; result jsonb; payload jsonb := jsonb_build_object('table',p_table,'source',p_source,'target',p_target,'reason',p_reason);
begin
  perform pg_advisory_xact_lock(hashtextextended('iust.taxonomy',0));
  perform private.require_admin();
  result := private.request_begin('merge_taxonomy',p_request_id,payload); if result is not null then return result; end if;
  perform private.assert(p_table in ('skills','skill_categories') and p_source <> p_target and length(btrim(p_reason)) between 1 and 500,'Choose two different skills or categories and explain the merge');
  execute format('select to_jsonb(t) from public.%I t where id = $1 for update',p_table) into a using p_source;
  execute format('select to_jsonb(t) from public.%I t where id = $1 for update',p_table) into b using p_target;
  perform private.assert(a is not null and b is not null and (b->>'is_active')::boolean and (a->>'is_active')::boolean
    and a->'seed_batch_id' = b->'seed_batch_id' and private.management_origin((a->>'seed_batch_id')::uuid),'Select active references from the same data origin');
  if p_table = 'skills' then
    update public.profiles set write_version = write_version + 1 where id in (select profile_id from public.profile_skills where skill_id = p_source);
    insert into public.profile_skills(profile_id,skill_id) select profile_id,p_target from public.profile_skills where skill_id = p_source on conflict do nothing;
    delete from public.profile_skills where skill_id = p_source;
    update public.skill_aliases set skill_id = p_target where skill_id = p_source;
    insert into public.skill_aliases(skill_id,alias,key,seed_batch_id) values(p_target,a->>'name',a->>'key',(a->>'seed_batch_id')::uuid) on conflict(key) do nothing;
    update public.skills set is_active = false,merged_into_id = p_target where id = p_source;
    update private.skill_requests set resolved_skill_id = p_target where resolved_skill_id = p_source;
  else
    update public.skills set category_id = p_target where category_id = p_source;
    update public.skill_categories set is_active = false where id = p_source;
    update private.skill_requests set suggested_category_id = p_target where suggested_category_id = p_source;
  end if;
  perform private.audit('taxonomy.merge',p_table,p_source::text,p_reason,jsonb_build_object('target',p_target),(a->>'seed_batch_id')::uuid);
  return private.request_finish('merge_taxonomy',p_request_id,payload,jsonb_build_object('id',p_target));
end $$;

create function public.admin_resolve_request(p_kind text, p_id uuid, p_decision text, p_reason text, p_skill_id uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.skill_requests; report private.moderation_reports; result jsonb; batch uuid;
  payload jsonb := jsonb_build_object('kind',p_kind,'id',p_id,'decision',p_decision,'reason',p_reason,'skill',p_skill_id);
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform private.require_admin();
  result := private.request_begin('resolve_request',p_request_id,payload); if result is not null then return result; end if;
  perform private.assert(length(btrim(p_reason)) between 1 and 500,'Add a resolution reason');
  if p_kind = 'skill' then
    select * into r from private.skill_requests where id = p_id for update;
    perform private.assert(r.id is not null and r.status = 'pending' and private.management_origin(r.seed_batch_id),'Request is not pending or available','PT409');
    perform private.assert(p_decision in ('accepted','merged','rejected'),'Invalid decision');
    perform private.assert(p_decision = 'rejected' or exists(select 1 from public.skills s join public.skill_categories c on c.id = s.category_id
      where s.id = p_skill_id and s.is_active and c.is_active and private.compatible_origin(r.seed_batch_id,s.seed_batch_id)
        and private.compatible_origin(r.seed_batch_id,c.seed_batch_id)),'Select an active skill, creating it first if needed');
    update private.skill_requests set status = p_decision,resolution_reason = p_reason,resolved_skill_id = case when p_decision <> 'rejected' then p_skill_id end,
      reviewed_by = auth.uid(),reviewed_at = clock_timestamp() where id = p_id;
    batch := r.seed_batch_id;
  elsif p_kind = 'report' then
    select * into report from private.moderation_reports where id = p_id for update;
    perform private.assert(report.id is not null and report.status = 'open' and report.target_subject <> auth.uid()
      and report.reporter_id is distinct from auth.uid() and private.management_origin(report.seed_batch_id)
      and (private.caller_batch() is null or exists(select 1 from private.account_controls where user_id = report.target_subject and private.management_origin(seed_batch_id))),
      'Report is not available','42501');
    perform private.assert(p_decision in ('resolved','dismissed'),'Invalid decision');
    update private.moderation_reports set status = p_decision,resolution_summary = p_reason,resolved_by = auth.uid(),resolved_at = clock_timestamp() where id = p_id;
    batch := report.seed_batch_id;
  else raise exception 'Unknown request kind';
  end if;
  perform private.audit(p_kind || '.resolve',p_kind,p_id::text,p_reason,jsonb_build_object('decision',p_decision),batch);
  return private.request_finish('resolve_request',p_request_id,payload,jsonb_build_object('id',p_id,'status',p_decision));
end $$;

create function public.manage_role(p_user_id uuid, p_role text, p_grant boolean, p_reason text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target private.account_controls; result jsonb;
  payload jsonb := jsonb_build_object('target',p_user_id,'role',p_role,'grant',p_grant,'reason',p_reason);
begin
  perform pg_advisory_xact_lock(hashtextextended('iust.role_management',0));
  perform private.require_user();
  perform private.assert(private.has_role('role_manager'),'Role-manager permission required','42501');
  result := private.request_begin('manage_role',p_request_id,payload); if result is not null then return result; end if;
  perform private.assert(p_user_id <> auth.uid() and p_role in ('admin','role_manager') and p_grant is not null,'Choose another account and a supported role');
  perform private.assert(length(btrim(p_reason)) between 1 and 500,'Add a role change reason');
  select * into target from private.account_controls where user_id = p_user_id for update;
  perform private.assert(target.user_id is not null and private.management_origin(target.seed_batch_id),'Account is not available','42501');
  if p_grant then
    perform private.assert(target.account_status = 'active' and exists(select 1 from auth.users where id = p_user_id and email_confirmed_at is not null),'A role requires an active, confirmed account');
    insert into private.user_roles(user_id,role,granted_by) values(p_user_id,p_role,auth.uid()) on conflict do nothing;
  else
    perform private.assert(exists(select 1 from private.user_roles r join private.account_controls c on c.user_id = r.user_id
      join auth.users u on u.id = r.user_id where r.role = p_role and r.user_id <> p_user_id and c.account_status = 'active' and u.email_confirmed_at is not null
        and c.seed_batch_id is not distinct from target.seed_batch_id and private.origin_allowed(c.seed_batch_id)),
      'The last active administrator or role manager cannot be removed','42501');
    delete from private.user_roles where user_id = p_user_id and role = p_role;
  end if;
  perform private.audit('role.' || case when p_grant then 'grant' else 'revoke' end,'user_roles',p_user_id::text,p_reason,jsonb_build_object('role',p_role),target.seed_batch_id);
  return private.request_finish('manage_role',p_request_id,payload,jsonb_build_object('id',p_user_id,'role',p_role,'granted',p_grant));
end $$;
create function public.get_role_directory(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert(private.has_role('role_manager'),'Role-manager permission required','42501');
  perform private.assert(length(p_query) <= 160,'Search is too long');
  return (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select u.id,u.email,c.account_status,
    coalesce((select jsonb_agg(role order by role) from private.user_roles where user_id = u.id),'[]'::jsonb) as roles
    from auth.users u join private.account_controls c on c.user_id = u.id where private.management_origin(c.seed_batch_id)
      and private.norm(u.email) like private.pattern(p_query) order by u.email,u.id limit 50) x);
end $$;
create function public.admin_update_settings(p_stale_after_days integer, p_eligibility_instructions text, p_reason text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; payload jsonb := jsonb_build_object('days',p_stale_after_days,'instructions',p_eligibility_instructions,'reason',p_reason);
begin
  perform private.require_admin();
  perform private.assert(private.caller_batch() is null,'Sample administrators cannot change instance settings','42501');
  result := private.request_begin('settings',p_request_id,payload); if result is not null then return result; end if;
  perform private.assert(length(btrim(p_reason)) between 1 and 500,'Add a reason');
  update private.instance_config set stale_after_days = p_stale_after_days,eligibility_instructions = btrim(p_eligibility_instructions) where singleton;
  perform private.audit('settings.update','instance_config','singleton',p_reason,jsonb_build_object('stale_after_days',p_stale_after_days));
  return private.request_finish('settings',p_request_id,payload,public.get_app_config());
end $$;

revoke execute on function private.management_origin(uuid) from public,anon,authenticated;
grant execute on function public.admin_moderate_profile(uuid,text,bigint,jsonb,uuid),public.admin_save_reference(text,uuid,jsonb,timestamptz,text,uuid),
  public.admin_merge_taxonomy(text,uuid,uuid,text,uuid),public.admin_resolve_request(text,uuid,text,text,uuid,uuid),
  public.manage_role(uuid,text,boolean,text,uuid),public.get_role_directory(text),public.admin_update_settings(integer,text,text,uuid) to authenticated;
