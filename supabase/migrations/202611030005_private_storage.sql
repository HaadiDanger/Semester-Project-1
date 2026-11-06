insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('upload-quarantine','upload-quarantine',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('profile-media','profile-media',false,5242880,array['image/webp']),
  ('verification-evidence','verification-evidence',false,5242880,array['image/webp']);

alter table private.assets add column quarantine_deleted_at timestamptz;
alter table private.assets add column cleanup_token uuid;
alter table private.assets add column cleanup_expires_at timestamptz;
alter table private.assets add column cleanup_delete_final boolean not null default false;
alter table private.assets add column cleanup_attempts integer not null default 0;
alter table private.assets add column cleanup_error text;

create function private.asset_attached(asset uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where photo_asset_id = asset)
    or exists(select 1 from public.portfolio_items where asset_id = asset)
    or exists(select 1 from private.price_verifications where evidence_asset_id = asset)
$$;
create function private.upload_allowed(purpose text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.account_ok() and exists(select 1 from private.account_controls where user_id = auth.uid() and close_requested_at is null)
    and case when purpose = 'price_evidence' then private.has_role('admin') else
      not exists(select 1 from private.profile_moderation where profile_id = auth.uid() and status in ('pending','removed')) end
$$;
create function private.can_upload_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.account_ok() and exists(select 1 from private.assets where quarantine_path = object_name
    and owner_id = auth.uid() and state = 'reserved' and expires_at > now() and private.origin_allowed(seed_batch_id)
    and private.upload_allowed(purpose))
$$;
create policy quarantine_insert on storage.objects for insert to authenticated
  with check(bucket_id = 'upload-quarantine' and owner_id = auth.uid()::text and private.can_upload_object(name));
-- No client SELECT/UPDATE/DELETE on these private buckets. Access is mediated below.

create function public.reserve_asset(p_purpose text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare id uuid := gen_random_uuid(); result jsonb; payload jsonb := jsonb_build_object('purpose',p_purpose);
begin
  perform private.require_user();
  result := private.request_begin('reserve_asset',p_request_id,payload); if result is not null then return result; end if;
  perform private.assert(p_purpose in ('photo','portfolio','price_evidence'),'Unsupported upload purpose');
  perform private.assert(p_purpose <> 'price_evidence' or private.has_role('admin'),'Price evidence requires administrator permission','42501');
  perform private.assert(p_purpose <> 'photo' or private.caller_batch() is null,'Sample profiles use initials rather than uploaded portraits','42501');
  perform private.assert(not exists(select 1 from private.account_controls where user_id = auth.uid() and close_requested_at is not null),'Cancel your deletion request before uploading');
  perform private.assert(private.upload_allowed(p_purpose),'Withdraw a pending submission before uploading; removed profiles require an administrator.','42501');
  perform private.assert((select count(*) from private.assets where owner_id = auth.uid() and created_at > now() - interval '1 day') < 40,'Daily upload limit reached');
  perform private.assert((select count(*) from private.assets where owner_id = auth.uid() and state in ('reserved','processing','ready')) < 30,'Remove unused uploads before adding more');
  insert into private.assets(id,owner_id,purpose,quarantine_path,bucket_id,object_path,seed_batch_id)
    values(id,auth.uid(),p_purpose,auth.uid()::text || '/' || id::text,
      case when p_purpose = 'price_evidence' then 'verification-evidence' else 'profile-media' end,
      auth.uid()::text || '/' || id::text || '.webp',private.caller_batch())
    returning jsonb_build_object('id',assets.id,'path',quarantine_path,'bucket','upload-quarantine','expires_at',expires_at) into result;
  return private.request_finish('reserve_asset',p_request_id,payload,result);
end $$;
create function public.get_my_assets() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,'state',state,'created_at',created_at,
    'failure_code',failure_code,'is_attached',private.asset_attached(id)) order by created_at desc),'[]'::jsonb)
  from private.assets where owner_id = auth.uid() and private.account_ok(false) and state <> 'deleted' and private.origin_allowed(seed_batch_id)
    and (purpose <> 'price_evidence' or private.has_role('admin'))
