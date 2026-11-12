# IUST Orbit

A Supabase-backed campus directory, portfolio and café-menu application with canteen comparisons, built with React, Vite, JavaScript, Tailwind CSS and Framer Motion.

The soft-dark campus-field-guide identity pairs charcoal green with sage, warm copper and off-white, using Archivo body text and Newsreader headlines. Existing components, routes, interactions and the responsive editor are retained. Two visible CSS orbits, gently moving hero cards, stronger entrances and clearer hover feedback make the motion more apparent; reduced-motion preferences are respected. Fictional portraits remain replaced with initials and neutral artwork. See the [design references and refinement record](docs/implementation-report.md#editorial-refinement-12-november-2026).

## Run the local application

The local setup, checked on **12 November 2026**, has **45 publicly listed sample profiles**, **BREW AND BRINK’s 29-item menu** and **NESCAFÉ IUST’s 30-item menu**. Anas Tech has been removed from public discovery, its profile page and public photo access. Café names, menu items and prices are stored in Supabase, alongside profile/photo/portfolio data. Keep Docker Desktop running and use Node.js 24.

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

### Browse campus cafés

Open **http://localhost:5173/canteen-prices** and use **Choose café**. **BREW AND BRINK** has **29 listings in five sections**, priced **₹15–₹170**, with the supplied Small/Large sizes. **NESCAFÉ IUST** has **30 listings in four sections**, priced **₹15–₹120**. Both support category/search/budget filters and price sorting. Names and amounts come from the supplied menus; food photographs are real, credited illustrations served locally.

Both cafés and NESCAFÉ's four-drink disposable-cup photo update are applied in this checkout's local database. Cappuccino, Cafe Latte, Cafe Mocha and Hot Chocolate use distinct, drink-appropriate photographs; prices and Brew and Brink remain unchanged. On a fresh database, apply all migrations, inspect the instance UUID and run:

```sh
npm run menu:import -- --cafe nescafe-iust --instance YOUR_INSPECTED_INSTANCE_UUID
npm run menu:import -- --cafe brew-and-brink --instance YOUR_INSPECTED_INSTANCE_UUID
npm run menu:import -- --photo-update nescafe-hot-drink-cups --instance YOUR_INSPECTED_INSTANCE_UUID
```

Open **[Compare prices](http://localhost:5173/canteen-prices?view=compare)** to choose two cafés and compare matching published menu items side by side, with lower-price highlights, differences and budget filters. Size variants stay separate and unknown serving quantities are labelled. See **[Café setup and maintenance](docs/cafes.md)** for source records, repeatable imports, publication controls and the photograph workflow.

### Send account emails with Resend

Run **`npm run email:setup:resend`** with a **verified Resend sending domain**, **API key**, and **test-recipient inbox** ready. The command prompts privately for the key, checks Resend, sends a test email and saves server-side SMTP settings. Restart Supabase with `npx supabase stop` followed by `npx supabase start`, then restart the Edge Functions terminal. Signup confirmations and password-reset emails will use Resend. See **[Email setup](docs/email.md)** for domain setup, hosted Supabase settings and delivery checks. Gmail setup is available through `npm run email:setup`.

Resend support is ready; external delivery awaits your sender credentials. Until activation, this local stack captures account emails in its development mailbox.

### Create your profile and upload photos

1. Open **http://localhost:5173/sign-up** and create your own application account with a password of at least 12 characters.
2. Find your confirmation email in your inbox after email setup, or in the local mailbox at **http://127.0.0.1:54324** before setup. Open its link in the **same browser** where you registered.
3. Go to **My profile**, enter your name/bio, choose **Upload your photo**, and add portfolio entries/images as desired.
4. Click **Save draft**, then **Preview saved profile**. JPEG, PNG and WebP are supported up to 5 MiB and 4096 px per side.

Your draft and uploads can be saved now. Normal public submission requires academic details and independent eligibility/content review; official programmes still await owner-supplied data. Sample accounts use initials, so use your own account for your profile photo.

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
- Database-backed campus café menus for BREW AND BRINK and NESCAFÉ IUST, source-labelled prices, real food-photo credits and administrator publication controls.
- Side-by-side published-menu comparisons in INR, café swapping and URL-persisted filters. The exact-portion verification API, append-only price history and private source evidence support administrator checks with **30-day** freshness.
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

On **12 November 2026**, the completed soft-dark and cup-photo changes passed all **86 Node tests**, lint and the production build. The latest full browser run passed **44/45** scenarios; the signup-resend check timed out on a blank page before filling the form, then passed in an **unchanged 1/1 focused rerun**. Thus **45 distinct scenarios passed across those runs**, not one zero-failure post-photo run. Coverage includes enhanced/reduced motion, retained interactions, the populated editor, both café menus and comparisons at **360, 768, 1024, 1440 and 1920px**. Browser regressions use the actual frontend and application SQL with explicitly doubled HTTP/Auth/Storage. Selected solid-surface contrast and delayed-font geometry checks also passed; these are not a complete accessibility or page-load performance audit. Separate, unmocked local Chromium checks confirmed real orbit movement and all four cup photos at desktop/mobile widths. See the [current verification record](docs/implementation-report.md#5-executed-verification).

The earlier **10 November** real-local checks confirmed all **ten migrations**, the three shared menu items, both prices, budget filtering and café swapping; SQL lint reported **32 warnings and no errors**. The visual refinement made no database changes. The separate **12 November** guarded photo transaction changed only four NESCAFÉ listing photo pointers/versions and its cover, inserted missing photo metadata and recorded one audit. Before/after checks confirmed unchanged prices, publication, Brew and Brink, profile/account data and Storage; inventory remains **2 cafés, 59 published listings and 45 public profiles**.

Real local Auth/PostgREST/Storage/Edge integration, profile/portfolio persistence and confirmation/resend/password-recovery flows also passed. See the [implementation report](docs/implementation-report.md) for evidence and remaining acceptance work. External email activation requires sender credentials through [email setup](docs/email.md).

## Handoff documents

- [Setup and local verification](docs/setup.md)
- [Imported profile history and removal](docs/profiles.md)
- [Café menus, imports and maintenance](docs/cafes.md)
- [Resend and Gmail account-email setup](docs/email.md)
- [Operations, moderation, retention, recovery and deployment](docs/operations.md)
- [Implementation and verification report](docs/implementation-report.md)
- [Asset provenance and font licenses](ASSET-NOTES.md)
- [Historical architecture package](docs/architecture/README.md)

Implementation branch: [`feat/supabase-campus-platform`](https://github.com/HaadiDanger/Semester-Project-1/tree/feat/supabase-campus-platform), based on `bc5af7d612b9d9481d9bd668c8014c74fb47af73`. The application and Supabase services run locally. A GitHub push publishes the source; database migrations, menu imports and application hosting are separate deployment steps.
