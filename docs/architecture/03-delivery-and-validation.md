# E–F, H–I. Delivery sequence, development data, validation, and decisions

Status: **Proposed implementation plan**, not completed implementation. Tests below are future acceptance obligations. See the [repository assessment](README.md) for the limited checks actually evidenced at the reviewed source baseline.

## E. Migration and implementation sequence

Implement in dependency order. Each stage must leave a reviewable diff and honest completion status. Local disposable database tests are allowed in the later coding task; cloud writes always need separate explicit target/change approval. Do not deploy an unfinished write path simply because its React screen is ready.

### Stage 0 — re-inspect and capture the baseline

- **Goal:** Confirm the repository still matches baseline `749d448021be6002037c5a25cf865eea422c54ca` and identify intervening user work/instructions.
- **Existing files:** Inspect `package.json`, lockfile, `src/App.jsx`, all profile/discovery components, context/storage/data, CSS and verification reports. Check Git status/remote and applicable `AGENTS.md`.
- **Proposed new files:** A baseline section in `docs/implementation-report.md`; later browser tests in `tests/e2e/` only when their runner is introduced.
- **Database changes:** None.
- **Functional work:** Record current route behavior, screenshots at 320/390/768/1440/1920/2560px, animation ledger values and component lifetime/key behavior. Inventory every use of fictional photos before deletion.
- **Tests/exit:** Run existing build and lint, record exact exits/warnings; exercise home, discovery, profile, editor, mobile menu, toast, hover and reduced motion. If source differs materially, update the plan before editing affected areas. Existing saved verification JSON is not a fresh test run.
- **Recovery:** Preserve user edits; use small commits. Do not reset/delete unrecognized files, rewrite existing history or replace the app with a scaffold.

### Stage 1 — local backend, ownership and deny-by-default authorization

- **Goal:** Establish safe data ownership before exposing writes.
- **Existing files affected:** `.gitignore`, `package.json`/lockfile only for justified pinned tooling/client dependencies. Do not upgrade unrelated packages.
- **Proposed new files:** `.env.example`; `supabase/config.toml`; ordered migrations for private schema/helpers, instance configuration, reference/profile/account/control/role/audit tables, explicit grants/RLS; `supabase/tests/`; local target-validation tooling; role-bootstrap runbook.
- **Database changes:** Create the profile ownership/control foundation, normalizing helpers, constraints/indexes, safe signup trigger, guarded wrappers and role checks. Defer asset foreign keys until the asset table exists in stage 3. Disable unintended default privileges; private schema unexposed. Provision a disposable local development instance explicitly; production defaults stay seed-disabled.
- **Functional work:** No browser DML enabled until owner/other-user/anonymous/admin authorization tests pass. Bootstrap only a local test administrator using an identified operator action, not signup metadata.
- **Tests/exit:** Fresh local migration replay; confirmed/unconfirmed user controls creation; one-profile constraint; default-deny direct DML; private-table denial; role escalation and recursion tests; safe profile/contacts SELECT matrix; last-manager protection. Use ordinary JWTs for API tests.
- **Recovery:** Local reset only after confirming the disposable local target. Correct unapplied migrations freely; after a shared/approved deployment use forward-fix migrations. No cloud provisioning/migration is implicit in this stage.

### Stage 2 — genuine Auth, reference data, owned draft editor

- **Goal:** Real registration/session handling and cross-device owned profile saves.
- **Existing files affected:** `src/App.jsx`, `src/context/AppContext.jsx`, `Navbar.jsx`, `MyProfilePage.jsx`, `ProfileForm.jsx`, `src/utils/storage.js` and `src/data/profiles.js` consumers.
- **Proposed new files:** `src/lib/supabase.js`, `AuthContext.jsx`, session/eligibility guards, sign-in/register/callback/recovery pages, `profilesApi.js`, `taxonomyApi.js`, `useProfile.js`, `profileAdapter.js`, initial integration tests.
- **Database changes:** Finalize ensure/save/submit/withdraw contracts and protected reference-management operations; add private missing-skill requests/alias collision protection. Load only explicitly labelled synthetic academic references locally, or owner-supplied genuine references in an approved environment.
- **Functional work:** Email confirmation/recovery; safe session bootstrap/sign-out; programme-derived department and student/graduate stages; inclusive skill picker; database draft save with version conflict handling. Remove localStorage domain authority as each real flow takes over; no fallback arrays on backend errors.
- **Tests/exit:** Registration/confirmation/expired links/sign-out, owner-only draft write, two-browser persistence, stale-version conflict, rejected nested owner IDs, invalid academic combinations, genuine graduate with no semester, missing-config/network/permission UX. Build/lint pass with exact warning report.
- **Recovery:** Keep unsaved input on server failure; refetch/explicit merge after conflict. Do not auto-import or delete existing local drafts. Session changes clear another user's in-memory state.

### Stage 3 — private assets and multiple portfolio entries

