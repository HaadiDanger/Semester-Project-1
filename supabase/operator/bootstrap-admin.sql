-- Operator-only first bootstrap. No Auth user, email confirmation or eligibility is invented.
-- Execute inside a transaction after setting iust.operator.* values; see docs/setup.md.
do $$
declare
  expected uuid := nullif(current_setting('iust.operator.instance_id',true),'')::uuid;
  subject uuid := nullif(current_setting('iust.operator.user_id',true),'')::uuid;
  expected_email text := current_setting('iust.operator.email',true);
  label text := btrim(current_setting('iust.operator.label',true));
  reason text := btrim(current_setting('iust.operator.reason',true));
  c private.account_controls;
begin
  perform private.assert(current_setting('iust.operator.confirm',true) = 'IUST_CONNECT_FIRST_ADMIN',
    'Explicit first-administrator confirmation is required');
  perform private.assert(length(label) between 1 and 100 and length(reason) between 1 and 500,
    'Supply an operator label and reason');
  perform private.assert(expected is not null and exists(select 1 from private.instance_config where singleton and instance_id = expected),
    'The exact inspected instance UUID is required');
  perform pg_advisory_xact_lock(hashtextextended('iust.role_management',0));
  select * into c from private.account_controls where user_id = subject for update;
  perform private.assert(c.user_id is not null and c.account_status = 'active' and c.seed_batch_id is null and c.close_requested_at is null,
    'Choose an active, non-sample account without a deletion request');
  perform private.assert(exists(select 1 from auth.users where id = subject and email = expected_email and email_confirmed_at is not null
    and lower(email) not like '%@iust-connect.example.invalid' and raw_app_meta_data->>'iust_connect_fixture' is distinct from 'true'
    and raw_app_meta_data->>'seed_batch_id' is null),'Auth UUID, exact email and confirmed non-fixture identity must match');
  perform private.assert(not exists(select 1 from private.user_roles r join private.account_controls a on a.user_id = r.user_id
    where a.seed_batch_id is null and r.user_id <> subject),
    'A genuine privileged account already exists. Use its role manager rather than first bootstrap');
  if (select count(*) from private.user_roles where user_id = subject) = 2 then return; end if;
  perform private.assert(not exists(select 1 from private.user_roles where user_id = subject),
    'This account already has a role. Use the established role-management process');
  insert into private.user_roles(user_id,role) values(subject,'admin'),(subject,'role_manager');
  insert into private.admin_audit_log(request_id,actor_kind,actor_label,action,target_table,target_key,reason,details)
    values(gen_random_uuid(),'operator',label,'operator.bootstrap_admin','user_roles',subject::text,reason,
      jsonb_build_object('roles',jsonb_build_array('admin','role_manager'),'instance_id',expected));
end $$;
