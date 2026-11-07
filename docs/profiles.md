# Anas Tech

Anas Tech is an owner-requested directory profile with the supplied portrait, a tech-focused introduction, and three skills: **Frontend development**, **Technical troubleshooting**, and **Digital tools**.

- Profile: `http://localhost:5173/student/75cbf346-a3b7-4e17-b9e8-7dbd52f7293e`
- Search: `http://localhost:5173/discover?query=Anas%20Tech`
- Temporary sign-in email: `anas.tech.b88010@example.invalid` — a placeholder, not a working mailbox.
- Generated password: `.profile-imports/anas-tech.json`, ignored by Git and blocked by Vite. The login email is not automatically published as a contact link.

## Import on a fresh local database

Start the configured Supabase stack, apply all migrations with `npx supabase migration up`, and inspect `private.instance_config.instance_id`. Then run:

```sh
npm run profile:import -- --profile anas-tech --instance YOUR_INSPECTED_INSTANCE_UUID --operator YOUR_OPERATOR_LABEL
npm run edge:prepare
npx supabase functions serve --env-file .env.functions.local
```

In another terminal, run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.

The import creates a separate ordinary Auth account, uploads the normalized photo to private `profile-media` storage, and atomically adds the profile, skill references, operator-attributed directory approval and import audit. It does not send an email. Programme and semester fields stay empty because those details were not supplied. The site uses its existing discovery, profile and permission-checked image APIs to display the entry.

Matching reruns preserve the account, photo, owner edits and visibility. A partial Auth/Storage attempt can be retried; a completed import is never used to overwrite later content. Conflicting accounts, profiles, photos, reference data or manifests stop the import. The command accepts only the configured local stack and the inspected instance UUID.

## Content and photo source

- [`scripts/data/profiles/anas-tech.json`](../scripts/data/profiles/anas-tech.json): name, requested tech copy, temporary email, skills, fixed identities and photo/source hashes.
- [`scripts/data/profiles/anas-tech.webp`](../scripts/data/profiles/anas-tech.webp): the original user-supplied portrait converted to WebP, auto-oriented and stripped of metadata; **888 × 1280**, **134,518 bytes**.
- [`scripts/import-profile.mjs`](../scripts/import-profile.mjs): repeatable local Auth/Storage/database import.
- [`supabase/migrations/202611070001_operator_profile_imports.sql`](../supabase/migrations/202611070001_operator_profile_imports.sql): records operator attribution without assigning a fictitious signed-in reviewer or granting administrator roles.

The original photo was provided on **7 November 2026**. The repository owner requested the name, photo, tech-focused description and temporary email. No academic credentials, completed projects or external contact details were supplied.

After importing, maintain content in **My profile** using the generated sign-in. Normal owner edits return the profile to a draft, and later self-service submission uses the site's existing programme/skill requirements. Ordinary moderation, unpublishing, deletion requests, audience changes and email-change eligibility resets continue to apply. Replace the temporary email through Supabase Auth when the real owner email is available.

## Verification (7 November 2026)

- Applied all eight migrations and imported the profile into local instance `43bbe85a-f1a8-403a-8776-ee2a5a57d87f`, attributed to `github:HaadiDanger`. Existing account, profile and café-menu digests were preserved.
- All **72 Node tests**, lint and the production build passed. The four profile-import tests cover discovery/media access, operator attribution, owner edits, conflict rollback, shared-skill reuse, reruns and later eligibility changes.
- Live discovery returned exactly one Anas Tech result. The discovery card and detail page passed at **360px and 1440px**, with no horizontal overflow or page/HTTP errors. Loaded portrait bytes matched the checked-in WebP SHA-256 exactly.
- Temporary sign-in, the populated owner editor, reload, sign-out and subsequent public access passed. A matching import rerun preserved the account, profile, skill links, moderation, photo metadata/Storage object, audit and local credentials.
- All four direct/raw/URL-module/absolute-path credential-file requests returned **403**. Sanitized live results and desktop/mobile screenshots are retained locally in ignored `.profile-imports/`.