- **Goal:** Real, safe uploads and a non-truncating portfolio editor.
- **Existing files affected:** `ProfileForm.jsx`, `Avatar.jsx`, `PortfolioCard.jsx`, `ProfileView.jsx`, `Hero.jsx`, `FeaturedProfileCard.jsx`, `src/index.css`, asset documentation/references.
- **Proposed new files:** `PortfolioEditor.jsx`, `UploadField.jsx`, `src/data/assetsApi.js`; asset lifecycle/Storage policy migrations; `asset-gateway/index.js`, `asset-cleanup/index.js`; file validation/recovery tests.
- **Database changes:** `private.assets`, portfolio asset references, reservation/finalization/authorization operations; private bucket configuration, exact reservation upload policy; no direct user read/sign/overwrite of final buckets.
- **Functional work:** Multiple persisted item IDs, reorder/remove without truncation, optional own genuine photo, privacy controls, server validation and signed-URL refresh/failure handling. Replace fictional stock/AI photos with initials/neutral artwork; inspect all references before deleting only those files. Preserve dimensions, hover zoom and motion wrappers. Replace fragile form `nth-child` placement with equivalent named classes when adding sections.
- **Tests/exit:** Three-plus saved portfolio entries, stable keys/reordering; wrong-owner asset rejection; invalid/spoofed/oversized/decompression-bomb input rejection; direct signing bypass denial; expiry/owner/read matrix; fail halfway through upload/finalize/attach and recover without deleting a referenced object; normal/reduced motion and layout checks.
- **Recovery:** Reservations expire safely; cleanup marks/deletes exact unreferenced objects via Storage API. Retain unmodified form data on upload error. Do not drop a previous attachment until the replacement is ready and its parent save commits.

### Stage 4 — moderation, reporting, privacy and administration

- **Goal:** Content approval is genuine, audited and distinct from eligibility/identity.
- **Existing files affected:** Profile editor/view, app route/navbar, feedback and visibility copy.
- **Proposed new files:** Admin layout/profile/report/taxonomy/role pages; `adminApi.js`; `ConfirmDialog.jsx`; report UI; moderation/report/role/audit migrations as needed.
- **Database changes:** Implement all guarded eligibility/review/suspension/restoration/removal/report/role operations; quotas/uniqueness; same-transaction audits; owner-safe versus admin-only projections. No app audit/price-history mutation grants.
- **Functional work:** Pending/rejected reasons, explicit submit/withdraw, review current version, approved-edit warning/de-listing, suspension block, restoration to draft, soft-removal confirmation, reports and resolution, taxonomy/academic reference maintenance and role management. Real admin authority from current database roles only.
- **Tests/exit:** Approve only eligible confirmed active targets; stale admin review fails; child-only changes reset review; privacy reductions change only the write counter, preserve current approval and reject stale edits/reviews; suspended old token/recreate/upload attempts fail; roles update without depending on JWT refresh; reporter confidentiality/limits; last-active-manager concurrency; audit transaction rollback. Private contacts/evidence absent from ordinary reads.
- **Recovery:** Do not delete audit records to undo an action. Use an authorized compensating action with reason. Restoration does not publish content automatically. Privileged purge remains separate and policy-gated.

### Stage 5 — database-backed discovery and preserved navigation

- **Goal:** Replace array filtering with a correct bounded database directory.
- **Existing files affected:** `HomePage.jsx`, `Hero.jsx`, `FilterBar.jsx`, `ProfileCard.jsx`, `FeaturedProfileCard.jsx`, `StudentPage.jsx`, `ProfileView.jsx`, `src/utils/filterProfiles.js`, `AppContext.jsx`.
- **Proposed new files:** `discoveryApi.js`, `useDiscovery.js`, `Pagination.jsx`, search/detail/spotlight SQL functions and targeted indexes; E2E/database search fixtures.
- **Database changes:** Safe projections and parameterized `EXISTS`/trigram search; matching profile/detail/child visibility rules; cursor/page/array limits. Inspect plans before adding denormalized search state.
- **Functional work:** Shared search controls, all-skill/category/department/programme/stage filters, stable name/UUID pages, active-filter URL state, truthful counts, loading/empty/error/denied states, protected spotlight or neutral anonymous art. Remove production imports of demo profile arrays.
- **Tests/exit:** Two-page stable ordering and no duplicate IDs; retained card keys; text/alias/category and inclusive skill tests; AND/OR rules, graduate-stage rules, empty filters and failure/retry; no whole-dataset fetch or hidden mock fallback; page/anchor/hover/menu/toast/reduced-motion behavior matches the ledger.
- **Recovery:** Reset cursor on filters; abort stale requests; access-denied clears protected results. Retrying a transient query must not replay the entire route/hero unnecessarily.

### Stage 6 — canteen catalogue, comparison and verified price history

