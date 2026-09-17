# Annotated repository guidance

## Project layout

- The Chrome extension is the repository root application.
- `webapp/` is the public React/Vite site deployed to Cloudflare Pages.
- `supabase/` contains local Supabase CLI configuration.
- `sql/` contains reviewed SQL patches and security changes.

## Required checks

Before committing application changes, run:

```bash
npm ci
npm run build
cd webapp
npm ci
npm run build
```

Never commit `.env`, `.env.*` files, Supabase `.temp` files, service-role keys, database passwords, or deployment tokens.

## Production rules

- Treat the `annotated` Cloudflare Pages project and the linked Supabase project as production.
- Do not run `supabase db push`, delete data, rotate secrets, or deploy production changes without explicitly reporting the change first.
- Keep public frontend environment variables limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never put `service_role`, database passwords, or provider API tokens in a `VITE_*` variable.
