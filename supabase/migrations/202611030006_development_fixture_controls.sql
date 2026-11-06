-- Service-only fixture tooling, disabled by the production-default instance setting.
-- The CLI additionally requires a loopback URL, explicit confirmation and exact instance UUID.
create function private.require_fixture_target(instance uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  perform private.assert(exists(select 1 from private.instance_config where singleton and instance_id = instance
    and environment = 'development' and seed_enabled),'Fixture target must be the explicitly enabled development instance','42501');
end $$;
create function public.dev_fixture_target() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  return (select jsonb_build_object('application','iust-connect','instance_id',instance_id,'environment',environment,'seed_enabled',seed_enabled)
    from private.instance_config where singleton);
end $$;
create function public.dev_fixture_inventory(p_instance_id uuid, p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_fixture_target(p_instance_id);
  perform private.assert(p_batch_id is not null,'A specific batch is required');
  return jsonb_build_object('users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'app_metadata',u.raw_app_meta_data))
    from auth.users u left join private.account_controls c on c.user_id = u.id
    where c.seed_batch_id = p_batch_id or u.raw_app_meta_data->>'seed_batch_id' = p_batch_id::text),'[]'::jsonb));
end $$;
create function public.dev_register_fixture(p_instance_id uuid, p_batch_id uuid, p_user_id uuid, p_admin boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare c private.account_controls;
begin
  perform private.require_fixture_target(p_instance_id);
  perform private.assert(p_batch_id is not null and exists(select 1 from auth.users where id = p_user_id
    and email like '%@iust-connect.example.invalid' and email_confirmed_at is not null
    and raw_app_meta_data->>'iust_connect_fixture' = 'true' and raw_app_meta_data->>'seed_batch_id' = p_batch_id::text),
    'Fixture registration requires a dedicated, confirmed Auth fixture identity','42501');
  select * into c from private.account_controls where user_id = p_user_id for update;
  if c.seed_batch_id = p_batch_id then return; end if;
  perform private.assert(c.user_id is not null and c.seed_batch_id is null and not exists(select 1 from public.profiles where id = p_user_id)
    and not exists(select 1 from private.user_roles where user_id = p_user_id),'Existing application accounts cannot be relabelled as fixtures','42501');
  perform set_config('iust.fixture_registration',p_user_id::text,true);
  update private.account_controls set seed_batch_id = p_batch_id,eligibility_status = 'eligible',
    eligibility_basis = 'Development fixture only; not a verified university identity',eligibility_decided_by = p_user_id,
    eligibility_decided_at = now(),version = version + 1 where user_id = p_user_id;
  if p_admin then insert into private.user_roles(user_id,role) values(p_user_id,'admin'); end if;
  insert into private.admin_audit_log(request_id,actor_kind,actor_label,action,target_table,target_key,reason,seed_batch_id)
    values(gen_random_uuid(),'operator','guarded-local-fixture-loader','fixture.register','auth.users',p_user_id::text,'Development Auth fixture',p_batch_id);
end $$;
create function public.dev_cleanup_fixture_data(p_instance_id uuid, p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.require_fixture_target(p_instance_id);
  perform private.assert(p_batch_id is not null,'A specific batch is required');
  perform pg_advisory_xact_lock(hashtextextended(p_batch_id::text,0));
  perform private.assert(not exists(select 1 from private.account_controls c join auth.users u on u.id = c.user_id
    where c.seed_batch_id = p_batch_id and (u.raw_app_meta_data->>'iust_connect_fixture' is distinct from 'true'
      or u.raw_app_meta_data->>'seed_batch_id' is distinct from p_batch_id::text or u.email not like '%@iust-connect.example.invalid')),
    'Fixture Auth metadata no longer matches its registered batch','42501');
  -- Close registered fixture accounts before removing content, preventing new owner writes during retries.
  update private.account_controls set account_status = 'closed',version = version + 1 where seed_batch_id = p_batch_id;
  perform set_config('iust.cleanup_batch',p_batch_id::text,true);
  -- FK restrictions make accidental cross-origin references fail rather than cascade through genuine data.
  delete from private.price_verifications where seed_batch_id = p_batch_id;
  delete from private.price_records where seed_batch_id = p_batch_id;
  delete from public.canteen_offerings where seed_batch_id = p_batch_id;
  delete from public.menu_items where seed_batch_id = p_batch_id;
  delete from public.canteens where seed_batch_id = p_batch_id;
  delete from public.food_categories where seed_batch_id = p_batch_id;
  delete from public.profiles where seed_batch_id = p_batch_id;
  delete from private.skill_requests where seed_batch_id = p_batch_id;
  delete from private.moderation_reports where seed_batch_id = p_batch_id;
  delete from public.skill_aliases where seed_batch_id = p_batch_id;
  delete from public.skills where seed_batch_id = p_batch_id;
  delete from public.skill_categories where seed_batch_id = p_batch_id;
  delete from public.programmes where seed_batch_id = p_batch_id;
  delete from public.departments where seed_batch_id = p_batch_id;
  delete from private.rpc_receipts where seed_batch_id = p_batch_id;
  delete from private.admin_audit_log where seed_batch_id = p_batch_id;
  update private.assets set state = 'delete_pending' where seed_batch_id = p_batch_id and state <> 'deleted';
  select jsonb_build_object('assets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'quarantine_path',quarantine_path,'bucket',bucket_id,'path',object_path))
      from private.assets where seed_batch_id = p_batch_id),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email)) from auth.users
      where raw_app_meta_data->>'iust_connect_fixture' = 'true' and raw_app_meta_data->>'seed_batch_id' = p_batch_id::text
        and email like '%@iust-connect.example.invalid'),'[]'::jsonb)) into result;
  return result;
end $$;
create function public.dev_finalize_fixture_cleanup(p_instance_id uuid, p_batch_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_fixture_target(p_instance_id);
  perform private.assert(p_batch_id is not null,'A specific batch is required');
  perform private.assert(not exists(select 1 from private.assets a join storage.objects o on
    (o.bucket_id = 'upload-quarantine' and o.name = a.quarantine_path) or (o.bucket_id = a.bucket_id and o.name = a.object_path)
    where a.seed_batch_id = p_batch_id),'Remove fixture bytes through Storage before finalizing cleanup');
  perform private.assert(not exists(select 1 from public.profiles where seed_batch_id = p_batch_id),'Remove fixture profiles first');
  delete from private.assets where seed_batch_id = p_batch_id;
  delete from private.user_roles where user_id in (select user_id from private.account_controls where seed_batch_id = p_batch_id);
  delete from private.account_controls where seed_batch_id = p_batch_id;
end $$;

revoke execute on function private.require_fixture_target(uuid) from public,anon,authenticated;
grant execute on function public.dev_fixture_target(),public.dev_register_fixture(uuid,uuid,uuid,boolean),
  public.dev_fixture_inventory(uuid,uuid),public.dev_cleanup_fixture_data(uuid,uuid),public.dev_finalize_fixture_cleanup(uuid,uuid) to service_role;