- **Goal:** A separate functional comparison service with correct provenance.
- **Existing files affected:** `src/App.jsx`, `Navbar.jsx`, shared fields/buttons/feedback/style patterns.
- **Proposed new files:** `CanteenPricesPage.jsx`, `CanteenComparison.jsx`, admin canteen/history/evidence UI, `canteensApi.js`; food/canteen/offering/price/verification migrations and integration tests.
- **Database changes:** Exact portion/variant identities, immutable offering identity after history, numeric prices, append-only set/correct/withdraw and verify/revoke events, evidence links, transactional audit, current-first comparison query and indexes.
- **Functional work:** Item/category/canteen/price/budget filters, per-group minimum/ties, availability/missing/stale/unverified labels, source/recorded/checked timestamps, admin catalogue availability and event history. Official data entry waits for authorized sources; local fixtures are explicitly illustrative.
- **Tests/exit:** Old price 20, current 30, budget 25 returns no current match; no stale verification inheritance; latest revoke wins; latest withdrawal stays unknown; mixed portion/currency/unknown-unit cases; zero/free and exact budget boundaries; full-result ties before pagination; concurrent record/verification; denied ordinary writes; atomic event + audit.
- **Recovery:** Correct bad data by appending replacement/withdrawal/revocation, not historical UPDATE. Keep evidence referenced by current verification; log corrections with reasons.

### Stage 7 — complete fixtures, adversarial integration tests and hardening

- **Goal:** A demonstrable, genuine local prototype with honest verification evidence.
- **Existing files affected:** Documentation, scripts and component error/accessibility details uncovered by tests; only relevant code fixes.
- **Proposed new files:** `supabase/dev-data/profiles.json`, `canteens.json`, `manifest.json`; `supabase/reference-data/taxonomy.json`; `scripts/seed-dev.mjs`, `cleanup-dev.mjs`; full `tests/integration/`, `tests/e2e/`, `supabase/tests/`; operations/completion reports.
- **Database changes:** Only tested fixes/indexes; local-only `dev_only.seed_registry` outside production migrations. No schema constraint relaxed for fixtures.
- **Functional work:** 45 labelled sample profiles, mixed realistic test states, neutral avatars, inclusive skills, seeded comparison edge cases. Validate input errors, retries, conflict recovery, accessibility and responsive states across new and preserved pages.
- **Tests/exit:** All applicable H cases; local seed rerun/cleanup and fail-closed remote/production guards; fresh local migration replay; ordinary-role REST/RPC/Storage tests; static/bundle secret checks; build/lint; report actual command outputs and limitations. No generic “all passed” without test evidence.
- **Recovery:** Sample-only cleanup leaves genuine local accounts and shared reference data intact. Keep rollback/recovery fixtures independent of deployment migrations. Fix failures before broadening test scope unnecessarily.

### Stage 8 — explicitly approved deployment and operational handoff

- **Goal:** Deploy only a locally verified implementation to a named environment.
- **Existing/proposed files affected:** Deployment configuration, exact Auth redirects, redacted environment example, `docs/operations.md`, `docs/implementation-report.md`; possibly an approval-gated deployment workflow.
- **Database changes:** Only the reviewed migration set and separately approved configuration/reference/admin bootstrap operations. **No development seeds.**
- **Functional work:** Obtain owner decisions on real eligibility/reference data/admins/retention/canteen sources/domain; request explicit project/environment/write approval; configure production credentials and mail/redirects; apply migrations/configuration in the reviewed order; deploy static UI and authenticated Edge functions.
- **Tests/exit:** Verify target identity and no sample rows/accounts; run approved non-destructive smoke tests with designated accounts; check deep links/Auth callbacks/roles/Storage; record deployed revision/migration IDs and actual outcome. A staging result does not prove production is configured.
- **Recovery:** Pre-change backup/restore procedure, forward-fix plan and separate Storage recovery. No automatic destructive database reset or migration-history repair. Disclose missing runtime prerequisites, credentials, approvals or failed stages plainly.

## F. Development-data plan

### Deterministic dataset and structure

**Target:** Exactly 45 fictional member profiles. This is a dataset size, never an application enrollment limit. Dedicated local administrator/role-manager test accounts may exist without profiles and do not change that 45-profile target.

Proposed files:

```text
supabase/
  migrations/                         # schema, privileges, policies, functions only
  reference-data/taxonomy.json         # curated non-university skill categories/terms
  dev-data/manifest.json               # batch UUID, stable fixture keys, dataset version
  dev-data/profiles.json               # exactly 45 fictional profile definitions
  dev-data/canteens.json               # separate illustrative catalogue/prices/evidence cases
scripts/
  seed-dev.mjs                         # guarded local-only orchestration through real services
  cleanup-dev.mjs                      # exact sample-only cleanup
```

Do not put these inserts in `supabase/migrations/`, build startup, the browser, or an automatic production `seed.sql`/`--include-seed` deployment path. The checked-in manifest contains fixture identity, not passwords or secret keys.

Recommended state distribution:

| State | Count | Expected ordinary discovery behavior |
| --- | --- | --- |
| Eligible, active, approved, opted-in | 36 | Visible in two default 20-item pages |
| Draft (one pending eligibility, one eligible, one ineligible) | 3 | Hidden; own/admin preview |
| Submitted (one pending eligibility, one eligible) | 2 | Hidden pending review |
| Rejected, active | 2 | Hidden; owner sees safe reason |
| Suspended with previously approved profile | 1 | Hidden; own retained read only |
| Approved but discovery opt-in off | 1 | Hidden by owner choice |
| **Total** | **45** | No special fixture bypass of RLS |

Cover all six skill groups, several multi-category profiles, students in different stage schemes and graduates with no stage. Mix one-, two- and three-entry portfolios, private/campus audience rows, missing optional photo/contact fields and similar names to test stable sorting. Generated descriptions should sound like brief personal interests, not repeated corporate biographies. No profile claims to be an actual university directory entry.

