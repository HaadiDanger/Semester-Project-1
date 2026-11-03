# IUST Connect

A browser-only campus networking prototype built with React, Vite, Tailwind CSS and Framer Motion.

## Run locally

Use Node.js 22.12 or newer (Node.js 24 is also suitable). Open a terminal in this folder:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To build and preview:

```sh
npm run build
npm run preview
```

The archive deliberately excludes node_modules. Install dependencies on the computer where you will run it.

## What changed in this edition

- Dark charcoal surfaces, soft mint accents and lavender highlights throughout the site.
- Full-width layered teal/violet gradient hero background with a subtle sheen.
- New hero composition, typographic hierarchy, profile cards and community directory.
- Consistent profile detail pages and editor styling.
- Fluid desktop layouts with small side gutters, proportional hero artwork, adaptive directory columns and a two-column desktop editor.
- Responsive navigation, filters and layouts, visible keyboard focus, named search inputs, accessible toast feedback and reduced-motion support.
- Hiba Naseer's old stock photo replaced with a bundled, AI-generated fictional student portrait.
- Avatar fallback now retries when the image source changes.
- Clear-filter control, visible result count, edit-profile shortcut and empty portfolio state.

The original local draft/publish behavior, profile data, combined search/filter logic, routes, portfolio links and placeholder Connect action are retained. This UI update is not a full implementation of all findings in the earlier audit.

## Prototype data

Eleven sample profiles are provided. Their names, biographies and projects are demo content, not verified university directory entries. A custom profile and its draft are saved only in this browser's localStorage. Publishing does not send data to a server or make a profile visible on other devices. Connect remains a coming-soon action. Existing saved data keys are unchanged.

No authentication, database or backend is required. Use sample information on shared computers. Clear the two localStorage entries `iust-connect-draft` and `iust-connect-published` to reset your local profile.

## Images and typography

Hiba's bundled asset: `public/images/hiba-naseer.png`. Created with the built-in image generation tool for this fictional demo profile; it is not a photograph of an identified real student.

Generation prompt: "Use case: photorealistic-natural. Asset: square profile portrait for a fictional student called Hiba in a university networking demo. Create a natural, professional head-and-shoulders photograph of a fictional adult South Asian woman age 22, modest sage-green kurta, loosely draped ivory headscarf, friendly confident expression, looking toward camera. Soft out-of-focus campus greenery and warm stone background, soft daylight, authentic skin texture, understated academic portrait rather than glamour photography. Centered face and shoulders with safe space for circular avatar crops. No text, logos, watermarks or additional people."

Other profile images are bundled copies of the original Unsplash assets; their original URLs are documented in ASSET-NOTES.md. A local neutral illustration is used if a hero/featured image cannot load; directory avatars fall back to initials. Outfit and Fraunces Latin font files are bundled locally, with system fallbacks.

## Deployment

Run `npm run build` and host the generated `dist` folder. Configure the host to serve `index.html` for application routes such as `/my-profile` and `/student/hiba-naseer`. This project assumes hosting at the domain root. No site has been published as part of this update.

## Desktop layout update (v3)

The main desktop layout uses fluid 2.5vw side gutters (24–64px) instead of the old 1184px maximum width. Hero artwork, headings and spotlight cards scale with the viewport. The directory adds columns as room becomes available, and the profile editor uses a two-column layout on desktop. The dark palette, full-width hero gradient, Hiba portrait and existing prototype flows are retained.
