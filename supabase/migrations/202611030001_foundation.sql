-- IUST Connect owns these application objects. No university reference or fixture data.
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;
revoke create on schema public from public, anon, authenticated;
alter default privileges revoke execute on functions from public;
alter default privileges revoke execute on functions from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from anon, authenticated;

create function private.assert(ok boolean, message text, code text default '22023') returns void
language plpgsql set search_path = '' as $$
begin
  if ok is not true then raise exception using message = message, errcode = code; end if;
end $$;

create function private.norm(value text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(normalize(coalesce(value, ''), NFKC), '\s+', ' ', 'g')))
$$;

create function private.pattern(value text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(private.norm(value), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
$$;

create function private.check_keys(value jsonb, allowed text[]) returns void
language plpgsql set search_path = '' as $$
begin
  perform private.assert(jsonb_typeof(value) = 'object' and octet_length(value::text) <= 65536, 'Invalid request object');
  perform private.assert(not exists(select 1 from jsonb_object_keys(value) k where not k = any(allowed)), 'Unknown or protected field');
end $$;

create function private.valid_url(value text) returns boolean
language sql immutable set search_path = '' as $$
  select value is null or (length(value) <= 2048 and value ~ '^https://[^/@[:space:][:cntrl:]]+(\.[^/@[:space:][:cntrl:]]+|:[0-9]+)?([/?#][^[:space:][:cntrl:]]*)?$'
    and value !~ '^https://[^/]*@' and position(E'\\' in value) = 0)
$$;

create table private.instance_config (
  singleton boolean primary key default true check (singleton),
  instance_id uuid not null unique default gen_random_uuid(),
  environment text not null default 'production' check (environment in ('production','development')),
  seed_enabled boolean not null default false,
  stale_after_days smallint not null default 30 check (stale_after_days between 1 and 90),
  eligibility_mode text not null default 'manual' check (eligibility_mode = 'manual'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (environment <> 'production' or not seed_enabled)
);
insert into private.instance_config(singleton) values (true);

create table private.account_controls (
  user_id uuid primary key references auth.users(id) on delete restrict,
  account_status text not null default 'active' check (account_status in ('active','suspended','closed')),
  eligibility_status text not null default 'pending' check (eligibility_status in ('pending','eligible','ineligible')),
  eligibility_basis text check (length(eligibility_basis) <= 500),
  eligibility_decided_by uuid, eligibility_decided_at timestamptz,
  owner_reason text check (length(owner_reason) <= 500), staff_note text check (length(staff_note) <= 2000),
  close_requested_at timestamptz, version bigint not null default 1 check (version > 0),
  seed_batch_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (eligibility_status = 'pending' or (eligibility_decided_by is not null and eligibility_decided_at is not null
    and eligibility_basis is not null and length(btrim(eligibility_basis)) > 0))
);
create index account_state_idx on private.account_controls(account_status, eligibility_status, user_id);

create table private.user_roles (
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('admin','role_manager')),
  granted_at timestamptz not null default now(), granted_by uuid,
  primary key (user_id, role)
);
create index roles_role_idx on private.user_roles(role,user_id);

create table private.admin_audit_log (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  actor_kind text not null check (actor_kind in ('user','operator','system')),
  actor_user_id uuid, actor_label text check(length(actor_label) <= 100),
  action text not null check (length(action) between 1 and 80), target_table text not null,
  target_key text not null, occurred_at timestamptz not null default clock_timestamp(),
  reason text check(length(reason) <= 500), details jsonb not null default '{}' check(octet_length(details::text) <= 4096),
  seed_batch_id uuid,
  check ((actor_kind = 'user' and actor_user_id is not null) or (actor_kind <> 'user' and actor_label is not null))
);
create index audit_time_idx on private.admin_audit_log(occurred_at desc,id);
create index audit_target_idx on private.admin_audit_log(target_table,target_key,occurred_at desc);

create table public.departments (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
  key text not null unique, is_active boolean not null default true, seed_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.programmes (
  id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id) on delete restrict,
  name text not null check(length(btrim(name)) between 1 and 120), key text not null,
  stage_unit text not null check(stage_unit in ('semester','year','none')), stage_count smallint,
  is_active boolean not null default true, seed_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(department_id,key), check ((stage_unit = 'none' and stage_count is null) or (stage_unit <> 'none' and stage_count is not null and stage_count between 1 and 20))
);
create table public.skill_categories (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 80),
  key text not null unique, display_order smallint not null default 0 check(display_order between 0 and 1000),
  is_active boolean not null default true, seed_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.skills (
  id uuid primary key default gen_random_uuid(), category_id uuid not null references public.skill_categories(id) on delete restrict,
  name text not null check(length(btrim(name)) between 1 and 80), key text not null unique,
  is_active boolean not null default true, merged_into_id uuid references public.skills(id) on delete restrict,
  seed_batch_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (merged_into_id is null or (merged_into_id <> id and not is_active))
);
create table public.skill_aliases (
  id uuid primary key default gen_random_uuid(), skill_id uuid not null references public.skills(id) on delete restrict,
  alias text not null check(length(btrim(alias)) between 1 and 80), key text not null unique,
  seed_batch_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index programmes_department_idx on public.programmes(department_id,is_active,key,id);
create index skills_category_idx on public.skills(category_id,is_active,key,id);
create index skills_key_search_idx on public.skills using gin(key extensions.gin_trgm_ops);
create index aliases_skill_idx on public.skill_aliases(skill_id);
create index aliases_key_search_idx on public.skill_aliases using gin(key extensions.gin_trgm_ops);

create table private.assets (
  id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id) on delete set null,
  purpose text not null check(purpose in ('photo','portfolio','price_evidence')),
  state text not null default 'reserved' check(state in ('reserved','processing','ready','rejected','delete_pending','deleted')),
  quarantine_path text not null unique, bucket_id text, object_path text,
  media_type text, byte_size bigint, width integer, height integer, sha256 text,
  expires_at timestamptz not null default now() + interval '10 minutes',
  processing_token uuid, processing_expires_at timestamptz, validated_at timestamptz, failure_code text,
  seed_batch_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(bucket_id,object_path),
  check(state <> 'processing' or (processing_token is not null and processing_expires_at is not null)),
  check(state <> 'ready' or (bucket_id in ('profile-media','verification-evidence') and object_path is not null
    and media_type = 'image/webp' and byte_size between 1 and 5242880 and width between 1 and 4096
    and height between 1 and 4096 and width::bigint * height <= 16000000 and sha256 ~ '^[0-9a-f]{64}$' and validated_at is not null) is true)
);
create index assets_owner_idx on private.assets(owner_id,state,created_at);
create index assets_expiry_idx on private.assets(state,expires_at);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '' check(length(display_name) <= 80), name_key text not null default '',
  programme_id uuid references public.programmes(id) on delete restrict,
  member_type text not null default 'student' check(member_type in ('student','graduate')),
  stage_number smallint check(stage_number between 1 and 20), graduation_year smallint check(graduation_year between 1900 and 9999),
  bio text not null default '' check(length(bio) <= 280), about text not null default '' check(length(about) <= 2000),
  services text not null default '' check(length(services) <= 500), interests text[] not null default '{}' check(cardinality(interests) <= 10),
  discovery_opt_in boolean not null default false,
  visibility text not null default 'public' check(visibility in ('public','campus')),
  photo_asset_id uuid references private.assets(id) on delete restrict,
  photo_audience text not null default 'owner' check(photo_audience in ('owner','campus','public')),
  write_version bigint not null default 1, content_version bigint not null default 1,
  featured_rank smallint check(featured_rank between 1 and 3), seed_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(write_version >= content_version and content_version > 0),
  check((member_type = 'graduate' and stage_number is null) or (member_type = 'student' and graduation_year is null))
);
create index profiles_name_idx on public.profiles(name_key,id);
create index profiles_programme_idx on public.profiles(programme_id,member_type,stage_number,id);
create index profiles_text_idx on public.profiles using gin ((private.norm(display_name || ' ' || bio || ' ' || about || ' ' || services)) extensions.gin_trgm_ops);
create index profiles_photo_idx on public.profiles(photo_asset_id) where photo_asset_id is not null;
create unique index profiles_spotlight_idx on public.profiles(featured_rank) where featured_rank is not null;

create table private.profile_moderation (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'draft' check(status in ('draft','pending','approved','rejected','removed')),
  submitted_version bigint, submitted_at timestamptz, reviewed_version bigint,
  reviewed_at timestamptz, reviewed_by uuid, owner_reason text check(length(owner_reason) <= 500),
  staff_note text check(length(staff_note) <= 2000), removed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(status <> 'pending' or (submitted_version is not null and submitted_at is not null)),
  check(status <> 'approved' or (reviewed_version is not null and reviewed_at is not null and reviewed_by is not null)),
  check(status <> 'rejected' or (owner_reason is not null and length(btrim(owner_reason)) > 0)),
  check(status <> 'removed' or removed_at is not null)
);
create index moderation_queue_idx on private.profile_moderation(status,submitted_at,profile_id);
create table public.profile_skills (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  created_at timestamptz not null default now(), primary key(profile_id,skill_id)
);
create index profile_skills_reverse_idx on public.profile_skills(skill_id,profile_id);
create table public.profile_contacts (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('email','phone','social','website')), label text not null default '' check(length(label) <= 60),
  value text not null check(length(value) between 1 and 2048),
  audience text not null default 'owner' check(audience in ('owner','campus','public')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(profile_id,kind,value),
  check ((kind in ('social','website') and private.valid_url(value)) or
    (kind = 'email' and length(value) <= 254 and value ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$') or
    (kind = 'phone' and value ~ '^\+?[0-9 ()-]{7,24}$'))
);
create index contacts_profile_idx on public.profile_contacts(profile_id,audience,id);
create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(btrim(title)) between 1 and 100), description text not null default '' check(length(description) <= 1000),
  external_url text check(private.valid_url(external_url)), asset_id uuid references private.assets(id) on delete restrict,
  audience text not null default 'campus' check(audience in ('owner','campus','public')),
  sort_order smallint not null default 0 check(sort_order between 0 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(length(btrim(description)) > 0 or external_url is not null or asset_id is not null)
);
create index portfolio_profile_idx on public.portfolio_items(profile_id,sort_order,id);
create index portfolio_asset_idx on public.portfolio_items(asset_id) where asset_id is not null;

create table private.skill_requests (
  id uuid primary key default gen_random_uuid(), requester_id uuid not null references auth.users(id) on delete restrict,
  proposed_name text not null check(length(btrim(proposed_name)) between 1 and 80), key text not null,
  suggested_category_id uuid references public.skill_categories(id) on delete restrict,
  status text not null default 'pending' check(status in ('pending','accepted','merged','rejected')),
  resolved_skill_id uuid references public.skills(id) on delete restrict,
  resolution_reason text check(length(resolution_reason) <= 500), reviewed_by uuid, reviewed_at timestamptz,
  request_id uuid not null, seed_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(requester_id,request_id), check(status not in ('accepted','merged') or resolved_skill_id is not null),
  check(status = 'pending' or (reviewed_by is not null and reviewed_at is not null and resolution_reason is not null and length(btrim(resolution_reason)) > 0))
);
create unique index skill_request_pending_idx on private.skill_requests(requester_id,key) where status = 'pending';
create index skill_request_queue_idx on private.skill_requests(status,created_at,id);
create table private.moderation_reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid references auth.users(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null, target_subject uuid not null,
  category text not null check(category in ('spam','harassment','impersonation','other')),
  description text not null check(length(btrim(description)) between 1 and 1000),
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  resolution_summary text check(length(resolution_summary) <= 500), staff_note text check(length(staff_note) <= 2000),
  resolved_by uuid, resolved_at timestamptz, request_id uuid not null, seed_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(reporter_id,request_id), check(status = 'open' or (resolved_by is not null and resolved_at is not null and resolution_summary is not null and length(btrim(resolution_summary)) > 0))
);
create unique index reports_open_idx on private.moderation_reports(reporter_id,profile_id) where status = 'open';
create index reports_queue_idx on private.moderation_reports(status,created_at,id);

create table public.food_categories (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 80), key text not null unique,
  display_order smallint not null default 0 check(display_order between 0 and 1000), is_active boolean not null default true,
  seed_batch_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.menu_items (
  id uuid primary key default gen_random_uuid(), food_category_id uuid not null references public.food_categories(id) on delete restrict,
  name text not null check(length(btrim(name)) between 1 and 120), name_key text not null,
  variant text not null default '' check(length(variant) <= 80), variant_key text not null default '',
  serving_quantity numeric(10,3) check(serving_quantity > 0 and serving_quantity <= 9999999.999),
  unit_code text check(unit_code in ('piece','g','ml','portion')), portion_spec text not null default '' check(length(portion_spec) <= 200),
  portion_key text not null default '', is_comparable boolean not null default false, is_active boolean not null default true,
  seed_batch_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct(name_key,variant_key,serving_quantity,unit_code,portion_key),
  check(not is_comparable or (serving_quantity is not null and unit_code is not null and (unit_code <> 'portion' or length(btrim(portion_spec)) > 0)))
);
create index menu_category_idx on public.menu_items(food_category_id,is_active,name_key,id);
create index menu_search_idx on public.menu_items using gin(name_key extensions.gin_trgm_ops);
create table public.canteens (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120), key text not null unique,
  location_description text not null default '' check(length(location_description) <= 300), is_active boolean not null default true,
  seed_batch_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.canteen_offerings (
  id uuid primary key default gen_random_uuid(), canteen_id uuid not null references public.canteens(id) on delete restrict,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  canteen_item_label text not null default '' check(length(canteen_item_label) <= 120), currency text not null default 'INR' check(currency = 'INR'),
  is_available boolean not null default false, availability_checked_at timestamptz, is_active boolean not null default true,
  seed_batch_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(canteen_id,menu_item_id,currency), check(not is_available or availability_checked_at is not null)
);
create index offering_menu_idx on public.canteen_offerings(menu_item_id,currency,is_active,canteen_id);
create table private.price_records (
  id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
  offering_id uuid not null references public.canteen_offerings(id) on delete restrict,
  event_kind text not null check(event_kind in ('set','withdraw')), amount numeric(10,2),
  recorded_at timestamptz not null default clock_timestamp(), recorded_by uuid not null,
  corrects_price_id uuid references private.price_records(id) on delete restrict,
  source_note text check(length(source_note) <= 500), request_id uuid not null, seed_batch_id uuid,
  unique(offering_id,request_id),
  check((event_kind = 'set' and amount is not null and amount between 0 and 99999999.99) or (event_kind = 'withdraw' and amount is null))
);
create index prices_latest_idx on private.price_records(offering_id,recorded_at desc,sequence desc);
create index prices_correction_idx on private.price_records(corrects_price_id);
create table private.price_verifications (
  id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
  price_record_id uuid not null references private.price_records(id) on delete restrict,
  decision text not null check(decision in ('verified','revoked')),
  recorded_at timestamptz not null default clock_timestamp(), observed_at timestamptz,
  actor_user_id uuid not null, source_method text check(source_method in ('displayed_menu','supplier_confirmation','simulated')),
  evidence_asset_id uuid references private.assets(id) on delete restrict,
  reason text not null check(length(btrim(reason)) between 1 and 500), request_id uuid not null, seed_batch_id uuid,
  unique(price_record_id,request_id),
  check(decision <> 'verified' or (observed_at is not null and source_method is not null and evidence_asset_id is not null))
);
create index verification_latest_idx on private.price_verifications(price_record_id,recorded_at desc,sequence desc);
create index verification_asset_idx on private.price_verifications(evidence_asset_id);

create function private.origin_allowed(batch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.instance_config where singleton and (batch is null or (environment = 'development' and seed_enabled)))
$$;
create function private.compatible_origin(root_batch uuid, reference_batch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.origin_allowed(root_batch) and private.origin_allowed(reference_batch)
    and (reference_batch is null or reference_batch = root_batch)
$$;
create function private.caller_batch() returns uuid
language sql stable security definer set search_path = '' as $$ select seed_batch_id from private.account_controls where user_id = auth.uid() $$;
create function private.management_origin(batch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.origin_allowed(batch) and (private.caller_batch() is null or private.caller_batch() = batch)
$$;
create function private.account_ok(active_only boolean default true) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.account_controls c join auth.users u on u.id = c.user_id
    where c.user_id = auth.uid() and u.email_confirmed_at is not null and c.account_status <> 'closed'
    and (not active_only or c.account_status = 'active') and private.origin_allowed(c.seed_batch_id))
$$;
create function private.has_role(wanted text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.account_ok() and exists(select 1 from private.user_roles where user_id = auth.uid() and role = wanted)
$$;
create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('admin') or (private.account_ok() and exists(select 1 from private.account_controls where user_id = auth.uid() and eligibility_status = 'eligible'))
$$;
create function private.profile_visible(subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p join private.account_controls c on c.user_id = p.id
    join private.profile_moderation m on m.profile_id = p.id join auth.users u on u.id = p.id
    where p.id = subject and p.discovery_opt_in and m.status = 'approved' and m.reviewed_version = p.content_version
       and c.account_status = 'active' and c.eligibility_status = 'eligible' and c.close_requested_at is null and u.email_confirmed_at is not null
      and private.compatible_origin(p.seed_batch_id,c.seed_batch_id)
       and (auth.uid() is null or private.account_ok()) and (p.visibility = 'public' or (private.is_member()
         and (private.caller_batch() is null or private.caller_batch() = p.seed_batch_id))))
$$;
create function private.can_read_profile(subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = subject and private.origin_allowed(p.seed_batch_id)
    and ((p.id = auth.uid() and private.account_ok(false)) or (private.has_role('admin') and private.management_origin(p.seed_batch_id)) or private.profile_visible(p.id)))
$$;
create function private.can_read_audience(subject uuid, audience text, admin_preview boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_read_profile(subject) and ((subject = auth.uid() and private.account_ok(false))
    or (admin_preview and private.has_role('admin') and exists(select 1 from public.profiles where id = subject and private.management_origin(seed_batch_id)))
    or (private.profile_visible(subject) and (audience = 'public' or (audience = 'campus' and private.is_member()
      and exists(select 1 from public.profiles where id = subject and (private.caller_batch() is null or private.caller_batch() = seed_batch_id))))))
$$;

create function private.signup_controls() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.email,'')) like '%@iust-connect.example.invalid' or new.raw_app_meta_data->>'iust_connect_fixture' = 'true' then
    perform private.assert(exists(select 1 from private.instance_config where singleton and environment = 'development' and seed_enabled),
      'Fixture identities require an explicitly enabled development instance','42501');
  end if;
  insert into private.account_controls(user_id) values(new.id) on conflict do nothing;
  return new;
end $$;
create trigger iust_signup_controls after insert on auth.users for each row execute function private.signup_controls();
-- Existing accounts start pending; metadata cannot grant authority.
insert into private.account_controls(user_id) select id from auth.users on conflict do nothing;
create function private.email_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update private.account_controls set eligibility_status = 'pending', eligibility_decided_by = null,
      eligibility_decided_at = null, eligibility_basis = null, version = version + 1 where user_id = new.id;
    update public.profiles set write_version = write_version + 1 where id = new.id;
  end if;
  return new;
end $$;
create trigger iust_email_changed after update of email on auth.users for each row execute function private.email_changed();

create function private.touch() returns trigger language plpgsql set search_path = '' as $$
begin new.created_at := old.created_at; new.updated_at := clock_timestamp(); return new; end $$;
create function private.guard_origin() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert(private.origin_allowed(new.seed_batch_id), 'Sample data requires a seed-enabled development instance', '42501');
  if tg_op = 'UPDATE' and new.seed_batch_id is distinct from old.seed_batch_id then
    perform private.assert(tg_table_name = 'account_controls' and old.seed_batch_id is null
      and current_setting('iust.fixture_registration', true) = to_jsonb(new)->>'user_id', 'Sample origin is immutable', '42501');
  end if;
  return new;
end $$;
create function private.append_only() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.seed_batch_id is not null and private.origin_allowed(old.seed_batch_id)
    and current_setting('iust.cleanup_batch', true) = old.seed_batch_id::text then return old; end if;
  raise exception 'History is append-only' using errcode = '42501';
end $$;

do $$
declare r record;
begin
  for r in select table_schema,table_name from information_schema.tables where table_schema in ('public','private')
    and table_type = 'BASE TABLE' and table_name in ('instance_config','account_controls','user_roles','admin_audit_log',
    'departments','programmes','skill_categories','skills','skill_aliases','assets','profiles','profile_moderation',
    'profile_skills','profile_contacts','portfolio_items','skill_requests','moderation_reports','food_categories','menu_items',
    'canteens','canteen_offerings','price_records','price_verifications') loop
    execute format('alter table %I.%I enable row level security',r.table_schema,r.table_name);
    execute format('revoke all on %I.%I from public, anon, authenticated',r.table_schema,r.table_name);
    if exists(select 1 from information_schema.columns where table_schema = r.table_schema and table_name = r.table_name and column_name = 'updated_at') then
      execute format('create trigger touch before update on %I.%I for each row execute function private.touch()',r.table_schema,r.table_name);
    end if;
    if exists(select 1 from information_schema.columns where table_schema = r.table_schema and table_name = r.table_name and column_name = 'seed_batch_id') then
      execute format('create trigger origin_guard before insert or update on %I.%I for each row execute function private.guard_origin()',r.table_schema,r.table_name);
    end if;
  end loop;
end $$;
create trigger prices_immutable before update or delete on private.price_records for each row execute function private.append_only();
create trigger verifications_immutable before update or delete on private.price_verifications for each row execute function private.append_only();
create trigger audit_immutable before update or delete on private.admin_audit_log for each row execute function private.append_only();

create function private.guard_instance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text; has_samples boolean;
begin
  perform private.assert(new.instance_id = old.instance_id,'Database instance identity is immutable','42501');
  if new.environment = 'production' or not new.seed_enabled then
    perform private.assert(not exists(select 1 from auth.users where lower(email) like '%@iust-connect.example.invalid'
      or raw_app_meta_data->>'iust_connect_fixture' = 'true'),'Remove fixture Auth accounts before disabling development fixtures','42501');
    foreach t in array array['account_controls','admin_audit_log','assets','skill_requests','moderation_reports','price_records','price_verifications','rpc_receipts',
      'departments','programmes','skill_categories','skills','skill_aliases','profiles','food_categories','menu_items','canteens','canteen_offerings'] loop
      execute format('select exists(select 1 from %I.%I where seed_batch_id is not null)',
        case when t = any(array['account_controls','admin_audit_log','assets','skill_requests','moderation_reports','price_records','price_verifications','rpc_receipts']) then 'private' else 'public' end,t) into has_samples;
      perform private.assert(not has_samples,'Remove all fixture records before disabling development fixtures','42501');
    end loop;
  end if;
  return new;
end $$;
create trigger instance_guard before update on private.instance_config for each row execute function private.guard_instance();

grant select on public.departments,public.programmes,public.skill_categories,public.skills,public.skill_aliases,
  public.profile_skills,public.profile_contacts,public.portfolio_items,public.food_categories,
  public.menu_items,public.canteens,public.canteen_offerings to anon,authenticated;
-- Row policies do not redact columns. The photo pointer and editor/control metadata are RPC-only.
grant select(id,display_name,programme_id,member_type,stage_number,graduation_year,bio,about,services,interests,featured_rank,created_at,updated_at)
  on public.profiles to anon,authenticated;
do $$
declare t text;
begin
  foreach t in array array['departments','programmes','skill_categories','skills','skill_aliases','food_categories','menu_items','canteens','canteen_offerings'] loop
    execute format('create policy reference_read on public.%I for select to anon, authenticated using (private.origin_allowed(seed_batch_id) and (auth.uid() is null or private.account_ok(false)))',t);
  end loop;
end $$;
create policy profile_read on public.profiles for select to anon,authenticated using(private.can_read_profile(id));
create policy profile_skills_read on public.profile_skills for select to anon,authenticated using(private.can_read_profile(profile_id));
create policy contacts_read on public.profile_contacts for select to anon,authenticated using(private.can_read_audience(profile_id,audience));
create policy portfolio_read on public.portfolio_items for select to anon,authenticated using(private.can_read_audience(profile_id,audience,true));

revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.origin_allowed(uuid),private.account_ok(boolean),private.can_read_profile(uuid),
  private.can_read_audience(uuid,text,boolean) to anon,authenticated;
-- Function grants are deliberately enumerated in each later migration.
