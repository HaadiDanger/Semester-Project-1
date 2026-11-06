# IUST Orbit operations

Use [setup](setup.md) for installation and [the implementation report](implementation-report.md) for actual verification. Application policies are defined by `supabase/migrations/`; the UI is not an authorization boundary.

## Accounts, roles and authorization

Signup confirmations, confirmation resends and password-reset messages are delivered by Supabase Auth. Use [Gmail account-email setup](email.md) to configure the sender, templates, rate limits and local or hosted redirects. Application login remains email-and-password based.

| Actor | Application access |
| --- | --- |
| Anonymous | Approved, eligible, opted-in public profiles; public child audiences; permitted references; published café menus and qualifying comparison prices. |
| Confirmed ordinary owner | Their own profile, drafts, permitted uploads, suggestions and reports. Membership eligibility does not grant administration. |
| Eligible campus member | Campus-visible published profiles and campus child audiences in their permitted data origin. |
| Content administrator (`admin`) | Account/eligibility/content decisions, moderation previews, references, prices/private evidence, requests, settings and audit. |
| Role manager (`role_manager`) | Account lookup and granting/revoking roles on other accounts. This role alone does not grant content-administrator access. |
| Trusted worker/operator | Narrow service-only worker/fixture RPCs, or explicitly reviewed operator SQL. Server credentials never enter browser code. |

- All application tables have RLS; private tables have no anonymous/authenticated table grants. Ordinary clients cannot directly insert/update/delete domain rows. Browser mutations use bounded, security-definer RPCs with fixed search paths, current-account/role checks and transactional validation.
- Auth UUID determines profile ownership. Payloads cannot set owners, roles, approval, seed markers, server timestamps or version counters. Auth user metadata grants no authority.
- Anonymous `profiles` SELECT has explicit safe columns: private photo pointers and editor/control metadata are RPC-only. Child audiences are enforced in SQL; counts and discovery use the same visibility rules.
- Roles are read from protected database records on each operation. An old user JWT cannot preserve revoked role privileges. The UI also refreshes account state on focus/visibility changes.
- Self-moderation and self-role changes are denied. Role removal preserves another active, confirmed holder in the same genuine/sample origin. Sample administrators do not count as genuine backups. Restricting a privileged account requires first transferring/revoking its roles through the role manager.
- Email changes reset campus eligibility to pending. Bootstrap grants roles only; it does not assert university membership.

`public` is the only exposed application API schema in local configuration. Keep `private` outside PostgREST/GraphQL exposure. On an existing hosted project, inspect existing grants and Storage policies too: permissive policies from another application can broaden access and require reconciliation before use.

## Profile lifecycle and privacy

Profiles have an account restriction, eligibility decision, moderation state and discovery opt-in. These are independent.

| Action | Result |
| --- | --- |
| Save draft/content | Atomically saves profile, skills, contacts and portfolios; advances write/content versions; returns to a hidden draft. |
| Submit | Validates name, biography, programme/stage and active skills; records the submitted content version and discovery intent. |
| Approve | Requires a current pending version, active confirmed account, eligible membership and no deletion request. |
| Reject | Saves owner-visible feedback, removes discovery opt-in and permits revision. |
| Withdraw pending submission | Hides the profile and returns it to draft so editing/uploads can resume. |
| Unpublish approved profile | Hides it immediately without discarding approval. An unchanged approved/eligible profile can be republished. |
| Suspend | Account restriction hides the profile and blocks content writes/uploads, including in-flight processing completion. |
| Remove | Moderation removes visibility and spotlight placement; owner editing requires administrator restoration. |
| Restore | Restores an allowed account/profile to an unpublished draft requiring review. |
| Request deletion | Immediately hides the profile. The owner may cancel while pending; cancellation leaves it hidden. |
| Administrator completes deletion | Deletes profile, portfolios, contacts, skills and profile moderation; queues profile media for deletion. The separate Auth account remains. |

Photo and contact audiences default to **Only me**. Each portfolio has an explicit audience; the editor defaults new projects to Public visitors. Overall profile visibility is public or eligible-campus, and unpublished drafts are excluded from discovery. Moderators can preview private photos and portfolios; owner-only contact values are not included in their moderation preview. Login email is never automatically inserted into public contact links.

