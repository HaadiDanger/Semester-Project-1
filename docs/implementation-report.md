# IUST Orbit implementation report

**Latest update: 13 November 2026.** Desktop retains the premium three-orbit hero; phones use two moving orbits, lighter shadows, deferred route/photo loading and offscreen/background pauses. A separate production-built, public-browsing-only phone preview runs at **http://192.168.29.174:4175/** on this PC's LAN. The completed changes passed **91/91 Node tests**, a **48/48 full Chromium run with zero retries**, lint and build. Production mobile emulation measured about **60 rAF FPS** and **4.8 MB post-GC JS heap**; this is not a physical-phone or total-RAM certification. Normal application routes/Auth and retained profile/café data remain intact. Desktop development preview: **http://127.0.0.1:5173/**.

The real-local inventory rechecked on **12 November** retains **2 cafés, 59 published listings and 45 public profiles**; all **ten migrations** were verified on 10 November, with matching menu prices at **http://localhost:5173/canteen-prices?view=compare**. The visual refinement made no database-content changes; the separate guarded cup-photo transaction changed only the scope recorded below. Resend SMTP setup remains ready, and Anas Tech remains removed from the public website.

**Branding:** Header/footer, orbit icon/favicon, browser metadata, package name, authentication emails and setup messages now use **IUST Orbit**. Visual inspection at 360px and 1440px confirmed the name, icon, home labels and browser title. Local Supabase serves the branded confirmation/recovery templates. Password login remains enabled; external email activation awaits sender credentials through [email setup](email.md).

**Earlier platform handoff (4 November):** The first six migrations applied on PostgreSQL 17.11 and 45 labelled sample profiles were loaded. Real Auth/PostgREST/Storage/Edge integration, ordinary signup/local confirmation, profile/portfolio uploads, two-context persistence and password recovery passed. The café update below adds genuine menu records while preserving that profiles-only fixture scope.