Representative preview only:

| Fictional name | Skills across categories | Short sample description |
| --- | --- | --- |
| Mustafa Shahzad | Football, event organization, poster design | “I organize weekend games and make simple posters when a team needs one.” |
| Hashim | Baking, homemade ice cream, packaging | “Trying small ice-cream batches and better ways to pack desserts for a picnic.” |
| Fictional entry 03 | Tutoring, public speaking, writing | “I like explaining maths and helping friends practise short presentations.” |
| Fictional entry 04 | Drawing, crafting, handmade decoration | “Most evenings end with a sketchbook or a half-finished paper decoration.” |
| Fictional entry 05 | Web development, photography, video editing | “I build little websites and make short videos of places I visit.” |
| Fictional entry 06 | Badminton, cooking, team organization | “Happy to arrange a game or help cook for a small group.” |

The full later dataset should use varied fictional names, including the two requested names and at least two identical display names to exercise the UUID sorting tie-breaker. Fixture keys and synthetic emails remain distinct. Use explicitly synthetic academic labels (for example, “Development programme A — sample”) until verified reference data is supplied. Do not elevate the existing `src/data/profiles.js` department/programme arrays into official facts.

### Auth and ownership strategy

Use **local Supabase synthetic Auth users** through its Admin Auth API. Their generated Auth UUIDs remain the real `profiles.id` foreign keys. No nullable owner, fake string ID, service-role exception to profile ownership, or public insert policy is introduced.

1. Every fixture has a stable key such as `member-001` and deterministic synthetic email such as `iust-connect.member-001@example.invalid`.
2. The guarded local script creates an Auth user only if none matches the exact fixture identity. It may mark local synthetic emails confirmed without sending mail. Their protected `app_metadata` carries the fixture batch/key solely for cleanup identification, **not** authorization. A separately guarded local operator registration marks the corresponding control row before ordinary profile RPCs run; those RPCs derive profile/asset markers from the control row. Use a marked synthetic local administrator for fixture catalogue/evidence creation, whose trusted operations derive the same batch. No browser/admin payload may set or clear a marker.
3. Store returned Auth UUIDs in local `dev_only.seed_registry`. On rerun, verify UUID, exact synthetic email, registry instance/batch and protected metadata match. Abort on collision with an unmarked account; never adopt a genuine account because its name/email looks similar.
4. Use standard owner sessions to call actual ensure/save/submit RPCs and standard local admin sessions to review/approve/suspend. These real service flows populate the required state; do not fill frontend arrays or give the browser a service key.
5. Fixed fixture keys/payloads/request UUIDs make logical content reproducible and reruns idempotent. Auth UUIDs and trusted recording timestamps are generated by the database/services and persisted in the registry; byte-for-byte identity across a destroyed/recreated local instance is not required.
6. Generate local credentials securely at runtime and keep them in ignored local test storage if needed. Do not commit a usable password/secret or print it to normal logs. Genuine registration/email-confirmation tests remain separate: synthetic confirmed seed users do not prove the signup flow.

New genuine users use ordinary registration, pending eligibility and the same owner/approval rules. “Replacing” sample data means targeted cleanup followed by genuine enrollment, never renaming a fake account into a real person or transferring its seeded identity.

### Production/target safeguards

The first-release seed/cleanup scripts are **local-only**; they reject every hosted Supabase project, including a cloud development project. A later hosted-fixture workflow would need a separate explicit design and project approval, not an `--unsafe` override.

Use a two-phase guard: validate URLs/local CLI identity before loading or sending privileged credentials, then use credentials only against the validated loopback endpoints to verify database state. Complete every check below before the first write:

- Require an explicit development-seed confirmation argument/environment value independent of `VITE_` settings.
- Parse API and database URLs; require literal loopback/localhost resolving only to loopback, exact local stack ports/project identity from CLI status, and no redirects to a remote host. Reject `prod.localhost.example.com`, cloud domains, userinfo tricks and non-loopback resolution.
- Cross-check the service-only API identity projection and SQL `private.instance_config`: environment development, seeds enabled, matching instance UUID. Production is the schema default and always fails this check. This diagnostic RPC has no browser execution grant and grants no write capability.
- Validate the expected stable batch/manifest hash and `.invalid` fixture emails before creation. Do not permit a command-line “force” option that disables the target guard.
- Application/SQL marker-write guards independently reject non-null seed markers when production/seed-disabled. Local-only registry and fixtures are absent from the production migration path.
- Production preflight checks for any sample-marked account/profile/canteen/price/reference record and synthetic Auth fixture identity. Fail deployment if any exist; do not merely hide them with RLS.

A privileged operator could deliberately change any database safeguard; this is protection against accidental targeting and application misuse, not a claim that a database superuser is constrained by its own schema.

### Idempotency and cleanup

Use stable request IDs for logical profile submission, price and verification events. Do not append a new “initial” price/audit every seed rerun. Verify existing fixture hashes/states; resume interrupted creation only for verified marked fixture identities. Fail with an actionable diff on unexpected/genuine collisions rather than overwriting unknown data.

