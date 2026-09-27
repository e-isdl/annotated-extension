# Annotated

Clip and annotate content from the web. This repository contains the Chrome
extension, public web app, and Supabase project configuration.

## Repository layout

- `src/`, `background.js`, and `content.js` — Chrome extension
- `webapp/` — React/Vite public site deployed to Cloudflare Pages
- `supabase/` — Supabase CLI configuration
- `sql/` — reviewed SQL patches

## Development

Create local environment files from the examples. Never commit them.

```bash
copy .env.example .env
copy webapp/.env.example webapp/.env
```

Build the extension:

```bash
npm ci
npm run build
```

Build the web app:

```bash
cd webapp
npm ci
npm run build
```

## Install the Chrome extension (no coding required)

1. Download `annotated-extension.zip` from the
   [latest release](https://github.com/e-isdl/annotated-extension/releases/latest).
2. Unzip it somewhere permanent, like your Documents folder. Leave the unzipped
   folder there — Chrome loads the extension straight from it.
3. In Chrome, open a new tab and go to `chrome://extensions`.
4. Turn on **Developer mode** using the toggle in the top-right corner.
5. Click **Load unpacked** and pick the unzipped folder (the one that contains
   `manifest.json`).
6. Done! Click the puzzle-piece icon in the Chrome toolbar and pin **Annotated**
   so it stays visible.

To update later, download the new release zip, delete the old folder, and
repeat steps 2–5.

## Working on the extension

Build it, then load this repository's `dist/` directory as described above:

```bash
npm ci
npm run build
```

After every rebuild, click the reload (↻) arrow next to Annotated on
`chrome://extensions` so Chrome picks up the fresh `dist/` files.

## Deployment

The web app is the Cloudflare Pages project `annotated`
(https://annotated4.pages.dev). Cloudflare's GitHub integration builds and
deploys `webapp/` automatically on every push to `master`.
`.github/workflows/deploy-pages.yml` only verifies the build in CI.

Supabase schema changes must be reviewed before applying them to production.

## Links

- Web app: https://annotated4.pages.dev
- Extension releases: https://github.com/e-isdl/annotated-extension/releases
- Issues: https://github.com/e-isdl/annotated-extension/issues

## License

The source code is released under the MIT License. User-generated content and
third-party media remain subject to their own rights and terms.
