# Annotated Community Implementation Plan

This plan follows `docs/annotated-community-product-spec.md` and is optimized
for a convincing public demo before deeper platform work.

## Phase 0 — research and baseline

- Keep the existing Supabase schema and extension intact.
- Treat `webapp/` as the primary product surface.
- Preserve the public GitHub repository and Cloudflare Pages deployment.
- Capture a small set of representative demo posts: article, YouTube, X/social,
  audio, and text discussion.
- Record baseline builds before changing the UI.

Exit check: current production build passes and the app can be launched locally.

## Phase 1 — the Reddit-shaped shell

Build the product frame without changing the backend contract:

- Responsive three-column desktop layout with mobile collapse.
- Left navigation rail with Home, Popular, Latest, Explore, Saved, and joined
  communities.
- Center feed header with feed description and sort controls.
- Right rail with Create prompt, trending communities, and trending sources.
- Updated top bar with search, create, notifications, and profile.
- Demo fallback feed when the database is empty.

Exit check: an anonymous visitor sees a credible, populated community product
on desktop and mobile.

## Phase 2 — post and detail quality

- Redesign `ClipCard` as the annotation post card from the spec.
- Put commentary first and context second.
- Add source domain, source image/screenshot support, media badges, and compact
  action rows.
- Redesign `ClipPage` as the conversation-first detail page.
- Add a sticky/compact context bar when users move into comments.
- Add copy-link/share feedback and a polished not-found state.

Exit check: three different post types look intentional and the detail page
communicates “this is the argument, this is the evidence” immediately.

## Phase 3 — community and creation loop

- Add community catalog and `/c/:community` routes.
- Add join/leave state using a small membership table or a safe local fallback
  until the schema migration is deployed.
- Add a public web create flow with URL metadata fallback.
- Add annotation type selector: Reaction, Fact Check, Explainer, Steelman,
  Receipts.
- On publish, navigate directly to the new permalink.
- Add save/share behavior and user-visible feedback.

Exit check: a new user can discover a community, create a post, and start a
conversation without installing the extension.

## Phase 4 — data model hardening

Add Supabase migrations only after the UI vertical slice is validated:

- `communities`: id, slug, name, description, icon_url, rules, created_by.
- `community_members`: community_id, user_id, role, created_at.
- `post_saves`: clip_id, user_id, created_at.
- `post_types` or an annotation type column on `clips`.
- Source preview fields on `clips`: source_domain, source_image_url,
  source_excerpt, source_snapshot_url, source_metadata.
- RLS policies for public read, authenticated create, owner update/delete,
  member actions, and moderator actions.

Exit check: all write actions are authorized by RLS and the client does not
depend on service-role credentials.

## Phase 5 — bounty demo polish

- Seed a small number of high-quality demo posts in the production database or
  use the clearly labeled demo fallback.
- Prepare three scripted paths:
  1. Article paragraph → reaction → permalink → comments.
  2. YouTube timestamp → transcript/context → discussion.
  3. Social post → preserved source preview → fact-check/receipts thread.
- Remove placeholder copy, broken metadata, dead links, and empty states that
  look unfinished.
- Test sign-in, publish, voting, comments, share, and mobile layout.
- Record a short demo focused on the discussion loop, not implementation
  details.

Exit check: Jason can understand the product and see why it could become a
community destination within the first minute.

## Phase 6 — extension as capture surface

Only after Phases 1–5:

- Add explicit X/social detection.
- Capture article screenshots/metadata.
- Improve YouTube clipping preview and transcript fallback.
- Make the extension publish directly into a selected community.
- Update the success link to the canonical Pages domain.

## Verification gates

For every phase:

- `npm run build` in the repository root extension.
- `npm run build` in `webapp/`.
- Inspect the built app at desktop and mobile widths.
- Confirm no `.env`, service-role key, database password, or provider token is
  committed.
- Test anonymous read access separately from authenticated write access.
- Check direct navigation to `/`, `/clip/:id`, `/c/:community`, `/search`, and
  `/u/:handle` on the deployed Pages URL.