Cleanup repeats the same local/instance/manifest guards and selects **exact registry batch IDs and marked related roots**. It verifies markers on the actual Auth users, not just SQL rows.

Order:

1. Identify exact sample roots and reject cleanup when unexpected genuine-owned references would be affected.
2. Detach and remove sample-owned Storage objects through the Storage API; reconcile asset metadata. Avoid currently referenced shared/genuine assets.
3. Remove sample verification/price history only for sample offerings/canteens; handle correction chains in a safe FK order. Production history remains append-only.
4. Remove marked sample profile children/moderation/reports as appropriate; retain or sanitize local sample audit history explicitly rather than truncating the audit table.
5. Remove exact sample profile/control/role records, then the corresponding verified synthetic Auth accounts through the Auth Admin API. The ordinary application has no access to this privileged cleanup.
6. Remove only batch-marked, now-unreferenced synthetic academic/canteen reference records. Leave shared generic categories, skills, aliases and every genuine/shared reference record intact.
7. Remove registry entries only after confirming the corresponding cleanup succeeded. Rerunning after partial failure is safe.

Never `TRUNCATE auth.users`, blanket-delete all profiles, remove records by common names, or wipe shared taxonomy. Idempotency and cleanup tests must include a genuine local account deliberately sharing a fictional profile's display name.

### Canteen fixtures

Store separately from member fixtures with the same overall development batch but distinct fixture keys. Use names such as “Sample Canteen A” and “Sample Canteen B,” not invented real IUST outlets. Prices are illustrative numeric examples with conspicuous UI badges. Use a code-drawn receipt-like test image as evidence, not a fabricated authentic receipt or AI face.

Include equivalent portions/ties, different sizes/variants, an unknown portion, unavailable offering, no-price offering, latest withdrawal, verified → unverified new price, verified → revoked, stale observation, zero/free price, and a budget-between-old-and-current case. Observation timestamps can be relative to the database seed-time clock; idempotent request IDs preserve them on reruns. Label seeded verification states “Simulated verification — development fixture.” Never claim genuine checking dates/evidence for these records.

## H. Testing and acceptance checklist

### Test approach and evidence

Reuse build/Oxlint and local Supabase pgTAP. Add Playwright only for real UI/interaction tests; use the built-in Node runner or Playwright request clients for direct HTTP integration. Testing effort should target security boundaries, transaction races, data correctness and preserved behavior, not trivial implementation-mirroring snapshots.

Provide exact command, target environment, fixture version, timestamp, exit code, number of cases, warnings and failures in `docs/implementation-report.md`. Clearly separate **static inspection**, **mocked unit tests**, **real local integration**, **browser-verified**, **approved cloud smoke-tested**, and **not tested/blocked**. Do not report planned cases as passes.

Run database tests with ordinary publishable-key + real user JWT requests for API/RLS checks. At least two distinct ordinary accounts, a pending and suspended user, an admin and role manager are necessary. Use privileged credentials only for isolated setup/teardown and deliberate invariant checks; successful service-role reads do not validate RLS. For pgTAP role simulation, set actual roles/claims and assert returned/unchanged rows, not just absence of exceptions.

### H-UI — repository, routes, accessibility and animation

- [ ] Existing `npm run build` and `npm run lint` pass, with the existing Fast Refresh warning explicitly distinguished from newly introduced issues. Lockfile remains reproducible and unrelated dependencies are unchanged.
- [ ] `/`, `/#discover`, `/student/:id`, `/my-profile`, new Auth/admin/canteen routes and deep-link reloads work; legacy owner alias resolves only to the signed-in profile; unknown/removed IDs show not-found/denied appropriately.
- [ ] Keyboard tab order, skip link, visible focus, labels, associated field errors, search status, filter reset, pagination and mobile menu/Escape are usable. Dialog focus is trapped/restored; destructive controls require a meaningful confirmation and keyboard-accessible cancel.
- [ ] Home/detail/editor/canteen/admin pages at 320, 390, 768, 1440, 1920 and 2560px have no accidental horizontal overflow. Desktop gutters/cards/editor geometry match the original ledger where applicable. Loading/errors/long names do not break layout.
- [ ] Route fade retains `mode="wait"`, pathname-only key, `.18` duration and reduced-motion zero duration. Query/hash changes and session refresh do not replay the route/hero unexpectedly; navigation preserves top/hash scrolling semantics.
- [ ] Hero text/art entrance, featured `.5`/`index*.06`, directory `.45`/capped `.035` delays and viewport `once/.1` behavior match the ledger. Same profile IDs survive refetch/filter retention; new page cards enter without duplicate keys.
- [ ] ProfileView's `.35` inner fade, mobile menu `.15` entrance/exit, toast message key/default transition/2,800ms lifetime remain. Test actual enter/exit over time; a settled screenshot/import check is insufficient.
- [ ] Hover preserves button lift, card border/shadow and neutral feature-image scale `1.04`. There are no existing Framer hover/tap/layout/variant/modal props to invent; if reinspection finds new user-added ones, extend the ledger and preserve them too.
- [ ] With reduced motion, CSS sheen/smooth scrolling/transitions and Framer behavior match the existing preference logic. Newly added dialogs respect reduced motion. Screenshot comparisons allow deliberate fictional-face replacement only with unchanged relevant geometry.

