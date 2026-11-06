-- Operator-only, outside the automatic migration path. See docs/setup.md.
-- Execute inside a transaction after setting the required iust.operator.* values.
-- SQL checks intent and instance identity; the operator must also verify the connection is local.
do $$
declare
  expected uuid := nullif(current_setting('iust.operator.instance_id',true),'')::uuid;
  label text := btrim(current_setting('iust.operator.label',true));
  reason text := btrim(current_setting('iust.operator.reason',true));
  cfg private.instance_config;
begin
  perform private.assert(current_setting('iust.operator.confirm',true) = 'IUST_CONNECT_LOCAL_DEVELOPMENT',
    'Explicit local-development confirmation is required');
  perform private.assert(length(label) between 1 and 100 and length(reason) between 1 and 500,
    'Supply an operator label and reason');
  select * into cfg from private.instance_config where singleton for update;
  perform private.assert(expected is not null and cfg.instance_id = expected,'The exact inspected instance UUID is required');
  if cfg.environment = 'development' and cfg.seed_enabled then return; end if;
  update private.instance_config set environment = 'development', seed_enabled = true where singleton;
  insert into private.admin_audit_log(request_id,actor_kind,actor_label,action,target_table,target_key,reason)
    values(gen_random_uuid(),'operator',label,'operator.enable_fixtures','instance_config',expected::text,reason);
end $$;