$$;
create function public.delete_my_asset(p_id uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a private.assets; result jsonb; payload jsonb := jsonb_build_object('id',p_id);
begin
  perform private.require_user(false);
  result := private.request_begin('delete_asset',p_request_id,payload); if result is not null then return result; end if;
  select * into a from private.assets where id = p_id for update;
  perform private.assert(a.id is not null and a.owner_id = auth.uid() and private.origin_allowed(a.seed_batch_id),'Upload is not available','42501');
  perform private.assert(a.purpose <> 'price_evidence' or private.has_role('admin'),'Administrator permission required','42501');
  perform private.assert(not private.asset_attached(a.id),'Remove this upload from your profile first. Historical evidence is retained.');
  perform private.assert(a.state <> 'processing','Upload is being processed. Try again shortly.','PT409');
  update private.assets set state = 'delete_pending' where id = a.id and state <> 'deleted';
  return private.request_finish('delete_asset',p_request_id,payload,jsonb_build_object('id',p_id,'state','delete_pending'));
end $$;
create function private.can_read_asset(asset uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.assets a where a.id = asset and a.state = 'ready' and private.origin_allowed(a.seed_batch_id)
    and case when a.purpose = 'price_evidence' then private.has_role('admin') and private.management_origin(a.seed_batch_id)
    else (a.owner_id = auth.uid() and private.account_ok(false))
      or exists(select 1 from public.profiles p where p.photo_asset_id = a.id and private.can_read_audience(p.id,p.photo_audience,true))
      or exists(select 1 from public.portfolio_items i where i.asset_id = a.id and private.can_read_audience(i.profile_id,i.audience,true)) end)
$$;
create function private.require_service() returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.assert(auth.role() = 'service_role','Trusted worker permission required','42501'); end $$;
create function private.set_viewer(subject uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role',case when subject is null then 'anon' else 'authenticated' end)::text,true);
  perform set_config('request.jwt.claim.sub',coalesce(subject::text,''),true);
  perform set_config('request.jwt.claim.role',case when subject is null then 'anon' else 'authenticated' end,true);
end $$;

-- The Edge Function obtains p_viewer_id ONLY by validating the bearer token with Auth.getUser.
create function public.worker_asset_access(p_id uuid, p_viewer_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a private.assets;
begin
  perform private.require_service();
  perform private.set_viewer(p_viewer_id);
  perform private.assert(private.can_read_asset(p_id),'Image is not available','42501');
  select * into a from private.assets where id = p_id;
  if a.purpose = 'price_evidence' then
    perform private.audit('asset.evidence_read','assets',a.id::text,'Authorized private evidence access','{}',a.seed_batch_id);
  end if;
  return jsonb_build_object('id',a.id,'bucket',a.bucket_id,'path',a.object_path,'media_type',a.media_type);
end $$;
create function public.worker_claim_asset(p_id uuid, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a private.assets;
begin
  perform private.require_service();
  perform private.set_viewer(p_user_id);
  perform private.require_user();
  select * into a from private.assets where id = p_id for update;
  perform private.assert(a.id is not null and a.owner_id = p_user_id and private.origin_allowed(a.seed_batch_id),'Upload is not available','42501');
  perform private.assert(a.purpose <> 'price_evidence' or private.has_role('admin'),'Administrator permission required','42501');
  if a.state = 'ready' then return jsonb_build_object('id',a.id,'state','ready'); end if;
  perform private.assert(private.upload_allowed(a.purpose),'This account or profile can no longer accept uploads','42501');
  perform private.assert(a.expires_at > clock_timestamp() and a.state = 'reserved',
    'Upload is expired, rejected, or already processing. Retry an expired upload with a new reservation.','PT409');
  update private.assets set state = 'processing',processing_token = gen_random_uuid(),processing_expires_at = now() + interval '2 minutes'
    where id = a.id returning * into a;
  return jsonb_build_object('id',a.id,'state',a.state,'token',a.processing_token,'quarantine_path',a.quarantine_path,'bucket',a.bucket_id,'path',a.object_path);
end $$;
create function public.worker_complete_asset(p_id uuid, p_user_id uuid, p_token uuid, p_metadata jsonb, p_failure text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a private.assets;
begin
  perform private.require_service();
  -- Keep account -> asset lock ordering consistent with owner writes and claims.
  perform 1 from private.account_controls where user_id = p_user_id for update;
  select * into a from private.assets where id = p_id for update;
  perform private.assert(a.id is not null and a.owner_id = p_user_id and a.state = 'processing' and a.processing_token = p_token
    and a.processing_expires_at > now(),'Processing claim expired or changed','PT409');
  if p_failure is not null then
    perform private.assert(p_failure in ('invalid_image','processing_failed'),'Invalid failure code');
    update private.assets set state = 'rejected',failure_code = p_failure,processing_token = null,processing_expires_at = null where id = a.id;
    return jsonb_build_object('id',a.id,'state','rejected');
  end if;
  perform private.set_viewer(p_user_id);
  perform private.require_user();
  perform private.assert(a.purpose <> 'price_evidence' or private.has_role('admin'),'Administrator permission required','42501');
  perform private.assert(private.upload_allowed(a.purpose),'This account or profile can no longer accept uploads','42501');
  perform private.check_keys(p_metadata,array['byte_size','width','height','sha256']);
  update private.assets set state = 'ready',media_type = 'image/webp',byte_size = (p_metadata->>'byte_size')::bigint,
    width = (p_metadata->>'width')::integer,height = (p_metadata->>'height')::integer,sha256 = p_metadata->>'sha256',
    validated_at = clock_timestamp(),processing_token = null,processing_expires_at = null,failure_code = null where id = a.id;
  return jsonb_build_object('id',a.id,'state','ready');
end $$;

-- An upload may finish after its processing lease or lose the completion response.
-- Queue late bytes again without ever deleting an already committed, ready asset.
create function public.worker_reconcile_asset(p_id uuid, p_user_id uuid, p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a private.assets;
begin
  perform private.require_service();
  perform 1 from private.account_controls where user_id = p_user_id for update;
  select * into a from private.assets where id = p_id for update;
  perform private.assert(a.id is not null and a.owner_id = p_user_id,'Upload is not available','42501');
  if a.state = 'ready' then return jsonb_build_object('id',a.id,'state','ready'); end if;
  perform private.assert(a.state in ('rejected','delete_pending','deleted') or (a.state = 'processing' and a.processing_token = p_token),
    'Processing claim changed','PT409');
  perform private.assert(not private.asset_attached(a.id),'Referenced uploads cannot be reclaimed','42501');
  update private.assets set state = 'delete_pending',processing_token = null,processing_expires_at = null,
    cleanup_token = null,cleanup_expires_at = null,cleanup_delete_final = true where id = a.id;
  return jsonb_build_object('id',a.id,'state','delete_pending');
end $$;

create function public.worker_claim_cleanup(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a private.assets; jobs jsonb := '[]';
begin
  perform private.require_service();
  perform private.assert(p_limit between 1 and 100,'Invalid cleanup batch size');
  -- Referenced price evidence is retained, including historical verification evidence.
  for a in select * from private.assets
    where state <> 'deleted' and (cleanup_expires_at is null or cleanup_expires_at < now())
      and ((state = 'reserved' and expires_at < now()) or (state = 'processing' and processing_expires_at < now())
        or state in ('rejected','delete_pending') or (state = 'ready' and (quarantine_deleted_at is null
          or (updated_at < now() - interval '24 hours' and not private.asset_attached(id)))))
    order by created_at,id for update skip locked limit p_limit loop
    if a.state <> 'ready' or (a.updated_at < now() - interval '24 hours' and not private.asset_attached(a.id)) then
      a.state := 'delete_pending'; a.cleanup_delete_final := true;
    else a.cleanup_delete_final := false;
    end if;
    update private.assets set state = a.state,cleanup_token = gen_random_uuid(),cleanup_expires_at = now() + interval '2 minutes',
      cleanup_delete_final = a.cleanup_delete_final,cleanup_attempts = cleanup_attempts + 1 where id = a.id returning * into a;
    jobs := jobs || jsonb_build_array(jsonb_build_object('id',a.id,'token',a.cleanup_token,'quarantine_path',a.quarantine_path,
      'bucket',a.bucket_id,'path',a.object_path,'delete_final',a.cleanup_delete_final));
  end loop;
  return jobs;
end $$;
create function public.worker_finish_cleanup(p_id uuid, p_token uuid, p_success boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare a private.assets;
begin
  perform private.require_service();
  select * into a from private.assets where id = p_id for update;
  perform private.assert(a.cleanup_token = p_token,'Cleanup claim changed','PT409');
  if p_success then
    update private.assets set state = case when a.cleanup_delete_final then 'deleted' else state end,
      quarantine_deleted_at = clock_timestamp(),cleanup_token = null,cleanup_expires_at = null,cleanup_error = null where id = a.id;
  else
    update private.assets set cleanup_token = null,cleanup_expires_at = now() + interval '15 minutes',cleanup_error = 'storage_delete_failed' where id = a.id;
  end if;
end $$;

revoke execute on function private.asset_attached(uuid),private.upload_allowed(text),private.can_upload_object(text),private.can_read_asset(uuid),private.require_service(),private.set_viewer(uuid) from public,anon,authenticated;
grant execute on function private.can_upload_object(text) to authenticated;
grant execute on function public.reserve_asset(text,uuid),public.get_my_assets(),public.delete_my_asset(uuid,uuid) to authenticated;
grant execute on function public.worker_asset_access(uuid,uuid),public.worker_claim_asset(uuid,uuid),public.worker_complete_asset(uuid,uuid,uuid,jsonb,text),
  public.worker_reconcile_asset(uuid,uuid,uuid),public.worker_claim_cleanup(integer),public.worker_finish_cleanup(uuid,uuid,boolean) to service_role;