### H-AUTH and H-PROFILE — registration, ownership and persistence

- [ ] Register a genuine local test user, confirm via the local mail flow, resend/expire/reuse links appropriately, sign in, refresh, sign out and recover a password. A signup response requiring confirmation is not treated as an authenticated session.
- [ ] Unconfirmed/pending accounts cannot fetch member directory/canteen data. Pending confirmed users can create/edit their own draft. Missing controls fail closed; malformed signup metadata cannot grant roles or break safe default provisioning.
- [ ] Two accounts and two browser contexts retain different owned profiles. An actual edit in one browser appears after reload in the other signed into the same account; a different account sees only permitted approved content.
- [ ] One profile per Auth subject; forced IDs, duplicate creation, foreign child IDs, ownership transfer and stale save versions fail. Save conflicts preserve local input and offer an explicit reload/recovery path.
- [ ] Programme/department cannot contradict; stage bounds/type are enforced server-side. Graduates require graduation year and no semester. Invalid future graduate year, unsupported programme and retired new selection fail.
- [ ] Multiple distinct skill IDs and at least three portfolio entries survive editing/reordering/reload. Editing the second entry does not remove the first/third. Per-profile limits do not cap the number of registered accounts.
- [ ] Missing backend configuration, session expiry, network/server error, conflict and permission denial each render honest states. No domain data silently returns to localStorage or mock arrays.

### H-MOD and H-REPORT — lifecycle and accountability

- [ ] Draft/submitted/rejected/removed profiles are hidden from other ordinary users, including direct detail IDs, related rows, search counts and asset requests; authorized admin previews remain explicit.
- [ ] Content approval requires confirmed email, active/eligible target, valid ready assets and the current submitted version. Approval is labelled moderation, not verified university identity.
- [ ] Approved parent/skill/contact/portfolio/photo edits become hidden drafts in the same transaction. Submitted content requires withdrawal. Restrictive privacy changes do not increase visibility; wider sharing follows review rules.
- [ ] `expected_version` checks `write_version`; content saves increment both counters. A privacy-only reduction increments only the write counter and preserves approved visibility for remaining shared content; a concurrent stale save/review fails. Detachment cannot leave an invalid asset-only portfolio entry. Re-listing unchanged approved content does not invent a new review.
- [ ] Rejection exposes only the owner-safe reason; staff notes remain private. Restoration after suspension/removal returns draft, not automatic publication.
- [ ] Suspension blocks an old JWT's directory/price/write/upload access on the next authorization check, hides the profile and prevents same-account recreation. Own retained read/status remains scoped. New unrelated registration stays pending, not implicitly eligible.
- [ ] Only permitted active eligible users report a visible different profile. Test concurrent duplicate/rate-limit attempts and retry idempotency; own receipts disclose no internal notes; report subjects cannot inspect reporters.
- [ ] A reported admin is excluded from that report's private/related audit projections; an admin reporter cannot resolve their own report. Another authorized administrator handles those cases.
- [ ] Important admin/role/price/report actions record real actor/target/time/reason and only permitted change details. Deliberate audit failure rolls back its associated change. A retry does not emit duplicate effects.

### H-SECURITY and H-PRIVACY — authorization matrix and adversarial API tests

- [ ] Exercise SELECT/INSERT/UPDATE/DELETE for every exposed table with anon, owner, other ordinary user, pending user, suspended user and admin credentials, matching deliverable D. Private tables and ungranted operations remain unavailable.
- [ ] Distinguish permission errors from RLS-filtered empty responses; after a denied write, independently verify the protected record is unchanged. Assert positive allowed rows, not merely a successful zero-row request.
- [ ] Calling public wrappers directly enforces the same rules as the UI. Forged Auth metadata, IDs, roles, ownership, approval, seed markers, actor/time, prices or audit data are rejected. Unknown payload keys do not slip through JSON merges.
- [ ] Role revocation applies with an existing JWT; only current role manager can grant/revoke. Concurrent grants/revokes/suspensions/closures cannot strand the last active manager. Role-manager-only does not imply content admin.
- [ ] No recursive policies; fixed safe function search paths; no unintended PUBLIC/default EXECUTE/table grants; no client CREATE in protected schemas. Scan all added SECURITY DEFINER functions for explicit caller/target checks.
- [ ] Base tables, views, RPCs, joins/embeds and any enabled GraphQL path reveal neither private contacts nor staff notes/eligibility identifiers/evidence. Owner-only portfolio entries are absent from other users' entries and counts.
- [ ] Anonymous/public marketing responses do not leak profile names/photos/IDs from protected spotlight queries. Sign-out/account changes clear in-memory private results and URL caches.
- [ ] Plain-text payloads such as HTML/script remain text; malicious `javascript:`, data, credential-bearing and malformed URLs are rejected by server writes and unsafe rendering paths. External links keep safe target/rel behavior; no arbitrary server-side URL fetch.

### H-ASSET — Storage, files and failure recovery

