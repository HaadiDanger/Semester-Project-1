# A–B. Product requirements and technical architecture

Status: **Recommended design**, based on the [source assessment](README.md). Requirements explicitly requested in the brief are mandatory; defaults below are recommendations pending the prioritized [owner decisions](03-delivery-and-validation.md#i-decisions-requiring-owner-input).

## A. Refined product requirements

### Purpose, audience, and first release

Help IUST students and eligible graduates discover each other's skills, creative work, practical abilities, and services. A separate Canteen Prices page helps eligible readers compare equivalent, recently verified listed offerings. This is an independent prototype; neither membership moderation nor a price check implies official university endorsement.

Primary users:

1. A prospective member registering and preparing an owned profile.
2. An eligible student or graduate discovering collaborators and viewing permitted portfolios/contact information.
3. An administrator reviewing eligibility and profiles, resolving reports, and maintaining canteen records.
4. A separately authorized role manager granting/revoking administrative roles.

**Recommended audience default:** The landing shell is public. Profile discovery, profile details belonging to other people, and canteen comparison require a confirmed-email, active, eligible account. An active administrator can review data without needing a student profile. A pending applicant can edit their own draft and see their own status, but authentication alone does not grant directory access.

“Directory-visible” below means visible to this authorized campus audience, not automatically visible on the public internet. If public discovery is selected later, change the database, API, Storage, consent text, and tests together; do not implement it as a frontend switch.

### Requirement-to-delivery traceability

Each acceptance ID is expanded in [deliverable H](03-delivery-and-validation.md#h-testing-and-acceptance-checklist). Stage numbers refer to deliverable E.

| ID / mandatory first-release flow | Persistent model | Authorization contract | Stage | Measurable acceptance |
| --- | --- | --- | --- | --- |
| FR1 Register, confirm email, sign in/out, recover access | Supabase `auth.users`; `account_controls` | Auth verifies credentials; database checks current account restrictions and eligibility separately | 1–2 | H-AUTH: two browsers retain the same owned profile; an unconfirmed/pending account cannot read the directory |
| FR2 Create/save/edit a profile with student/graduate academic data | `profiles`, `programmes`, `departments`, `profile_moderation` | One profile per Auth subject; controlled owner RPCs; programme-derived department | 1–2 | H-PROFILE: another user cannot edit; a graduate has no semester; invalid stage/programme combinations are rejected by the database |
| FR3 Add inclusive standardized skills, interests, and services | `skill_categories`, `skills`, `skill_aliases`, `profile_skills`, `skill_requests` | Owners select active skills; administrators review new terms and manage taxonomy | 2, 4–5 | H-DISCOVERY: sports, culinary, creative and academic skills are as searchable/filterable as technical skills; aliases cannot duplicate canonical terms |
| FR4 Maintain multiple portfolio entries and genuine optional photos | `portfolio_items`, `assets`, private Storage | Owner reservation + trusted file validation + parent-based read permission | 3 | H-ASSET: at least three saved portfolio entries survive reload; changing one preserves the others; spoofed/oversized uploads fail |
| FR5 Submit, approve, reject, edit, suspend, restore, remove | `profile_moderation`, `account_controls`, `admin_audit_log` | Status transitions only through guarded transactional operations | 4 | H-MOD: only approved/eligible/active/opted-in profiles appear; approved edits disappear until reviewed; suspension bypass attempts fail |
| FR6 Search/filter/profile exploration with stable pagination | Normalized profile/reference tables | Search and detail return only rows permitted by the same visibility predicate | 5 | H-DISCOVERY: no duplicate IDs across unchanged pages; combined filters match their documented semantics; query failure never becomes demo data |
| FR7 Choose privacy for contacts, photos, and portfolio entries | `profile_contacts`, profile/portfolio audience fields, `assets` | Database omits private rows; asset access mirrors parent/audience rules | 3–5 | H-PRIVACY: private fields absent from other users' table, RPC, view and Storage responses |
| FR8 Report inappropriate profiles and resolve reports | `moderation_reports`, `admin_audit_log` | Active eligible reporters; bounded submission; private administrator review | 4 | H-REPORT: reporter identity is not disclosed to the subject; repeat/open duplicate reports are controlled; resolution is audited |
| FR9 Compare canteens, food categories, variants/portions, budgets and prices | `canteens`, `food_categories`, `menu_items`, `canteen_offerings`, `price_records` | Eligible reads; administrator-only writes | 6 | H-PRICE: comparison never mixes different portion IDs/currencies; an older cheaper price cannot satisfy the current budget filter |
| FR10 Record prices, verification/evidence and history | `price_records`, `price_verifications`, `assets`, `admin_audit_log` | Append-only events; authorized actor/time; atomic event + audit | 6 | H-PRICE: a new price is unverified even if the old price was verified; ties and stale/unavailable prices are labelled accurately |
| FR11 Admin role assignment and accountability | `user_roles`, `admin_audit_log` | Explicit role-manager grant; no editable-metadata authority | 1, 4 | H-SECURITY: ordinary direct API writes cannot change roles, status, ownership, official prices or audits |
| FR12 Reproducible development community | Local synthetic Auth users; fixture markers/registry | Local-only seed target guard; real ownership and application RPCs | 7 | H-DATA: exactly 45 sample profiles, idempotent rerun, targeted cleanup, zero cloud seeding |

### User journeys

**Member onboarding:** Register with email/password → confirm through Supabase's email flow → sign in → obtain an empty owned draft → select programme and academic stage/status → choose skills and optionally request a missing term → add portfolio/contact/photo information → preview sharing choices → submit for review → see pending, rejection reason, or approval. Pending eligibility may be reviewed alongside the profile, but approving eligibility and approving content are separate database operations.

**Discovery:** Sign in as an eligible active member → search the existing Home/Discover section → combine filters → move through stable pages → open `/student/:id` → explore permitted projects and permitted contact links → optionally report the profile. No connection request or message is sent by a decorative Connect button. Replace its label with an honest contact affordance when contacts exist; otherwise show “Contact details not shared.”

**Profile edit:** Open `/my-profile` → load owned data and version → edit multiple entries → save a database draft → obtain a conflict message if another browser changed it → submit the latest version → wait for review. A content edit to an approved profile takes it out of discovery immediately and transactionally. Show that consequence before saving.

**Moderation:** Admin opens `/admin/profiles` → filters submitted/eligibility-pending records → reviews the current version, relevant assets and permitted private information → records eligibility separately → approves or rejects with an owner-safe reason → database records the actor/action/audit in the same transaction. Admin may suspend the account, restore to a reviewable draft, or soft-remove a profile. Reporting has its own queue and resolution reason.

**Price comparison:** Eligible reader opens `/canteen-prices` → searches an item, chooses food category and exact portion/variant group → filters canteens/budget and chooses ascending/descending order → sees current listed prices, availability, recorded/checked dates and verification/staleness badges. “Lowest eligible listed price” is calculated inside each equivalent-item/currency group, for all matching results before pagination; every equal minimum is marked.

**Canteen maintenance:** Admin creates a genuine source-backed canteen and canonical item/portion → creates an offering → confirms availability → records a new price → sees it initially unverified → attaches protected evidence and verifies that exact price → later price changes append new records. History remains readable in the admin area. Fictional fixtures use explicit sample labels throughout this journey.

### Profile information and validation

| Information | Recommended first-release rule |
| --- | --- |
| Name | Required on submission; plain text, trimmed, 1–80 characters. Do not infer verified identity from it. |
| Programme and department | Profile stores only `programme_id`; department is derived from `programmes.department_id`. Admin-entered reference data must be supplied/validated by the owner. |
| Academic stage | Each programme declares `stage_unit` as `semester`, `year` or `none` and its maximum stage. Students supply a valid stage when applicable. No automatic conversion between semesters and academic years without authoritative rules. |
| Student/graduate status | Explicit `member_type`; graduates have `stage_number = NULL` and a graduation year. A draft may be incomplete; submission may not. |
| Graduation year | Required for graduates on submission; integer from 1900 through the current year, using server validation. Students leave it null in v1. Eligibility policy may narrow this after the owner decides. |
| Short description/about | `bio` required, max 280 characters; `about` optional, max 2,000. Plain text. |
| Skills/talents | 1–20 distinct active canonical skill IDs at submission. This is a per-profile usability bound, not a total-user cap. |
| Interests/services | Optional interests list of at most 10 items, 60 characters each; services/help text up to 500 characters. Not a service marketplace/order system. |
| Portfolio | Up to 10 independent entries, each with title (1–100), description (max 1,000), optional HTTPS link and optional validated image attachment. At least a description, link or attachment is required per saved entry. |
| Contacts/social links | Up to 10 rows; explicit `owner` or `campus` audience, default owner-only. Auth email is never automatically copied into shared contact data. |
| Photograph | Optional genuine user upload; default owner-only until explicit campus sharing. No stock/AI faces for fictional people. |

Validate inputs twice: frontend for feedback, database/server for authority. Validate cross-table academic relationships in trusted database operations/triggers. Required-on-submission checks allow incomplete drafts without admitting invalid approved records. Programme structural changes already used by profiles require explicit migration/review; retire an old programme rather than silently changing its department or stage interpretation.

### Lifecycle and visibility

Four independent facts determine access:

1. **Authentication:** Supabase session and current confirmed email.
2. **Eligibility/account restriction:** `account_controls.eligibility_status = pending | eligible | ineligible`; `account_status = active | suspended | closed`.
3. **Moderation:** `profile_moderation.status = draft | submitted | approved | rejected | removed`.
4. **Owner choice:** `profiles.discovery_opt_in`, plus separate photo/contact/portfolio audiences.

```mermaid
stateDiagram-v2
    [*] --> draft: Ensure owned profile
    draft --> submitted: Validate and submit current version
    submitted --> approved: Admin approves eligible active account
    submitted --> rejected: Admin gives owner-safe reason
    submitted --> draft: Owner withdraws before editing
    rejected --> draft: Owner saves corrections
    approved --> draft: Content edit
    draft --> removed: Admin soft removal
    submitted --> removed: Admin soft removal
    approved --> removed: Admin soft removal
    rejected --> removed: Admin soft removal
    removed --> draft: Admin restoration
```

Suspension is an **account restriction outside this state machine**. It immediately blocks directory/canteen access and ordinary writes and hides the owner's profile, regardless of its moderation state. Suspended users may read their own retained profile/status and prior report receipts. They cannot create another profile for that account. Restoring a suspended account returns its profile to draft; publication requires a new review. Closing an account blocks ordinary domain access and keeps a tombstone until the approved retention/purge process runs.

The exact discovery predicate is: **target has a confirmed email, active account, eligible status, approved current profile, explicit discovery opt-in, and an allowed data-origin marker**. Readers must independently satisfy the audience rule. Owners and admins have controlled preview access; a draft is never discoverable merely because its ID is known.

**Recommended approved-edit policy:** No published-revision table. Name, academic information, descriptions, services/interests, skills, photo reference, contact values and portfolio-content saves reset an approved/rejected profile to draft, including child-only edits. Submitted content is locked until withdrawal, except for the narrow privacy-reduction operation. Privacy restrictions (campus → owner), hiding discovery, and detaching an optional asset can take effect immediately without increasing exposure. An asset-only portfolio entry must still satisfy its content constraint after detachment; otherwise hide that entry or use the normal edit/review flow. Widening an audience or attaching/replacing content requires the draft/review path. Re-enabling discovery on unchanged approved content is allowed through a guarded consent operation.

**Version contract:** `write_version` is the aggregate concurrency counter checked by every `expected_version` parameter; increment it for every profile/child/privacy/moderation change. `content_version` advances only for changes requiring content review. Submission and approval bind to `content_version`. A privacy-only reduction increments `write_version` while retaining `content_version` and the existing submission/approval metadata; this preserves approval of the unchanged, more restricted content and rejects stale edits/reviews. Normal content saves increment both counters and reset review. Keep both counters server-controlled; they are not stored revision copies.

This temporarily interrupts discovery after edits but prevents unreviewed content leaks with one current version. The UI must explain the tradeoff. A later revision system is justified only if actual review delays materially harm use.

### Inclusive taxonomy and search contract

**Recommended taxonomy:** Six equally presented categories: technology; creative; sports/fitness; culinary; business/practical; academic/social. These are product categories, not claims about university departments. Skills have one primary category in v1. Members may choose skills across every category; category order is not an importance ranking.

- Normalize names using Unicode normalization, trim/collapse whitespace, and case folding. Preserve meaningful punctuation: `C`, `C++` and `C#` are distinct.
- Canonical skill keys are unique. Aliases resolve to exactly one skill; a shared advisory lock/controlled write checks canonical and alias namespaces together so an alias cannot collide with another canonical name. An alias identical to its own canonical term is unnecessary and rejected.
- Members search existing terms before submitting a missing-skill request. Request creation is bounded and does not immediately create an authoritative skill. An administrator accepts into the existing taxonomy or merges the request with an existing skill/alias, recording the resolution.
- Administrators edit/retire taxonomy through the admin area. Retired skills remain readable on historical associations but cannot be newly selected. Merging reassigns links without duplicates and keeps useful aliases. No frontend code change is needed to introduce a category or skill.

**Search semantics:** Trim/collapse whitespace and case-normalize a literal query, max 80 characters. Match a substring in any of display name, bio/about, services/interests, programme/department label, skill canonical name, skill alias or category name. Do not search private contact values, administrative notes, Auth email or evidence. Portfolio exploration is through permitted profile entries; full-text indexing of project descriptions is postponed.

- Empty query means no text restriction. Require at least two characters for free-text queries; a one-character skill such as `C` can still be selected by canonical ID in the skill chooser.
- Treat `%`, `_` and escape characters as literal input rather than user-defined SQL wildcards. Use parameterized queries and escape LIKE patterns; never interpolate raw SQL/PostgREST filter expressions.
- Text matches are OR across searchable fields. Different filter dimensions combine with AND. Multiple selected skills mean **match all**; multiple categories, programmes or departments mean **any within that dimension**. Do not add an ambiguous skill-any toggle in v1.
- Stage filters apply only to students of the chosen stage unit. Selecting a stage excludes graduates. A graduate-year filter applies only to graduates. Contradictory filters yield a clear empty state rather than silently weakening the query.
- Default sort is normalized display name ascending, then profile UUID ascending. Use keyset pagination (a cursor holding the last sort values), page size 20 and maximum 50. Bind/validate cursors against the active filters/sort; reset them on filter changes. Stable ordering does not promise an immutable snapshot if names or visibility change between requests.
- Use `EXISTS` for skill/category membership; choose the page of profile IDs before aggregating child rows. Do not paginate a multiplying join and then deduplicate in JavaScript.
- Use PostgreSQL `pg_trgm` indexes for substring search, B-tree indexes for equality/cursor paths, and `EXPLAIN` on representative local data. Short/punctuation-only searches can be less index-friendly: apply bounded queries, query timeouts and filter-array limits. Do not introduce Elasticsearch or another external search service.
- Limit selected skills/categories/programmes/departments to 20/6/20/20 respectively per request, debounce typing around 250 ms, reject malformed cursors and cap server execution time. Use visible-only results and counts. An optional first-page count may be omitted on timeout; then label “N shown,” not “N total.”

### Canteen correctness and authenticity

`menu_items` represents an **exact comparable item/variant/portion specification**, not merely a food name. A canteen offering links one canteen to that specification and one currency. For example, an illustrative 200 ml portion and an illustrative 300 ml portion must have different menu-item IDs, even if their names are identical. A vague “plate” is not comparable unless its quantity/specification is confirmed as the same shared portion definition.

Use explicit units such as `piece`, `g`, `ml`, or a confirmed `portion` specification. No unit or currency conversions in v1. Unknown-size items are labelled non-comparable and never receive a lowest-price badge. INR is the recommended first-release currency, subject to owner confirmation; no actual prices or canteen names are invented.

Prices are effective when recorded in v1. Store a trusted `recorded_at`; an evidence observation time records when information was actually checked. Scheduled/backdated price activation is postponed. Every price change is a new event, including a withdrawal event that makes the current price unknown. Corrections reference the current erroneous record and append a replacement/withdrawal; they do not erase history or reveal an older price as current.

Verification belongs to one exact price record. A new price does not inherit an old verification. Append verification/revocation events with actor, event time, observation time, source method and protected evidence. A recent verification event for an old observation does not make the observation fresh.

**Recommended freshness:** Seven days from the latest valid verification's `observed_at`, configurable server-side. Exactly the threshold is still fresh; older is stale. The latest verification event must be `verified`, not revoked. Default listings display current information with status badges; only active/available, comparable, same-currency, fresh verified prices qualify for the lowest-price calculation. Unverified or stale data can remain visible with conspicuous labels but does not compete for that badge.

Choose the latest price **before** applying budget, sorting or verification filters. Calculate the per-item/currency minimum over the full eligible filtered set, before pagination. Show all ties and disclose the active filters. Use “Lowest eligible listed price,” not “guaranteed cheapest.” If no eligible price exists, say so. A budget cannot make an older cheaper historical record current.

Fictional canteens and illustrative price evidence are development fixtures only. Label them “Sample canteen,” “Illustrative price,” and “Simulated verification”; never portray test evidence as official university confirmation.

### Nonfunctional requirements and exclusions

- **Security/privacy:** Authorization on every exposed operation; least-privilege grants; private-by-default contacts/photos; no secrets in client bundles or source control; protected downloads follow current authorization.
- **Usability/accessibility:** Maintain the dark aesthetic, animations and responsive proportions; keyboard-operable forms/filters/dialogs, visible focus, associated errors, live result feedback, and reduced-motion behavior.
- **Reliability:** Persist across sessions/devices; atomic multi-row writes; optimistic version conflicts; idempotent retries for submissions/prices/reports; explicit pending, empty, failed and denied states. No silent mock fallback.
- **Performance:** Bounded pages and uploads; no whole-directory fetches or N+1 downloads; use a representative 10,000-profile disposable benchmark to investigate query plans. Target a warmed local database search under 500 ms and report hardware/data/actual timings; this is a target, not an asserted production SLA.
- **Maintainability:** Retain JavaScript, current routing/styling/state patterns; add only justified libraries; version migrations; document roles, environments, deployment and recovery.
- **Scope:** No chat, payments, service booking, feed, recommendations, full revision system, institutional SSO without supplied requirements, or automatic identity certification. Repository publication is not website or database deployment.

## B. Technical architecture

### Architecture and trust boundaries

```mermaid
flowchart TB
    Visitor[Browser: untrusted input and UI]
    UI[Existing React / Vite application\nAuth context + small data modules]
    Auth[Supabase Auth\nemail confirmation and sessions]
    API[Data API\npublic tables + SECURITY INVOKER RPC wrappers]
    DB[PostgreSQL\ngrants + RLS + constraints\nprivate guarded operations + audit]
    Edge[Asset gateway\nverified user JWT + database authorization\nbounded WASM validation and signed URLs]
    Store[Private Storage\nquarantine / profile-media / evidence]
    Operator[Approved operator\nlocal migrations, bootstrap, cleanup]
    Visitor --> UI
    UI --> Auth
    UI -->|publishable key + user JWT| API
    API --> DB
    UI -->|own reserved quarantine path| Store
    UI -->|user JWT, asset ID only| Edge
    Edge -->|user-scoped authorization RPC| DB
    Edge -->|privileged server-only Storage operations| Store
    Operator -->|local by default; named approval for cloud| DB
```

The browser is not trusted to supply ownership, roles, approval, verification, actors or authoritative timestamps. RLS filters rows; SQL grants control which operations/columns may be requested. Private guarded operations perform multi-table transitions. The Edge Function is needed for inspecting uploaded bytes and issuing constrained asset access, not as a general replacement for database authorization.

Use an unexposed `private` schema for administrative/control data and elevated implementation functions. Expose deliberately named `SECURITY INVOKER` wrappers in `public` for `rpc()` calls; wrappers call tightly granted `private` functions with explicit authorization. No blanket definer function accepting arbitrary tables/SQL/owner IDs. Detailed grants, predicates and matrix are in deliverable D.

### Repository-specific file and route changes

All new paths in this table are **proposed**. Existing paths are identified as existing and are not changed by this architecture review.

| Area | Existing files to extend | Proposed files and responsibility |
| --- | --- | --- |
| Initialization | `src/main.jsx`, `src/App.jsx`, `vite.config.js` only if necessary | `src/lib/supabase.js`: one browser client, safe environment validation; `.env.example` |
| State | `src/context/AppContext.jsx` | `src/context/AuthContext.jsx`: session/bootstrap state; retain AppContext for toast/UI feedback, remove mock/domain authority |
| Guards/session | `src/App.jsx`, `src/components/Navbar.jsx` | `src/components/RequireSession.jsx`, `RequireEligibility.jsx`, `RequireAdmin.jsx`; loading-aware UX guards, not security boundaries |
| Authentication | Extend root route list | `src/pages/SignInPage.jsx`, `RegisterPage.jsx`, `AuthCallbackPage.jsx`, `RecoverAccountPage.jsx`; `/sign-in`, `/register`, `/auth/callback`, `/recover-account` |
| Profiles | `MyProfilePage.jsx`, `StudentPage.jsx`, `ProfileForm.jsx`, `ProfileView.jsx`, `PortfolioCard.jsx`, `Avatar.jsx` | `src/data/profilesApi.js`, `src/hooks/useProfile.js`, `src/utils/profileAdapter.js`, `src/components/PortfolioEditor.jsx`, `UploadField.jsx` |
| Discovery | `HomePage.jsx`, `Hero.jsx`, `FilterBar.jsx`, `ProfileCard.jsx`, `FeaturedProfileCard.jsx`, `SearchBar.jsx` | `src/data/discoveryApi.js`, `taxonomyApi.js`, `src/hooks/useDiscovery.js`, `src/components/Pagination.jsx` |
| Feedback/dialogs | `Toast.jsx`, reusable form `Field`, `src/index.css` | `src/components/AsyncState.jsx`, `ConfirmDialog.jsx`; retain existing animation/feedback patterns |
| Canteens | Navbar/root route additions | `src/pages/CanteenPricesPage.jsx`, `src/data/canteensApi.js`, `src/components/CanteenComparison.jsx`; `/canteen-prices` |
| Administration | Extend animated routes using the same outer wrapper | `src/pages/admin/AdminLayout.jsx`, `ProfilesPage.jsx`, `ReportsPage.jsx`, `CanteensPage.jsx`, `TaxonomyPage.jsx`, `RolesPage.jsx`, `src/data/adminApi.js`; `/admin/*` with bounded queues |
| Backend | No existing backend directory | `supabase/config.toml`, `supabase/migrations/`, `supabase/tests/`, `supabase/functions/asset-gateway/index.js`, `supabase/functions/asset-cleanup/index.js` |
| Fixtures/tests/docs | Existing verification reports remain evidence | `supabase/dev-data/`, `scripts/seed-dev.mjs`, `scripts/cleanup-dev.mjs`, `tests/integration/`, `tests/e2e/`, `docs/operations.md`, `docs/implementation-report.md` |

Keep `/` and `/#discover` as the existing discovery experience rather than adding an unnecessary replacement route. Preserve `/student/:id` with real profile UUIDs. Handle the legacy `/student/my-profile` alias by resolving only the current signed-in owner's ID; never treat the literal string as shared ownership. Removed fictional slug URLs can show the existing not-found UI; do not silently map an old fictional name to a real person.

Reference dropdowns are loaded from the database. Keep `src/data/profiles.js` out of production query paths once the data migration is complete; move fictional content to guarded development fixtures. `src/utils/storage.js` ceases to be the authoritative domain store. An optional, explicit, validated import of a user's old local draft is a later convenience, not part of onboarding or an automatic upload.

### Data-access organization

Use small resource-specific JavaScript modules and React hooks. Do not introduce Redux, a query cache framework, or a wholesale state replacement. API modules translate database rows to the existing `person` rendering shape while migrating components deliberately: `display_name → name`, joined programme/department labels, skill labels, permitted portfolio entries, and derived ownership/sample flags.

Each resource hook owns loading/error/refresh state, cancellation/request sequencing, retry behavior and cursor state. Abort or discard stale requests. On authentication subject change or sign-out, clear in-memory resource state and signed URLs; do not carry another user's draft/query result into the new session. Counts and card collections must use the same visibility filters.

Never catch a Supabase error by substituting `demoProfiles`. Missing configuration shows a setup error, not a functional-looking fake backend. An access-denied response clears stale protected content; a transient refetch failure may keep the last authorized result with a clear “could not refresh” message until a fresh access check says otherwise.

### Authentication/session flow

1. Configure email/password registration and email confirmation; recommend a 12-character minimum password and Supabase's supported Auth abuse limits. Do not hardcode an IUST email-domain suffix without supplied policy.
2. A narrow Auth-user creation trigger creates `account_controls` with active/pending defaults. It must not read client metadata to grant roles/eligibility or let malformed profile metadata break signup. `ensure_my_profile()` creates only the caller's draft after a confirmed session.
3. The Auth context subscribes to session changes and obtains the caller's server-authoritative account/profile/role summary. Wait for initialization before rendering protected route decisions. Email/account checks in SQL remain authoritative after a stale JWT or role revocation.
4. Verify confirmation/recovery callback behavior with the installed SDK and local mailbox, including expired/used links, resend, password reset and same-browser/cross-browser cases. Use exact redirect allowlists; sanitize return destinations to local application paths. Do not log callback tokens or fragments.
5. On sign-out clear domain caches. Supabase session persistence is allowed and is distinct from storing profiles/roles/canteen records in localStorage.

Email changes need the platform's secure confirmation flow and a fresh eligibility review when eligibility depended on that address. Do not treat a stale token email or email-domain claim as proof. Genuine enrollment remains blocked until the owner chooses an eligibility/deduplication procedure.

### Profile write and moderation flow

`ensure_my_profile()` has no owner parameter. `save_my_profile(expected_version, payload)` accepts only whitelisted editable fields and owned child IDs, locks account then profile, compares `expected_version` with `write_version`, validates the aggregate, updates the parent and children atomically, advances both version counters, and withdraws approved content to draft. An unknown administrative field is rejected rather than silently trusted. Changes spanning multiple accounts/profiles lock IDs in a consistent order; role-manager safety operations take their shared advisory lock first.

`submit_my_profile(expected_version, request_id)` validates all required data and ready referenced assets, records `submitted_version = content_version`, and advances `write_version`. Pending eligibility may submit; ineligible/suspended/closed accounts may not. `withdraw_my_submission(expected_version, request_id)` returns it to draft. Approval/rejection functions compare the review screen's `write_version` and current submitted content version; approval additionally requires current eligibility/confirmed email/account activity. Owner-safe rejection reasons and internal notes are separate fields and response projections.

Admin suspension changes account restrictions, not a user-editable status field. Restoration requires admin authority and puts content in draft. Removal keeps the root/tombstone, preventing same-account recreation. Different accounts created by the same human cannot be reliably deduplicated without an owner-approved eligibility identifier/process; new accounts always start pending.

For submissions, reports, price records and admin actions use an idempotency/request UUID and expected state/version. Under duplicate/concurrent requests, return the existing outcome or a clear conflict. Audit entries use the actual authenticated actor inside the same transaction as the corresponding database change. Trusted submission/withdrawal/closure operations may also use this log for their minimal state-transition receipts; owners receive only their safe operation result, never general audit access.

### Upload and asset flow

1. Reserve a purpose-specific asset ID/path using an owner/admin RPC. Check active account, ownership, quotas and parent editability; record declared size/type as untrusted until inspection. Reserve for 10 minutes, with at most five outstanding unreferenced assets per owner (including reserved, processing and ready-unattached assets).
2. Upload with the user's JWT to an exact reserved path in private `upload-quarantine`, without upsert. Storage RLS checks the reservation, owner/path, expiry, purpose and account restriction; bucket size/type limits are also enforced.
3. Call `asset-gateway` with user JWT and asset ID, not an arbitrary Storage path/URL. Use the current documented user-auth mode. Check access through a user-scoped database function before privileged Storage access.
4. Read bytes server-side, check byte limits/signature/decoder format/dimensions, reject active/animated or unsupported formats, decode and re-encode allowed raster data, strip metadata, and write an immutable final object. Recheck authorization/state before marking metadata ready. Only ready assets can be attached to profiles, portfolio entries or verification events.
5. Finalization of a profile/portfolio attachment follows the normal parent version/re-review rule. Failed or abandoned uploads stay unreferenced and are cleaned up safely; never claim Storage bytes and SQL writes are one atomic transaction.
6. Requests to view an asset recheck parent visibility, audience, account status and purpose. The gateway issues at most a 60-second signed URL. Final buckets grant no direct end-user read/sign permission, preventing callers from requesting their own longer expiry. Evidence requires admin authorization and an audited access event.
7. Replace files using new object IDs; detach old references transactionally and mark unreferenced objects for cleanup. A processing token/expiry coordinates retries and cleanup; expired reservations and ready-but-unattached objects older than 24 hours can be reclaimed after rechecking references under a lock. Delete through the Storage API, then reconcile metadata. Never delete Storage metadata rows directly to pretend the bytes were deleted.

Defaults: genuine photos up to 2 MiB; portfolio/evidence images up to 5 MiB; JPEG/PNG/WebP, max 4,096 pixels per dimension and 16 megapixels. Re-encode photos to a suitable maximum around 1,024 pixels and portfolio/evidence to at most 2,048, preserving legibility. Keep limits configurable in trusted deployment settings. No SVG/HTML/PDF/office/archive uploads in v1; externally hosted HTTPS portfolio links cover other media. This still provides genuine multiple portfolio uploads without an unsafe document renderer.

Previously issued URLs and already downloaded bytes cannot be recalled just by changing RLS. Keep short expiry, low/no-store caching where supported, clear frontend copies on permission changes, and document the residual access window. Urgent object removal/rotation may revoke future fetches, not copies already obtained. Do not promise instantaneous retroactive revocation.

### Canteen recording/verification flow

All official maintenance uses guarded admin RPCs. Lock the offering while appending a new price/correction/withdrawal; a retry with the same request ID cannot create a second event. Verification locks the offering and asserts that the referenced price is still current, is a set-price event, and has authorized ready evidence. Store verification separately; later edits append revocation/new-verification events.

`search_canteen_prices` uses one server snapshot time, joins the latest price per offering and latest verification per price, computes freshness/availability/comparability, applies current-result filters, then computes grouped minima and paginates. The output contains safe labels/timestamps and eligibility reasons, not evidence paths, private notes or the administrator's Auth identity. Admin history endpoints return bounded event/evidence metadata and authorize every asset separately.

### Dependencies and backend-function justification

| Addition proposed | Why justified |
| --- | --- |
| `@supabase/supabase-js`, pinned compatible version | Auth, Data API/RPC and Storage access; one client library replaces bespoke requests. Resolve an actual supported version during implementation. |
| Supabase CLI, pinned development tooling | Reproducible disposable local Auth/Postgres/Storage, migrations, pgTAP tests and environment configuration. Requires a supported container runtime on this Windows workspace. |
| `@playwright/test`, development-only | Real routes, focus, uploads, authentication, motion and cross-browser-context persistence need browser tests; no equivalent runner currently exists. |
| Built-in Node test runner + local pgTAP | Input/seed checks and real RLS/transaction integration testing; avoid another general test framework unless a demonstrated gap requires one. |
| Official `@supabase/server` Edge auth helper, pinned | Current documentation provides a verified user-context wrapper and separate privileged context. Prevent accidental use of a publishable key as user authentication. |
| Bounded WASM image decoder/encoder, e.g. documented `magick-wasm` | Browser MIME/size checks are not file validation. Official Supabase guidance supports WASM, not native Sharp in Edge. Pin and test a compatible package, restrict decoders/resources, and report a blocker if the limits cannot be enforced. |
| SQL aggregate-write/moderation/price functions | Multi-row ownership, state transitions, race control and same-transaction audit require database operations. |
| `asset-gateway` and service-only `asset-cleanup` | Trusted byte inspection/constrained signing and recovery across non-atomic Storage/SQL operations. No additional standing server or unrelated service. |

JavaScript Edge entrypoints are supported by current Supabase documentation: configure `entrypoint = './functions/asset-gateway/index.js'` relative to `supabase/config.toml`. Keep user-facing functions authenticated; do not copy a documentation example's unauthenticated image demo settings. A service-only cleanup function may use the documented secret-auth mode with explicit verification in code; ordinary user tokens/publishable keys must fail.

### Environments, deployment, recovery, and MCP

- Begin with a disposable **local Supabase** stack. Use a separate staging/development cloud project if later approved. Production uses different URLs, credentials, Auth redirect configuration and administrative bootstrap.
- Browser variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`. They are public configuration; a legacy anon credential, if required by the installed local stack, has the same low-privilege purpose, not service authority. Do not place database passwords, secret/service credentials, signing material or MCP tokens under `VITE_`.
- Server/operator-only variables include Supabase secret credentials, local database connection and seed-target identifiers. Use the current Edge runtime's documented secret context/environment, not copied obsolete variable assumptions. Keep `.env` variants ignored and `.env.example` redacted.
- Version schema/grants/policies/functions together in `supabase/migrations/`. Keep fixture inserts outside migrations and outside automatic production seed paths. Review generated SQL, including managed `auth`/`storage` customizations. Avoid untracked remote Dashboard edits.
- Host the Vite build on a static HTTPS host at the domain root with SPA deep-link fallback, exact Auth callback/recovery URLs and suitable security headers. Hosting/provider/domain is an owner decision. GitHub repository hosting alone is not this deployment.
- The operational guide must cover first-admin bootstrap, role recovery, local resets, forward-fix migrations, database backups/restore rehearsal, separate Storage recovery, failed uploads/orphans, secret rotation, retention and remote migration approval. Do not present destructive resets as recovery for a live database.

**Supabase MCP** is an operator tool for inspecting schemas/docs and proposing migrations, not an application backend connection. The official hosted server currently documents this scoped read-only URL shape:

```text
https://mcp.supabase.com/mcp?project_ref=<DEV_PROJECT_REF>&read_only=true&features=database,docs
```

Configure it using the chosen MCP client's current instructions; the URL is not a universal client configuration file. Local MCP's address is printed by `supabase status` (normally `http://localhost:54321/mcp`); discover local capabilities rather than assuming identical hosted flags/tools. Use OAuth/secure operator credentials outside source control. Do not enable write tools just because a plan mentions a migration. Treat database rows, reports and retrieved documents as untrusted data, not agent instructions.

**Mandatory deployment boundary:** Neither this review nor the later coding agent has permission to write to a live cloud database merely because GitHub commits were requested. Before any cloud migration, seed, reference-data update, role bootstrap, Storage configuration or other write, obtain explicit approval naming the project/environment and intended changes. Provide the migration list/hash, affected objects/data, local test results, and recovery plan. This applies to staging cloud projects too. Local disposable testing can proceed in the later implementation task. Never run development fixtures against production or automatically deploy database writes on every push.
