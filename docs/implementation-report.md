# IUST Orbit implementation report

**Latest update: 6 November 2026.** **NESCAFÉ IUST** is the first campus café, with **30 database-backed menu listings and 30 real food photographs**. All **68 Node tests and 28 Chromium checks** passed, as did lint and the production build. All **seven migrations** are applied to the real local Supabase instance. The live menu is at **http://localhost:5173/canteen-prices**.

**Branding:** Header/footer, orbit icon/favicon, browser metadata, package name, authentication emails and setup messages now use **IUST Orbit**. Visual inspection at 360px and 1440px confirmed the name, icon, home labels and browser title. Local Supabase serves the branded confirmation/recovery templates. Password login remains enabled; Gmail activation is paused pending the owner’s sending address and Google app password through `npm run email:setup`.

**Earlier platform handoff (4 November):** The first six migrations applied on PostgreSQL 17.11 and 45 labelled sample profiles were loaded. Real Auth/PostgREST/Storage/Edge integration, ordinary signup/local confirmation, profile/portfolio uploads, two-context persistence and password recovery passed. The café update below adds genuine menu records while preserving that profiles-only fixture scope.

Delivery branch: [`feat/supabase-campus-platform`](https://github.com/HaadiDanger/Semester-Project-1/tree/feat/supabase-campus-platform). Database, Auth, Storage and Edge operations described below occurred on the positively identified local stack. GitHub source publication does not deploy the app or populate a hosted database.

## Café menu update (6 November 2026)

- Visually checked all **30 names and INR amounts** against the supplied **NESCAFÉ | IUST BRANCH** photograph: four sections, **₹15–₹120**. The [manifest](../scripts/data/cafes/nescafe-iust.json) records its source label, receipt date and SHA-256. Capture date, portions, hours and current availability were not supplied.
- Added database-backed café browsing at `/canteen-prices`, with category/search/budget/sort controls, URL persistence, responsive cards, empty/retry/image fallback states and expandable source/photograph credits. Exact-portion comparisons remain available at `/canteen-prices?view=compare`.
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

**Activation remaining:** external Gmail delivery has not been tested with owner credentials. Run `npm run email:setup` in an interactive terminal and follow the restart instructions in [Gmail account-email setup](email.md). Until then, account emails are captured by local Mailpit.

## 1. Baseline and repository state

- Repository: `HaadiDanger/Semester-Project-1`. Implementation baseline: `bc5af7d612b9d9481d9bd668c8014c74fb47af73` (`docs: add IUST Connect architecture audit and coding prompt`). The platform, email, Orbit branding and café changes are delivered together on `feat/supabase-campus-platform`; Git history identifies the exact publication revision.
- The starting checkout was clean. Existing React/Vite/JavaScript/Tailwind structure, typography, colours, responsive proportions and animation contracts were inspected and extended. No applicable workspace `AGENTS.md` was found.
- The baseline used eleven fictional profiles, hard-coded academic/skill lists and browser-local draft/publication storage. Those production paths were replaced with database APIs. The historical architecture package remains in `docs/architecture/`.
- Baseline `npm run build` passed with Vite `8.3.2`; baseline `npm run lint` passed with the existing `react(only-export-components)` warning in `AppContext.jsx`. The final lint result has no warnings.
- The current request supersedes the historical campus-only/seven-day recommendations: approved, eligible, opted-in public profiles, published café menus and qualifying comparison prices allow anonymous reads; comparison freshness defaults to **30 days**. Content approval, campus eligibility and account restriction remain separate.

## 2. Implemented application and backend

| Area | Main changed paths | Implemented behavior |
| --- | --- | --- |
| Application shell and asynchronous state | `src/App.jsx`, `src/components/Navbar.jsx`, `src/context/`, `src/hooks/` | Protected routes, lazy-loaded administration, session-scoped query/image state, cancellation and loading/error/retry/setup states. |
| Authentication | `src/lib/supabase.js`, `src/pages/AuthPage.jsx`, `src/pages/AuthCallbackPage.jsx`, `src/components/ProtectedRoute.jsx` | Registration, confirmation/resend handling, sign-in/out, PKCE callback/recovery, safe return paths and confirmed-account checks. |
| Owned profiles | `src/pages/MyProfilePage.jsx`, `src/components/ProfileForm.jsx`, `src/components/ProfileView.jsx`, `src/utils/profiles.js` | Persistent drafts, student/graduate fields, inclusive skills, multiple stable-ID portfolios, optional contacts, audiences, review submission/withdrawal, publication and deletion requests. |
| Discovery and details | `src/pages/HomePage.jsx`, `src/pages/DiscoverPage.jsx`, `src/pages/StudentPage.jsx`, `src/components/DiscoverSection.jsx`, `src/components/FilterBar.jsx` | Database text/reference filters, count-before-pagination, spotlight, detail reads and explicit empty/error states. |
| Café menus and comparisons | `src/pages/CanteenPage.jsx`, `src/components/canteen/`, `src/utils/prices.js`, `src/components/admin/PricePanel.jsx`, `src/components/admin/MenuPublication.jsx` | Source-labelled menu listings with photo credits, filters and publication controls; exact-portion comparisons, current-first selection and private append-only price/verification history. |
| Administration | `src/pages/AdminPage.jsx`, `src/components/admin/` | Accounts/eligibility/moderation, suspension/restoration/removal, deletion completion, reference editing/merges, suggestions/reports, separate roles, settings and audit. |
| Private media | `src/components/AssetUpload.jsx`, `src/components/AssetImage.jsx`, `src/components/Avatar.jsx`, `supabase/functions/` | Quarantine reservations, real raster normalization, permission-checked streaming, response-loss reconciliation and leased cleanup. |
| Database and operators | `supabase/config.toml`, `supabase/migrations/`, `supabase/operator/` | RLS, narrow transactional RPCs, protected roles/origins/history, read-only inspection, instance-bound development enablement and first-admin bootstrap. |
| Fixtures and verification | `scripts/`, `tests/`, `playwright.config.js` | Guarded seed/cleanup, real-local integration command, disposable SQL/SDK tests and browser regression coverage. |
| Design and documentation | `src/index.css`, `README.md`, `ASSET-NOTES.md`, `docs/setup.md`, `docs/cafes.md`, `docs/operations.md` | Preserved design/motion, Orbit branding, real menu photography, responsive forms/panels and operator guidance. |

The wired owner flow is registration/confirmation → draft and uploads → submission → independent eligibility/content review → publication/discovery. Editing approved content returns it to a hidden draft. Pending content must be withdrawn before editing. Unpublication is immediate; deletion requests hide content immediately, and administrator completion deletes profile content and queues uploads while retaining the separate sign-in account.

Photo/contact defaults are owner-only; each portfolio has an explicit audience. Moderators can inspect private profile/portfolio images, while owner-only contact values stay out of moderation previews. Contact links replace the former placeholder Connect action; messaging is not implemented.

Authentication uses Supabase JS `2.118.0`; the database rechecks account status and protected role records for authorization. Client payloads cannot assign ownership, approval, roles, origin markers or server versions. Role-manager-only accounts do not receive content administration. Self-moderation/self-role changes and removal of the last qualifying role holder are denied. Report subjects and reporters must recuse from administrator resolution.

### Tooling decisions

- Verification used Windows, Node `24.20.0`, npm `11.19.0` and Chromium `156.0.8078.4` (Playwright revision `1248`).
- Newly pinned tooling: Supabase CLI `3.0.0`, PGlite `0.5.15`, Playwright `1.64.1` and ImageMagick WASM `0.0.45`. Vite is pinned to `8.3.5`; existing React and Framer Motion dependencies were retained.
- The lockfile matches `package.json`. Its added dependencies and Vite/toolchain updates were reviewed; all package resolutions use the npm registry and include integrity metadata.
- `supabase/functions/deno.json` pins Supabase JS and ImageMagick versions. `npm run edge:prepare` copies the decoder into ignored `supabase/functions/_shared/magick.wasm` for serving/deployment.
- The browser bundle has a separate administration chunk and vendor chunks. The latest main application JavaScript is **100,181 bytes**; the largest JavaScript chunk is the **257,761-byte** React vendor chunk. Public menu photographs total **3,284,052 bytes**. These are uncompressed sizes from the build with local public configuration.

## 3. Database and configuration execution

Seven ordered migrations replay successfully in **disposable PGlite databases**, using minimal Auth/Storage schemas and PostgreSQL roles supplied by `tests/helpers/database.mjs`. The first six applied during fresh real Supabase startup on 4 November; the café migration applied to the populated instance on 6 November:

| Migration | Scope |
| --- | --- |
| `202611030001_foundation.sql` | Account controls, roles, audit, references, profile/asset/price tables, Auth triggers, RLS and origin/production guards. |
| `202611030002_profile_api.sql` | Owned aggregate writes, version/request receipts, discovery/details, audiences, reports and suggestions. |
| `202611030003_administration.sql` | Eligibility/moderation, reference editing/merges, role management and settings. |
| `202611030004_canteen_prices.sql` | Current-first comparison, immutable price/verification history and administrator queries. |
| `202611030005_private_storage.sql` | Private buckets, quarantine policy, authorization/processing/reconciliation and cleanup RPCs. |
| `202611030006_development_fixture_controls.sql` | Service-only fixture registration, inventory and exact-batch cleanup. |
| `202611060001_cafe_menus.sql` | Curated photo metadata, operator-attributed prices, source-labelled menu reads and versioned publication. |

Migration SHA-256 values at handoff:

```text
78405851cd3df15490d618b83548ca9b0513b41a38232e8aca53fb75e8f1a2c5  202611030001_foundation.sql
1cb665a1f9946a82db7a84390620b5832ca6ec0e1f5f90c4436efde132e0cf6b  202611030002_profile_api.sql
cd63da8bcae537595e7cf3195afb7179e710f1f4fcfc918973c8a3d5425cd63d  202611030003_administration.sql
5fcdaf1d456061ef79483a34c8c4e6ba2f0b5d039d9793d5c2135b8ad0acd8c4  202611030004_canteen_prices.sql
eff88ed6fafdb6b89becf392568ccbba9f3ca42b1bd097d6692104c898ee2554  202611030005_private_storage.sql
6518faa139232affa7db39545e4cc5b67bff778cdacdbc4e7799a6d09287bccb  202611030006_development_fixture_controls.sql
e4aaed894943a820b2f62660731812456858710cc358dd303be6b9a7c8dc1863  202611060001_cafe_menus.sql
```

The local configuration targets `iust-connect-local`, API port `54321`, PostgreSQL 17 on `54322`, Studio `54323` and local mail `54324`. The database itself starts `production`, seed-disabled, with manual eligibility and 30-day freshness even on a local installation. Migrations contain no official academic catalogue, student fixtures or genuine prices.

On 3 November, no container runtime was available. On 4 November, the user started Docker Desktop; inspection confirmed a local `desktop-linux` engine, free project ports and no prior Supabase containers/volumes. CLI `3.0.0` started a fresh stack on **PostgreSQL 17.11**. After the 6 November café upgrade, migration history matches all seven files; their current hashes are recorded above.

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
| `npm test` (6 Nov, final) | Exit 0; **68/68 passed**, including ten café checks and four Gmail setup checks. | Real application SQL/image processing and committed photo bytes, with explicit Auth/Storage/SMTP doubles. |
| `npm run test:browser` (6 Nov, final) | Exit 0; **28/28 passed**, approximately 1.9 minutes, zero retries. | Actual React/Supabase JS frontend with intercepted HTTP/Auth/Storage backed by PGlite; six café checks included. |
| Real local email/browser check (6 Nov) | Account flows passed; exact-account/mail cleanup subsequently completed. | Actual Supabase Auth, PKCE, confirmation/resend/recovery templates and Mailpit; external Gmail remains pending. |
| `npm test` (3 Nov) | Exit 0; **54/54 passed** across nine files. | Actual application SQL in PGlite, actual image decoder, explicit service doubles. |
| `npm run test:browser` (3 Nov) | Exit 0; **19/19 passed**, approximately 1.4 minutes, zero retries. | Chromium with the actual React/Supabase JS frontend and intercepted Auth/Storage/HTTP backed by PGlite. |
| `node --test tests/fixtures.test.mjs tests/operator.test.mjs` (4 Nov) | Exit 0; **8/8 passed** after profiles-only changes. | Empty canteen scope/reruns, explicit full-scope extension, stable account identities and existing operator/cleanup guards. |
| `npm run lint` | Exit 0; no warnings or errors. | Oxlint. |
| `npm run build` | Exit 0; Vite `8.3.5`, no warnings. | Production compilation/bundle. |
| `npm run edge:prepare` | Succeeded; pinned WASM prepared and loaded by the real local Edge runtime. | Hosted packaging/deployment remains untested. |
| `git -c core.autocrlf=false diff --check` | Exit 0. | Tracked diff whitespace. |
| `npm run test:integration -- --confirm=exercise-local-fixtures` | Exit 0 on 4 Nov. | Real Auth sessions, PostgREST ownership/privacy, portfolios/moderation, Storage denials and Edge normalization/streaming. Canteen checks explicitly skipped for profiles-only. |
| `npx supabase start` / `migration up` / `migration list` | Fresh startup and populated café upgrade passed; all seven migration IDs match. | Real PostgreSQL 17.11 and managed local Auth/Storage schemas; account/profile digests preserved. |
| `npm run menu:import -- --instance …` | Initial import and matching rerun passed; 30 published entries and one audit. | Real instance-checked SQL, committed photo hashes and real public PostgREST amounts/filter checks. |
| One-off live café Chromium check (6 Nov) | Passed at 360px and 1440px; 30 cards, 31 loaded images, no overflow/errors; budget/sort/reload passed. | Real local application and PostgREST responses; requests restricted to those origins without response mocking. |
| `npx supabase db lint --schema public,private --level warning --fail-on error` | Exit 0; **27 warnings, no errors**. | Warnings concern STABLE/VOLATILE helper calls and implicit text-to-JSONB initialization. |
| One-off ordinary-account Chromium check (4 Nov) | Passed signup, local confirmation, draft/photo/portfolio save, reload, second browser context and password recovery. | Actual services; network interception allowed only the local application/API and did not supply mock responses. |
| Real `asset-cleanup` invocations | **1/1**, then **2/2** completed. | All three test images removed; 0 remaining Storage objects and 3 metadata tombstones. |
| Private development-file HTTP checks | **6/6 denied (403)**; application root still returns 200. | Fixture manifest, raw/encoded/absolute-path forms and both environment files. |

### Node coverage

| Test file | Passed | Main observations |
| --- | --- | --- |
| `tests/database.test.mjs` | 10 | Migration replay, RLS/direct-write denials, ownership and three-entry persistence, audiences, approval/version rules, retry receipts, deletion and production guards. |
| `tests/administration.test.mjs` | 7 | Separate role powers, self/last-holder protections, private notes, references/stages/merges/aliases, request handling and settings. |
| `tests/canteen.test.mjs` | 7 | Current-first selection, complete-set minima/ties, unlike portions, zero/precision checks, stale/revoked/withdrawn states, conflicts and immutable history. |
| `tests/cafe-import.test.mjs` | 3 | All 30 source prices/photo assets, atomic wrong-target/conflict rollback, idempotency and preservation of staff edits/withdrawals. |
| `tests/cafe-menu.test.mjs` | 7 | Empty/publication states, source/credit reads, filters/precision, current-first replacement, revocation/retirement, authorization/version checks and operator attribution. |
| `tests/storage.test.mjs` | 7 | Owned expiring inserts, worker-only completion, private pointers/audiences, retained historical evidence, cleanup leases and revoked/pending/removed/deletion upload restrictions. |
| `tests/images.test.mjs` | 5 | Real PNG/JPEG/WebP decoding, resize, orientation, metadata stripping/digest and malformed/animated/oversized rejection. |
| `tests/edge-handlers.test.mjs` | 7 | HTTP/token/origin validation, normalization plus SQL completion, no-store reads, Storage failures, lost responses, late writes and independently authenticated cleanup. |
| `tests/fixtures.test.mjs` | 5 | Pre-write target guards, production denial, 45 profiles, profiles-only/full-scope reruns, sample isolation and resumable targeted cleanup. |
| `tests/origins.test.mjs` | 3 | Cross-batch authorization, report recusal/provenance and isolated cleanup. |
| `tests/operator.test.mjs` | 3 | Exact-instance/account bootstrap guards, idempotent audit, eligibility separation and explicit local-fixture enablement. |
| `tests/email-setup.test.mjs` | 4 | TLS configuration, sender-only setup mail, private CLI overrides, preserving unrelated settings, credential rotation and failure/input handling. |

SQL assertions switch to `anon` or `authenticated` with synthetic user claims for ordinary access checks; privileged setup and worker operations use separate roles. This exercises PostgreSQL authorization under the supplied schemas. It does not establish real JWT issuance, managed Auth/Storage schema compatibility, PostgREST/GraphQL exposure or multi-connection behavior.

Image tests execute the pinned ImageMagick WASM under Node. Edge-handler tests invoke the shared handlers with real Request/Response objects and controlled service doubles. The separate real integration/browser checks verified local Edge WASM loading, normalization and streaming; hosted static-file packaging and measured CPU/memory limits remain unverified.

### Browser coverage and resolved failures

The browser suite checks combined discovery filters/counts/two-page uniqueness, retained route/card nodes, Auth/resend/recovery outcomes, three portfolios and private contacts across two browser contexts, failed-save input/request-ID retention, editor/upload lifetime, sign-out privacy, publication/moderation, reports/suggestions, reference/role/settings/audit workflows, canteen history, dialogs, responsive routes and unconfigured installations. Café coverage adds the 30-item source menu and all photo credits at mobile/desktop widths, URL-persisted filters, missing-image/database retry, comparison exclusion and administrator replacement/republication.

One price-history check retained private amounts `[40, 30, 20]` and latest decisions `["revoked", "verified"]`, while the revoked public result returned `amount: null`, `difference: null`, `is_cheapest: false`. These full-suite checks use the shared disposable backend. Ordinary profile/photo/portfolio persistence was also confirmed in two real browser contexts on 4 November.

Earlier browser failures exposed modal Tab wrapping and mobile Escape/focus/current-page behavior, which were fixed. Other assertions were corrected for overlapping outgoing/incoming toasts, scoped live regions, rendered desktop geometry, audit action search, redacted revoked prices and waiting for incoming route content before asserting removal. Café checks also exposed whole-rupee `.00` formatting and an over-broad canteen selector; formatting now omits unnecessary decimals and the assertion targets the named combobox. The latest complete **28/28** result supersedes earlier failed runs. The reduced-motion development warning is expected; no page errors or unexpected backend/external requests remained in the passing checks.

An initial ImageMagick image-list cap of 1 rejected valid PNGs. It was corrected to 4 for decoder working images; independent header-level animation rejection remains enforced and the image suite passes.

The local browser report is `playwright-report/index.html`; `.last-run.json` in `test-results/` records `passed` with no failed tests. Screenshot files are under `test-results/`. Animation JSON is embedded as report attachments, not standalone files in the motion-test output directories. These generated artifacts are ignored by Git. Open them with `npx playwright show-report` after a run.

### Real personal-profile check (4 November)

- The visible browser showed all 45 profiles, Mustafa Shahzad/Hashim spotlight cards and the canteen's **0 offerings** empty state.
- An isolated ordinary account registered through the UI, confirmed its message in local Mailpit and established a PKCE session. Eligibility remained pending, with no sample marker or role grants.
- Before genuine references existed, it uploaded a photo and a portfolio image, saved three distinct portfolio audiences and a private draft, reloaded both images and previewed the saved profile. Anonymous profile/image requests were denied.
- A second isolated browser context signed in and saw the persisted draft/photo; sign-out/sign-in and a local emailed password-reset flow also passed. No page errors or unexpected external requests were recorded.
- The temporary accounts were removed after exact UUID/email/creation-time/control/version checks, with an operator audit entry. Both images were detached and removed through the normal owner/cleanup APIs. The integration fixture's original content/publication was restored; its versions and audit history advanced. The **4 November** inventory was **46 sample Auth accounts, 45 profiles, 57 portfolios, no contacts/canteen rows, 0 live assets and 0 Storage objects**. Three deleted-asset tombstones and protected test/audit receipts remained. The current café inventory is recorded above.
- The one-off script, sanitized result inventory and screenshot are retained in ignored `.dev-seed/`; its account password was removed after cleanup. It is not part of the checked-in browser suite. Mailpit delivery is local interception, not external SMTP delivery.

## 6. Design, motion and accessibility evidence

Eleven fictional stock/AI portraits were removed from `public/images/`. Initials and code-drawn gradients occupy the existing image geometry; genuine permitted uploads still render through the gateway. Original font files/licenses, palette, fluid container sizing and breakpoints were retained. Provenance is documented in [asset notes](../ASSET-NOTES.md).

| Contract | Evidence |
| --- | --- |
| Route wait/opacity | Browser observed 180 ms entrance/exit, old-node removal and at most one route child. Source retains `AnimatePresence mode="wait"` and pathname-only keys. |
| Hero | Browser observed 650 ms content entrance and 800 ms artwork fade with 100 ms delay. |
| Featured cards | Browser observed 500 ms entrances and viewport-once lifetime; source retains `index * .06` staggering and the original easing. |
| Discovery cards | Browser observed 450 ms entrance; source retains capped `Math.min(index * .035, .18)` staggering, easing and stable profile UUID keys. |
| Detail and mobile menu | Browser observed 350 ms inner-detail fade and 150 ms mobile-menu exit. |
| CSS effects | Browser measured 18-second moving infinite hero sheen, artwork hover scale 1.04 and button lift of 2 px. |
| Toasts | Source retains message keys, Motion's default transition and the **2800 ms** dismissal timer. Browser checks cover visibility and eventual dismissal; timing was not certified with a wall-clock tolerance. |
| Reduced motion | Browser observed no translation effects, zero-duration route transitions, curtailed sheen and automatic scroll behavior. |
| Mounting | Browser checks retain route/card DOM nodes through filters/hash changes and editor nodes through saves/uploads; query/image responses are scoped to the session. |

Rendered checks covered **360, 768, 1024, 1440 and 1920 px** widths for Home, discovery, details, canteens, sign-in and the editor. No page-level horizontal overflow beyond the one-pixel assertion tolerance was observed. Desktop editor bounding boxes verify equal-width two-column pairs, 24 px gaps and full-width actions; narrower layouts stack. Populated Home/editor and mobile/desktop administrator screenshots were reviewed.

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
| Current local data | 45 profiles-only fixtures plus the genuine 30-item NESCAFÉ menu. Genuine accounts can save drafts/photos/portfolios; profile publication still awaits genuine academic/skill references and independent eligibility/content review. |
| Café source scope | Menu-board prices are publicly browsable with credited illustrative photos. The original unknown capture date/portions/availability are not treated as verified comparison data. |
| Audit and retention | Privileged decisions/evidence reads and owner deletion requests are audited. Ordinary draft saves use versions/receipts without an audit event. General Auth/report/audit/receipt purge jobs are not installed. Profile deletion retains the Auth account. |
| Upload capacity | 40 reservations per rolling 24 hours and 30 live assets per account. Retained historical evidence counts toward the live cap and cannot be deleted as an orphan; sustained administrator evidence entry needs a reviewed capacity/retention change. |
| Upload expiration | Expired two-minute processing claims go to cleanup, not a renewed processing lease. A retry needs a new reservation. Cleanup scheduling is an operator task. |
| Revocation | Each new image read checks current permissions. Owners/moderators can retain authorized private access after public withdrawal; already delivered bytes and authorized in-flight reads cannot be recalled. |
| Legacy browser drafts | Manual re-entry only. The application does not automatically attach old localStorage content to an Auth account. |

These deviations are not counted as completed acceptance for the richer historical proposal. The implemented authorization and current-price rules remain enforced independently of the UI.

## 8. Remaining acceptance and owner inputs

| Pending item | Precise next action |
| --- | --- |
| Extended Auth acceptance | Signup, confirmation/resend, reused-link rejection and password recovery passed with local Auth/Mailpit. Verify real time-expired links, secure email changes and external Gmail delivery after configuring the sender. |
| Extended Storage/Edge acceptance | Basic real upload/access denials, normalization, streaming and cleanup passed. Extend real-service fault/concurrency coverage for response loss, role/audience races and measured hosted runtime resources. |
| SQL lint warnings | Review the 27 routine-volatility/initializer warnings and use forward-fix migrations for changes to the already-applied schema. |
| Database/operational acceptance | The populated café upgrade passed. Extend staged-upgrade coverage and exercise real multi-connection save/review/role/price/cleanup races, representative query plans and a matched database/Storage restore drill. PGlite sequencing/conflict checks do not close these gates. |
| Genuine data and roles | Supply approved departments/programmes/stage structures, eligibility instructions/decision basis, a named initial administrator and independent role coverage. Further cafés need their supplied menus; verified comparisons need equivalent portions, dated evidence and current availability. |
| Retention and hosting | Decide account/report/audit/history/evidence retention and upload capacity; configure cleanup scheduling, backups/recovery objectives, exact domain/redirects, SMTP and secret storage. |
| Hosted deployment | Identify project name/ref/API URL/owner/environment and instance UUID, inspect read-only, then obtain approval for the exact revision and change set using [operations](operations.md#approved-hosted-deployment). |

No production readiness, large-scale performance, successful restore, external SMTP delivery or cloud deployment result is claimed. Local email interception and the real local flows above passed; broader operational acceptance remains open.

## 9. Local handoff

Final repository review covered the lockfile, tracked changes, all new paths and the intentional removal of eleven portraits plus `src/data/profiles.js`, `src/utils/filterProfiles.js` and `src/utils/storage.js`. No application references to the removed modules/assets remain. Whitespace/conflict-marker checks passed for **128 changed text files**, and **75 local links across 13 Markdown files** resolved successfully, including 31 heading links. All 30 photo attribution rows match their metadata; `npm ls --depth=0` and manifest/lockfile consistency checks passed.

A read-only scan compared **51 actual local private values** (server credentials, cleanup token and sample passwords) against **186 Git-candidate files and 51 built files**, with no matches; credential-pattern checks also found no matches. Public browser configuration is intentionally in the bundle. Environment files, fixture manifests/passwords, generated WASM, dependencies, `dist` and test reports are ignored and absent from Git candidates. An earlier HTTP check found Vite's default file rules exposed the newly generated fixture manifest; `vite.config.js` now extends Vite's default denials to local operator directories. All six direct/raw/encoded/absolute-path/environment denial checks passed afterwards.

For this already configured checkout, keep Docker Desktop running. From the repository root with Node 24, in one terminal:

```sh
npx supabase start
npm run edge:prepare
npx supabase functions serve --env-file .env.functions.local
```

In another terminal, run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. Open **http://localhost:5173**, create your own application account and open its confirmation link in the same browser. Look in your real inbox after [Gmail setup](email.md), or at **http://127.0.0.1:54324** before SMTP activation. **My profile → Upload your photo → Save draft → Preview saved profile** is ready to use. See [setup](setup.md) for a fresh checkout, the exact-instance configuration helper, administrator bootstrap and fixture controls.

After the local stack and guarded seed are ready:

```sh
npm run test:integration -- --confirm=exercise-local-fixtures
```

This real-only command signs in the existing sample administrator, `member-44` and two sessions of `member-45`; it checks actual APIs, edits/restores the latter profile's content/publication, advances versions/audit and queues its test image for cleanup. Its confirmed run passed on 4 November. Keep the documented `DEV_...` variables and manifest private, run the cleanup worker afterwards and avoid concurrent edits to these fixture accounts. The profiles-only manifest skips canteen comparisons explicitly.

Browse **http://localhost:5173/canteen-prices** for NESCAFÉ IUST. Use [café maintenance](cafes.md) for menu changes and [operations](operations.md) for moderation, fixture cleanup, retention, recovery and deployment. This revision includes the platform/backend/scripts/tests/documentation, email setup, Orbit branding, café implementation and intentional removal of obsolete mock/storage modules and fictional portraits. Services run locally; GitHub publication is separate from application/database deployment.
