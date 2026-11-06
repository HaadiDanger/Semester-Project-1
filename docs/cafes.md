# Campus café menus

The first café is **NESCAFÉ IUST** at `/canteen-prices`. Its name, menu identities, prices, source labels, photo metadata and publication state are stored in Supabase. The frontend reads them through `get_canteen_menu`; the manifest is an import source rather than a browser-side menu array.

## NESCAFÉ source and inventory

- Source: the user-supplied **NESCAFÉ | IUST BRANCH** menu-board photograph, received **6 November 2026**.
- Original photograph SHA-256: `6a8d8097c301a8c9a1c50ae36b93927ce5700de491f521bf6b3a31dd7385f77d`.
- Manifest: [`scripts/data/cafes/nescafe-iust.json`](../scripts/data/cafes/nescafe-iust.json), containing all 30 transcribed names and INR amounts in board order.
- Capture date, serving sizes, opening hours and current availability were not supplied. `source.observed_on` is `null`; receiving/importing a photograph does not establish its capture date.
- The original source photo remains outside the repository. The manifest and import audit retain its hash, source label, receipt date and explanatory note.

| Menu section | Items | Menu-board range |
| --- | ---: | ---: |
| Burgers, sandwiches & snacks | 14 | ₹60–₹120 |
| Cold beverages | 3 | ₹60–₹70 |
| Hot beverages | 5 | ₹15–₹30 |
| Noodles & pasta | 8 | ₹30–₹70 |
| **Total** | **30** | **₹15–₹120** |

