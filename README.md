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

## Extension installation

1. Build the extension with `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Select **Load unpacked** and choose this repository directory.

## Deployment

The production Pages project is `annotated`. Cloudflare deployment is handled
by `.github/workflows/deploy-pages.yml` after these GitHub Actions secrets are
configured:

- `CLOUDFLARE_API_TOKEN` — scoped to the Pages project/account
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID

Supabase schema changes must be reviewed before applying them to production.

## Links

- Web app: https://annotated-2ec.pages.dev
- Issues: https://github.com/e-isdl/annotated-extension/issues

## License

The source code is released under the MIT License. User-generated content and
third-party media remain subject to their own rights and terms.
