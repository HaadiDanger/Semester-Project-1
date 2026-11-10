-- Operator-only removal of the previously imported Anas Tech directory entry.
-- Run inside a transaction with iust.operator.instance_id, label and reason set.
do $$
declare
  expected uuid := nullif(current_setting('iust.operator.instance_id',true),'')::uuid;
  label text := btrim(current_setting('iust.operator.label',true));
  reason text := btrim(current_setting('iust.operator.reason',true));
  subject constant uuid := '75cbf346-a3b7-4e17-b9e8-7dbd52f7293e';
  p public.profiles;
  m private.profile_moderation;
begin
  perform private.assert(expected is not null and exists(select 1 from private.instance_config where singleton and instance_id=expected),
    'The exact inspected instance UUID is required');
  perform private.assert(length(label) between 1 and 100 and length(reason) between 1 and 500,
    'Supply an operator label and reason');
  perform pg_advisory_xact_lock_shared(hashtextextended('iust.taxonomy',0));
  perform 1 from private.account_controls where user_id=subject for update;
  select * into p from public.profiles where id=subject for update;
  select * into m from private.profile_moderation where profile_id=subject for update;
  perform private.assert(p.id is not null and m.profile_id is not null and p.seed_batch_id is null
    and exists(select 1 from auth.users where id=subject and raw_app_meta_data->>'iust_profile_import'='anas-tech')
    and exists(select 1 from private.admin_audit_log where action='profile.import' and target_key='anas-tech'
      and details->>'profile_id'=subject::text), 'The imported Anas Tech profile must match');
  if m.status='removed' and not p.discovery_opt_in and p.featured_rank is null then return; end if;

  -- Use the same state transition as the administrator's Remove profile action.
  update private.profile_moderation set status='removed',removed_at=clock_timestamp(),owner_reason=reason
    where profile_id=subject;
  update public.profiles set discovery_opt_in=false,featured_rank=null,write_version=write_version+1
    where id=subject;
  insert into private.admin_audit_log(request_id,actor_kind,actor_label,action,target_table,target_key,reason,details)
    values(gen_random_uuid(),'operator',label,'profile.remove','profiles',subject::text,reason,
      jsonb_build_object('profile_key','anas-tech','previous_status',m.status,'previous_version',p.write_version,'instance_id',expected));
end $$;
