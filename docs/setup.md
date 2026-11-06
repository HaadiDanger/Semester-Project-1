# IUST Orbit local setup and verification

This guide describes the implemented application. The [implementation report](implementation-report.md) records which checks actually ran. As of **6 November 2026**, the real local Supabase stack has **seven applied migrations**, **45 labelled sample profiles**, and **NESCAFÉ IUST’s 30 published menu listings**. See [café setup and maintenance](cafes.md) for the import workflow.

## 1. Prerequisites and application configuration

- Node.js **24**; verification used Node `24.20.0` and npm `11.19.0` on Windows.
- Install dependencies with `npm ci`. The lockfile pins the installation; Supabase CLI is `3.0.0`, Supabase JS `2.118.0`, Vite `8.3.5`, Playwright `1.64.1`, PGlite `0.5.15` and ImageMagick WASM `0.0.45`.
- A supported, running Docker-compatible container runtime is required. This installation uses Docker Desktop's `desktop-linux` context with Linux containers.
- Use terminals in the repository root. Examples that set environment variables use PowerShell.

After starting and inspecting the stack in section 2, `npm run connect:local` generates `.env.local` and `.env.functions.local`, without printing credentials or overwriting existing files. The public configuration follows [`.env.example`](../.env.example):

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_LOCAL_PUBLISHABLE_OR_ANON_KEY
VITE_APP_URL=http://localhost:5173
```

The legacy `VITE_SUPABASE_ANON_KEY` is also accepted when the publishable variable is absent. Every `VITE_` value is public build-time configuration. Database passwords, service-role/secret keys and cleanup credentials must never use this prefix.

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Use `http://localhost:5173` consistently for this configuration. For fixed Auth callback URLs, start Vite with `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. Restart Vite after changing environment values. Without valid configuration the UI shows a setup notice. `npm run build` writes `dist`; `npm run preview` serves that bundle locally. Vite blocks access to environment files, `.dev-seed/` and local Supabase operator metadata over HTTP.

## 2. Start and inspect local Supabase

