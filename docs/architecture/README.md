# IUST Connect — repository audit and implementation architecture

Historical architecture baseline. See [the implementation report](../implementation-report.md) for the implemented IUST Orbit application and current verification.

**Review date:** 3 November 2026

**Source baseline:** `749d448021be6002037c5a25cf865eea422c54ca`

**Repository:** [HaadiDanger/Semester-Project-1](https://github.com/HaadiDanger/Semester-Project-1)

## Executive summary

IUST Connect has a reusable, visually complete frontend demonstration. Keep its React/Vite/JavaScript foundation, dark palette, fluid desktop layouts, components, and existing animation behavior. Its profile publishing currently writes only to localStorage; authentication, a database, moderation, uploads to a server, and canteen comparison are absent from the inspected source.

The recommended first release uses Supabase Auth, PostgreSQL with Row Level Security (RLS), private Storage, and a small asset-processing Edge Function. Talent discovery remains the primary experience. Canteen Prices is a separate page with correctly matched portions, append-only price history, and independently recorded verification events.

The main product defaults are campus-only discovery, email confirmation plus separate manual eligibility review, and a simple moderation lifecycle: changing an approved profile's content returns it to a hidden draft until reviewed again. Narrow privacy reductions preserve approval of the unchanged remaining content. These defaults avoid exposing unreviewed changes or building a revision-management system prematurely. Official eligibility rules, academic reference data, administrators, canteen sources, and the deployment target still need the owner's decisions.

This package is an **architecture deliverable**. Its schemas, policies, functions, paths marked proposed, and acceptance tests are specifications for later implementation. SQL examples are **proposed and unexecuted**, not tested migrations. The master coding prompt has not been executed.

## Deliverables A–I

| Deliverable | Document |
| --- | --- |
| A. Refined product requirements | [Product and architecture](01-product-and-architecture.md#a-refined-product-requirements) |
| B. Technical architecture | [Product and architecture](01-product-and-architecture.md#b-technical-architecture) |
| C. Normalized Supabase schema | [Data and authorization](02-data-and-authorization.md#c-recommended-normalized-supabase-schema) |
| D. Authorization, RLS, and Storage | [Data and authorization](02-data-and-authorization.md#d-authorization-and-rls-design) |
| E. Migration and implementation sequence | [Delivery and validation](03-delivery-and-validation.md#e-migration-and-implementation-sequence) |
| F. Development-data plan | [Delivery and validation](03-delivery-and-validation.md#f-development-data-plan) |
| G. Standalone MASTER CODING PROMPT | [Copy-ready prompt](MASTER-CODING-PROMPT.md) |
| H. Testing and acceptance checklist | [Delivery and validation](03-delivery-and-validation.md#h-testing-and-acceptance-checklist) |
| I. Decisions requiring owner input | [Delivery and validation](03-delivery-and-validation.md#i-decisions-requiring-owner-input) |

The files form one review. The master prompt also repeats the necessary contracts so it can be used independently.

## Source-inspection gate and evidence level

- **Observed:** The current workspace source is accessible. The inspected project root is the directory containing `package.json`, `package-lock.json`, `index.html`, `vite.config.js`, `src/`, and `public/`—the inner `IUST-Connect-Desktop-v3` directory in the downloaded project. This review uses that repository, rather than claiming to have inspected a newly attached ZIP.
- **Observed:** The working tree was clean on `main`, tracking `origin/main`, at the baseline commit above. There were 64 tracked files. No applicable `AGENTS.md` was found in the workspace or its ancestor directories during this review.
- **Observed:** All application JavaScript/JSX files, application CSS, configuration, package manifests and lockfile entries, asset references, README, asset notes, and saved verification reports were inspected. Generated `dist/` and installed `node_modules/` are excluded by `.gitignore` and are not authoritative application source.
- **Observed, previously executed in this same session:** `npm run build` passed at this source baseline, using Vite 8.3.2; `npm run lint` exited successfully with the existing `react(only-export-components)` warning at `src/context/AppContext.jsx:64`. These were run during the preceding GitHub publication task.
- **Observed documentation, not independently rerun browser proof:** `VERIFICATION.md:1–29`, `verification-results.json`, `desktop-layout-results.json`, and `editor-layout-results.json` describe earlier Chromium/layout checks. Their assertions are useful baseline evidence, not an executable regression suite or proof of the proposed backend.
- **Not runtime-verified by this architecture review:** Current browser interactions, security properties, Supabase behavior, SQL examples, deployment, and the proposed feature flows. Static inspection establishes what code says, not that every path works.

Throughout this package, **Observed** means supported by inspected source; **Inferred** means an interpretation needing validation; **Recommended** means a proposed design; **Decision required** means an owner choice. All architecture sections after the repository assessment are recommendations unless explicitly marked mandatory by the brief or unresolved.

## Evidence-based repository assessment

### 1. Existing functionality worth preserving

| Observed feature | Source evidence | Preservation requirement |
| --- | --- | --- |
| Home, discovery anchor, individual profile, and profile editor | `src/App.jsx:11–21`; `src/pages/HomePage.jsx:12–40`; `StudentPage.jsx:4–10`; `MyProfilePage.jsx:6–12` | Keep the page structure and `/`, `/#discover`, `/student/:id`, `/my-profile` route shapes. |
| Dark charcoal, mint, and lavender visual identity | `src/index.css:1–16`, `24–89` | Reuse tokens, borders, radii, typography, surfaces, and spacing. |
| Fluid desktop gutters, adaptive directory, two-column editor | `src/index.css:108–160` | Preserve desktop proportions and the existing mobile stack. |
| Search, combined filters, reset and empty state | `HomePage.jsx:16–36`; `src/utils/filterProfiles.js:1–41` | Retain understandable filter feedback while moving selection to bounded database queries. |
| Reusable profile, portfolio, avatar, search, form-field and toast components | `src/components/`; notably `ProfileForm.jsx:275–284` and `Avatar.jsx:1–7` | Extend these components rather than introducing a replacement design system. |
| Skip link, focus styles, named form controls, live feedback, reduced-motion handling | `App.jsx:19–21`; `src/index.css:8,16,106`; `SearchBar.jsx:3–7`; `Toast.jsx:3` | Preserve accessibility behavior and verify new dialogs and async states. |
| Local fonts and code-drawn neutral artwork | `src/fonts.css:1–56`; `ASSET-NOTES.md:7`; `public/fonts/*-OFL.txt` | Keep font licenses and neutral assets; avoid unnecessary external asset requests. |

### 2. Implemented behavior requiring modification

| Observed implementation | Evidence | Required change |
| --- | --- | --- |
| Local-only profile publishing | `AppContext.persistPublished`, `src/context/AppContext.jsx:28–49`; `src/utils/storage.js:1–69` | Replace authoritative localStorage and merged mock arrays with owned database rows and moderation. |
| One editable portfolio entry, despite multiple entries being rendered | `ProfileForm.updateProject:17–26`, `project:84`; `ProfileView.jsx:10,18` | Implement a genuine collection editor with stable database IDs and multiple entries. Editing must not truncate other entries. |
| Unbounded image-to-data-URL conversion | `ProfileForm.handlePhoto:47–62`, file input `:95` | Replace with restricted, server-validated private uploads. |
| Programme and department selected independently; graduate represented as a year string | `src/data/profiles.js:1–21`; `ProfileForm.jsx:6,117–162` | Programme owns its department and academic-stage scheme; graduate status is separate. Existing lists are unverified demo content. |
| Free-text, case-sensitive skill deduplication | `ProfileForm.addSkill:29–38`; `filterProfiles.js:38–41` | Use database taxonomy, canonical normalization, aliases, and reviewed missing-skill requests. |
| Entire profile collection downloaded from an imported array and filtered in memory | `AppContext.jsx:1–3,46–49`; `HomePage.jsx:20–24` | Use server-side filtering, stable pagination, visible-result-only responses. |
| Hero explicitly looks up two fictional slugs | `Hero.jsx:7` | Use a bounded, authorized spotlight result or neutral artwork when inaccessible/empty. Preserve wrapper animations and card geometry. |
| Fictional profiles use ten bundled stock photos and one AI-generated portrait | `src/data/profiles.js:23–270`; `ASSET-NOTES.md:3–22` | During implementation replace all fictional faces with neutral artwork/initials; inspect shared references before deleting assets. |
| Portfolio links are rendered without scheme validation | `PortfolioCard.jsx:4`; `ProfileForm.jsx:246–252` | Enforce HTTPS links in both database write validation and rendering. Keep `noopener noreferrer`. |
| Every non-owner profile is labelled demo, ownership relies on a client flag | `ProfileView.jsx:13–15`; `ProfileCard.jsx:8` | Derive ownership from session subject and sample labels from protected seed markers. |
| Footer and editor accurately describe the present demo | `App.jsx:19`; `MyProfilePage.jsx:11` | Update copy only as corresponding backend flows become real; preserve honest prototype/non-official positioning. |

### 3. Missing functionality

**Observed absence in the tracked application:** Supabase client/configuration, Auth/session handling, backend endpoints, migrations, RLS, administrative roles, moderation/reports, real portfolio uploads, contact privacy, graduate eligibility, database-driven taxonomy, pagination, canteen entities/comparison/history/verification, an admin area, and runnable application tests. No `supabase` dependency or backend call appears in the inspected app. A demo profile mentioning Firebase is biography text (`src/data/profiles.js:259`), not a Firebase integration.

The Connect button only emits “Connection feature coming soon.” (`ProfileView.jsx:15`). It is simulated feedback, not a connection or messaging service.

### 4. Frontend and architectural risks

- **Observed:** `ProfileForm` initializes React state from props only once (`:9`). Loading a profile asynchronously requires delaying the populated form's first mount or carefully resetting by profile ID/version; otherwise stale drafts can appear or current typing can be overwritten.
- **Observed:** `.profile-form > :nth-child(...)` determines desktop grid placement (`src/index.css:151–159`). Adding sections can silently put fields in the wrong grid areas. Replace positional selectors with equivalent named section classes as part of extending this form, and verify unchanged geometry.
- **Observed:** `src/App.css` is not imported by the inspected entry graph; its old template selectors include `.hero`. Accidentally importing it could conflict with the actual design. Treat it as potential historical work, not a deletion instruction.
- **Observed:** No length limits, graduate validation, robust external-URL validation, or upload size cap exist in the current form. Browser-only validation would be bypassable once an API exists.
- **Observed:** Draft reads catch JSON parse errors but do not validate the returned object shape (`storage.js:25–43`). Do not automatically import old localStorage records into genuine accounts.
- **Inferred:** Live data, session refreshes, and loading-state remounts are the largest animation-regression risk. Stable IDs and component lifetimes are part of the preservation contract below.
- **Inferred:** No host configuration currently demonstrates fallback handling for `BrowserRouter` deep links. A static build alone will not configure deployment routing.

### 5. Important database decisions

**Recommended:** One profile per Auth account; independent account restrictions; programme-derived department; protected moderation state; database-normalized skills; row-based contact privacy; transactional, version-checked profile writes; private assets; exact portion identities; append-only price and verification events; and SQL authorization shared across read paths and RPCs.

**Decision required:** Real student/graduate eligibility and reference data, campus-only versus public readership, removal/retention, verified price sources, and the named deployment project. See deliverable I for prioritized questions and nonblocking defaults.

### 6. Security and privacy concerns

The current demo has no genuine access-control boundary. Adding Auth without RLS would not establish one. Email confirmation proves control of an email address, not IUST affiliation; profile approval is content moderation, not identity certification. Never trust `isUser`, `isPublished`, editable Auth metadata, URL paths, React route guards, or hidden UI controls as authorization.

`.gitignore:1–24` excludes `*.local`, dependencies and build output, but not general `.env` or `.env.production` files. Later implementation must add appropriate environment exclusions before introducing credentials. No secret file was found in the initial workspace inspection; this is not a claim of a comprehensive secret audit.

### 7. Postpone

Chat, payments, service-order workflows, recommendations, ratings, social feeds, societies/events modules, native desktop packaging, public SEO profile pages, a full profile-revision system, multi-currency conversion, unknown-portion price normalization, scheduled/backdated price activation, user-uploaded active documents, and external search infrastructure. Services/interests text and a normalized skills model leave room for later collaboration features without creating these systems now.

## Repository inventory

### Actual stack and locked dependencies

The project uses JavaScript/JSX and ES modules (`package.json:5`), not TypeScript. Type declaration packages do not change that. npm lockfile format is 3 (`package-lock.json:4`). Requested ranges and the resolved lockfile differ in several places; preserve the lockfile rather than silently upgrading.

| Package | Manifest range | Locked version | Lockfile entry line |
| --- | --- | --- | --- |
| `react` | `^19.2.8` | `19.3.0` | 1790 |
| `react-dom` | `^19.2.8` | `19.3.0` | 1799 |
| `react-router-dom` | `^7.18.4` | `7.18.4` | 1833 |
| `framer-motion` | `^14.0.0` | `14.0.0` | 1317 |
| `lucide-react` | `^1.51.0` | `1.51.0` | 1633 |
| `tailwindcss` | `^4.3.3` | `4.3.3` | 1905 |
| `@tailwindcss/vite` | `^4.3.3` | `4.3.3` | 1190 |
| `@vitejs/plugin-react` | `^6.1.1` | `6.1.1` | 1225 |
| `vite` | `^8.3.0` | `8.3.2` | 1949 |
| `oxlint` | `^1.81.0` | `1.86.0` | 1692 |
| `@types/react` | `^19.2.18` | `19.3.0` | 1205 |
| `@types/react-dom` | `^19.2.7` | `19.3.0` | 1215 |

Evidence: `package.json:1–28` and the corresponding `package-lock.json` entries. The package's placeholder name is `web-project-skill`; its `private: true` is an npm publishing setting, not GitHub visibility or application privacy. The repository is public. `README.md:7` recommends Node 22.12+; maintain that compatible baseline.

### Entry points, routes, components, and tools

| Area | Observed structure |
| --- | --- |
| Browser entry | `index.html:12–13` → `src/main.jsx:1–10`, `StrictMode`, `createRoot` → `src/App.jsx` |
| Root providers | `MotionConfig reducedMotion="user"` → `AppProvider` → `BrowserRouter` (`App.jsx:21`) |
| Routes | `/` → `HomePage`; `/student/:id` → `StudentPage`; `/my-profile` → `MyProfilePage`; wildcard → `/` (`App.jsx:15`). `/#discover` is a hash anchor, not a distinct route. |
| Layout | `Layout`, skip link, `Navbar`, animated route wrapper, `Brand` footer, `Toast` (`App.jsx:17–21`) |
| Discovery | `Hero`, `FeaturedProfileCard`, `SearchBar`, `FilterBar`, `ProfileCard`, `SkillTag` (`HomePage.jsx:5–11,29–39`) |
| Profile | `ProfileView`, `Avatar`, `PortfolioCard`; editor `ProfileForm` with local `Field` helper |
| State | React context for local published profile/toasts; component `useState`/`useMemo`; no separate state library |
| Data | Eleven `demoProfiles`; static department/programme arrays; localStorage keys `iust-connect-draft`, `iust-connect-published` |
| Styling | `src/main.jsx:3` imports `src/index.css`; it imports local `fonts.css` and Tailwind v4. Custom classes and utilities coexist. Vite plugins are React and Tailwind (`vite.config.js:1–7`). |
| Assets | `public/images`, `public/fonts`, favicon; hero uses profile images, not the apparently unreferenced `src/assets/hero.png` |
| Build/lint | `dev`, `build`, `lint`, `preview` npm scripts (`package.json:6–10`); Oxlint hook rule error and Fast Refresh warning (`.oxlintrc.json:3–6`) |
| Testing/CI | Saved Markdown/JSON verification reports; no test script, test files, or tracked CI workflow |

## Animation preservation ledger

All values below are **observed**. Durations/delays are seconds. There are no named `variants`, `whileHover`, `whileTap`, `layout`, or `layoutId` props in the inspected application. There are no existing modal components. Do not invent those as current functionality; inspect again before implementation in case the repository has changed.

| Location | Exact behavior and lifetime |
| --- | --- |
| `src/App.jsx:11–15` | `AnimatePresence mode="wait"`; wrapper key is **`location.pathname`**, not query/hash or a random value. Initial/exit opacity is `0` normally, `1` with reduced motion; animate opacity `1`; duration `.18`, or `0` with reduced motion. Exit finishes before the next route mounts. |
| `src/App.jsx:14` | On pathname/hash changes, scroll to top with `behavior: "instant"` only when there is no hash. |
| `src/App.jsx:21` | Global `MotionConfig reducedMotion="user"`. Do not replace it with `always`/`never`. |
| `Hero.jsx:9` | Text enters with opacity `0 → 1`, `y:14 → 0`, duration `.65`, ease `[.22,1,.36,1]`. |
| `Hero.jsx:16` | Art wrapper opacity `0 → 1`, duration `.8`, delay `.1`. Individual mini cards have stable `person.id` keys (`:18`). |
| `FeaturedProfileCard.jsx:6` | Opacity `0 → 1`, `y:12 → 0` on `whileInView`; viewport `{ once:true, amount:.1 }`; duration `.5`; delay `index*.06`; ease `[.22,1,.36,1]`. Home currently limits spotlight to three. |
| `ProfileCard.jsx:7` | Opacity `0 → 1`, `y:10 → 0` on `whileInView`; viewport `{ once:true, amount:.1 }`; duration `.45`; delay `min(index*.035,.18)`; same ease. Home keys by `person.id` (`HomePage.jsx:36`). |
| `ProfileView.jsx:11` | Inner article opacity `0 → 1`, duration `.35`, in addition to the outer route fade. Portfolio rows currently key by title/index (`:18`); change them to persisted item IDs without remounting the surrounding article. |
| `Navbar.jsx:22–25` | `AnimatePresence` around conditionally mounted mobile `motion.nav`; opacity `0 → 1 → 0`, explicit `.15` transition; closes on link selection and Escape. Preserve actual unmount/exit behavior. |
| `Toast.jsx:3`; `AppContext.jsx:12–16` | `AnimatePresence`; child key is the message; initial opacity `0`, `y:10`; animate opacity `1`, `y:0`; exit opacity `0`; **no explicit transition**, so keep the installed library default. Toast clears after 2,800 ms and a new message resets the timer. |
| `HomePage.jsx:27–28`; `Navbar.jsx:13–14` | Discover scrolling is smooth normally and instant with reduced-motion preference. A hash change does not remount the route wrapper. |
| `src/index.css:12–15,65–66,75` | CSS micro-interactions: buttons lift `-2px` with `.2s` transitions; featured-card border/shadow `.25s`; image hover scale `1.04` with `.65s` transition; ordinary-card border/shadow `.2s`; text-link underline. These are CSS, not Framer Motion hover props. |
| `src/index.css:36–46,106` | Hero sheen is an 18-second infinite CSS animation. Reduced motion changes animation/transition durations to `.01ms`, iterations to one, and smooth scrolling to auto. |

### Behavioral invariants during the data migration

1. Keep route animation boundaries and pathname keys around loading, success, failure, and authorization states. Session refresh or a changed query string must not remount the whole application or replay the hero.
2. Use stable database profile/item IDs for list keys. Retained cards must keep their component identity on filter changes; entering cards use the existing viewport entrance. A page change may mount new cards with the same page-local index delays. Do not key the grid by a loading flag or response timestamp.
3. Keep `once:true` scoped to each card's mount. Preserve existing cards during background refetch, with an explicit refreshing indicator; replace them on a committed filter/page result. Cancel or ignore stale responses. Clear private data immediately on sign-out/access denial.
4. Preserve feature-photo, hero-mini, and avatar dimensions when replacing fictional photos with neutral images/initials. The featured image's CSS hover zoom must still affect the neutral artwork. A same-class neutral SVG `<img>` is a practical equivalent.
5. Keep the hero's animated wrappers mounted while authorized spotlight results arrive. Anonymous/empty states use neutral decorative cards of the same dimensions and reveal no protected identities.
6. Defer mounting a populated editor until its initial database state is ready. Subsequent background responses must not erase unsaved input. A stable profile/version and an explicit conflict flow are preferable to a random remount key.
7. Preserve the mobile-nav exit and toast message-key behavior. New moderation/confirmation dialogs need focus trapping/restoration, Escape handling, stable keys and deliberate entrance/exit under `AnimatePresence`; they are new behavior, not evidence of old modals.
8. Verify computed motion and visible interactions in a browser at normal and reduced-motion settings. An import check or screenshot of a settled page does not prove preservation. Use the ledger plus deliverable H's interaction checks.

## Official documentation checked for the proposed design

The following official Supabase documentation was retrieved during this review on 3 November 2026. It informs recommendations, not repository findings. Recheck versions and CLI help before the later implementation executes commands.

- [RLS, grants, recursive policies, and invoker views](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database function privileges and safe search paths](https://supabase.com/docs/guides/database/functions)
- [Publishable versus privileged API keys](https://supabase.com/docs/guides/api/api-keys)
- [Storage access policies](https://supabase.com/docs/guides/storage/security/access-control)
- [Storage upload limits](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [Private downloads and signed-URL revocation limits](https://supabase.com/docs/guides/storage/serving/downloads)
- [Local Supabase CLI workflow](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Versioned database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Edge Function authentication](https://supabase.com/docs/guides/functions/auth)
- [JavaScript Edge entrypoints](https://supabase.com/docs/guides/functions/function-configuration)
- [WASM image processing and runtime limits](https://supabase.com/docs/guides/functions/examples/image-manipulation)
- [Supabase MCP scoping and read-only parameters](https://supabase.com/docs/guides/getting-started/mcp)

No cloud project, database, Storage bucket, or MCP connection was created or changed by this architecture review.
