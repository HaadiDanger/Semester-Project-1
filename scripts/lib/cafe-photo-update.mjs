import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { loadMenuPhotos, sqlLiteral, validateMenuPhotos } from "./cafe-menu-import.mjs"

const keyPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
const hash = value => createHash("sha256").update(value).digest("hex")
const normalized = value => (value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()

function validateUpdate(update, photos) {
  const bounded = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max
  assert.ok(keyPattern.test(update.key) && keyPattern.test(update.cafe_key) && bounded(update.cafe_name, 120))
  assert.ok(bounded(update.reason, 500) && Array.isArray(update.items) && update.items.length > 0 && update.items.length <= 1000)
  const keys = validateMenuPhotos(photos)
  for (const change of [update.cover, ...update.items]) {
    assert.ok(change && keyPattern.test(change.from) && keys.has(change.to) && change.from !== change.to, "Invalid photograph replacement")
  }
  for (const item of update.items) {
    assert.ok(bounded(item.name, 120) && (item.variant === undefined || typeof item.variant === "string" && item.variant.length <= 80))
  }
  assert.equal(new Set(update.items.map(item => JSON.stringify([normalized(item.name), normalized(item.variant)]))).size, update.items.length, "Duplicate photo update item")
}

export async function loadCafePhotoUpdate(key = "nescafe-disposable-cups") {
  assert.match(key, keyPattern)
  const update = JSON.parse(await readFile(new URL(`../data/cafes/photo-updates/${key}.json`, import.meta.url), "utf8"))
  assert.equal(update.key, key)
  const photos = await loadMenuPhotos([update.cover.to, ...update.items.map(item => item.to)])
  validateUpdate(update, photos)
  return { update, photos }
}

// A separate receipt keeps the original import reproducible. Only photo pointers change.
export function createCafePhotoUpdateSQL({ update, photos, instanceId, operator = "cafe-menu-import-cli" }) {
  validateUpdate(update, photos)
  assert.match(instanceId, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, "Specify the exact inspected database instance UUID")
  assert.ok(typeof operator === "string" && operator.trim().length > 0 && operator.length <= 100)
  const body = `
declare
  plan jsonb := ${sqlLiteral(JSON.stringify(update))}::jsonb;
  photos jsonb := ${sqlLiteral(JSON.stringify(photos))}::jsonb;
  manifest_hash text := ${sqlLiteral(hash(JSON.stringify({ update, photos })))};
  operator_label text := ${sqlLiteral(operator.trim())};
  receipt private.admin_audit_log; cafe_id uuid; entry_id uuid; photo jsonb; dish jsonb;
begin
  perform private.assert(exists(select 1 from private.instance_config where singleton and instance_id=${sqlLiteral(instanceId)}::uuid),
    'The database does not match the explicitly selected photo-update instance');
  perform pg_advisory_xact_lock(hashtextextended('iust.taxonomy',0));
  select * into receipt from private.admin_audit_log where action='menu.photos.update' and target_key=plan->>'key';
  if found then
    perform private.assert(receipt.details->>'manifest_sha256'=manifest_hash,'This photo update was already applied with different content.');
    raise notice 'Photo update already completed. Existing records were preserved.';
    return;
  end if;
  select (details->>'canteen_id')::uuid into cafe_id from private.admin_audit_log where action='menu.import' and target_key=plan->>'cafe_key';
  perform private.assert(exists(select 1 from public.canteens where id=cafe_id and key=private.norm(plan->>'cafe_name') and seed_batch_id is null),
    'Import the selected genuine café before applying its photograph update.');
  for photo in select value from jsonb_array_elements(photos) loop
    insert into private.menu_photos select r.* from jsonb_populate_record(null::private.menu_photos,photo) r on conflict(key) do nothing;
    perform private.assert((select to_jsonb(p) from private.menu_photos p where key=photo->>'key')=photo,
      'A curated photo key conflicts with existing source metadata. Existing data was preserved.');
  end loop;
  for dish in select value from jsonb_array_elements(plan->'items') loop
    select e.offering_id into entry_id from private.canteen_menu_entries e
      join public.canteen_offerings o on o.id=e.offering_id join public.menu_items m on m.id=o.menu_item_id
      where o.canteen_id=cafe_id and o.seed_batch_id is null and m.seed_batch_id is null
        and m.name_key=private.norm(dish->>'name') and m.variant_key=private.norm(dish->>'variant')
        and m.serving_quantity is null and m.unit_code is null and m.portion_key='';
    perform private.assert(found,'A requested café photo listing is missing. Existing data was preserved.');
    update private.canteen_menu_entries set photo_key=dish->>'to',version=version+1
      where offering_id=entry_id and photo_key=dish->>'from';
    perform private.assert(found,'A listing photograph changed since this update was prepared. Existing data was preserved.');
  end loop;
  update public.canteens set menu_cover_photo_key=plan->'cover'->>'to'
    where id=cafe_id and menu_cover_photo_key=plan->'cover'->>'from';
  perform private.assert(found,'The café cover changed since this update was prepared. Existing data was preserved.');
  insert into private.admin_audit_log(request_id,actor_kind,actor_label,action,target_table,target_key,reason,details)
    values(gen_random_uuid(),'operator',operator_label,'menu.photos.update','canteens',plan->>'key',plan->>'reason',
      jsonb_build_object('canteen_id',cafe_id,'manifest_sha256',manifest_hash,'cover',plan->'cover','items',plan->'items'));
  raise notice 'Updated % listing photographs and the cover for %.',jsonb_array_length(plan->'items'),plan->>'cafe_name';
end;
`
  let delimiter = "$orbit_photo_update$"
  while (body.includes(delimiter)) delimiter = delimiter.replace("$orbit", "$orbit_")
  return `begin;\ndo ${delimiter}${body}${delimiter};\ncommit;\n`
}
