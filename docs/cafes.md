# Campus café menus

**BREW AND BRINK** and **NESCAFÉ IUST** are available at `/canteen-prices`, with a **Choose café** selector. Their names, menu identities, prices, source labels, photo metadata and publication state are stored in Supabase. The frontend reads them through `get_canteen_menu`; manifests are import sources rather than browser-side menu arrays.

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

The initial NESCAFÉ import created **1 genuine café, 4 food categories, 30 menu items, 30 offerings, 30 price records, 30 published entries and 30 photo records**. Cappuccino’s photograph also supplies the cover, so the full page displays 31 images from 30 files. The **12 November** photo-only update replaces Cappuccino, Cafe Latte, Cafe Mocha and Hot Chocolate with distinct disposable-cup photographs and keeps the cover consistent. The original import remains unchanged. Food photos are real, openly licensed photographs matched to the named dish or preparation style; they are labelled illustrative and link to their authors and licences. See [all photo credits](../ASSET-NOTES.md#campus-café-food-photographs).

## Brew and Brink source and inventory

- Source: the supplied **BREW AND BRINK — University Café – Food & Beverages Menu**, preserved in [`scripts/data/cafes/sources/brew-and-brink-menu.md`](../scripts/data/cafes/sources/brew-and-brink-menu.md).
- Manifest: [`scripts/data/cafes/brew-and-brink.json`](../scripts/data/cafes/brew-and-brink.json), with all 29 names, INR amounts and supplied size labels in source order. The source text's SHA-256 is validated before import.
- Small/Large labels are distinct item variants. Exact quantities, the menu's effective date, opening hours and current availability were not supplied.
- Subtitle and tagline appear in the café header. Listings use **Listed menu price** and text-source wording.

| Menu section | Listings | Price range |
| --- | ---: | ---: |
| Mojitos & Refreshers | 7 | ₹80–₹100 |
| Shakes & Cold Beverages | 4 | ₹50–₹110 |
| Tea & Hot Coffee | 6 | ₹15–₹60 |
| Specials & Fast Food | 10 | ₹40–₹170 |
| Momos | 2 | ₹100–₹110 |
| **Total** | **29** | **₹15–₹170** |

Imported into the inspected local instance on **10 November 2026**, bringing the total to **2 cafés and 59 published listings**. Cold Coffee, Cheese Fries and Chicken Popcorn reuse compatible catalogue identities while retaining each café's own section and price. Brew and Brink uses **26 distinct credited photographs**, including 20 additional files; repeated size variants and the cover reuse their matching image.

## Import into local Supabase

Complete [local setup](setup.md#2-start-and-inspect-local-supabase), including all ten migrations and database inspection. The menu import is independent of the optional sample-profile seed. The supplied WebP files are ready to use; no photo download is needed for a normal checkout.

```sh
npx supabase migration list
npx supabase db query --read-only --file supabase/operator/inspect.sql
npm run menu:import -- --cafe nescafe-iust --instance YOUR_INSPECTED_INSTANCE_UUID
npm run menu:import -- --cafe brew-and-brink --instance YOUR_INSPECTED_INSTANCE_UUID
npm run menu:import -- --photo-update nescafe-hot-drink-cups --instance YOUR_INSPECTED_INSTANCE_UUID
```

Replace the placeholder with the inspected database UUID. Each command checks the configured local API and database container, validates every used photo’s hash/dimensions, and performs a single transaction. For the already configured checkout, the instance is `43bbe85a-f1a8-403a-8776-ee2a5a57d87f`; both imports and the four-drink photo update have completed.

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
2. In **Café menu publication**, review the current amount, enter the **Public source label**, and select **Menu source type**. Leave **Menu source date (if known)** blank when unknown.
3. Choose a curated **Illustrative food photograph**, set **Menu display order** (0–1000), check **Publish the current menu price**, and provide a **Publication change reason**.
4. Choose **Save menu listing**, then verify the public page. To hide a listing, clear publication and save with a reason.

Publication is linked to one specific price event. Replacing it hides the prior public listing until staff explicitly publish the replacement. Withdrawal, a latest verification revocation, reference retirement or unpublication also remove the listing. Version checks prevent stale saves; reload and review the stored listing after a conflict. Historic prices remain in append-only private history.

## Compare published menu prices

Open `/canteen-prices?view=compare`, choose **First café** and **Second café**, or use **Swap cafés**. The `get_canteen_menu_comparisons` RPC matches published offerings by shared catalogue identity and currency, preserving variants and any established portion identity. Choosing the other café in the first selector swaps the pair automatically. Café selection carries between menu and comparison views.

The current menus share three items:

| Item | Brew and Brink | NESCAFÉ IUST | Difference |
| --- | ---: | ---: | ---: |
| Cold Coffee | ₹110 | ₹70 | ₹40 |
| Cheese Fries | ₹150 | ₹90 | ₹60 |
| Chicken Popcorn | ₹130 | ₹120 | ₹10 |

Search and category filters apply to matching items. A budget keeps a pair when either price meets the limit, retaining both amounts. Price ordering uses the lower price in each pair; **Largest difference** sorts by the absolute difference. Differences and totals are calculated before pagination. Filters and both café IDs persist in the URL; clearing filters retains the selected pair.

These are **listed menu prices**. Unknown serving quantities are labelled, and actual portions and availability may differ. NESCAFÉ's unspecified Tea does not automatically match Brew and Brink's Small/Large variants. Fewer than two published café menus or no shared items produces an explanatory empty state.

The existing `get_canteen_prices` API continues to require known equivalent portions, current verified evidence and recent availability checks. When confirmed serving sizes become available, use [source-backed catalogue entry](operations.md#enter-a-source-backed-offering); used comparison identities are immutable.

## Photograph provenance and updates

| Path | Purpose |
| --- | --- |
| [`scripts/data/menu-photo-sources.json`](../scripts/data/menu-photo-sources.json) | Curated Wikimedia file titles or reviewed Flickr source pages, stable keys, descriptive alt text and source metadata. |
| [`scripts/data/menu-photos.json`](../scripts/data/menu-photos.json) | Retrieved metadata, original/download URLs and hashes, author, licence, source/retrieval dates, transformations and final WebP dimensions/hash/size. |
| [`public/images/menu/`](../public/images/menu/) | Locally served WebP photographs; selected files are hash- and dimension-checked during import. |
| [`scripts/prepare-menu-photos.mjs`](../scripts/prepare-menu-photos.mjs) | Operator-only licensed-photo download and raster normalization tool. |

For new source selections, edit the source list and run `npm run menu:photos`, or select specific keys with `npm run menu:photos -- PHOTO_KEY`. Matching existing files are hash-checked and reused. The tool requires complete attribution and accepts the recorded CC BY, CC BY-SA, CC0 or public-domain licences from Wikimedia. A Flickr source records its exact `source_url` and reviewed taken `source_date`; the tool checks the live source identity, author, CC BY/CC BY-SA licence and display-image identity before downloading. It auto-orients, strips metadata and converts photographs to WebP through the real image decoder; the UI crops them to fit. No external photograph requests are made by the application.

Visually inspect each photograph and its source page, then check the final mobile/desktop crop. The preparation tool validates raster data and metadata; selection still requires checking the actual subject and photographic provenance. Keep the credits in [asset notes](../ASSET-NOTES.md) synchronized and retain each image’s applicable licence, including share-alike terms for adaptations.

For an already imported café, keep existing photo keys, files and metadata stable. A replacement should use a new key/path, be added to `private.menu_photos` through an explicit operator update or a subsequent café import, and then be selected in the administrator publication form. The original completed import manifest remains the record of the first load. Preparing new files alone does not update database photo metadata.

### Apply the four-drink NESCAFÉ photo update

For an existing imported database, inspect its UUID and run only:

```sh
npm run menu:import -- --photo-update nescafe-hot-drink-cups --instance YOUR_INSPECTED_INSTANCE_UUID
```

[`nescafe-hot-drink-cups.json`](../scripts/data/cafes/photo-updates/nescafe-hot-drink-cups.json) targets exactly **Cappuccino → `takeaway-cappuccino`**, **Cafe Latte → `takeaway-latte`**, **Cafe Mocha → `takeaway-mocha`**, **Hot Chocolate → `takeaway-hot-chocolate`**, and the Cappuccino cover. The guarded transaction inserts missing immutable photo metadata, updates these four photo pointers and increments their listing versions; publication, source labels, prices, other listings, Brew and Brink and profiles remain unchanged. One `menu.photos.update` audit records the plan and its hash separately from the original imports. A matching rerun is a no-op, including after later staff edits. Different completed content, stale pointers/covers, metadata conflicts and wrong instances reject the entire transaction.

For a fresh database, use all three setup commands above: original NESCAFÉ import, Brew and Brink import, then this photo update. Do **not** blindly run the older [`nescafe-disposable-cups.json`](../scripts/data/cafes/photo-updates/nescafe-disposable-cups.json) plan as well; it targets a different historical scope and shares the cover/coffee pointers. If an older plan or staff edit already changed them, inspect and prepare a new explicit plan instead of bypassing the conflict guards.

To export for a separately inspected target without modifying it:

```sh
npm run menu:import -- --photo-update nescafe-hot-drink-cups --instance YOUR_TARGET_INSTANCE_UUID --operator YOUR_OPERATOR_LABEL --sql .dev-seed/nescafe-hot-drink-cups.sql
```

Create the ignored output directory first and use a new filename. Execute the reviewed SQL after that target's original import, following the [SQL export requirements](#sql-export-for-another-database); deploy the matching public WebPs with the frontend. A GitHub push alone does not update another database.

## Add the next café

Add one café at a time from its supplied source. Create a new `scripts/data/cafes/<key>.json` using either existing manifest, preserving exact names, amounts and any size variants. For a text source, set `source.kind` to `text` and retain the Markdown and its hash as Brew and Brink does. Record only known dates/location details. Choose credited real photographs, add their source records, prepare/review them and update the attribution document. Import with `--cafe <key>` and the inspected instance UUID. Compatible genuine categories/items can be reused; café-specific sections are stored on the listing rather than changing shared catalogue categories.

The café chooser appears when more than one café has published listings. Run the relevant SQL/import/browser checks and verify that café’s names, prices, credits, filters and layout against the real local service before handoff. Current executed results are recorded in [the implementation report](implementation-report.md#café-comparison-fix-10-november-2026).
