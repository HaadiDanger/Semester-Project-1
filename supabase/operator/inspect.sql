-- Run with `supabase db query --read-only --file ...` against the identified target.
-- One SELECT works with CLI 3's read-only validator and prepared-query execution.
select current_database() as database, current_user as database_role, version() as postgres_version,
  (select to_jsonb(c) from (select instance_id, environment, seed_enabled, stale_after_days, eligibility_mode, created_at
    from private.instance_config where singleton) c) as instance,
  coalesce((select jsonb_agg(to_jsonb(r) order by r.user_id,r.role) from (
    select r.user_id, r.role, c.account_status, c.seed_batch_id is not null as is_sample,
      u.email_confirmed_at is not null as email_confirmed
    from private.user_roles r join private.account_controls c on c.user_id = r.user_id
    join auth.users u on u.id = r.user_id) r),'[]'::jsonb) as role_holders,
  coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from (
    select id, public, file_size_limit, allowed_mime_types from storage.buckets
    where id in ('upload-quarantine','profile-media','verification-evidence')) b),'[]'::jsonb) as media_buckets;
