import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { inspectImage } from "../../supabase/functions/_shared/image-validator.mjs"

const keyPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const photoFields = ["key", "path", "alt", "author", "source_url", "license", "license_url", "source_date", "sha256", "width", "height"]
const sha256 = value => createHash("sha256").update(value).digest("hex")
export const sqlLiteral = value => value === null ? "null" : `E'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`
const normalized = value => (value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()

export function validateMenuPhotos(photos) {
  const bounded = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max
  const photoKeys = new Set(photos.map(photo => photo.key))
  assert.equal(photoKeys.size, photos.length, "Duplicate photo keys")
  for (const photo of photos) {
    assert.ok(keyPattern.test(photo.key) && photo.path === `/images/menu/${photo.key}.webp`, "Only curated local WebP paths are allowed")
    assert.match(photo.sha256, /^[a-f0-9]{64}$/)
    assert.ok(bounded(photo.alt, 240) && bounded(photo.author, 1000) && bounded(photo.license, 80) && bounded(photo.source_date, 200))
    assert.ok([photo.source_url, photo.license_url].every(value => new URL(value).protocol === "https:"), "Photo source and licence URLs must be HTTPS")
    assert.ok([photo.width, photo.height].every(value => Number.isInteger(value) && value > 0 && value <= 2048))
  }
  return photoKeys
}

export function validateCafeMenu(menu, photos) {
  const bounded = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max
  assert.ok(keyPattern.test(menu.key) && bounded(menu.name, 120), "A stable café key and name are required")
  assert.ok(bounded(menu.location, 300) && bounded(menu.description, 500), "Add the known campus location and café description")
  assert.ok(menu.subtitle === undefined || bounded(menu.subtitle, 160), "Keep the café subtitle within 160 characters")
  assert.equal(menu.currency, "INR")
  assert.ok(bounded(menu.source?.label, 240) && bounded(menu.source?.note, 500), "Document the actual menu source")
  assert.ok(["photograph", "text"].includes(menu.source.kind || "photograph"), "Choose the actual menu source kind")
  if (menu.source.kind === "text") {
    assert.match(menu.source.text_file, /^[a-z0-9]+(-[a-z0-9]+)*\.md$/, "Keep the supplied text in the café sources directory")
    assert.match(menu.source.text_sha256, /^[a-f0-9]{64}$/)
  } else assert.match(menu.source.photo_sha256, /^[a-f0-9]{64}$/)
  assert.match(menu.source.received_on, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(menu.source.observed_on === null || /^\d{4}-\d{2}-\d{2}$/.test(menu.source.observed_on), "Use null when the source date is unknown")
  assert.ok(Array.isArray(menu.sections) && menu.sections.length > 0 && menu.sections.length <= 20)
  const items = menu.sections.flatMap(section => {
    assert.ok(bounded(section.name, 80) && section.items.length > 0)
    return section.items
  })
  assert.ok(items.length > 0 && items.length <= 1000)
  assert.equal(new Set(menu.sections.map(section => normalized(section.name))).size, menu.sections.length, "Duplicate menu sections")
  const photoKeys = validateMenuPhotos(photos)
  assert.ok(photoKeys.has(menu.cover_photo_key), "Missing café cover photograph")
  for (const item of items) {
    assert.ok(bounded(item.name, 120))
    assert.ok(item.variant === undefined || typeof item.variant === "string" && item.variant.length <= 80, "Invalid item size/variant")
    assert.ok(typeof item.price === "number" && Number.isFinite(item.price) && /^[0-9]{1,8}(\.[0-9]{1,2})?$/.test(String(item.price)), `Invalid INR price: ${item.name}`)
    assert.ok(photoKeys.has(item.photo_key), `Missing food photograph: ${item.name}`)
  }
  assert.equal(new Set(items.map(item => JSON.stringify([normalized(item.name), normalized(item.variant)]))).size, items.length, "Duplicate menu item sizes/variants")
  return items.length
}

export async function loadMenuPhotos(keys) {
  const allPhotos = JSON.parse(await readFile(new URL("../data/menu-photos.json", import.meta.url), "utf8"))
  const used = new Set(keys)
  const photos = allPhotos.filter(photo => used.has(photo.key)).map(photo => Object.fromEntries(photoFields.map(field => [field, photo[field]])))
  assert.equal(photos.length, used.size, "Missing curated photo metadata")
  validateMenuPhotos(photos)
  for (const photo of photos) {
    const bytes = await readFile(new URL(`../../public${photo.path}`, import.meta.url))
    assert.equal(sha256(bytes), photo.sha256, `Food photograph hash mismatch: ${photo.key}`)
    const image = inspectImage(bytes)
    assert.equal(image.width, photo.width); assert.equal(image.height, photo.height)
  }
  return photos
}

export async function loadCafeMenu(key = "nescafe-iust") {
  assert.match(key, keyPattern)
  const menu = JSON.parse(await readFile(new URL(`../data/cafes/${key}.json`, import.meta.url), "utf8"))
  assert.equal(menu.key, key)
  const photos = await loadMenuPhotos([menu.cover_photo_key, ...menu.sections.flatMap(section => section.items.map(item => item.photo_key))])
  validateCafeMenu(menu, photos)
  if (menu.source.kind === "text") {
    const text = await readFile(new URL(`../data/cafes/sources/${menu.source.text_file}`, import.meta.url), "utf8")
    assert.equal(sha256(text.replaceAll("\r\n", "\n")), menu.source.text_sha256, "Supplied menu text hash mismatch")
  }
  return { menu, photos }
}

// The same atomic SQL is used in disposable PostgreSQL tests, local Supabase, and SQL-editor exports.
// A completed import is a no-op on rerun, so staff edits and withdrawals are never overwritten.
export function createCafeMenuImportSQL({ menu, photos, instanceId, operator = "cafe-menu-import-cli" }) {
  validateCafeMenu(menu, photos)
  assert.match(instanceId, uuidPattern, "Specify the exact inspected database instance UUID")
  assert.ok(typeof operator === "string" && operator.trim().length > 0 && operator.length <= 100)
  const manifestHash = sha256(JSON.stringify({ menu, photos }))
  const body = `
declare
  menu jsonb := ${sqlLiteral(JSON.stringify(menu))}::jsonb;
  photos jsonb := ${sqlLiteral(JSON.stringify(photos))}::jsonb;
  expected_instance uuid := ${sqlLiteral(instanceId)}::uuid;
  operator_label text := ${sqlLiteral(operator.trim())};
  manifest_hash text := ${sqlLiteral(manifestHash)};
  receipt private.admin_audit_log;
  cafe_id uuid; category_id uuid; item_id uuid; offering_id uuid; price_id uuid;
  section jsonb; dish jsonb; photo jsonb; category_order integer := 0; item_order integer := 0;
begin
  perform private.assert(exists(select 1 from private.instance_config where singleton and instance_id=expected_instance),
    'The database does not match the explicitly selected menu-import instance');
  perform pg_advisory_xact_lock(hashtextextended('iust.taxonomy',0));
  select * into receipt from private.admin_audit_log where action='menu.import' and target_key=menu->>'key';
  if found then
    perform private.assert(receipt.details->>'manifest_sha256'=manifest_hash,
      'This menu was already imported with different content. Maintain existing prices in Admin; the importer will not overwrite them.');
    raise notice 'Menu import already completed. Existing records were preserved.';
    return;
  end if;
  perform private.assert(not exists(select 1 from public.canteens where key=private.norm(menu->>'name')),
    'A canteen with this name already exists. Existing data was preserved.');
  for photo in select value from jsonb_array_elements(photos) loop
    insert into private.menu_photos select r.* from jsonb_populate_record(null::private.menu_photos,photo) r on conflict(key) do nothing;
    perform private.assert((select to_jsonb(p) from private.menu_photos p where key=photo->>'key')=photo,
      'A curated photo key conflicts with existing source metadata. Existing data was preserved.');
  end loop;
   insert into public.canteens(name,key,location_description,menu_description,menu_cover_photo_key,menu_subtitle)
    values(menu->>'name',private.norm(menu->>'name'),menu->>'location',menu->>'description',menu->>'cover_photo_key',coalesce(menu->>'subtitle','')) returning id into cafe_id;
  for section in select value from jsonb_array_elements(menu->'sections') loop
    select id into category_id from public.food_categories where key=private.norm(section->>'name');
    if category_id is null then
      insert into public.food_categories(name,key,display_order) values(section->>'name',private.norm(section->>'name'),category_order) returning id into category_id;
    else
      perform private.assert(exists(select 1 from public.food_categories where id=category_id and is_active and seed_batch_id is null),
        'A food category conflicts with retired or sample data. Existing data was preserved.');
    end if;
    category_order := category_order+1;
    for dish in select value from jsonb_array_elements(section->'items') loop
      item_order := item_order+1;
      select id into item_id from public.menu_items where name_key=private.norm(dish->>'name')
        and variant_key=private.norm(dish->>'variant') and serving_quantity is null and unit_code is null and portion_key='';
      if item_id is null then
        insert into public.menu_items(name,name_key,variant,variant_key,food_category_id,is_comparable)
          values(dish->>'name',private.norm(dish->>'name'),coalesce(dish->>'variant',''),private.norm(dish->>'variant'),category_id,false) returning id into item_id;
      else
        perform private.assert(exists(select 1 from public.menu_items m join public.food_categories f on f.id=m.food_category_id
          where m.id=item_id and m.is_active and m.seed_batch_id is null and not m.is_comparable and f.is_active and f.seed_batch_id is null),
          'A menu item conflicts with existing catalogue data. Existing data was preserved.');
      end if;
      insert into public.canteen_offerings(canteen_id,menu_item_id,canteen_item_label)
        values(cafe_id,item_id,dish->>'name') returning id into offering_id;
      insert into private.price_records(offering_id,event_kind,amount,recorded_by_operator,source_note,request_id)
        values(offering_id,'set',(dish->>'price')::numeric,operator_label,menu->'source'->>'note',gen_random_uuid()) returning id into price_id;
      insert into private.canteen_menu_entries(offering_id,price_record_id,source_label,source_observed_on,source_kind,photo_key,display_order,is_published,section_category_id,section_order)
        values(offering_id,price_id,menu->'source'->>'label',(menu->'source'->>'observed_on')::date,coalesce(menu->'source'->>'kind','photograph'),
          dish->>'photo_key',item_order,true,category_id,category_order-1);
    end loop;
  end loop;
  insert into private.admin_audit_log(request_id,actor_kind,actor_label,action,target_table,target_key,reason,details)
    values(gen_random_uuid(),'operator',operator_label,'menu.import','canteens',menu->>'key','Transcribe the supplied campus café menu',
      jsonb_build_object('canteen_id',cafe_id,'manifest_sha256',manifest_hash,'item_count',item_order,'source',menu->'source'));
  raise notice 'Imported % menu listings for %.',item_order,menu->>'name';
end;
`
  let delimiter = "$orbit_menu_import$"
  while (body.includes(delimiter)) delimiter = delimiter.replace("$orbit", "$orbit_")
  return `begin;\ndo ${delimiter}${body}${delimiter};\ncommit;\n`
}