The local import created **1 genuine café, 4 food categories, 30 menu items, 30 offerings, 30 price records, 30 published entries and 30 photo records**. Cappuccino’s photograph also supplies the cover, so the full page displays 31 images from 30 files. Food photos are real Wikimedia photographs matched to the named dish or preparation style; they are labelled illustrative and link to their authors and licences. See [all photo credits](../ASSET-NOTES.md#campus-café-food-photographs).

## Import into local Supabase

Complete [local setup](setup.md#2-start-and-inspect-local-supabase), including all seven migrations and database inspection. The menu import is independent of the optional sample-profile seed. The committed WebP files are ready to use; no photo download is needed for a normal checkout.

```sh
npx supabase migration list
npx supabase db query --read-only --file supabase/operator/inspect.sql
npm run menu:import -- --cafe nescafe-iust --instance YOUR_INSPECTED_INSTANCE_UUID
```

Replace the placeholder with the inspected database UUID. The command checks the configured local API and database container, validates every used photo’s hash/dimensions, and performs a single transaction. For the already configured checkout, the instance is `43bbe85a-f1a8-403a-8776-ee2a5a57d87f` and this import has already completed.

Open **http://localhost:5173/canteen-prices**. Category, text, budget and sorting controls query the database and retain their state in the URL. The default page holds 36 items, with a bounded 1–48-item RPC page size. Whole-rupee prices omit `.00`; fractional prices retain up to two decimal places.

### Attribution and repeat imports

The default operator label is `cafe-menu-import-cli`. To use your own recorded label on an initial import, add `--operator YOUR_OPERATOR_LABEL`. Imported price events set `recorded_by_operator`; later administrator events use their authenticated `recorded_by` account. Each price requires exactly one of these actors.

An initial import writes one `menu.import` audit with its café key, source and manifest SHA-256. A completed matching rerun is a no-op, preserving staff edits, withdrawals and hidden entries. A changed manifest for that completed café is rejected rather than treated as a price update. Wrong instances and catalogue/photo conflicts roll back the whole transaction. Use the administrator workflow below for ongoing maintenance.

### SQL export for another database

Use the UUID obtained by inspecting that database after its migrations are applied. `--sql` validates the manifest/photos and writes a new transaction file without connecting to or modifying a database:

```powershell
New-Item -ItemType Directory -Force .dev-seed | Out-Null
npm run menu:import -- --cafe nescafe-iust --instance YOUR_TARGET_INSTANCE_UUID --operator YOUR_OPERATOR_LABEL --sql .dev-seed/nescafe-menu.sql
```

The output file is created exclusively and must not already exist. Execute the reviewed file in one `psql` connection to that target, with `ON_ERROR_STOP=1`; the SQL itself asserts the selected instance UUID. CLI 3’s `db query` accepts only one statement and cannot execute this multi-statement import. Use [hosted deployment](operations.md#approved-hosted-deployment) for target-specific configuration and deploy the matching public images with the frontend.

## Maintain published listings

Sign in as a genuine content administrator, then open `/admin` → **Canteen prices** → **Manage price**. The current local `sample-admin` belongs to the development fixture batch and cannot maintain genuine café data; use [first-administrator setup](setup.md#appoint-the-first-administrator) for the owner’s nominated account.

1. Append a new INR price and source/change reason in the price-history form when an amount changes.
2. In **Café menu publication**, review the current amount and enter the **Public source label**. Leave **Menu photograph date** blank when unknown.
3. Choose a curated **Illustrative food photograph**, set **Menu display order** (0–1000), check **Publish the current menu-board price**, and provide a **Publication change reason**.
4. Choose **Save menu listing**, then verify the public page. To hide a listing, clear publication and save with a reason.

Publication is linked to one specific price event. Replacing it hides the prior public listing until staff explicitly publish the replacement. Withdrawal, a latest verification revocation, reference retirement or unpublication also remove the listing. Version checks prevent stale saves; reload and review the stored listing after a conflict. Historic prices remain in append-only private history.

Menu browsing displays documented **menu-board prices** without claiming current availability. Exact-portion comparisons are at `/canteen-prices?view=compare`; they require a known matching portion, current verified evidence and recent availability checks. NESCAFÉ’s original unknown-portion listings do not qualify automatically. When confirmed serving sizes become available, create correctly identified comparison items/offerings using [source-backed catalogue entry](operations.md#enter-a-source-backed-offering); used comparison identities are immutable.

## Photograph provenance and updates

| Path | Purpose |
| --- | --- |
| [`scripts/data/menu-photo-sources.json`](../scripts/data/menu-photo-sources.json) | Curated Wikimedia file titles, stable keys, descriptive alt text and any explicit author/licence metadata. |
| [`scripts/data/menu-photos.json`](../scripts/data/menu-photos.json) | Retrieved metadata, original/download URLs and hashes, author, licence, source/retrieval dates, transformations and final WebP dimensions/hash/size. |
| [`public/images/menu/`](../public/images/menu/) | The 30 checked-in, locally served WebP photographs, totalling 3,284,052 bytes. |
| [`scripts/prepare-menu-photos.mjs`](../scripts/prepare-menu-photos.mjs) | Operator-only Wikimedia download and raster normalization tool. |

For new source selections, edit the source list and run `npm run menu:photos`, or select specific keys with `npm run menu:photos -- PHOTO_KEY`. Matching existing files are hash-checked and reused. The tool requires complete attribution and accepts the recorded CC BY, CC BY-SA, CC0 or public-domain licences. It auto-orients, strips metadata and converts downloaded photographs to WebP through the real image decoder; the UI crops them to fit.

Visually inspect each photograph and its source page, then check the final mobile/desktop crop. The preparation tool validates raster data and metadata; selection still requires checking the actual subject and photographic provenance. Keep the credits in [asset notes](../ASSET-NOTES.md) synchronized and retain each image’s applicable licence, including share-alike terms for adaptations.

For an already imported café, keep existing photo keys, files and metadata stable. A replacement should use a new key/path, be added to `private.menu_photos` through an explicit operator update or a subsequent café import, and then be selected in the administrator publication form. The original completed import manifest remains the record of the first load. Preparing new files alone does not update database photo metadata.

## Add the next café

Add one café at a time from its supplied source. Create a new `scripts/data/cafes/<key>.json` using the NESCAFÉ manifest shape, preserving exact names/amounts and recording only known dates/location details. Choose credited real photographs, add their source records, prepare/review them and update the attribution document. Import with `--cafe <key>` and the inspected instance UUID. Compatible genuine categories/items can be reused; conflicting or sample records stop the import for review.

The café chooser appears when more than one café has published listings. Run the relevant SQL/import/browser checks and verify that café’s names, prices, credits, filters and layout against the real local service before handoff. Current executed results are recorded in [the implementation report](implementation-report.md#café-menu-update-6-november-2026).
