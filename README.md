# IUST Orbit

A Supabase-backed campus directory, portfolio and café-menu application with canteen comparisons, built with React, Vite, JavaScript, Tailwind CSS and Framer Motion.

The original charcoal, mint and lavender design, fluid desktop proportions, two-column editor and motion timings are retained. Fictional portraits have been replaced with initials and neutral artwork.

## Run the local application

The local setup, verified on **6 November 2026**, has **45 labelled sample profiles** and **NESCAFÉ IUST’s 30-item menu**. Café names, menu items and prices are stored in Supabase, alongside profile/photo/portfolio data. Keep Docker Desktop running and use Node.js 24.

For this configured checkout, restart from the repository root. In one terminal:

```sh
npx supabase start
npm run edge:prepare
npx supabase functions serve --env-file .env.functions.local
```

In a second terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://localhost:5173**. Supabase retains the database between restarts. For a fresh checkout, run `npm ci` and follow **[Local Supabase setup](docs/setup.md)** to inspect the database and generate the ignored configuration with `npm run connect:local`.

### Browse NESCAFÉ IUST

Open **http://localhost:5173/canteen-prices** for **30 items in four sections**, priced **₹15–₹120**, with category/search/budget filters and price sorting. Names and amounts were transcribed from the supplied menu-board photograph; all food photographs are real, credited illustrations served locally.

The café is already imported in this checkout’s local database. On a fresh database, apply all seven migrations, inspect the instance UUID and run:

```sh
npm run menu:import -- --cafe nescafe-iust --instance YOUR_INSPECTED_INSTANCE_UUID
```

See **[Café setup and maintenance](docs/cafes.md)** for the source record, repeatable import, publication controls and photograph workflow. Exact-portion comparisons are at `/canteen-prices?view=compare`; menu-board listings identify the supplied prices without assuming an observation date or serving size.

### Send account emails with Gmail

Run **`npm run email:setup`** and enter your Gmail address and a [Google app password](https://myaccount.google.com/apppasswords) in the private terminal prompts. The command verifies Gmail, sends a test email to that address and saves server-side SMTP settings. Restart Supabase with `npx supabase stop` followed by `npx supabase start`, then restart the Edge Functions terminal. Signup confirmations and password-reset emails will use Gmail. See **[Gmail email setup](docs/email.md)** for the complete steps and delivery checks.

### Create your profile and upload photos

1. Open **http://localhost:5173/sign-up** and create your own application account with a password of at least 12 characters.
2. Find your confirmation email in your inbox after Gmail setup, or in the local mailbox at **http://127.0.0.1:54324** before setup. Open its link in the **same browser** where you registered.
3. Go to **My profile**, enter your name/bio, choose **Upload your photo**, and add portfolio entries/images as desired.
4. Click **Save draft**, then **Preview saved profile**. JPEG, PNG and WebP are supported up to 5 MiB and 4096 px per side.

Your draft and uploads can be saved now. Public publication requires genuine academic/skill references and independent eligibility/content review; those references are awaiting owner-supplied data. Sample accounts use initials, so use your own account for your profile photo.

Browser configuration contains only the Supabase URL, publishable/legacy anonymous key and public application URL. Server keys and fixture passwords stay in ignored operator files; Vite denies HTTP access to those files.

For a production bundle and local preview:

```sh
npm run build
npm run preview
```

## Included flows

- Registration, email-confirmation handling, sign-in, recovery and sign-out.
- Auth-owned drafts, up to 12 portfolio entries, optional contact links and per-item/photo audiences.
- Separate campus-eligibility and content review, publication controls, reports and profile-deletion requests.
- Database discovery with combined filters, counts, pagination, spotlight profiles and detail pages.
- Administrator account review, reference editing/merges, role management, settings and audit history.
- Database-backed campus café menus, source-labelled prices, real food-photo credits and administrator publication controls. NESCAFÉ IUST is the first café.
- Exact-portion INR canteen comparisons, append-only price/verification history and private source evidence. Freshness starts at **30 days**.
- Private raster uploads, metadata-stripped WebP processing, permission-checked image streaming and a cleanup worker.
- An opt-in, loopback-only seed of **45 labelled development profiles**, including Mustafa Shahzad and Hashim. It creates 46 fixture Auth accounts including a sample administrator; 45 is a dataset size, not an enrollment limit. `npm run seed:dev -- --profiles-only` creates no canteen fixtures and preserves genuine café data. Ordinary reruns preserve the manifest's saved scope; illustrative comparison cases require a separate explicit opt-in.

Approved, opted-in public profiles, published café menus and qualifying comparison prices support anonymous reads. Real university references and eligibility decisions still need operator input; further cafés are added from supplied menus, one at a time. Contact links replace the former placeholder Connect action; messaging is not implemented.

Profiles are stored in Supabase. Old prototype `iust-connect-draft` and `iust-connect-published` localStorage entries are neither imported nor published; the Supabase sign-in session uses the separate `iust-connect-auth` key.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run build
```

On **6 November**, all **68 Node tests and 28 Chromium checks** passed, along with lint and the production build. The real local database has all **seven migrations** applied; the café import and repeat import preserved existing accounts/profiles. Real PostgREST reads and the live menu at **360px and 1440px** passed with all 31 displayed images loaded and no horizontal overflow or page errors. SQL lint reported **27 warnings and no errors**.

Real local Auth/PostgREST/Storage/Edge integration, profile/portfolio persistence and confirmation/resend/password-recovery flows also passed. See the [implementation report](docs/implementation-report.md) for evidence and remaining acceptance work. Gmail activation remains paused pending sender credentials through `npm run email:setup`.

## Handoff documents

- [Setup and local verification](docs/setup.md)
- [Café menus, imports and maintenance](docs/cafes.md)
- [Gmail account-email setup](docs/email.md)
- [Operations, moderation, retention, recovery and deployment](docs/operations.md)
- [Implementation and verification report](docs/implementation-report.md)
- [Asset provenance and font licenses](ASSET-NOTES.md)
- [Historical architecture package](docs/architecture/README.md)

Implementation branch: [`feat/supabase-campus-platform`](https://github.com/HaadiDanger/Semester-Project-1/tree/feat/supabase-campus-platform), based on `bc5af7d612b9d9481d9bd668c8014c74fb47af73`. The application and Supabase services run locally. A GitHub push publishes the source; database migrations, menu imports and application hosting are separate deployment steps.