The pinned CLI 3 targets the local stack by default for `db` and `migration` commands. Do not add the obsolete `--local` flag. Hosted targets use `--remote[=<ref|branch|url>]` and the separate procedure in [operations](operations.md#approved-hosted-deployment).

If a terminal opened before Docker installation cannot find `docker`, reopen the terminal. For this machine's per-user installation, this also updates the current PowerShell session:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"
```

Check `docker context show`, its inspected endpoint, existing Supabase containers/volumes and the project ports before first startup. The verified local context here was `desktop-linux` at `npipe:////./pipe/dockerDesktopLinuxEngine`.

```sh
npx supabase --version
npm run edge:prepare
npx supabase start
npx supabase status
npx supabase migration list
```

`supabase/config.toml` identifies the local stack as `iust-connect-local`: API `54321`, PostgreSQL `54322` (major 17), Studio `54323`, local mailbox `54324`. Compare these with CLI status before using any credentials. Status may display local keys; keep that output private.

On a fresh stack, startup applies migrations. For an existing stack, inspect its migration history and database identity before applying pending files:

```sh
npx supabase db query --read-only "select current_database(), current_user, version(), to_regclass('private.instance_config');"
npx supabase migration up
npx supabase db query --read-only --file supabase/operator/inspect.sql
npx supabase db lint --schema public,private --level warning --fail-on error
```

If application objects already exist, run `inspect.sql` before the upgrade as well. If the target or history differs from what you expected, reconcile it before applying migrations. Record the returned **instance UUID**. The local stack label alone is not the database identity.

The instance created for this checkout is `43bbe85a-f1a8-403a-8776-ee2a5a57d87f`. It is now development/seed-enabled with a profiles-only fixture manifest. A reset/recreation generates a different UUID; always use the inspected value:

```powershell
$env:DEV_EXPECTED_INSTANCE_ID = 'YOUR_INSPECTED_INSTANCE_UUID'
npm run connect:local
```

This helper verifies the local API and database instance, then writes only the ignored environment files. It preserves existing files for review. CLI 3's `db query` accepts **one statement** per invocation; `inspect.sql` is a single SELECT. Multi-statement operator transactions below use `psql` in the inspected local database container.

### Migration inventory

Apply all seven files in order from `supabase/migrations/`:

| File | Purpose |
| --- | --- |
| `202611030001_foundation.sql` | Controls, roles, audit, references, profiles, asset metadata, canteen/event tables, RLS, Auth triggers and production-default origin guards. |
| `202611030002_profile_api.sql` | Transactional owned writes, request receipts, discovery/detail, audiences, reports and suggestions. |
| `202611030003_administration.sql` | Moderation, eligibility, role management, reference editing/merges and settings. |
| `202611030004_canteen_prices.sql` | Current-first comparisons, immutable history RPCs, verification and administrator lists. |
| `202611030005_private_storage.sql` | Three private buckets, quarantine policy, image-access/processing and cleanup worker RPCs. |
| `202611030006_development_fixture_controls.sql` | Service-only, instance-guarded fixture registration, inventory and targeted cleanup. |
| `202611060001_cafe_menus.sql` | Source-labelled café listings, curated photo metadata, operator-attributed prices and versioned publication RPCs. |

Migrations insert no student fixtures, official academic catalogue or canteen prices. `private.instance_config` starts as `production`, `seed_enabled=false`, manual eligibility and a **30-day** freshness window. This is also the initial state on a local installation. Automatic SQL seeding is disabled.

All seven files replay successfully in disposable PGlite databases. The first six applied on fresh local **PostgreSQL 17.11** startup; the café migration applied to that populated instance on 6 November while preserving all 48 Auth accounts and 45 profiles. Its migration history matches all seven files. Real `db lint` completed with **27 warnings and no errors**, concerning STABLE routines that call VOLATILE helpers and implicit text-to-JSONB initializers. Broader staged upgrades and restore drills remain unverified.

### Import the first café

After inspecting the upgraded database, use its actual UUID:

```sh
npm run menu:import -- --cafe nescafe-iust --instance YOUR_INSPECTED_INSTANCE_UUID
```

The command loads the checked-in manifest and photographs into the configured local database and records one operator audit. The import is atomic; a matching rerun preserves existing records and staff changes. It is independent of development fixtures and administrator bootstrap. This checkout’s NESCAFÉ import has already completed. Open **http://localhost:5173/canteen-prices**; use [café maintenance](cafes.md) for subsequent changes or SQL export.

## 3. Serve the image functions

`npm run edge:prepare` copies the pinned decoder to ignored `supabase/functions/_shared/magick.wasm`. Run it after `npm ci` and before serving or deploying the gateway. The static WASM file is declared in `supabase/config.toml`; the Deno import map pins both dependencies.

`npm run connect:local` already creates an independent random cleanup token in `.env.functions.local`. For manual configuration instead, generate a token of at least 32 random characters, for example:

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"
```

For manual configuration, create ignored `.env.functions.local` and keep the generated token private:

```dotenv
APP_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ASSET_CLEANUP_SECRET=REPLACE_WITH_THE_GENERATED_RANDOM_TOKEN
```

In a separate terminal:

```sh
npx supabase functions serve --env-file .env.functions.local
```

The runtime supplies `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`. These are server-side only. `APP_ALLOWED_ORIGINS` is an exact, comma-separated origin allowlist, without paths or trailing slashes.

Both functions deliberately set `verify_jwt=false`:

- `asset-gateway` validates user bearer tokens with Auth `getUser`, then asks service-only SQL to authorize that viewer. Anonymous reads must independently satisfy public-profile/audience rules. Processing requires an authenticated owner.
- `asset-cleanup` accepts only its separate cleanup bearer secret. A user JWT or a public API key is not its authorization.

The gateway accepts JPEG/PNG/WebP up to 5 MiB, 4096 pixels per side and 16 megapixels, rejects animation, strips metadata and returns normalized WebP. See [asset operations](operations.md#uploads-and-cleanup) for retries, retention and scheduling.

## 4. Auth, email and the first administrator

Local configuration enables signup and email confirmation, a minimum 12-character password and secure email-change confirmation. The CLI 3 configuration uses `[local_smtp]` and `[auth.email] enabled = true`.

To deliver confirmation and recovery emails to real inboxes through **Gmail**, run `npm run email:setup`. It prompts privately for the sending address and Google app password, checks SMTP and sends a setup message before saving `supabase/.env.local`. Restart Supabase and the Edge Functions terminal afterward. Follow [Gmail account-email setup](email.md) for the full procedure. Until that setup is completed, messages go to the local mailbox. The authentication templates are in `supabase/templates/`.

Allowed local Auth URLs are:

- Site URL: `http://localhost:5173`
- Callback: `http://localhost:5173/auth/callback` and `http://127.0.0.1:5173/auth/callback`
- Recovery: `http://localhost:5173/recover-account` and `http://127.0.0.1:5173/recover-account`

The browser SDK uses **PKCE**, automatic callback detection and the `iust-connect-auth` session key. Open confirmation/recovery links in the browser and application origin that requested them; PKCE needs that browser's verifier. `next` return paths are restricted to local application paths.

### Your own profile and photos

1. Open `http://localhost:5173/sign-up` and create an application account.
2. Find its confirmation message in your real inbox if Gmail has been enabled, otherwise at `http://127.0.0.1:54324`. Open the link in the same browser. The local mailbox captures messages even for real email addresses until SMTP is enabled.
3. Choose **Complete my profile**, enter your name and bio, and use **Upload your photo**. You can also add portfolio descriptions, links and images.
4. Click **Save draft** and **Preview saved profile**. The draft and images survive reloads and signing in from another browser. Photo audience defaults to **Only me**.

Use a separate ordinary account for your own photograph; sample accounts deliberately use initials. Genuine academic/skill references are not configured yet, so leave those choices blank and save a draft. Publication awaits source-backed reference data and independent eligibility/content review. Real local signup, confirmation, photo/portfolio uploads, two-context persistence and password recovery passed on 4 November.

### Appoint the first administrator

1. Register the owner-approved initial administrator through `/sign-up`.
2. Open the local mailbox URL reported by CLI status and complete email confirmation. On a hosted project, configure real SMTP and exact HTTPS redirects first.
3. Inspect the exact Auth UUID and email using local Studio or a read-only query. Auth confirmation and university eligibility remain separate. Local Mailpit confirmation does not establish ownership of an external mailbox.
4. Execute the first-admin operator script below against the inspected database.

### Transaction-local operator settings

Operator SQL is outside the automatic migration path. Its `iust.operator.*` settings must be set **in the same transaction and connection** as the script. Running `set_config(..., true)` in one CLI invocation and the script in another will not work.

This PowerShell example assembles one transaction from the checked-in script. Replace every `YOUR_...` value with the inspected/approved value; the UUID/email checks are exact.

```powershell
New-Item -ItemType Directory -Force .dev-seed | Out-Null
$settings = @'
begin;
select set_config('iust.operator.confirm', 'IUST_CONNECT_FIRST_ADMIN', true);
select set_config('iust.operator.instance_id', 'YOUR_INSPECTED_INSTANCE_UUID', true);
select set_config('iust.operator.user_id', 'YOUR_CONFIRMED_AUTH_UUID', true);
select set_config('iust.operator.email', 'YOUR_EXACT_CONFIRMED_EMAIL', true);
select set_config('iust.operator.label', 'YOUR_OPERATOR_LABEL', true);
select set_config('iust.operator.reason', 'YOUR_RECORDED_BOOTSTRAP_REASON', true);
'@
$sql = $settings + "`n" + (Get-Content -Raw supabase/operator/bootstrap-admin.sql) + "`ncommit;"
[IO.File]::WriteAllText((Join-Path (Get-Location) '.dev-seed/bootstrap-admin.sql'), $sql)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-Content -Raw .dev-seed/bootstrap-admin.sql | docker exec -i supabase_db_iust-connect-local psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Administrator bootstrap failed; inspect the database before retrying.' }
```

Use SQL string escaping for any apostrophe in an actual setting. Review the assembled file and positively identify `supabase_db_iust-connect-local` before execution. This `psql` command executes the whole file in one connection; CLI 3's `db query --file` cannot execute this multi-statement transaction. The script requires a confirmed, active, non-fixture account, grants `admin` and `role_manager`, and records an operator audit event. A matching rerun is idempotent; it refuses a different bootstrap once genuine privileged accounts exist. It does **not** change eligibility.

For an approved hosted target, use the reviewed SQL with a verified TLS `psql` connection to that target instead of this local Docker command. Follow [hosted deployment](operations.md#approved-hosted-deployment) first.

Reload the application or sign in again, then open `/admin`. Use the Roles panel for subsequent assignments. An administrator cannot moderate their own account; another authorized administrator must review their eligibility/profile if they want publication.

Enter owner-supplied academic references and eligibility instructions under Reference data and Settings. Empty catalogues are intentional until this is done. See [source-backed reference entry](operations.md#references-and-discovery).

## 5. Optional local development fixtures

The fixture scripts refuse hosted projects, even hosted development projects. They accept only HTTP loopback (`127.0.0.1`, `localhost` resolving solely to loopback, or `[::1]`) on API port `54321`, with no userinfo, extra path, query or fragment. Credential-bearing requests are restricted to that origin and cannot follow redirects.

First, inspect the local target and opt it into fixtures. This uses a different confirmation from administrator bootstrap:

```powershell
New-Item -ItemType Directory -Force .dev-seed | Out-Null
$settings = @'
begin;
select set_config('iust.operator.confirm', 'IUST_CONNECT_LOCAL_DEVELOPMENT', true);
select set_config('iust.operator.instance_id', 'YOUR_INSPECTED_INSTANCE_UUID', true);
select set_config('iust.operator.label', 'YOUR_OPERATOR_LABEL', true);
select set_config('iust.operator.reason', 'YOUR_LOCAL_FIXTURE_ENABLEMENT_REASON', true);
'@
$sql = $settings + "`n" + (Get-Content -Raw supabase/operator/enable-local-development.sql) + "`ncommit;"
[IO.File]::WriteAllText((Join-Path (Get-Location) '.dev-seed/enable-local-development.sql'), $sql)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-Content -Raw .dev-seed/enable-local-development.sql | docker exec -i supabase_db_iust-connect-local psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Local fixture enablement failed; inspect the database before retrying.' }
npx supabase db query --read-only --file supabase/operator/inspect.sql
```

The database script verifies intent and instance UUID. The operator must also verify that the connection is the local stack. Now set the script-only variables in the terminal where you will seed; these scripts do not load `.env.local`:

```powershell
$env:DEV_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:DEV_SUPABASE_SERVICE_ROLE_KEY = 'YOUR_LOCAL_SERVER_KEY_FROM_STATUS'
$env:DEV_SUPABASE_PUBLISHABLE_KEY = 'YOUR_LOCAL_PUBLIC_KEY_FROM_STATUS'
$env:DEV_EXPECTED_INSTANCE_ID = 'YOUR_INSPECTED_INSTANCE_UUID'
$env:DEV_SEED_CONFIRM = 'IUST_CONNECT_LOCAL_DEVELOPMENT'
npm run seed:dev -- --profiles-only
```

Before writes, the script checks the service-only `dev_fixture_target` response against the expected UUID, application, development mode and enabled flag. SQL independently enforces these conditions. Keep Edge Functions running for your own uploads; a profiles-only seed itself creates no image files.

### What the seed creates

- Batch `ec280977-5d12-4d13-a584-7c44456ee045`: **45 profiles with separate Auth owners**, plus `sample-admin` (46 Auth accounts total).
- Mustafa Shahzad is `member-01`; Hashim is `member-02`. All names, studies, biographies and work are explicitly illustrative.
- Six inclusive skill categories with 61 skills, three labelled example departments/programmes, five graduate profiles and 57 portfolio entries across the 45 profiles.
- Initials, no profile portraits and no contact details. Sample profiles cannot add contacts or upload a portrait through the application.
- **Profiles-only:** the fixture seed creates no food categories, canteens, menu items, offerings, prices or verification evidence. This is the selected fixture scope; the separately imported genuine NESCAFÉ menu is preserved.

The manifest persists `includeCanteens: false`; running `npm run seed:dev` again keeps that choice and the existing account identities. Always pass `--profiles-only` when starting a new profiles-only batch. An explicit `--with-canteens` can add the optional labelled comparison cases to a development batch; reserve those examples for an intentionally chosen test dataset. An existing full-canteen manifest cannot be downgraded by `--profiles-only`; the command requires targeted cleanup first. Genuine café data uses the [menu importer and administrator catalogue](cafes.md), independently of fixtures.

The current seed publishes all 45 profiles through simulated eligibility/moderation. Other moderation states are exercised in the disposable test suites. The sample administrator can manage its sample origin, but cannot change instance settings, manage genuine private content or replace a genuine role holder.

Credentials and progress are stored in ignored **`.dev-seed/accounts.json`** with instance, batch, dataset and per-account hashes. Use the desired account's `email` and `password` for local sign-in; no password is published in source. Completed profiles are preserved on reruns, and matching unfinished work can resume. Do not relabel a sample account as a real person. If fixtures or their manifest do not match, use the targeted cleanup procedure instead of overwriting accounts.

Cleanup, using the same guarded environment:

```sh
npm run cleanup:dev -- --confirm=delete-local-samples
```

It removes only this verified batch, including its Storage bytes and synthetic Auth accounts, preserving genuine same-name people and genuine shared references. It can resume partial failures. Keep fixtures enabled until cleanup finishes; disabling them first causes the production-transition guard to reject the change. Full recovery details are in [operations](operations.md#fixture-cleanup-and-recovery).

## 6. Verification commands

### Disposable SQL, image and browser checks

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run build
```

These need no Supabase credentials or running database. The Node suites replay application SQL in PGlite with minimal Auth/Storage schemas. Image tests execute the real WASM decoder. Playwright launches controlled Vite servers on `4173` and `4174`; keep those ports free. HTTP/Auth/Storage are explicitly doubled and unexpected external requests are blocked. There is no application mock-data mode.

The latest complete run on **6 November** passed **68 Node tests and 28 Chromium tests**, including import rollback/idempotency, published-menu filters, photo credits/fallbacks and administrator price replacement/republication. Lint and production build also passed.

Browser results and screenshots are in ignored `playwright-report/` and `test-results/`. Open the report with `npx playwright show-report`. The reduced-motion test intentionally produces Motion's development warning about reduced motion.

### Real local integration

With migrations, Edge Functions and matching completed fixtures ready, retain the `DEV_...` environment above and run:

```sh
npm run test:integration -- --confirm=exercise-local-fixtures
```

This command has **no mock fallback**. It signs in `sample-admin`, `member-44` and two sessions of `member-45`, checks ordinary PostgREST/Storage denials, writes three portfolio audiences, uploads/processes an image and exercises moderation/public reads. Current-first price checks run only for a full-canteen manifest and are explicitly skipped for profiles-only. It temporarily edits `member-45`, restores its original content and publication, advances version/audit history and queues the image for cleanup. Avoid concurrent edits to these accounts; a version conflict stops automatic restoration rather than overwriting another edit.

The confirmed real integration run **passed on 4 November**, and its temporary image was cleaned. A separate ordinary-account browser check also passed signup, local confirmation, photo/portfolio uploads, reloads, two browser contexts, sign-out/in and password recovery. Its two temporary accounts and both images were removed using their exact inspected identities; audit/receipt records and asset tombstones remain. On **6 November**, real local branded confirmation/resend, reused-link rejection and password recovery also passed; that temporary account and its three messages were cleaned. Real time-expired links, secure email changes and external Gmail delivery remain to be checked.

Run the cleanup worker after future integration checks. Fixture sign-in alone does not test email delivery; continue to exercise the real mailbox/browser flows after Auth configuration changes.

The real café import was also checked on 6 November: 30 exact source amounts and photo records, one import audit after a matching rerun, unchanged account/profile hashes, anonymous administrator denial and comparison exclusion. The live menu passed at 360px and 1440px with 30 cards, 31 loaded images, working budget/sort/reload controls and no page/HTTP errors or horizontal overflow. These café checks used the real local PostgREST service; see [the café verification record](implementation-report.md#café-menu-update-6-november-2026).

For real fresh replay, staged upgrades, backup/restore and hosted setup, continue with [operations](operations.md).