Audience changes currently use the same aggregate save/review path as other editor changes. To immediately stop sharing an approved profile, use **Unpublish**; then adjust audiences and save. Pending submissions must be withdrawn before editing. There is no separate privacy-only mutation that preserves approval.

The editor supports 20 skills, 12 portfolios, 8 contact links and 10 interests per profile. Those are per-record input bounds, not an enrollment cap. Stable project/contact UUIDs survive collection edits. Portfolio order is persisted from the submitted array; the editor currently has add/remove controls but no reorder control. Failed saves retain input and the request UUID; a stale-version conflict requires reviewing the stored version before retrying. The Reload stored profile control intentionally discards unsaved editor input.

The old prototype's browser-only drafts are not migrated automatically. If a user has old localStorage data, they may review and manually re-enter their own content in the authenticated editor. The application does not publish historical browser content under a newly signed-in account.

### Reports, suggestions and audit

Confirmed active users can submit up to five reports and five skill suggestions per day, with duplicate/open-request protections. Suggestions do not become official taxonomy until an administrator creates/selects an active skill and resolves the request.

Reports are available only to authorized independent administrators. The subject and reporter are excluded from their own report's administrator queue/resolution. Reporter identity and internal notes are not public or disclosed to the reported owner. After profile deletion the report retains its protected subject UUID for accountability.

Administrative moderation, role, reference, price, request-resolution and settings changes append audit events in the same transaction. Authorized evidence reads and owner deletion requests also append events. Ordinary owner draft saves advance versions and store request receipts without adding an audit event. Mutation retries use actor-bound request receipts. Audit search matches **action and target table**, such as `profile.approve` or `price_records`; it does not search reason text. Staff notes remain separate from owner-facing feedback.

## References and discovery

Enter genuine data in `/admin` → **Reference data**, using an approved source and a recorded reason:

1. Departments, then programmes with the actual department and semester/year/none structure.
2. Skill categories, then skills spanning technical, creative, sporting, culinary, business and practical interests.
3. Food categories, exact menu identities, canteens and their offerings as described below.

The migrations supply no official university list or eligibility rule. Set owner-approved eligibility instructions in Settings and record the basis for individual decisions. Editing those instructions does not automatically approve accounts.

Retire obsolete references rather than erasing relationships/history. Occupied programme stages cannot be silently invalidated. Skill merges move associations, deduplicate memberships, preserve the former name as a searchable alias and advance affected write versions; category merges preserve skills. Merges require compatible data origins and a reason.

Discovery combines one selected skill, category, department, programme, member type and stage with **AND** between dimensions. Text searches names, profile text, academic labels, skills/categories and skill aliases; text locations are alternatives. Normalization uses NFKC, whitespace collapse/trim and PostgreSQL `lower`, rather than full Unicode case folding. `%`, `_` and backslash are treated literally in search input. A skill dropdown selection matches its ID, not a substring.

Pages contain 12 results in the UI (RPC bound: 1–48), with deterministic name/UUID ordering and count-before-pagination. This is page/offset pagination, not a cross-request snapshot or cursor: concurrent insertions/renames can move page boundaries. Query/filter changes reset the page. Retained card keys and pathname-only route keys avoid remounting on query/hash changes. Multi-select/all-selected-skill filtering and measured large-dataset query plans remain outside the current implementation.

The development banner and per-record sample labels reflect the protected backend origin. Genuine profiles cannot reference sample-only taxonomy. Sample accounts cannot gain access to genuine campus/private subjects through their simulated eligibility.

## Canteen catalogue and price history

The current local catalogue contains **NESCAFÉ IUST**, with **30 published menu-board prices and 30 credited food photographs** imported on 6 November. The source is the user-supplied menu photograph. Development fixtures remain profiles-only; genuine café records are independent of that batch. See [café imports and maintenance](cafes.md) for the manifest, source record, SQL export and photo attribution.

### Published café menus

`/canteen-prices` reads `get_canteen_menu`, which returns published genuine listings with source labels and photo credits. `/canteen-prices?view=compare` uses the stricter comparison contract below. The original photograph's capture date, serving sizes and current availability were not supplied; the imported entries therefore have no source observation date or comparable portion.

In `/admin` → **Canteen prices** → **Manage price**, genuine administrators can set the public source label, known photograph date, curated photo, display order and publication state. Each save requires the current listing version and a reason. A replacement price hides the prior listing until the current amount is explicitly published. Withdrawal, verification revocation, catalogue retirement and unpublication also remove it. Menu browsing reports documented prices without an availability or freshness claim; comparison eligibility still requires all checks below.

