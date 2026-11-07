import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { inspectImage } from "../../supabase/functions/_shared/image-validator.mjs"

const keyPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const hashPattern = /^[a-f0-9]{64}$/
const bounded = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max
const literal = value => `E'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`
export const profileImportHash = profile => createHash("sha256").update(JSON.stringify(profile)).digest("hex")

export function validateProfileImport(profile) {
  assert.match(profile.key, keyPattern)
  assert.match(profile.id, uuidPattern)
  assert.ok(bounded(profile.display_name, 80) && profile.display_name.trim().length >= 2)
  assert.match(profile.placeholder_email, /^[a-z0-9.+-]+@example\.invalid$/, "Use an explicitly non-deliverable placeholder email")
  assert.ok(bounded(profile.bio, 280) && profile.bio.trim().length >= 10)
  assert.ok(bounded(profile.about, 2000) && bounded(profile.services, 500))
  assert.ok(Array.isArray(profile.interests) && profile.interests.length <= 10 && profile.interests.every(item => bounded(item, 80)))
  assert.ok(Array.isArray(profile.skills) && profile.skills.length > 0 && profile.skills.length <= 20)
  assert.ok(profile.skills.every(skill => bounded(skill.name, 80) && bounded(skill.category, 80)))
  assert.equal(new Set(profile.skills.map(skill => skill.name.normalize("NFKC").trim().toLowerCase())).size, profile.skills.length)
  assert.match(profile.photo.id, uuidPattern)
  assert.notEqual(profile.id, profile.photo.id)
  assert.equal(profile.photo.file, `${profile.key}.webp`)
  assert.match(profile.photo.sha256, hashPattern)
  assert.ok([profile.photo.width, profile.photo.height].every(value => Number.isInteger(value) && value > 0 && value <= 4096))
  assert.ok(Number.isInteger(profile.photo.byte_size) && profile.photo.byte_size > 0 && profile.photo.byte_size <= 5242880)
  assert.match(profile.source.received_on, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(profile.source.original_photo_sha256, hashPattern)
  assert.ok(bounded(profile.source.note, 500))
}

export async function loadProfileImport(key = "anas-tech") {
  assert.match(key, keyPattern)
  const profile = JSON.parse(await readFile(new URL(`../data/profiles/${key}.json`, import.meta.url), "utf8"))
  assert.equal(profile.key, key)
  validateProfileImport(profile)
  const bytes = await readFile(new URL(`../data/profiles/${profile.photo.file}`, import.meta.url))
  assert.equal(createHash("sha256").update(bytes).digest("hex"), profile.photo.sha256, "Profile photograph hash mismatch")
  const image = inspectImage(bytes)
  assert.equal(image.format, "WEBP")
  assert.equal(image.width, profile.photo.width); assert.equal(image.height, profile.photo.height)
  assert.equal(bytes.length, profile.photo.byte_size)
  return { profile, bytes }
}

// Auth creation and immutable Storage upload precede this atomic, operator-only import.
// A receipt makes retries preserve subsequent owner edits and publication decisions.
export function createProfileImportSQL({ profile, instanceId, operator = "profile-import-cli" }) {
  validateProfileImport(profile)
  assert.match(instanceId, uuidPattern, "Specify the exact inspected database instance UUID")
  assert.ok(bounded(operator, 100))
  const body = `
declare
  entry jsonb := ${literal(JSON.stringify(profile))}::jsonb;
  expected_instance uuid := ${literal(instanceId)}::uuid;
  operator_label text := ${literal(operator.trim())};
  manifest_hash text := ${literal(profileImportHash(profile))};
  subject uuid := (entry->>'id')::uuid;
  photo_id uuid := (entry->'photo'->>'id')::uuid;
  receipt private.admin_audit_log;
  skill jsonb; category_ref uuid; skill_ref uuid;
begin
  perform private.assert(exists(select 1 from private.instance_config where singleton and instance_id=expected_instance),
    'The database does not match the explicitly selected profile-import instance');
  perform pg_advisory_xact_lock(hashtextextended('iust.taxonomy',0));
  select * into receipt from private.admin_audit_log where action='profile.import' and target_key=entry->>'key';
  if found then
    perform private.assert(receipt.details->>'manifest_sha256'=manifest_hash,
      'This profile was already imported with different content. Existing data was preserved.');
    raise notice 'Profile import already completed. Existing records were preserved.';
    return;
  end if;
  perform 1 from private.account_controls where user_id=subject for update;
  perform private.assert(exists(select 1 from auth.users u join private.account_controls c on c.user_id=u.id
    where u.id=subject and u.email=entry->>'placeholder_email' and u.email_confirmed_at is not null
      and u.raw_app_meta_data->>'iust_profile_import'=entry->>'key' and u.raw_app_meta_data->>'manifest_sha256'=manifest_hash
      and c.account_status='active' and c.eligibility_status='pending' and c.close_requested_at is null and c.seed_batch_id is null),
    'A matching, confirmed import account is required. Existing accounts were preserved.');
  perform private.assert(not exists(select 1 from public.profiles where id=subject or name_key=private.norm(entry->>'display_name')),
    'A profile with this identity or name already exists. Existing data was preserved.');
  perform private.assert(not exists(select 1 from private.assets where id=photo_id), 'The profile photo identity is already in use.');

  insert into private.assets(id,owner_id,purpose,state,quarantine_path,bucket_id,object_path,media_type,byte_size,width,height,sha256,validated_at,quarantine_deleted_at)
    values(photo_id,subject,'photo','ready',subject::text || '/' || photo_id::text,'profile-media',subject::text || '/' || photo_id::text || '.webp',
      'image/webp',(entry->'photo'->>'byte_size')::bigint,(entry->'photo'->>'width')::integer,(entry->'photo'->>'height')::integer,
      entry->'photo'->>'sha256',clock_timestamp(),clock_timestamp());
  perform private.check_asset(subject,photo_id,'photo',null);
  insert into public.profiles(id,display_name,name_key,bio,about,services,interests,photo_asset_id,photo_audience,visibility,discovery_opt_in)
    values(subject,entry->>'display_name',private.norm(entry->>'display_name'),entry->>'bio',entry->>'about',entry->>'services',
      array(select jsonb_array_elements_text(entry->'interests')),photo_id,'public','public',true);
  for skill in select value from jsonb_array_elements(entry->'skills') loop
    select id into category_ref from public.skill_categories where key=private.norm(skill->>'category');
    if category_ref is null then
      insert into public.skill_categories(name,key) values(skill->>'category',private.norm(skill->>'category')) returning id into category_ref;
    else
      perform private.assert(exists(select 1 from public.skill_categories where id=category_ref and is_active and seed_batch_id is null),
        'A skill category conflicts with inactive or sample data. Existing data was preserved.');
    end if;
    select id into skill_ref from public.skills where key=private.norm(skill->>'name');
    if skill_ref is null then
      insert into public.skills(name,key,category_id) values(skill->>'name',private.norm(skill->>'name'),category_ref) returning id into skill_ref;
    else
      perform private.assert(exists(select 1 from public.skills where id=skill_ref and category_id=category_ref and is_active and seed_batch_id is null),
        'A skill conflicts with existing reference data. Existing data was preserved.');
    end if;
    insert into public.profile_skills(profile_id,skill_id) values(subject,skill_ref);
  end loop;
  update private.account_controls set eligibility_status='eligible',eligibility_decided_by_operator=operator_label,
    eligibility_decided_at=clock_timestamp(),eligibility_basis='Directory listing authorized by the repository owner; academic details were not supplied.',
    version=version+1 where user_id=subject;
  insert into private.profile_moderation(profile_id,status,reviewed_version,reviewed_at,reviewed_by_operator,owner_reason)
    values(subject,'approved',1,clock_timestamp(),operator_label,'Added to the directory at the repository owner''s request.');
  insert into private.admin_audit_log(request_id,actor_kind,actor_label,action,target_table,target_key,reason,details)
    values(gen_random_uuid(),'operator',operator_label,'profile.import','profiles',entry->>'key','Add the owner-requested profile and supplied portrait',
      jsonb_build_object('profile_id',subject,'manifest_sha256',manifest_hash,'photo_sha256',entry->'photo'->>'sha256','source',entry->'source'));
end;
`
  let delimiter = "$orbit_profile_import$"
  while (body.includes(delimiter)) delimiter = delimiter.replace("$orbit", "$orbit_")
  return `begin;\ndo ${delimiter}${body}${delimiter};\ncommit;\n`
}