- [ ] Test own valid upload/validation/attachment and foreign path/asset, expired reservation, oversize, wrong purpose, malformed signature, declared-MIME spoof, excessive dimensions/pixels, animated/active format, unsupported extension and processing resource limits.
- [ ] Anonymous/user/admin direct final-bucket GET/list/sign/overwrite/delete attempts fail. User-generated signed URLs cannot bypass the gateway's fixed expiry; publishable-only calls do not authenticate a user.
- [ ] Owner, other eligible member, pending/suspended user and admin get exactly the intended photo/portfolio/evidence results. Evidence requires audited admin access; knowing a UUID/path never suffices.
- [ ] User calls to internal ready/finalize/cleanup fail; real service jobs authorize separately. Suspend/reject/remove during processing and between URL requests; new unauthorized issuance fails.
- [ ] Test partial upload, processing timeout, final object written but metadata commit failed, successful metadata but parent conflict, replacement, cancellation and cleanup races. Orphan cleanup is idempotent and never deletes an actively referenced successful asset.
- [ ] Ready objects are immutable; replacements get new IDs. Database attachment never points at unvalidated raw bytes. Storage object deletion uses Storage APIs and reconciles metadata.
- [ ] Verify signed-link expiry and caching behavior; document that already issued/downloaded content cannot be instantly recalled. No false test claim that RLS revokes an existing bearer URL immediately.

### H-DISCOVERY — matching and bounded results

- [ ] Name, canonical skill, alias and category searches work across technology, creative, sports, culinary, business/practical and academic/social examples. `C`, `C++`, `C#` retain distinct IDs/normalization semantics.
- [ ] Combined query and filters use the documented OR-across-fields, AND-across-dimensions, ALL-selected-skills and ANY-within-other-dimensions rules. Department/programme and student/graduate/stage/year cases match exactly.
- [ ] Literal `%`, `_`, escape characters, Unicode/case/whitespace and malformed SQL-like input do not become filter injection. Overlong strings/arrays and malformed cursors fail predictably.
- [ ] Name/UUID order is stable; unchanged multi-page result sets have no missing/duplicate IDs from skill joins. A filter change resets cursor; late requests cannot overwrite newer queries; stable cards are not remounted by a loading flag.
- [ ] Visible-only counts agree with matching rows or are honestly labelled “shown.” Draft/suspended/private data does not influence visible counts/portfolio counts. Empty/failure/retry states are distinct.
- [ ] Queries use server page caps and appropriate indexes. Record `EXPLAIN` and measured timings for a disposable larger dataset; do not infer performance from 45 fixtures alone.

### H-PRICE — equivalent comparison and event history

- [ ] Same canonical item but different variant, quantity, unit or unconfirmed portion never competes in one group; currency mismatches cannot share a minimum. No invented unit conversion.
- [ ] Current price is selected before budget/verification/price-sort filters. Historical 20/current 30/budget 25 does not return 20. Boundary budgets include exact equality; zero/free is valid and unknown is not zero; more than two decimal places are rejected rather than silently rounded.
- [ ] All ties receive the badge, including ties beyond the first page. Minimum is per exact item/currency and active filters over the full eligible set, not across unrelated foods or only the fetched page.
- [ ] No-price, unavailable, retired, withdrawal, unverified, revoked, stale and missing evidence cases have correct eligibility/labels. If no eligible record remains, there is no cheapest claim.
- [ ] Freshness uses observation time and the configured server threshold; exact seven-day boundary is handled consistently. New verification of old evidence does not forge freshness; future observations fail.
- [ ] Appending a new price removes eligibility until that exact price receives verification; an old verification never carries forward. Latest revoke is authoritative. Repeated request IDs do not create new histories.
- [ ] Admin append-only constraints and ordinary-user denials hold through direct APIs; same-offering corrections are validated; concurrent price/verification requests lock correctly; audit and price/verification commit/rollback together.
- [ ] Fictional names/prices/evidence always carry sample/simulated labels in lists, details, history and admin review. No real verification date/source is invented by a test fixture.

### H-DATA and H-DEPLOY — environments, migrations and fixture safety

- [ ] Fresh disposable local migrations produce correct tables, indexes, privileges, Auth trigger, RLS and Storage policies. Running staged upgrades preserves real-shaped data and corrects only intended objects.
- [ ] First seed creates exactly 45 profiles; second seed creates no additional Auth/profile/price/verification effect. Partial seed resumes only verified marked identities. Sample users exercise real Auth/queries/RPC/Storage rather than frontend mock switches.
- [ ] Cleanup removes the selected fixture batch and marked related sample data, leaves a genuine same-name user and shared taxonomy untouched, and succeeds again after partial failure. No broad table truncation.
- [ ] Guard rejects cloud URL, production instance, disabled seeds, API/SQL instance mismatch, malformed host/redirect, missing explicit confirmation and unmarked Auth collision before any write/credential-bearing remote request. A frontend development flag alone cannot enable seeding.
- [ ] Production migration/build inputs contain no automatic fixture insert path; deployment preflight rejects all sample markers/synthetic identities. Cloud development also needs explicit write approval and is rejected by the local-only seed script.
- [ ] Sample origin is enforced across caller controls, owner/admin reads, children, RPCs, catalogue joins, history, audit projections and Storage. Markers are inherited/immutable; a genuine root cannot attach a sample reference, and cleanup cannot reclassify fictional records as genuine.
- [ ] Client build includes only publishable configuration; secret/database/MCP credentials and test passwords are absent from tracked files and frontend bundles. `.env` variants are excluded, with redacted examples retained.
- [ ] Deep-link SPA fallback, exact environment-specific Auth redirects, signup mail, Edge user/service modes, backup/restore and separate Storage recovery are verified where actually deployed. Record named target/approval/migration IDs; don't equate GitHub push with deployment.