The importer attributes the initial prices to `cafe-menu-import-cli`, records an instance-bound manifest hash and creates no Auth account or role. Matching reruns leave staff changes intact; changed manifests are rejected after a completed import. Maintain later prices through append-only history and publication controls.

### Enter a source-backed offering

1. Create the genuine canteen and its location description from an owner-supplied source.
2. Create a menu item with the exact name, variant, quantity and unit (`piece`, `g`, `ml` or `portion`). A named `portion` also needs an unambiguous portion description. Mark it comparable only when equivalence is established.
3. Reuse that menu item for genuinely equivalent offerings at other canteens. Different sizes or variants need separate menu identities; there is no implicit per-gram conversion.
4. Create the canteen offering. Confirm its current availability before saving the availability flag; the RPC records the server time of that check.
5. In **Canteen prices**, append the INR amount and a source/change reason. A new price always starts unverified.
6. Upload private evidence and record its actual non-future observation time. Genuine methods are `displayed_menu` and `supplier_confirmation`. Only the current price event can be verified, and only the uploading administrator can attach their evidence.

Sample records require the `simulated` source method and display “Sample”/“Simulated verification.” NESCAFÉ’s supplied menu amounts are genuine source transcriptions, but no dated observation or exact serving sizes were supplied for comparison verification.

### Comparison contract

- PostgreSQL selects the latest price event for each offering first, then the latest verification event for that price. It never falls back to an older cheap/verified price.
- A qualifying offering is active and available, with a recent availability check, verified current price, ready evidence and an exact comparable portion.
- Freshness applies to both actual observation and availability time, initially **30 days**, configurable to 1–90 in Settings. Recording an old observation today does not make it fresh. Timestamps strictly older than the window are stale.
- Amounts are exact non-negative INR decimals with at most two decimal places; zero is valid. Exponents, NaN, negatives and extra precision are rejected.
- Minima, ties and price differences use all eligible equivalent offerings in the selected query/category/canteen set, **before budget filtering and pagination**, partitioned by menu identity, currency and sample batch.
- Missing, withdrawn, unavailable, unverified, revoked, stale, evidence-missing and unknown-portion rows do not qualify. Their public `amount` and difference are null. With a budget filter they are excluded entirely; without one the UI shows “Check needed.” Retired catalogue entries are omitted.
- A single qualifying offering has no competitive cheapest claim in the UI. All lowest-price ties receive equal treatment when there are multiple comparable offerings.

Corrections append a new price record referencing the current record. Withdrawal appends an event. Verification/revocation append their own events, retaining prior amounts, sources, actors and times privately. Version expectations reject stale decisions. Item comparison identity and offering identity cannot be rewritten after use. Private price/verification/audit history cannot be updated or deleted by the application; the guarded sample-batch cleanup is the narrow development exception.

## Uploads and cleanup

### Storage and processing

| Bucket | Contents and client policy |
| --- | --- |
| `upload-quarantine` | Original JPEG/PNG/WebP; only insert at an owned, unexpired reserved path. No client read/list/sign/update/delete. |
| `profile-media` | Normalized WebP photos and portfolio images. No direct client writes or reads/signing. |
| `verification-evidence` | Normalized private evidence. Administrator-authorized, audited gateway reads only. |

All three buckets are private. The browser reserves an asset with an owner RPC, uploads without overwrite, and asks `asset-gateway` to process it. The worker checks current owner/account/purpose, leases the claim, inspects raster headers before decoding, disables active formats/delegates, normalizes orientation and colour, resizes to at most 2048 pixels per side and strips metadata. It records a SHA-256 digest and size/dimensions only after validation. UI removal or a failed replacement does not delete the currently saved attachment.