Delivery branch: [`feat/supabase-campus-platform`](https://github.com/HaadiDanger/Semester-Project-1/tree/feat/supabase-campus-platform). Database, Auth, Storage and Edge operations described below occurred on the positively identified local stack. GitHub source publication does not deploy the app or populate a hosted database.

## Phone optimization and LAN preview (13 November 2026)

- `src/editorial.css` keeps the **16/24-second outer/inner orbits** on screens up to 760px and coarse-pointer touch devices, including landscape. The third runner, inclination, halo breathing, glints, card floating and full-width sheen are static there; shadows are smaller and selected controls/credit summaries have 44px tap targets. Desktop keeps its premium motion, and reduced motion stops all continuous hero effects.
- `src/hooks/useAmbientMotion.js` observes the artwork with `IntersectionObserver` and listens for document visibility changes. CSS effects pause when the artwork leaves the viewport or the document is hidden; the observer/listener are disconnected on unmount. No ambient JavaScript animation timer, scroll polling, canvas or dependency was added.
- `Avatar.jsx` defers permission-checked photo requests until within **200px** of the viewport and requests asynchronous decoding. Existing abort/session-scope/blob-URL cleanup is retained. Non-home pages now use lazy imports with the existing pathname exits and a route loading fallback. Café photos retain local WebP, native lazy loading, asynchronous decoding and source credits.
- `npm run preview:phone` builds an immutable, separate **`phone-preview` production snapshot** in an owned temporary directory. It binds only to a selected assigned private LAN address and serves built public files with gzip/asset caching, never the source workspace. `scripts/lib/phone-preview.mjs` proxies only six public read RPCs and validated anonymous image reads to the configured **local** Supabase stack; it replaces caller credentials with the anonymous browser key, forwards no browser cookies/tokens, rejects foreign Host/Origin headers, and blocks Auth, Storage, mutations and image processing. The client disables account flows/session persistence only when both the dedicated build mode and flag match. Ordinary application authentication is unchanged.
- The **opt-in, lazy-loaded** performance panel shows estimated rAF cadence, intervals over 50ms and browser-reported JS heap where supported. It cancels its sole diagnostic frame callback on close/hidden state and removes its listener on unmount; normal browsing has no diagnostic rAF loop. JS heap excludes decoded images, GPU buffers and browser processes and can be unavailable or approximate. The live UI session showed **13.6 MB without forced GC**, unlike the fresh-context post-GC measurements below; neither reading is total RAM.
- **91 Node tests** passed, including five preview-server/configuration/security checks. A single **48/48 Chromium run** passed with zero retries in **4.5 minutes**, including normal Auth/editor/admin/privacy/menu regressions and three new checks for phone/touch-landscape motion, deferred/cancelled photo reads and blob cleanup, and route-module loading. The new targeted checks plus reduced motion also passed **4/4** before the full run. Backend infrastructure in this suite is explicitly doubled with real application SQL/image processing.
- Separate **unmocked production LAN** checks passed at **360×780, 390×844, 430×932 and 844×390**: two running orbits, zero horizontal overflow/page errors/unexpected origins; no Auth/Storage calls or eager diagnostic/private-route chunks. Both menus (**29/30 listings**), all **31 NESCAFÉ images**, its **12-item ₹50 budget**, three comparisons, budget filtering and swapping passed. All seven account/admin entry routes showed the browsing-only notice. The meter's hidden/visible/closed transitions left **zero pending diagnostic callbacks** after closing. Screenshots and JSON are retained in the approved temporary `phone-performance-L4ca9R` evidence directory.

### Measured performance and limits

The same **desktop Chromium, 390×844 viewport, DPR 3, mobile/touch emulation and 6× CPU slowdown** sampled 180 rAF intervals with the artwork visible, followed by explicit GC. The baseline was captured before phone optimization; it was already smooth on this desktop, so reproduced physical-phone stuttering or large RAM savings are **not** claimed.

| Measurement | Before phone changes | Optimized regular build | Anonymous LAN preview |
| --- | --- | --- | --- |
| Average rAF FPS | 60.004 | 60.002 | 60.004 |
| p95 frame interval | 16.7ms | 16.8ms | 16.7ms |
| Intervals over 50ms | 0 | 0 | 0 |
| Paint events during the 180 intervals | 0 | 0 | 0 |
| Post-GC JS heap | 4.799 MB | 4.826 MB | 4.774 MB |
| Infinite hero effects | 11 | 2 | 2 |

The two optimized effects were verified paused offscreen. The reduction is in continuous animation work, not an observed reduction in JS heap or proof of lower total RAM. After one five-transition route warmup and **six additional five-transition rounds** (directory → profile → cafés → comparisons → home), post-GC JS heap increased from **5.419 to 6.132 MB**; documents stayed at **1**, event listeners at **208**, and nodes at **1376–1377**. This short run shows no growing document/listener count, but does not prove an absence of leaks or a device-memory ceiling. `baseline.json`, `optimized-performance.json`, `live-preview-checks.json` and the one-off verification script retain the measurements.

Physical-phone acceptance remains: use the same router/Wi-Fi, keep the PC/preview/local Supabase/Edge Functions running, test both portrait and landscape, repeatedly browse menus/pages, and background/reopen the browser. Use **Show performance meter** or **`/?perf=1`**, then close it for a clean usage test. This link is not an internet deployment; restart the preview for source changes or a new LAN address. No firewall settings, dependencies, database data, migration or Edge Function code changed in this refinement.

**Supabase publication state:** all **ten migration IDs** match the configured local stack on 13 November, with no pending backend migration for these frontend changes. No hosted project is linked, and the Supabase CLI reports that login is required. A hosted deployment still requires `npx supabase login`, an explicitly selected/approved project ref and target inspection; no cloud Supabase writes were made. GitHub publication and hosting the frontend remain separate from Supabase deployment.

## Premium orbit refinement (13 November 2026)

- `src/components/HeroOrbit.jsx` isolates the non-interactive, `aria-hidden` illustration. Three copper/sage/olive orbital planes have masked conic-gradient trails and shaded **14px/10px/8px satellites**, rotating over **16/24/32 seconds**; the inner orbit counter-rotates, and negative delays give the composition an immediate, staggered start.
- A static illuminated core, **10-second** transform/opacity halo, **20-second** gentle track inclination and three small glints provide depth. The rounded dark panel and profile cards gain restrained atmospheric gradients, fine borders and layered shadows. Existing **7px** card floating remains paused on hover/focus, with a gentle tilt reset for pointer hover. These additions use CSS, not a JavaScript animation loop, canvas, external artwork or new dependency.
- Reduced motion disables the new loops and retains deliberately positioned static satellites. All decoration stays behind the linked profiles and ignores pointer events. Natural-height mobile cards and the separate caption row are retained. No routing, Auth, database, API, menu, asset-gateway or profile-data behavior changes.
- **86 Node tests**, lint/build and **10 targeted Chromium scenarios** passed. Browser coverage includes genuine transform changes, gradient masks/glows, transform/opacity-only new keyframes, hover/focus pauses, reduced-motion navigation, selected solid-surface text contrast, delayed-font geometry, and responsive routes/editor at **360, 768, 1024, 1440 and 1920px**. These scenarios use the existing doubled HTTP/Auth backend with real application SQL, not live Supabase requests.
- Separate **unmocked local Chromium** captures at **1440px and 360px** observed all three orbit matrices changing, zero horizontal overflow and no page errors; the mobile reduced-motion composition remained static. Fresh desktop/mobile screenshots and a real-motion desktop video are retained in the approved temporary `premium-orbit-preview-JPhYhg` evidence directory. The in-app live preview was also inspected. This is targeted Chromium verification, not a full cross-browser, accessibility or performance audit.

## Editorial refinement (12 November 2026)

### Direction and references

Refined the existing application rather than rebuilding it. The checkout already contained uncommitted Archivo/Newsreader typography, a draft editorial stylesheet and small hero styling additions; these were inspected and developed, not discarded. The original CSS layers, page composition, route shell, forms, menu photography and animation implementation were audited before editing.

The initial paper/forest iteration was superseded by the owner's request for a darker theme and clearer animation. The current **campus field guide at dusk** uses charcoal green `#1d2927`, layered surfaces `#263532` / `#2d3e39`, off-white `#ece7dc`, sage `#b2c9b3`, warm copper `#dfa58b` and muted olive accents. Newsreader supplies expressive headlines and the italic Orbit wordmark; Archivo carries readable controls and body copy, with system monospace reserved for small editorial labels. The asymmetric spotlight, orbital portrait collage and charcoal standalone directory retain their distinct roles without changing content or controls.

| Reference | Principle used |
| --- | --- |
| [Kinfolk](https://www.kinfolk.com/) | Editorial hierarchy, generous whitespace, measured image/text proportions and restrained rules. |
| [Koto](https://koto.com/) | Confident typography, clear wayfinding and an identifiable visual voice rather than template chrome. |
| [Are.na](https://www.are.na/) | Content-first utility and readable information density. |
| [Studio Freight](https://studiofreight.com/) and the [Awwwards Dragonfly Redux listing](https://www.awwwards.com/sites/dragonfly-redux) | Distinctive art direction and purposeful motion as research references, not a reason to import heavyweight effects. |
| [Figma's 2026 web-design trends](https://www.figma.com/resource-library/web-design-trends/) | Evaluated typography, spacing and motion guidance against this application's usability and performance constraints. |

Reference sites informed principles only; no template, page, photograph, proprietary font or source code was copied. Direct Awwwards retrieval was limited, and Dragonfly's live browser view remained blank, so **a complete visual inspection of Dragonfly is not claimed**. Heavy 3D, experimental navigation, glowing accents, repeated decorative grids and large glass surfaces were deliberately not adopted.

### Implementation boundaries

- `src/editorial.css`, imported after `src/index.css`, changes typography, hierarchy, spacing, alignment, proportions, colour and responsive composition across Home, discovery, profiles/editor, Auth, administration and both café views. Existing transitions and keyframes in `src/index.css` remain unchanged; only its shared font-theme declaration changes.
- `Hero.jsx` adds a styling class and decorative orbit/caption markup. `DiscoverSection.jsx` adds only a conditional standalone styling class. The follow-up intentionally changes entrance distance/duration/staggering in `Hero.jsx`, `FeaturedProfileCard.jsx`, `ProfileCard.jsx` and `CanteenComparisons.jsx`. React state, handlers, requests, routes, component keys and content flows remain intact. The design work changed no routing/Auth/database/Storage code, retained profile content or menu data; the separate operator photo update below changes only menu photograph pointers and associated metadata/audit.
- Below 1001px, the hero's linked cards use natural-height CSS grid placement with a separate caption row. Names, skills and arrows remain readable rather than being covered by decoration. The application shell keeps the footer at the bottom of short pages; small-screen text inputs use 16px text to avoid small-input zoom.
- The original **18-second hero sheen**, pathname route exits and viewport-once lifetimes are retained. Copper/sage arcs and **14px/10px dots** rotate in opposite directions over **16/24 seconds**, with transform-only keyframes. Hero cards move **7px over 8/10 seconds**, pausing on hover or keyboard focus. Stronger entrances and **3px button / 4px card lifts**, arrow movement and modest image scaling replace the earlier preservation of every animation value. No application JavaScript loop, `will-change`, particle system or animation dependency is added; reduced motion stops the new loops and removes movement-based hover feedback.
- Three self-hosted weight-only Latin WOFF2 files are preloaded with local fallback metric adjustments. Font sources, byte sizes and unchanged OFL notices are recorded in [asset notes](../ASSET-NOTES.md). Original font assets remain retained but unused by the current declarations.

Verification for this refinement is recorded under [design, motion and accessibility evidence](#6-design-motion-and-accessibility-evidence). Services were resumed without resetting the local database; Anas Tech remains removed and was not restored for visual checks. The design and photo changes form this source revision on the delivery branch; they are not a hosted deployment.

## NESCAFÉ disposable hot-drink photos (12 November 2026)

- Replaced exactly **Cappuccino**, **Cafe Latte**, **Cafe Mocha** and **Hot Chocolate** with four distinct, drink-appropriate disposable-cup photographs; the cover shares Cappuccino's brown paper cup. Cappuccino and Latte reuse their existing files/metadata unchanged. Mocha uses Lara604's chocolate-flake-topped patterned paper cup (**CC BY-SA 2.0**); Hot Chocolate uses Famartin's freshly prepared drink in a disposable **foam** cup (**CC BY-SA 4.0**). Photographs remain illustrative, not actual NESCAFÉ IUST servings. [Asset notes](../ASSET-NOTES.md#nescafé-disposable-hot-drink-cups) record credits, hashes, dimensions and transformations.
- Preserved both original café import manifests and the older overlapping photo plan. Added the separate [`nescafe-hot-drink-cups.json`](../scripts/data/cafes/photo-updates/nescafe-hot-drink-cups.json) plan and Flickr preparation support with live source/image identity, author and permissive-licence checks. Mocha's licensed 1024px display JPEG is recorded without claiming an unavailable original camera URL or SHA-1. [Café maintenance](cafes.md#apply-the-four-drink-nescafé-photo-update) documents fresh/existing database commands and warns against blindly applying both photo plans.
- Applied `npm run menu:import -- --photo-update nescafe-hot-drink-cups --instance 43bbe85a-f1a8-403a-8776-ee2a5a57d87f` to the identified local stack. Exactly four photo pointers, their versions (**1 → 2**)/timestamps and the café cover/timestamp changed. Three missing photo records (`takeaway-cappuccino`, `takeaway-hot-chocolate`, `takeaway-mocha`) and one `menu.photos.update` audit (**`263b359e-6696-4aca-8796-5a59b7225552`**) were added; Latte metadata already existed.
- Before/after full-row comparisons confirmed unchanged price records/verifications, menu identities/offerings, publication, all other listings, Brew and Brink, profiles/moderation/skills/contacts/portfolios, account controls, assets and Storage objects. Full Auth-row fingerprints also matched. Inventory remains **2 cafés, 59 published listings and 45 public profiles**.
- Four new tests prove exact scope, preservation, matching-rerun idempotency after staff edits, and atomic rejection of wrong instances, missing cafés, stale pointers/covers and metadata conflicts. All **86 Node tests**, lint and build passed. All café browser checks passed at **360, 768, 1024, 1440 and 1920px**, including distinct paths, ₹30 prices, cover and credits. The full suite's unrelated signup timeout and unchanged successful rerun are recorded below.
- Separate **unmocked live Chromium** checks passed at **360px/1440px**: 31 NESCAFÉ images loaded, all 30 unique HTTP image hashes matched the manifest, four distinct replacement paths, Brew's 29 listings/Latte cover retained, zero horizontal overflow, page errors or unexpected origins. Fresh desktop/mobile cup screenshots were visually reviewed and presented. Sanitized evidence and private before/after snapshots remain outside Git in the approved temporary `nescafe-cup-verification-mITjlP` directory.

## Café comparison fix (10 November 2026)

- Reproduced the fault against actual PostgREST: the comparison tab read `get_canteen_prices`, whose verification-only contract returned the imported listings with `amount: null` and `status: unavailable`. The UI consequently displayed **Check needed** instead of their published menu prices.
- Added `get_canteen_menu_comparisons` and applied `202611100001_cafe_menu_comparisons.sql` to local instance `43bbe85a-f1a8-403a-8776-ee2a5a57d87f`. It pairs published offerings by shared menu identity/currency, retains size variants, calculates pair-specific differences before filtering/pagination and returns public source metadata.
- Added two café selectors, swapping, lower-price/tie labels, largest-difference sorting, budget/search/category filters, URL persistence, menu links and empty/retry states. A budget retains both prices whenever either meets the limit. Unknown serving quantities are explicitly labelled.
- Actual anonymous PostgREST returned **Cold Coffee ₹110/₹70 (₹40 difference)**, **Cheese Fries ₹150/₹90 (₹60)** and **Chicken Popcorn ₹130/₹120 (₹10)**. Budget/sort/reversed-pair checks passed; unspecified Tea did not match Small/Large variants. The running local page also passed budget and swap interactions without console errors.
- All **82/82 Node tests** passed, including five new comparison tests for published amounts, variants, ties/zero/decimals, third-café isolation, pagination, current-price publication/withdrawal and empty menus. All **33 browser scenarios** passed across the initial run and focused reruns; details are under [browser coverage](#browser-coverage-and-resolved-failures). The 360px and 1440px comparison screenshots were visually reviewed with no horizontal overflow.
- Lint and production build passed. Real SQL lint returned **32 warnings and no errors**; five new warnings arise from reusing the existing validation helpers in the STABLE comparison RPC.

## Brew and Brink menu (10 November 2026)

- Completed the existing Brew and Brink draft and imported **29 listings across five sections**, priced **₹15–₹170**. The supplied Markdown, exact names, Small/Large variants, subtitle and tagline are retained in the [source and manifest](cafes.md#brew-and-brink-source-and-inventory).
- Applied `202611090001_cafe_menu_sources_and_sections.sql` to local instance `43bbe85a-f1a8-403a-8776-ee2a5a57d87f`. Text/photograph source labels and café-local sections support shared catalogue identities with distinct prices. Existing full-profile and NESCAFÉ published-row digests matched before/after; counts stayed at **49 Auth accounts and 46 profiles**.
- Local inventory now contains **2 cafés, 59 published listings and one import audit per café**. The actual anonymous PostgREST response matched every row of the supplied Markdown, including sizes. Budget filtering returned eight listings at ₹50 or less, and NESCAFÉ Cold Coffee remained ₹70 in its own section.
- Validated all **26 Brew and Brink photo files** and their live HTTP bytes against the curated SHA-256 metadata. Desktop/mobile card crops were visually reviewed; [asset notes](../ASSET-NOTES.md#brew-and-brink-photographs) document the 20 additional sources and six reused photographs.
- **77/77 Node tests** passed, including the added Brew and Brink import scenario for café-specific sections, shared-item identities, size variants, text provenance, source preservation on administrator saves and repeated imports. **8/8 targeted café Chromium checks** passed, including Brew and Brink at **360px and 1440px**, café switching, all 30 displayed images, sizes, filters and reloads. These browser tests use real application SQL with doubled HTTP/Auth. The in-app browser also loaded the real local menu without console errors.
- Lint and production build passed. Real SQL lint reported **27 warnings and no errors**.

## Resend support and profile removal (9 November 2026)

- Verified compatibility against the official Resend/Supabase SMTP documentation. Added `npm run email:setup:resend`: verified-domain sender, separate test recipient, hidden API-key input, implicit TLS on `smtp.resend.com:465`, and username `resend`.
- Settings are written atomically to ignored `supabase/.env.local` only after SMTP authentication and test-message acceptance. Managed Gmail blocks migrate to a provider-neutral block; failures preserve existing settings and provider errors do not expose credentials. Four new Resend SMTP-double checks extend the four Gmail checks (**eight total**), covering TLS/recipient setup, provider switching, authentication/delivery failures and invalid/conflicting input.
- Applied `supabase/operator/remove-anas-tech-profile.sql` to inspected instance `43bbe85a-f1a8-403a-8776-ee2a5a57d87f`. The existing removal state hides discovery, direct public profile reads and public photo access, clears spotlight selection, and records one operator audit. Repeat removal is idempotent; import receipts preserve the removal on normal reimport.
- Actual anonymous APIs returned zero Anas Tech matches, a null direct profile, and 45 remaining public profiles. The running image gateway denied the portrait with **403 — Image is not available** and `no-store` headers. Live browser checks showed **No matches just yet** and **Profile not available** without console errors. Full-row digests for other profiles/moderation, account controls and café records matched before/after.
- `npm test`: **76/76 passed**. Lint and production build passed. External Resend delivery awaits a verified sending domain and owner-supplied API key; the local mailbox is still active.

## Historical Anas Tech import (7 November 2026)

- Recovered and visually matched the original supplied portrait. The checked-in WebP is auto-oriented, metadata-stripped, **888 × 1280**, **134,518 bytes**; original and normalized hashes are recorded in the [profile manifest](../scripts/data/profiles/anas-tech.json).
- Added the requested name, tech introduction, services/interests, three technology skills and a non-deliverable temporary login email. Programme and semester fields are empty, with no invented completed projects or public contact links.
- Added the local, instance-bound `profile:import` command and operator-attribution migration. The ordinary Auth account receives no administrator role; directory approval and the single `profile.import` audit identify `github:HaadiDanger` as the operator. Later normal edits and eligibility decisions clear stale operator attribution.
- Applied `202611070001_operator_profile_imports.sql` and imported into instance `43bbe85a-f1a8-403a-8776-ee2a5a57d87f`. Existing full-row digests for **48 Auth accounts, 45 profiles and 30 published menu listings** were unchanged. The resulting inventory is **49 Auth accounts and 46 profiles**, with one imported portrait in private profile media.
- Real anonymous discovery returned one matching profile. The live discovery card and detail page passed at **360px and 1440px** without overflow or page/HTTP errors. Browser-loaded image bytes matched the committed SHA-256 exactly. Desktop/mobile screenshots were visually reviewed; the in-app browser also displayed the profile and portrait with no console errors.
- Temporary sign-in, populated owner-editor reload, sign-out and subsequent anonymous photo/profile reads passed. A matching CLI rerun preserved full-row fingerprints for the new account, profile, controls, skill links, moderation, asset, Storage object and audit, plus the generated credentials.
- All **72/72 Node tests**, lint and production build passed. Four direct/raw/URL-module/absolute-path credential-file requests returned **403**. SQL lint retained **27 warnings and no errors**. Sanitized live evidence is in ignored `.profile-imports/live-verification.json`, with desktop/mobile screenshots alongside it.

See [profile history and removal](profiles.md) for the current removal status and original import records.

## Café menu update (6 November 2026)

- Visually checked all **30 names and INR amounts** against the supplied **NESCAFÉ | IUST BRANCH** photograph: four sections, **₹15–₹120**. The [manifest](../scripts/data/cafes/nescafe-iust.json) records its source label, receipt date and SHA-256. Capture date, portions, hours and current availability were not supplied.
- Added database-backed café browsing at `/canteen-prices`, with category/search/budget/sort controls, URL persistence, responsive cards, empty/retry/image fallback states and expandable source/photograph credits. The original comparison tab used the exact-portion verification API; the [10 November fix](#café-comparison-fix-10-november-2026) adds published-menu comparisons.
- Curated **30 real Wikimedia photographs**, served locally as WebP, with original/download provenance and integrity metadata. Final review replaced the egg-containing veggie burger and weaker popcorn, fried-burger, Maggi and Korean-noodle images. Iced-tea and cold-chocolate crops were adjusted. All authors/licences are in [asset notes](../ASSET-NOTES.md#campus-café-food-photographs).
- Added the atomic, instance-bound `menu:import` command, optional SQL export and `menu:photos` preparation tool. The importer records `cafe-menu-import-cli` as the price actor and a manifest-hashed `menu.import` audit. It creates no Auth account or administrator. Completed matching imports preserve staff changes; changed manifests and conflicts are rejected.
- Added genuine-administrator menu publication controls for source/date/photo/order. A new price hides the old listing until explicit republication; withdrawal, revocation, retirement and unpublication also remove it. Menu-board publication does not imply verified comparison eligibility.
- Applied `202611060001_cafe_menus.sql` to local instance `43bbe85a-f1a8-403a-8776-ee2a5a57d87f`. Before/after counts and full-row digests confirmed preservation of **48 Auth accounts and 45 profiles** through migration and import.
- Real inventory: **1 genuine café, 30 published listings, 30 operator-attributed prices, 30 photo records and one import audit**. A matching second import returned identical public records. Actual PostgREST reads matched every source amount, budget filters and comparison exclusion; anonymous administrator access was denied.
- The live page passed at **360px and 1440px**, with **30 cards and all 31 displayed images loaded**, no horizontal overflow, no page/HTTP errors, and working budget/sort/reload controls. Desktop/mobile screenshots were visually inspected. The in-app browser also loaded the live menu without errors; screenshots were captured with separate Chromium because the desktop tab was not visible to its screenshot tool.
- Genuine-administrator publication/replacement and broader rollback/authorization cases passed against disposable SQL and the browser test backend. No genuine administrator has yet been appointed in the retained local instance.
- Latest results: **68/68 Node tests**, **28/28 Chromium checks**, lint and production build passed. Real SQL lint reported **27 warnings and no errors**. Sanitized local evidence is retained in ignored `.dev-seed/menu-live-migration.json`, `menu-live-results.json` and `menu-live-browser.json`; live screenshots are in the local temporary evidence directory.

Use [café setup and maintenance](cafes.md) for imports, publication and future café additions.

## Authentication email update (6 November 2026)

- Confirmed the existing `/admin` dashboard and its account, reference, price, role, settings and audit sections. The owner selected **password login** and **Gmail** for confirmation and recovery messages.
- Added `npm run email:setup`: private terminal prompts, required STARTTLS, Gmail authentication and a self-addressed setup email, followed by saving the CLI 3 SMTP overrides to ignored `supabase/.env.local`. Failed SMTP checks preserve saved settings. The setup command uses pinned development dependency Nodemailer `10.3.1`; application messages are sent by Supabase Auth.
- Added confirmation and recovery HTML templates under `supabase/templates/`, explicit one-hour link expiry, one-minute send interval and a 20/hour custom-SMTP limit. Restarted the local stack to apply the templates while retaining its database.
- Added post-signup confirmation resend, a 60-second retry countdown, readable SMTP/rate-limit errors, and callback/recovery error handling for URL fragments as well as query parameters.
- **Verification:** `npm test` passed **58/58**. The expanded browser run passed 21/22 initially and exposed a missing fallback for an Auth HTTP 429 response without a parsed error code. After that fix, all **4/4 targeted authentication browser checks** passed. The other 18 browser checks passed in the full run. Final lint and production build passed.
- A separate real local Chromium check passed signup, branded confirmation delivery, actual confirmation resend after the cooldown, PKCE confirmation, rejection of a reused link, password sign-in, branded recovery delivery, password update, rejection of the old password and acceptance of the new one. There were no page errors.
- The disposable account's initial cleanup hit the intentional `account_controls` foreign-key restriction. Its exact UUID, email, creation time, unchanged controls and empty application data were inspected; the empty control row was removed with an operator audit, then the Auth account was deleted through the Admin API. Its three Mailpit messages were removed. Sanitized verification/cleanup results remain in ignored `.dev-seed/email-flow-results.json`.
- A real nested environment-file HTTP check returned **403** without its test value. The temporary probe file was removed. SMTP credentials remain outside browser configuration and the bundle.

**Activation remaining:** external SMTP delivery has not been tested with owner credentials. Run `npm run email:setup:resend` (or `npm run email:setup` for Gmail) in an interactive terminal and follow the restart instructions in [account-email setup](email.md). Until then, account emails are captured by local Mailpit.

## 1. Baseline and repository state

- Repository: `HaadiDanger/Semester-Project-1`. Implementation baseline: `bc5af7d612b9d9481d9bd668c8014c74fb47af73` (`docs: add IUST Connect architecture audit and coding prompt`). The platform, email, Orbit branding and café changes are delivered together on `feat/supabase-campus-platform`; Git history identifies the exact publication revision.
- The original platform starting checkout was clean. Existing React/Vite/JavaScript/Tailwind structure, typography, colours, responsive proportions and animation contracts were inspected and extended. The **12 November refinement** began with the uncommitted editorial draft described above and preserved that work. No applicable workspace `AGENTS.md` was found.
- The baseline used eleven fictional profiles, hard-coded academic/skill lists and browser-local draft/publication storage. Those production paths were replaced with database APIs. The historical architecture package remains in `docs/architecture/`.
- Baseline `npm run build` passed with Vite `8.3.2`; baseline `npm run lint` passed with the existing `react(only-export-components)` warning in `AppContext.jsx`. The final lint result has no warnings.
- The current request supersedes the historical campus-only/seven-day recommendations: approved, eligible, opted-in public profiles, published café menus and qualifying comparison prices allow anonymous reads; comparison freshness defaults to **30 days**. Content approval, campus eligibility and account restriction remain separate.

## 2. Implemented application and backend

| Area | Main changed paths | Implemented behavior |
| --- | --- | --- |
| Application shell and asynchronous state | `src/App.jsx`, `src/components/Navbar.jsx`, `src/context/`, `src/hooks/` | Protected routes, lazy-loaded non-home pages, session-scoped query/image state, cancellation and loading/error/retry/setup states. |
| Authentication | `src/lib/supabase.js`, `src/pages/AuthPage.jsx`, `src/pages/AuthCallbackPage.jsx`, `src/components/ProtectedRoute.jsx` | Registration, confirmation/resend handling, sign-in/out, PKCE callback/recovery, safe return paths and confirmed-account checks. |
| Owned profiles | `src/pages/MyProfilePage.jsx`, `src/components/ProfileForm.jsx`, `src/components/ProfileView.jsx`, `src/utils/profiles.js` | Persistent drafts, student/graduate fields, inclusive skills, multiple stable-ID portfolios, optional contacts, audiences, review submission/withdrawal, publication and deletion requests. |
| Discovery and details | `src/pages/HomePage.jsx`, `src/pages/DiscoverPage.jsx`, `src/pages/StudentPage.jsx`, `src/components/DiscoverSection.jsx`, `src/components/FilterBar.jsx` | Database text/reference filters, count-before-pagination, spotlight, detail reads and explicit empty/error states. |
| Café menus and comparisons | `src/pages/CanteenPage.jsx`, `src/components/canteen/`, `src/utils/prices.js`, `src/components/admin/PricePanel.jsx`, `src/components/admin/MenuPublication.jsx` | Source-labelled menus, photo credits and publication controls; two-café published-price comparisons with variants, differences and filters; exact-portion verification API and private append-only price history. |
| Administration | `src/pages/AdminPage.jsx`, `src/components/admin/` | Accounts/eligibility/moderation, suspension/restoration/removal, deletion completion, reference editing/merges, suggestions/reports, separate roles, settings and audit. |
| Private media | `src/components/AssetUpload.jsx`, `src/components/AssetImage.jsx`, `src/components/Avatar.jsx`, `supabase/functions/` | Quarantine reservations, real raster normalization, permission-checked streaming, response-loss reconciliation and leased cleanup. |
| Database and operators | `supabase/config.toml`, `supabase/migrations/`, `supabase/operator/` | RLS, narrow transactional RPCs, protected roles/origins/history, read-only inspection, instance-bound development enablement and first-admin bootstrap. |
| Fixtures and verification | `scripts/`, `tests/`, `playwright.config.js` | Guarded seed/cleanup, real-local integration command, disposable SQL/SDK tests and browser regression coverage. |
| Phone optimization and preview | `src/hooks/useAmbientMotion.js`, `src/components/PhonePreview*.jsx`, `src/components/PhonePerformancePanel.jsx`, `scripts/phone-preview.mjs`, `scripts/lib/phone-preview.mjs` | Phone-light hero, offscreen/background pause, on-demand avatars/routes and a production-built anonymous LAN preview with opt-in diagnostics. |
| Design and documentation | `src/index.css`, `src/editorial.css`, `src/fonts.css`, `README.md`, `ASSET-NOTES.md`, `docs/` | Soft-dark editorial identity, enhanced motion with retained route/mounting behavior, Orbit branding, real menu photography, responsive forms/panels and operator guidance. |

The wired owner flow is registration/confirmation → draft and uploads → submission → independent eligibility/content review → publication/discovery. Editing approved content returns it to a hidden draft. Pending content must be withdrawn before editing. Unpublication is immediate; deletion requests hide content immediately, and administrator completion deletes profile content and queues uploads while retaining the separate sign-in account.

Photo/contact defaults are owner-only; each portfolio has an explicit audience. Moderators can inspect private profile/portfolio images, while owner-only contact values stay out of moderation previews. Contact links replace the former placeholder Connect action; messaging is not implemented.

Authentication uses Supabase JS `2.118.0`; the database rechecks account status and protected role records for authorization. Client payloads cannot assign ownership, approval, roles, origin markers or server versions. Role-manager-only accounts do not receive content administration. Self-moderation/self-role changes and removal of the last qualifying role holder are denied. Report subjects and reporters must recuse from administrator resolution.

### Tooling decisions

- Verification used Windows, Node `24.20.0`, npm `11.19.0` and Chromium `156.0.8078.4` (Playwright revision `1248`).
- Newly pinned tooling: Supabase CLI `3.0.0`, PGlite `0.5.15`, Playwright `1.64.1` and ImageMagick WASM `0.0.45`. Vite is pinned to `8.3.5`; existing React and Framer Motion dependencies were retained.
- The lockfile matches `package.json`. Its added dependencies and Vite/toolchain updates were reviewed; all package resolutions use the npm registry and include integrity metadata.
- `supabase/functions/deno.json` pins Supabase JS and ImageMagick versions. `npm run edge:prepare` copies the decoder into ignored `supabase/functions/_shared/magick.wasm` for serving/deployment.
- The browser bundle has separate non-home route and vendor chunks. The **13 November phone-optimized regular build** main entry is **34,662 bytes** (`index-BSFRc_Gt.js`); this excludes shared/vendor chunks and is not the total home payload. The largest JavaScript chunk remains the **257,761-byte** React vendor chunk. The earlier **12 November** main entry was **102,622 bytes** (`index-C22WKy1n.js`), before the route splitting and subsequent orbit changes. The original 30 NESCAFÉ menu photographs total **3,284,052 bytes**. These are measured uncompressed sizes with local public configuration.

## 3. Database and configuration execution

Ten ordered migrations replay successfully in **disposable PGlite databases**, using minimal Auth/Storage schemas and PostgreSQL roles supplied by `tests/helpers/database.mjs`. The first six applied during fresh real Supabase startup on 4 November; the café migration applied to the populated instance on 6 November, the profile-import migration on 7 November and the menu-source/section and comparison migrations on 10 November:

| Migration | Scope |
| --- | --- |
| `202611030001_foundation.sql` | Account controls, roles, audit, references, profile/asset/price tables, Auth triggers, RLS and origin/production guards. |
| `202611030002_profile_api.sql` | Owned aggregate writes, version/request receipts, discovery/details, audiences, reports and suggestions. |
| `202611030003_administration.sql` | Eligibility/moderation, reference editing/merges, role management and settings. |
| `202611030004_canteen_prices.sql` | Current-first comparison, immutable price/verification history and administrator queries. |
| `202611030005_private_storage.sql` | Private buckets, quarantine policy, authorization/processing/reconciliation and cleanup RPCs. |
| `202611030006_development_fixture_controls.sql` | Service-only fixture registration, inventory and exact-batch cleanup. |
| `202611060001_cafe_menus.sql` | Curated photo metadata, operator-attributed prices, source-labelled menu reads and versioned publication. |
| `202611070001_operator_profile_imports.sql` | Operator-attributed eligibility/profile approval and attribution reset on later edits/decisions. |
| `202611090001_cafe_menu_sources_and_sections.sql` | Café subtitles, text/photograph provenance, independent menu sections and source-aware publication. |
| `202611100001_cafe_menu_comparisons.sql` | Side-by-side published-menu comparisons, variant matching, price differences, filtering and pagination. |

Migration SHA-256 values at handoff:

```text
78405851cd3df15490d618b83548ca9b0513b41a38232e8aca53fb75e8f1a2c5  202611030001_foundation.sql
1cb665a1f9946a82db7a84390620b5832ca6ec0e1f5f90c4436efde132e0cf6b  202611030002_profile_api.sql
cd63da8bcae537595e7cf3195afb7179e710f1f4fcfc918973c8a3d5425cd63d  202611030003_administration.sql
5fcdaf1d456061ef79483a34c8c4e6ba2f0b5d039d9793d5c2135b8ad0acd8c4  202611030004_canteen_prices.sql
eff88ed6fafdb6b89becf392568ccbba9f3ca42b1bd097d6692104c898ee2554  202611030005_private_storage.sql
6518faa139232affa7db39545e4cc5b67bff778cdacdbc4e7799a6d09287bccb  202611030006_development_fixture_controls.sql
e4aaed894943a820b2f62660731812456858710cc358dd303be6b9a7c8dc1863  202611060001_cafe_menus.sql
2802862bb5c6b187418602465978cdf354ef1025c9c150654041194b60960537  202611070001_operator_profile_imports.sql
917bf5231e585a0e1e9b729b58056e2d5791a10b76f30350c81da8f620692a04  202611090001_cafe_menu_sources_and_sections.sql
0f41ab2158004b1cd6a325834a809d6d5ec858554c86cfa886eeeebe8cb5c81a  202611100001_cafe_menu_comparisons.sql
```

The local configuration targets `iust-connect-local`, API port `54321`, PostgreSQL 17 on `54322`, Studio `54323` and local mail `54324`. The database itself starts `production`, seed-disabled, with manual eligibility and 30-day freshness even on a local installation. Migrations contain no official academic catalogue, student fixtures or genuine prices.

On 3 November, no container runtime was available. On 4 November, the user started Docker Desktop; inspection confirmed a local `desktop-linux` engine, free project ports and no prior Supabase containers/volumes. CLI `3.0.0` started a fresh stack on **PostgreSQL 17.11**. After the populated-stack upgrades through 10 November, migration history matches all ten files; their current hashes are recorded above.

The real local instance UUID is **`43bbe85a-f1a8-403a-8776-ee2a5a57d87f`**, API `http://127.0.0.1:54321`, database container `supabase_db_iust-connect-local`. Instance-bound operator SQL enabled development fixtures following the user's request for sample profiles. `npm run connect:local` verified this UUID and generated ignored `.env.local` and `.env.functions.local` without printing keys. Vite runs at `http://localhost:5173`; local mail is at `http://127.0.0.1:54324`. Image functions are served with the generated function environment. No hosted project was positively identified or approved for writes.

Real read-only inspection exposed two CLI 3 limitations: its read-only validator rejects `BEGIN`, and its prepared query execution rejects multiple statements. `inspect.sql` now uses one SELECT; documented operator transactions use `docker exec -i … psql` in one connection. Local fixture enablement passed this real procedure. First-admin bootstrap remains covered by PGlite tests; no genuine administrator has been appointed. It requires the inspected instance UUID, exact confirmed Auth UUID/email, operator and reason in one transaction, and grants roles without granting university eligibility. See [setup](setup.md#4-auth-email-and-the-first-administrator).

## 4. Development fixtures

The seed and cleanup scripts were exercised against PGlite and explicit SDK/Auth/Storage doubles. On 4 November, real local seeding used **`--profiles-only`**. The retained **fixture batch** contains:

- **45 owned profiles / 46 Auth accounts**, including the separate `sample-admin`.
- Mustafa Shahzad (`member-01`) and Hashim (`member-02`), with illustrative identities and work rather than verified personal claims.
- Six inclusive categories, **61 skills**, three example departments/programmes, **57 portfolio entries** and five graduate profiles.
- Initials, no profile portraits and no contact details. Sample accounts cannot add contact links or profile-photo uploads through the application.
- **Zero sample food categories, canteens, menu items, offerings, price records and verifications**. Genuine NESCAFÉ records were imported independently on 6 November.

The optional full fixture scope still supports illustrative canteen cases in disposable tests, with code-drawn `SAMPLE / NOT REAL` evidence. Those cases were not loaded into this local database. The manifest stores `includeCanteens: false`, so a bare rerun preserves the profiles-only scope. `--with-canteens` is an explicit extension; `--profiles-only` refuses to silently downgrade an existing full batch. Account identities and dataset hashes remain stable across scope choices.

Batch: `ec280977-5d12-4d13-a584-7c44456ee045`.

Dataset SHA-256: `d97817dd8e419b6f92149a9cf7c99c525310d0fcdea3b0b437276475ec39917d`.

All 45 profiles are initially published through simulated review. This is a dataset size, not an enrollment cap. The scripts require HTTP loopback on port `54321`, explicit confirmation, the exact instance UUID, development/seed enablement, matching dataset/account hashes and protected Auth metadata. Requests cannot follow redirects or send credentials to another origin.

Idempotent reseeding and partial seed/cleanup recovery passed. Cleanup preserved genuine same-name accounts and genuine shared references, removed only the verified batch, and permitted the tested production transition after sample cleanup. Sample authority cannot replace genuine role holders, read genuine campus/private subjects or affect genuine price minima.

Real profile fixture execution passed. The credential/progress file is ignored `.dev-seed/accounts.json`; no fixture password is committed or served by Vite. Use [fixture setup](setup.md#5-optional-local-development-fixtures) and [cleanup/recovery](operations.md#fixture-cleanup-and-recovery). Sample profiles retain initials; the user's own account can upload personal photos without eligibility approval or configured academic references while saving a private draft.

## 5. Executed verification

### Latest commands and outcomes

| Command | Outcome | Evidence boundary |
| --- | --- | --- |
| `npm test` (13 Nov, phone optimization) | Exit 0; **91/91 passed**. | Previous 86 tests plus five preview configuration/static-serving/anonymous-proxy/security/limit checks. |
| Full Chromium run (13 Nov, phone optimization) | Exit 0; **48/48 passed**, **zero retries**, approximately **4.5 minutes**. | `npx playwright test --reporter=list --output=…/phone-optimization-full-20261113-b470`; real frontend/SQL with doubled HTTP/Auth/Storage, including three new phone/loading/cleanup checks. |
| Unmocked production LAN and performance checks (13 Nov) | Four phone/touch sizes, both menus/comparisons, preview restrictions and diagnostic cleanup passed; about 60 rAF FPS / 4.8 MB fresh post-GC JS heap. | Actual local production builds/Supabase responses; desktop mobile emulation, not physical-phone FPS or total RAM. Detailed limits above. |
| Local migration inspection (13 Nov) | All ten local/applied migration IDs match. | Configured loopback stack only; hosted CLI login/project ref unavailable and no cloud writes. |
| `npm test` (12 Nov, final cups) | Exit 0; **86/86 passed**. | Real application SQL/image processing and committed photo bytes, with explicit Auth/Storage/SMTP doubles; four new photo-update scope/preservation/conflict tests. |
| `npm run test:browser` (12 Nov, final cups) | Exit 1; **44/45 passed**, approximately 5 minutes. | Actual React/Supabase JS frontend with intercepted HTTP/Auth/Storage backed by PGlite; all five-width café and design/motion checks passed. Signup-resend timed out on a blank page before form entry. |
| Focused signup-resend rerun (12 Nov) | Exit 0; **1/1 passed**, unchanged application/test, approximately 7.4 seconds including setup. | `npx playwright test tests/browser/platform.spec.mjs --grep 'signup confirmation can be resent' --reporter=list --output=…/signup-rerun`; together with the full run, 45 distinct scenarios passed. |
| Read-only live preview captures (12 Nov) | Passed at 360px/1440px; real counter-rotation, zero overflow and no page errors or unexpected origins. | Actual local frontend/Supabase responses, not HTTP doubles. Fresh screenshots and an orbit video were captured without disabling or fast-forwarding animations and without database writes. |
| Guarded local cup-photo update and before/after inspection (12 Nov) | Four listing photos/versions and cover updated; three metadata rows and one audit added. | Identified local instance; prices, publication, other listings, Brew, profile/account data, assets, Storage and full Auth-row fingerprints preserved. |
| Unmocked live cup-photo Chromium check (12 Nov) | Passed at 360px/1440px; 31 images loaded and 30 unique hashes matched; four distinct cups; Brew's 29 listings preserved. | Actual local frontend/PostgREST and same-origin image bytes; zero overflow, page errors or unexpected origins. |
| Real local email/browser check (6 Nov) | Account flows passed; exact-account/mail cleanup subsequently completed. | Actual Supabase Auth, PKCE, confirmation/resend/recovery templates and Mailpit; external Gmail remains pending. |
| `npm test` (3 Nov) | Exit 0; **54/54 passed** across nine files. | Actual application SQL in PGlite, actual image decoder, explicit service doubles. |
| `npm run test:browser` (3 Nov) | Exit 0; **19/19 passed**, approximately 1.4 minutes, zero retries. | Chromium with the actual React/Supabase JS frontend and intercepted Auth/Storage/HTTP backed by PGlite. |
| `node --test tests/fixtures.test.mjs tests/operator.test.mjs` (4 Nov) | Exit 0; **8/8 passed** after profiles-only changes. | Empty canteen scope/reruns, explicit full-scope extension, stable account identities and existing operator/cleanup guards. |
| `npm run lint` (13 Nov) | Exit 0; no warnings or errors. | Oxlint. |
| `npm run build` / `npm run preview:phone` (13 Nov) | Exit 0 build; Vite `8.3.5`, no warnings; separate LAN preview running. | Regular and dedicated phone production bundles; three hashed local WOFF2 assets. |
| `npm ls --depth=0` (12 Nov) | Exit 0; dependency tree valid. | Manifest/lockfile checks also match; the two added font packages have npm-registry resolutions and integrity metadata. |
| `npm run edge:prepare` | Succeeded; pinned WASM prepared and loaded by the real local Edge runtime. | Hosted packaging/deployment remains untested. |
| `git -c core.safecrlf=false diff --check` | Exit 0. | Tracked diff whitespace. |
| `npm run test:integration -- --confirm=exercise-local-fixtures` | Exit 0 on 4 Nov. | Real Auth sessions, PostgREST ownership/privacy, portfolios/moderation, Storage denials and Edge normalization/streaming. Canteen checks explicitly skipped for profiles-only. |
| `npx supabase start` / `migration up` / migration inspection | Fresh startup and populated-stack upgrades passed; all ten migration IDs match. | Real PostgreSQL 17.11 and managed local Auth/Storage schemas. |
| `npm run profile:import -- --instance … --operator github:HaadiDanger` (7 Nov) | Initial import and matching rerun passed; one profile/photo and one import audit. | Real Auth creation, private Storage upload, instance-bound operator SQL and anonymous PostgREST verification. |
| One-off live profile Chromium check (7 Nov) | Discovery/detail passed at 360px and 1440px; exact image hash, sign-in/editor/reload/sign-out and repeat-import preservation passed. | Actual local application, Auth, PostgREST, Storage and Edge gateway; no mocked responses. |
| `npm run menu:import -- --instance …` | Initial import and matching rerun passed; 30 published entries and one audit. | Real instance-checked SQL, committed photo hashes and real public PostgREST amounts/filter checks. |
| One-off live café Chromium check (6 Nov) | Passed at 360px and 1440px; 30 cards, 31 loaded images, no overflow/errors; budget/sort/reload passed. | Real local application and PostgREST responses; requests restricted to those origins without response mocking. |
| Live comparison API and browser checks (10 Nov) | Three exact shared-item pairs/differences; budget retains both prices; swapping, sorting and unlike-size exclusion passed. | Actual local PostgREST; in-app browser verified live prices, budget filtering and swapping. |
| `npx supabase db lint --schema public,private --level warning --fail-on error` | Exit 0; **32 warnings, no errors**. | Warnings concern STABLE/VOLATILE helper calls and implicit text-to-JSONB initialization. |
| One-off ordinary-account Chromium check (4 Nov) | Passed signup, local confirmation, draft/photo/portfolio save, reload, second browser context and password recovery. | Actual services; network interception allowed only the local application/API and did not supply mock responses. |
| Real `asset-cleanup` invocations | **1/1**, then **2/2** completed. | All three test images removed; 0 remaining Storage objects and 3 metadata tombstones. |
| Private development-file HTTP checks | **6/6 denied (403)**; application root still returns 200. | Fixture manifest, raw/encoded/absolute-path forms and both environment files. |
| Private profile-import credential HTTP checks (7 Nov) | **4/4 denied (403)**. | Direct, raw, URL-module and absolute-path requests for the actual generated credentials. |

### Node coverage

| Test file | Passed | Main observations |
| --- | --- | --- |
| `tests/database.test.mjs` | 10 | Migration replay, RLS/direct-write denials, ownership and three-entry persistence, audiences, approval/version rules, retry receipts, deletion and production guards. |
| `tests/administration.test.mjs` | 7 | Separate role powers, self/last-holder protections, private notes, references/stages/merges/aliases, request handling and settings. |
| `tests/canteen.test.mjs` | 7 | Current-first selection, complete-set minima/ties, unlike portions, zero/precision checks, stale/revoked/withdrawn states, conflicts and immutable history. |
| `tests/cafe-import.test.mjs` | 4 | NESCAFÉ's 30 source prices/photo assets; Brew and Brink's 29 listings, café-specific sections, shared identities, size variants and text provenance; atomic rollback, idempotency and preservation of staff edits/withdrawals. |
| `tests/cafe-photo-update.test.mjs` | 4 | Exactly four distinct cups, unchanged imports/prices/Brew/profile data, photo/cover scope, immutable metadata, idempotency after staff edits and atomic instance/stale-pointer/metadata conflicts. |
| `tests/profile-import.test.mjs` | 4 | Supplied portrait/discovery, private login, operator attribution, owner-edit/rerun preservation, atomic conflicts, shared-skill reuse and later eligibility changes. |
| `tests/cafe-menu.test.mjs` | 7 | Empty/publication states, source/credit reads, filters/precision, current-first replacement, revocation/retirement, authorization/version checks and operator attribution. |
| `tests/cafe-comparisons.test.mjs` | 5 | Published pair prices, variants, zero/decimal ties, pair isolation, filters/pagination, replacement/republication/withdrawal and empty menus. |
| `tests/storage.test.mjs` | 7 | Owned expiring inserts, worker-only completion, private pointers/audiences, retained historical evidence, cleanup leases and revoked/pending/removed/deletion upload restrictions. |
| `tests/images.test.mjs` | 5 | Real PNG/JPEG/WebP decoding, resize, orientation, metadata stripping/digest and malformed/animated/oversized rejection. |
| `tests/edge-handlers.test.mjs` | 7 | HTTP/token/origin validation, normalization plus SQL completion, no-store reads, Storage failures, lost responses, late writes and independently authenticated cleanup. |
| `tests/fixtures.test.mjs` | 5 | Pre-write target guards, production denial, 45 profiles, profiles-only/full-scope reruns, sample isolation and resumable targeted cleanup. |
| `tests/origins.test.mjs` | 3 | Cross-batch authorization, report recusal/provenance and isolated cleanup. |
| `tests/operator.test.mjs` | 3 | Exact-instance/account bootstrap guards, idempotent audit, eligibility separation and explicit local-fixture enablement. |
| `tests/email-setup.test.mjs` | 8 | Gmail STARTTLS and Resend implicit TLS, sender/test-recipient setup mail, private CLI overrides, provider switching/credential rotation, preserved settings and failure/input handling. |
| `tests/phone-preview.test.mjs` | 5 | Assigned private LAN selection, local/anonymous target validation, public static/gzip/cache/SPA behavior, Host/Origin rejection, stripped credentials, public-read allowlist, body limits and redirect denial. |

SQL assertions switch to `anon` or `authenticated` with synthetic user claims for ordinary access checks; privileged setup and worker operations use separate roles. This exercises PostgreSQL authorization under the supplied schemas. It does not establish real JWT issuance, managed Auth/Storage schema compatibility, PostgREST/GraphQL exposure or multi-connection behavior.

Image tests execute the pinned ImageMagick WASM under Node. Edge-handler tests invoke the shared handlers with real Request/Response objects and controlled service doubles. The separate real integration/browser checks verified local Edge WASM loading, normalization and streaming; hosted static-file packaging and measured CPU/memory limits remain unverified.

### Browser coverage and resolved failures

The browser suite checks combined discovery filters/counts/two-page uniqueness, retained route/card nodes, Auth/resend/recovery outcomes, three portfolios and private contacts across two browser contexts, failed-save input/request-ID retention, editor/upload lifetime, sign-out privacy, publication/moderation, reports/suggestions, reference/role/settings/audit workflows, canteen history, dialogs, responsive routes and unconfigured installations. Café coverage includes both source menus and photo credits, the four distinct disposable-cup paths/₹30 prices/Cappuccino cover/Flickr credit, URL-persisted filters, missing-image/database retry, administrator replacement/republication, and side-by-side comparisons at **360, 768, 1024, 1440 and 1920px** with budgets, categories, sorting, café swapping, reloads, menu links and single-café/unpublished-fixture empty states.

One price-history check retained private amounts `[40, 30, 20]` and latest decisions `["revoked", "verified"]`, while the revoked public result returned `amount: null`, `difference: null`, `is_cheapest: false`. These full-suite checks use the shared disposable backend. Ordinary profile/photo/portfolio persistence was also confirmed in two real browser contexts on 4 November.

Earlier browser failures exposed modal Tab wrapping and mobile Escape/focus/current-page behavior, which were fixed. Other assertions were corrected for overlapping outgoing/incoming toasts, scoped live regions, rendered desktop geometry, audit action search, redacted revoked prices and waiting for incoming route content before asserting removal. Café checks also exposed whole-rupee `.00` formatting and an over-broad canteen selector; formatting now omits unnecessary decimals and the assertion targets the named combobox.

The 10 November full run passed **29 checks**, encountered three new select-locator failures, and reached the outer command timeout before completing the setup check. Exact `getByLabel` text included nested select options; the new tests now use named combobox roles. Two follow-up route assertions were scoped to level-2 café headings to avoid outgoing comparison-card headings. All four affected scenarios passed in focused reruns, giving **33 distinct passing scenarios across runs**. Comparison screenshots wait for viewport-driven card animations before capture. The reduced-motion development warning is expected; no page errors or unexpected backend/external requests remained in the passing checks.

The initial **12 November paper/forest review** exposed a tablet caption covering linked hero labels and equal fixture sort orders producing nondeterministic project numbering. A separate natural-height caption row below 1001px and explicit fixture `sort_order` values resolved those issues without changing application logic; that iteration passed 45 scenarios. After the owner's darker-theme/more-apparent-motion follow-up, a **new full 45-scenario run passed** in approximately **3.8 minutes with zero retries**. `settleCards()` triggers the current viewport-once entrances and waits for opacity 1 before screenshots; it never disables or fast-forwards application animations.

After the final cup assets and guarded plan were added, the latest full run passed **44/45** in approximately **5 minutes**. `platform.spec.mjs:166` timed out waiting to fill **Email address** on `/sign-up`; the captured page was blank. Its root cause was not established, and no application fix or assertion change was made. The unchanged focused signup-resend rerun passed **1/1**, giving **45 distinct passing scenarios across these runs**. This is not represented as a new zero-failure full run. All café, responsive, motion, contrast and delayed-font scenarios passed in the full run.

The enhanced-motion check initially assumed native animation keyframes would contain Motion's translation. In this version, opacity can use a native effect while translations update inline. The test recorder now observes both native effects and read-only inline style mutations, proving initial, intermediate and settled positions rather than weakening movement assertions. Reduced-motion checks distinguish invisible initial offsets snapping to zero from prohibited intermediate translation tweening. Both motion scenarios and the 1440px comparison-card timing/stagger checks passed in the fresh full run.

An initial ImageMagick image-list cap of 1 rejected valid PNGs. It was corrected to 4 for decoder working images; independent header-level animation rejection remains enforced and the image suite passes.

The local browser report `playwright-report/index.html` and `test-results/.last-run.json` retain the latest **44/45 full run and its failed signup check**. The separate focused rerun used the list reporter and a temporary `signup-rerun` output directory, so it did not replace that HTML report. Full-run screenshots are under `test-results/`; live cup screenshots and rerun artifacts are in the approved temporary `nescafe-cup-verification-mITjlP` directory. Animation JSON is embedded as report attachments, not standalone files in the motion-test output directories. Generated artifacts and private snapshots are excluded from Git. Open the full-run report with `npx playwright show-report`.

### Real personal-profile check (4 November)

- The visible browser showed all 45 profiles, Mustafa Shahzad/Hashim spotlight cards and the canteen's **0 offerings** empty state.
- An isolated ordinary account registered through the UI, confirmed its message in local Mailpit and established a PKCE session. Eligibility remained pending, with no sample marker or role grants.
- Before genuine references existed, it uploaded a photo and a portfolio image, saved three distinct portfolio audiences and a private draft, reloaded both images and previewed the saved profile. Anonymous profile/image requests were denied.
- A second isolated browser context signed in and saw the persisted draft/photo; sign-out/sign-in and a local emailed password-reset flow also passed. No page errors or unexpected external requests were recorded.
- The temporary accounts were removed after exact UUID/email/creation-time/control/version checks, with an operator audit entry. Both images were detached and removed through the normal owner/cleanup APIs. The integration fixture's original content/publication was restored; its versions and audit history advanced. The **4 November** inventory was **46 sample Auth accounts, 45 profiles, 57 portfolios, no contacts/canteen rows, 0 live assets and 0 Storage objects**. Three deleted-asset tombstones and protected test/audit receipts remained. The current café inventory is recorded above.
- The one-off script, sanitized result inventory and screenshot are retained in ignored `.dev-seed/`; its account password was removed after cleanup. It is not part of the checked-in browser suite. Mailpit delivery is local interception, not external SMTP delivery.

## 6. Design, motion and accessibility evidence

Eleven fictional stock/AI portraits remain removed from `public/images/`. Initials now sit on muted sage/warm-brown/blue-green artwork; genuine permitted uploads still render through the same gateway. The active soft-dark typography, palette, spacing and responsive composition are refined by `src/editorial.css`, while original font assets/licences remain for provenance. The [editorial record](#editorial-refinement-12-november-2026) documents the research and boundaries; [asset notes](../ASSET-NOTES.md) document font and photograph sources.

| Contract | Evidence |
| --- | --- |
| Route wait/opacity | Browser observed 180 ms entrance/exit, old-node removal and at most one route child. Source retains `AnimatePresence mode="wait"` and pathname-only keys. |
| Hero | Browser observed 800 ms / 28px content entrance and 900 ms / 24px artwork entrance with 100 ms delay. Native effects record opacity timing; a read-only MutationObserver records initial, intermediate and settled inline translations. |
| Featured cards | Browser observed 650 ms / 24px entrances and viewport-once lifetime; source uses `index * .09` staggering and retains the original easing. |
| Discovery/comparison cards | Browser observed 550 ms / 18px entrances; comparison delays matched 0/50/100 ms at 1440px. Source uses capped `Math.min(index * .05, .25)` staggering, the existing easing and stable UUID keys. |
| Detail and mobile menu | Browser observed 350 ms inner-detail fade and 150 ms mobile-menu exit. |
| CSS effects | Browser measured the retained 18-second moving infinite hero sheen, feature-art hover scale 1.055, 4px card lift and 3px button lift. Menu-photo hover scale is 1.045; arrow feedback is transform-only. |
| Decorative orbits/cards | The 13 November checks observed three infinite 16/24/32-second rotations, inner counter-rotation, masked gradient trails and glowing 14px/10px/8px satellites. New track/glint keyframes contain only transform/opacity. Card keyframes retain 7px `translate` motion and hover/focus pauses. No application JavaScript loop or `will-change` is added. |
| Toasts | Source retains message keys, Motion's default transition and the **2800 ms** dismissal timer. Browser checks cover visibility and eventual dismissal; timing was not certified with a wall-clock tolerance. |
| Reduced motion | Browser observed no native translation effects or intermediate inline translation tweening, zero-duration route transitions, curtailed sheen, disabled orbit/halo/glint/card loops and automatic scroll behavior. Static satellite positions retain the illustration. Invisible initial offsets snap to zero when their viewport-once entrance is triggered. |
| Mounting | Browser checks retain route/card DOM nodes through filters/hash changes and editor nodes through saves/uploads; query/image responses are scoped to the session. |
| Local fonts | Browser observed exactly three same-origin WOFF2 requests and matching preloads. Vite emitted those three files, totalling **157,532 bytes**. |
| Delayed-font geometry | At **360px and 1440px**, hero heading/copy/search/artwork top and height changes stayed within **1px** after releasing held font responses; observed font-swap layout-shift sums were below **0.02**. This is not total page-load CLS or performance certification. |
| Reading surfaces | Selected visible, enabled text on composited solid-colour surfaces met **4.5:1** contrast. Header backdrop blur is removed. Text over images, pseudo-element overlays and a complete accessibility audit are outside this helper's scope. |

The **current soft-dark** rendered checks covered **360, 768, 1024, 1440 and 1920px** for Home, discovery, details, sign-in, the populated editor, both café menus and price comparisons. Content-administration sections were also exercised at all five widths. No page-level horizontal overflow beyond the one-pixel assertion tolerance was observed; the hero caption did not overlap linked names or skills. Desktop editor bounding boxes verify equal-width two-column pairs, 24px gaps and full-width actions; narrower layouts stack. Editor fixtures contain three explicitly ordered projects and an owner-only contact without modifying retained campus records. Fresh route, populated-editor, café/comparison and administrator-Overview screenshots were visually reviewed across these widths.

During the **12 November** capture, the in-app screenshot tool reported that its tab was not visible, and its animation timeline did not reliably advance. No application workaround was added for that tooling condition. A separate **unmocked local Chromium** session captured that revision's Home at **360px/1440px**, with zero horizontal overflow and no page errors or unexpected origins. Both original orbit matrices changed between approximately 1.1 and 8.5 seconds. Those captures and earlier paper-theme previews are historical; the [13 November refinement](#premium-orbit-refinement-13-november-2026) records the current three-orbit captures.

The final hot-drink card crops were also reviewed at desktop/mobile widths after the real photo update. Each photograph remains visibly distinct, all four ₹30 labels and illustrative credits are retained, and the fifth Hot beverages listing (Tea) remains unchanged. Live image-hash and preservation evidence is recorded under the [cup-photo update](#nescafé-disposable-hot-drink-photos-12-november-2026).

Keyboard checks cover the skip link, mobile navigation, dialog Tab/Shift+Tab containment, Escape dismissal and focus restoration. Labels, live regions, loading/error states and mobile current-page state are present. This evidence covers the exercised Chromium interactions and rendered geometry; a full assistive-technology/cross-browser accessibility audit and historical pixel-diff baseline remain outstanding.

## 7. Deliberate deviations and operational limits

| Area | Current behavior and consequence |
| --- | --- |
| Eligibility | Configurable, manually administered instructions; no invented university domain policy or official reference list. Email confirmation and role bootstrap do not establish campus identity. |
| Discovery selections | One value per filter dimension, combined with AND. Exact skill-ID selection and normalized text/alias search are implemented; multi-select/all-selected-skill queries from the architecture proposal are not. |
| Pagination and scale | Bounded page/offset queries, deterministic name/UUID ordering and count-before-pagination. Concurrent changes can shift page boundaries. Cursor snapshots and large-dataset query-plan/latency evidence are absent. |
| Unicode search | NFKC, whitespace normalization and PostgreSQL `lower`; full Unicode case folding is not implemented. |
| Privacy edits | Audience changes use aggregate saving and return the profile to a hidden draft for review. This prevents unreviewed publication but differs from the proposed approval-preserving privacy-only mutation. Unpublish provides immediate public withdrawal. |
| Portfolio ordering | Array order is persisted and IDs survive add/remove edits. The editor has no reorder control, so UI reorder acceptance is incomplete. |
| Fixture states | All 45 initial profiles are published for development discovery. Other moderation states are tested in disposable suites rather than included in the initial seed. |
| Current local data | 45 public profiles-only fixtures and two genuine cafés with 59 published listings. Anas Tech is marked removed with public profile/photo access revoked. Three technology skills are available; normal profile submission still requires official academic references and independent eligibility/content review. |
| Café source scope | Published menu prices support browsing and two-café comparisons. Size variants stay separate; unknown serving quantities and possible portion/availability differences are explicit. The exact-portion verification API retains its source/freshness requirements. |
| Audit and retention | Privileged decisions/evidence reads and owner deletion requests are audited. Ordinary draft saves use versions/receipts without an audit event. General Auth/report/audit/receipt purge jobs are not installed. Profile deletion retains the Auth account. |
| Upload capacity | 40 reservations per rolling 24 hours and 30 live assets per account. Retained historical evidence counts toward the live cap and cannot be deleted as an orphan; sustained administrator evidence entry needs a reviewed capacity/retention change. |
| Upload expiration | Expired two-minute processing claims go to cleanup, not a renewed processing lease. A retry needs a new reservation. Cleanup scheduling is an operator task. |
| Revocation | Each new image read checks current permissions. Owners/moderators can retain authorized private access after public withdrawal; already delivered bytes and authorized in-flight reads cannot be recalled. |
| Legacy browser drafts | Manual re-entry only. The application does not automatically attach old localStorage content to an Auth account. |

These deviations are not counted as completed acceptance for the richer historical proposal. The implemented authorization and current-price rules remain enforced independently of the UI.

## 8. Remaining acceptance and owner inputs

| Pending item | Precise next action |
| --- | --- |
| Extended Auth acceptance | Signup, confirmation/resend, reused-link rejection and password recovery passed with local Auth/Mailpit. Verify real time-expired links, secure email changes and external Resend/Gmail delivery after configuring the sender. |
| Extended Storage/Edge acceptance | Basic real upload/access denials, normalization, streaming and cleanup passed. Extend real-service fault/concurrency coverage for response loss, role/audience races and measured hosted runtime resources. |
| SQL lint warnings | Review the **32** routine-volatility/initializer warnings recorded on 10 November and use forward-fix migrations for changes to the already-applied schema. |
| Database/operational acceptance | The populated café upgrade passed. Extend staged-upgrade coverage and exercise real multi-connection save/review/role/price/cleanup races, representative query plans and a matched database/Storage restore drill. PGlite sequencing/conflict checks do not close these gates. |
| Genuine data and roles | Supply approved departments/programmes/stage structures, eligibility instructions/decision basis, a named initial administrator and independent role coverage. Further cafés need their supplied menus; verified comparisons need equivalent portions, dated evidence and current availability. |
| Retention and hosting | Decide account/report/audit/history/evidence retention and upload capacity; configure cleanup scheduling, backups/recovery objectives, exact domain/redirects, SMTP and secret storage. |
| Hosted deployment | Identify project name/ref/API URL/owner/environment and instance UUID, inspect read-only, then obtain approval for the exact revision and change set using [operations](operations.md#approved-hosted-deployment). |

No production readiness, large-scale performance, successful restore, external SMTP delivery or cloud deployment result is claimed. Local email interception and the real local flows above passed; broader operational acceptance remains open.

## 9. Local handoff

**Historical platform handoff review, before the 12 November refinement:** Repository review covered the lockfile, tracked changes, all new paths and the intentional removal of eleven portraits plus `src/data/profiles.js`, `src/utils/filterProfiles.js` and `src/utils/storage.js`. No application references to the removed modules/assets remained. Whitespace/conflict-marker checks passed for **128 changed text files**, and **75 local links across 13 Markdown files** resolved successfully, including 31 heading links. All 30 photo attribution rows matched their metadata; `npm ls --depth=0` and manifest/lockfile consistency checks passed. These inventory counts describe the earlier handoff, not the current editorial diff; current refinement evidence is in sections 5 and 6.

**Historical platform security scan:** A read-only scan compared **51 actual local private values** (server credentials, cleanup token and sample passwords) against **186 Git-candidate files and 51 built files**, with no matches; credential-pattern checks also found no matches. Public browser configuration is intentionally in the bundle. Environment files, fixture manifests/passwords, generated WASM, dependencies, `dist` and test reports were ignored and absent from those Git candidates. An earlier HTTP check found Vite's default file rules exposed the newly generated fixture manifest; `vite.config.js` now extends Vite's default denials to local operator directories. All six direct/raw/encoded/absolute-path/environment denial checks passed afterwards.

**Final 12 November source-publication review:** Checked **31 intended changed files**, including **29 text files**, with no conflict markers or whitespace errors. All **71 local links across the four changed Markdown files** resolved, including **25 heading links**. Both new font-notice texts match their installed upstream OFL licences; the three current WOFF2 files total **157,532 bytes**. All **55 curated WebP files** match recorded hashes/byte sizes, and all four new cup attribution rows match their metadata. Original café imports, the older photo plan and existing photo metadata remain unchanged. A fresh read-only scan checked **48 actual private values from four local operator/configuration files** against **233 Git-candidate files and 81 built files**, with no private-value, high-confidence credential-pattern or privileged-token matches. Private/operator files, generated reports, dependencies, build output and WASM remain excluded from publication. These scoped checks are not a complete security audit; sanitized publication evidence remains in the approved temporary evidence directory.

For this already configured checkout, keep Docker Desktop running. From the repository root with Node 24, in one terminal:

```sh
npx supabase start
npm run edge:prepare
npx supabase functions serve --env-file .env.functions.local
```

In another terminal, run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. Open **http://localhost:5173**, create your own application account and open its confirmation link in the same browser. Look in your real inbox after [email setup](email.md), or at **http://127.0.0.1:54324** before SMTP activation. **My profile → Upload your photo → Save draft → Preview saved profile** is ready to use. See [setup](setup.md) for a fresh checkout, the exact-instance configuration helper, administrator bootstrap and fixture controls.

After the local stack and guarded seed are ready:

```sh
npm run test:integration -- --confirm=exercise-local-fixtures
```

This real-only command signs in the existing sample administrator, `member-44` and two sessions of `member-45`; it checks actual APIs, edits/restores the latter profile's content/publication, advances versions/audit and queues its test image for cleanup. Its confirmed run passed on 4 November. Keep the documented `DEV_...` variables and manifest private, run the cleanup worker afterwards and avoid concurrent edits to these fixture accounts. The profiles-only manifest skips canteen comparisons explicitly.

Browse **http://localhost:5173/canteen-prices** and use **Choose café** for NESCAFÉ IUST or Brew and Brink. Use [café maintenance](cafes.md) for menu changes and [operations](operations.md) for moderation, fixture cleanup, retention, recovery and deployment. This source revision adds the soft-dark identity, stronger reduced-motion-aware animation and the four-cup photo update to the previously published platform/email/café work. Services run locally; GitHub publication is separate from application/database deployment.