## I. Decisions requiring owner input

Implementation can begin locally with the stated defaults and fictional references. These questions block only the affected real-data/deployment stage unless noted. No production secret is needed in chat; project identifiers, settings and redacted examples suffice.

| Priority | Question | Why it matters | Practical default | Blocking point |
| --- | --- | --- | --- | --- |
| 1 | Who qualifies as a current student or eligible graduate, and what authorized evidence/deduplication process establishes it? Are any graduates excluded by cohort/status? | Email control and content review are not campus identity; ban evasion across newly created identities needs a legitimate stable process. | Manual eligibility review; every new account pending; no invented email-domain/graduate rule; no “verified university identity” badge. | Genuine enrollment/eligibility approval; local fictional development can proceed. |
| 2 | What are the authoritative department/programme lists and each programme's semester/year scheme and length? | Prevents inconsistent academic fields and invented official facts. | Owner-supplied reference records; synthetic clearly labelled local references until supplied. | Genuine profile submission with official academic claims. |
| 3 | Which confirmed Supabase account is the first administrator/role manager, and who may subsequently grant roles? | Prevents accidental privilege assignment or lockout. A GitHub identity does not automatically identify a Supabase administrator. | Named operator bootstrap of one confirmed account with admin + role_manager; current role manager grants thereafter; protect last active manager. | Non-local bootstrap/administration. Local dedicated test accounts are fine. |
| 4 | What removal, account erasure, ban-tombstone, audit and evidence retention rules should apply? | Personal-data deletion, accountability and suspension persistence can conflict. | Soft-remove; proposed 30-day content, 180-day minimal audit, price history for service lifetime, superseded evidence 90 days with current evidence preserved. | Handling genuine production users and enabling purge jobs. |
| 5 | Which exact development/staging/production Supabase projects, hosting domain/provider and redirect URLs will be used? | Separates data/credentials, enables Auth and deep-link deployment, identifies the target for approval. | Disposable local Supabase first; static HTTPS domain-root frontend; distinct cloud staging/production. | Any live cloud write or deployment; approval must name project and changes. |
| 6 | Is discovery public to the internet or restricted to eligible signed-in campus members? Should canteen prices have the same audience? | Controls database responses, consent and Storage distribution—not just routes. | Campus-only for both; public landing shell and neutral decorative artwork. | Nonblocking with default; explicit policy/test change before public exposure. |
| 7 | What registration/confirmation method and email infrastructure are available? Is institutional SSO actually required? | Signup verification, email-change behavior, graduate access and deliverability depend on it. | Email/password + confirmation, manual eligibility, password recovery; local mailbox for development. No guessed institutional domain or SSO. | Real external signup/email delivery; local implementation can proceed. |
| 8 | What are the actual canteen names and authorized sources for offerings, prices and availability? | Prevents fabricating official campus information. | No real catalogue entry without supplied/authorized source; use separately labelled local samples. | Real canteen data publication, not module implementation. |
| 9 | Who is allowed to verify prices, what evidence is sufficient, and how long should a check remain fresh? | “Verified” needs an accountable meaning and observation date. | Active app admins, source method + protected menu/confirmation image, seven-day observation-based threshold, labelled platform checking rather than university endorsement. | Genuine verified-price claims; local simulated checks can proceed. |
| 10 | Which serving units/portion definitions are supported and actually comparable across outlets? | Same food name does not establish equivalent quantity. | Exact piece/g/ml specifications; explicit agreed portion definition; unknown size marked non-comparable; INR only, no conversion. | Each real offering's comparable status; unknown entries may remain labelled non-comparable. |
| 11 | Should contacts and photographs ever be publicly accessible, or only owner/campus? | Sets consent, leakage and download rules. | Owner-only contacts/photos until explicit campus sharing; portfolio defaults to campus-on-approval with clear disclosure. No public genuine files. | Nonblocking with default; any public option needs coordinated schema/Storage changes. |
| 12 | Is temporary removal from discovery after approved-content edits acceptable? | Simpler safe moderation trades continuity for fewer moving parts. | Yes: save to draft, resubmit, reapprove; privacy narrowing immediate; no published revision copy. | Nonblocking with default; a different choice materially changes schema/workflow. |
| 13 | Are JPEG/PNG/WebP portfolio images plus external links enough, and are the proposed upload limits suitable? | Additional PDF/video/archive formats require different validation/serving/resource controls. | 2 MiB photo; 5 MiB portfolio/evidence; 4,096px dimension/16MP caps; raster only; no active uploads. | Nonblocking with default; additional formats block only their upload capability. |

Future service requests, societies, tutoring coordination, small businesses and events are explicitly postponed. Their later requirements do not block this first release.