Curated menu illustrations are public repository assets in `public/images/menu/`, with database-backed attribution and hashes in `scripts/data/menu-photos.json`. They are served from the application origin and do not use private Storage or the cleanup worker. Their source/licence and replacement workflow is documented in [café photography](cafes.md#photograph-provenance-and-updates).

Decoder bounds are 5 MiB input/output, 4096 pixels per input side, 16 megapixels, 128 MiB configured pixel-cache memory, no disk cache and a 15-second ImageMagick time limit. Image-list limit **4** permits decoder working images; animation is independently rejected before decoding. WASM loading, normalization and streaming passed in the real local Edge runtime on 4 November, including browser photo/portfolio uploads. Hosted deployment and CPU/memory limits still need measurement; the decoder settings are not evidence of a measured Edge resource ceiling.

Each account can create at most **40 reservations per rolling 24 hours** and hold at most **30 live assets** in `reserved`, `processing` or `ready` state. The live quota includes attached photos, portfolios and retained historical price evidence. In particular, an administrator can reach the cap through evidence that cannot be removed as an orphan; the current UI has no quota override or evidence archive. Review capacity and a history-preserving quota/retention change before sustained genuine price entry.

Gateway reads are POST requests for an asset UUID. The gateway verifies Auth and database audience/role state, streams WebP and sends `Cache-Control: private, no-store, max-age=0` and `X-Content-Type-Options: nosniff`. It never returns a reusable signed Storage URL. Unpublication or suspension blocks new public/campus reads; authorized owners and moderators may retain private access under the audience rules. Revoked roles cease to authorize privileged reads. Already delivered bytes and in-flight authorized reads cannot be recalled. Browser object URLs are revoked on account changes/unmount. Do not configure a proxy to cache these private responses.

### Retention implemented today

| Asset/data state | Behavior |
| --- | --- |
| Reserved upload | Upload reservation expires after 10 minutes. |
| Processing claim | Two-minute lease; expired claims become eligible for cleanup. Processing is not re-leased; retry with a new reservation. |
| Successful ready asset | Quarantine original becomes eligible for removal; attached final bytes remain. |
| Unattached ready asset | Eligible for final-byte removal after 24 hours since its last metadata update. |
| Rejected / delete-pending asset | Eligible for cleanup; new gateway reads are denied. |
| Cleanup claim / failure | Two-minute lease; failed Storage deletion backs off 15 minutes. |
| Referenced price evidence | Retained even when its verification/price is historical or revoked. |
| Deleted asset metadata | Retained as a tombstone; ordinary cleanup does not purge the row. |
| Auth, account controls, reports, suggestions, audit and RPC receipts | Not purged by profile deletion. No general retention/purge job is installed. |

Timing means eligibility for the next successful worker invocation, not guaranteed physical deletion at an exact deadline. Attached evidence is protected from orphan cleanup. Decide retention for audit, reports, Auth and historical evidence with the platform owner before genuine operation; any future erasure/archive process must preserve referential and audit requirements explicitly.

### Schedule and observe cleanup

The repository supplies `asset-cleanup` but installs no scheduler. Configure an operator-controlled scheduler to send repeated POST requests to `/functions/v1/asset-cleanup` with `Authorization: Bearer <ASSET_CLEANUP_SECRET>` and the project's public API key if required by its gateway. Keep the cleanup secret in the scheduler's secret store.

For the inspected local instance, with the same token supplied to the function loaded into the shell:

```powershell
$headers = @{ Authorization = "Bearer $env:ASSET_CLEANUP_SECRET"; apikey = $env:DEV_SUPABASE_PUBLISHABLE_KEY }
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/functions/v1/asset-cleanup' -Headers $headers
```

`npm run connect:local` generated this token in ignored `.env.functions.local`; PowerShell does not load that file automatically. Read the token into the shell without printing it and use the local public key from `.env.local` or private CLI status output. The integration image and two ordinary browser-check images were successfully removed by this worker on 4 November.

Each invocation claims at most ten assets and runs at most five jobs concurrently. A response contains `attempted` and `completed`; a 200 response does not imply every job completed. Failures remain retryable in the database. Inspect restricted operational metadata with an operator `psql` connection (or run each SELECT separately with `supabase db query --read-only`):

```sql
begin read only;
select state, count(*) as assets, min(created_at) as oldest,
       max(cleanup_attempts) as most_attempts
from private.assets group by state order by state;
select id, state, cleanup_attempts, cleanup_error, cleanup_expires_at
from private.assets where cleanup_error is not null
order by updated_at limit 50;
commit;
```

Monitor backlog age, repeated errors and function failures. The worker retries lost acknowledgements safely; lost processing responses are reconciled without deleting a committed ready image. A late Storage write after a processing lease expires is requeued. If an upload has expired/rejected, choose the file again for a new reservation. Users can queue unattached files in **Unused uploads**. Avoid deleting bytes or `storage.objects` metadata by hand: that bypasses attachment/lease protection and can break historical evidence.

## Fixture cleanup and recovery

Keep the guarded `DEV_...` environment from [setup](setup.md#5-optional-local-development-fixtures). Run one fixture operation at a time:

```sh
npm run cleanup:dev -- --confirm=delete-local-samples
```

The script rechecks loopback/port, confirmation, instance UUID, development/seed state, dataset and account hashes, exact Auth UUID/email and protected app metadata. It inventories only the known batch, closes its controls to prevent further owner writes, removes its dependent content and sample history, deletes objects through Storage, finalizes application controls/roles/asset metadata, and deletes the exact synthetic Auth accounts. Its credential manifest is removed only after success.

- For a transient Storage or Auth failure, correct that service and rerun with the same target and manifest. Partial cleanup is designed to resume.
- For missing local credentials, seeding refuses to overwrite an existing fixture account. Cleanup can identify the exact accounts from protected inventory/hash metadata, then reseed. A present but mismatched manifest fails closed; verify its provenance instead of editing markers to make it pass.
- A genuine person with the same display name is preserved. Genuine shared taxonomy stays genuine. Unexpected cross-origin foreign keys stop deletion rather than cascade through genuine data.
- The fixture batch is `ec280977-5d12-4d13-a584-7c44456ee045`; email suffix alone is never the deletion selector. No global table truncation or sample-to-genuine relabelling is used.
- If a database is reset, its instance UUID changes. Reinspect it and archive any stale manifest separately before starting a new batch; a stale manifest must not be reused with a new instance.

Production mode starts seed-disabled. For a deliberate local transition after cleanup, an operator may set `environment='production', seed_enabled=false` in a reviewed transaction that asserts the exact instance UUID and appends an operator audit event. The instance trigger refuses this transition while sample Auth identities or marked application/history/asset rows remain. Never bypass the trigger or clear sample markers to obtain a “clean” result.

## Administrator access recovery

Use an existing confirmed role manager to transfer roles to another owner-approved confirmed account. Arrange a separate genuine role manager so one unavailable login does not require a database intervention. Role changes do not establish campus identity and require an independent content administrator for self-related moderation.

If every genuine role manager is inaccessible, first attempt normal Auth/email recovery. The first-admin bootstrap intentionally refuses to replace an established privileged account. If account recovery is impossible, the project owner must approve an operator-level recovery: inspect exact instance/user IDs and current roles read-only, verify the replacement account, prepare a narrowly scoped transaction under the role-management lock, preserve a genuine active role holder, and append an `actor_kind='operator'` audit with the named operator and reason. Review that specific change before execution. No general-purpose unauthenticated recovery endpoint or automatic takeover script is supplied.

## Migration upgrades, backups and restoration

The first six application migrations applied during fresh local startup on PostgreSQL 17.11 on 4 November. The seventh, `202611060001_cafe_menus.sql`, applied to the populated instance on 6 November; account/profile counts and content hashes were preserved. All seven migration IDs match the files, and real SQL lint completed with **27 warnings and no errors**. Broader staged upgrades, multi-connection races, large-data query plans and restores remain operational acceptance work.

On a **throwaway local stack with no data to preserve**, test fresh replay:

```sh
npx supabase db reset --no-seed
npx supabase migration list
npx supabase db lint --schema public,private --level warning --fail-on error
```

`db reset` destroys the selected local database. It is not the cleanup command and must not be used for a live/valued database. For a staged upgrade exercise on that disposable stack:

```sh
npx supabase db reset --version 202611030003 --no-seed
```

Create representative confirmed accounts, drafts, portfolio/contact audiences and reference data through the APIs available at that revision; record their IDs/content. Then run `npx supabase migration up`, inspect all seven applied migration IDs and verify the retained rows and effective grants. Complete the real integration/mail/browser tests from setup. Include at least two real sessions for concurrent save/review/role/price/cleanup tests; PGlite conflict tests are not proof of multi-connection lock behavior.

For a shared environment, record the exact deployed Git revision, migration versions/hashes, settings and function revisions before changing it. Once a migration is shared/applied, use a forward-fix migration rather than editing its history. Never silently repair migration tracking to conceal a schema mismatch.

### Backup scope

- Use a supported database backup/restore process covering application `public`/`private`, Auth identities and relevant Storage metadata. Confirm the actual provider/export scope: a default application-schema dump alone may omit managed Auth/Storage data and roles.
- Back up private Storage **object bytes separately**, with a restricted object manifest and hashes. Database backup alone cannot restore image bytes.
- Retain the Git revision/lockfile, migration files, function source/WASM version, Auth/mail/redirect settings and secret-store references. Keep keys/passwords out of the repository and ordinary logs.
- Retain café manifests, the menu-photo metadata and corresponding public WebP bytes with the application revision. Café names, prices, publication state and import audits are in the database backup.
- The owner must select backup frequency, retention, recovery point and recovery time objectives; none have been claimed or configured by this implementation.

Restore first into an isolated, positively identified target with outbound mail and public traffic controlled. Restore the database and matching Storage objects, reconcile object IDs/hashes with asset metadata, inspect private-bucket policies, and reconfigure/rotate environment-specific secrets and redirects. Restore cleanup scheduling only after attachment/lease consistency is checked. Verify anonymous versus owner/campus/admin access, history integrity and successful new writes before switching traffic. Record observed data loss/duration rather than assuming the backup meets its objectives.

Application rollback and database rollback are separate. Restore a compatible frontend/function revision or apply a forward fix; rolling back JavaScript does not reverse schema/data changes. Restore the database and Storage together only through an approved recovery plan. No restore drill has run in this environment.

## Approved hosted deployment

No hosted project was positively identified or authorized for writes during this implementation. No remote migrations, Auth users, Storage objects or functions were changed.

For each later staging/production change:

1. Record the exact project name/ref, API URL, owner, environment and database instance UUID. Inspect migration history, current schema/grants/policies and relevant Auth/Storage configuration **read-only first**. Keep staging and production credentials separate.
2. Present the exact revision, migration hashes, configuration/data/function changes, local results, impact and recovery plan to the owner. Obtain named approval for that target/change set. Approval for another target or earlier change is not reusable.
3. Use explicit `--remote=<approved-ref>` in CLI 3 commands; do not rely on an ambiguous linked default. Fixtures remain local-only.

Read-only CLI examples, after selecting the target:

```sh
npx supabase migration list --remote=APPROVED_PROJECT_REF
npx supabase db query --remote=APPROVED_PROJECT_REF --read-only "select current_database(), current_user, version(), to_regclass('private.instance_config');"
```

When application objects exist, also run the read-only `supabase/operator/inspect.sql` against that exact ref. Supabase MCP, if configured, is likewise an operator inspection tool, not an application dependency or permission to apply changes.

Only after the corresponding write approval, use the reviewed deployment commands:

```sh
npx supabase migration up --remote=APPROVED_PROJECT_REF
npm run edge:prepare
npx supabase secrets set --remote=APPROVED_PROJECT_REF --env-file .env.functions.production.local
npx supabase functions deploy asset-gateway asset-cleanup --remote=APPROVED_PROJECT_REF
```

The ignored function environment file supplies the production origin allowlist and independent cleanup token; standard Supabase server credentials come from the function runtime. Preserve the per-function authentication model and static WASM configuration. Verify the hosted bundler includes `magick.wasm`, and measure actual processing/resource behavior there before enabling genuine uploads.

Build the frontend with the target's public URL/key and exact HTTPS `VITE_APP_URL`. Host `dist/` at the domain root with BrowserRouter fallback to `index.html` for routes including `/discover`, `/canteen-prices`, `/student/<Auth-UUID>`, `/my-profile`, `/admin`, `/auth/callback` and `/recover-account`. Include `dist/images/menu/` and the local fonts. Configure exact Auth site/callback/recovery URLs and working SMTP. Configure response/security headers with the actual app: Motion uses inline styles, private images use `blob:` URLs, menu photos and fonts are local, and API connections go to the selected Supabase origin. Preserve gateway `no-store` behavior.

Load source-backed café data separately using the [instance-bound SQL export](cafes.md#sql-export-for-another-database) after the target’s migrations are applied. The local menu import and GitHub push do not populate a hosted database.

Bootstrap the owner-approved administrator with the same instance-bound operator procedure, enter genuine source-backed references, schedule cleanup, and verify seed-disabled production/no fixture identities or marked data. Run real anonymous/owner/other-user/admin, email/recovery, deep-link, upload/evidence and price-history smoke checks before switching public traffic. Record the actual deployed revision and observed results. Git publication, database migration and application deployment are separate operations; none is automatic on push in this repository.
