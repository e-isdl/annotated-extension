# Handoff: YouTube chapters bug (+ repo state)

## UPDATE 2 — latest evidence (read first)
- E2340 badge is back to **8** (was 7): widening the DOM scope restored a real marker. The 7 was a scope cut, not the truth.
- Jeetu Patel video (43:22) badge **8**, and its open chapter sheet (0:00 Cisco's Bet on AI, 3:38 Running Cisco, 6:45 Infrastructure, 10:00 32,000 Engineers, 14:07 Hardware, 17:15 Data Center, 21:27 Overbuilding, 25:10 Building Trust) looks CORRECT for that video.
- Naveen Rao video (22:34, description shows 0:00/4:45/10:24 chapters) badge **8** — correctness unverified.
- So the current code may already be right on fresh loads; every "still wrong" report needs the installed build verified FIRST (`chrome://extensions` → version + Reload), because threads like this one mixed localhost/live/v8–v12 results throughout.
- Current architecture (all committed locally through `d528636`, NOT pushed): single MAIN-world pipeline — player-bound refusal on id mismatch, live player-bar chapter map read FIRST (complete list), scoped DOM markers union in with longest-wins confirmation, structured globals last, description scraping deleted everywhere, per-video cache wipe + poll invariant in the panel. Root suite green.
- `chapter-code-all.txt` (repo root) regenerated from current code: content.js readers + handler, full `src/lib/youtubeChapters.js`, exact `loadChapters`.
- Biggest known hole: NO test or code path can run real YouTube here; everything is vm-simulated DOM/page objects. Whoever takes this needs the user to confirm build + compare against YouTube's own "In this video" panel on the SAME video.


## The problem (still open)
The extension's YouTube clipper shows the WRONG chapters. Two symptoms, both observed repeatedly by the user with screenshots:

1. **Stale chapters on navigation.** Watch video A, switch to video B → panel still shows A's chapters. Proven case: CGTN Elon Musk interview → TWIST E2340, and E2338 → E2346 → back to E2338.
2. **Wrong/incomplete counts on one video.** Same video (TWIST E2338) showed 8 chapters, then 26, then 7 across visits. A Paul Graham video showed 14 of unknown correctness.

Key evidence that constrains the diagnosis:
- Panel title/duration update correctly on navigation — only chapters go stale.
- Counts observed on E2338: 8 (first visit), 26 (after navigating away and back), 7 (after a later fix). The 26 was almost certainly raw description timestamp lines (sponsor links included); the 8→7 delta coincided exactly with a change that scoped DOM reads, i.e. one real marker lives outside the current scope.
- YouTube's own "In this video" panel on the same page shows the correct list, so ground truth is visible for comparison.

## Root causes found so far (in order)
1. **Two competing sources.** Chapters came from rendered macro-markers AND from scraping description timestamp lines; whichever rendered first won. Description lines vary (truncated text, sponsor links). Status: description scraping DELETED everywhere (content.js + MAIN-world reader). Markers only.
2. **SPA race.** Chapter load fires the moment the polled videoId changes, but the DOM still shows the old video; the stale list then gets cached under the new id. Status: mitigated with videoId tagging on responses + retries + full cache wipe on navigation + a poll-tick invariant (`chaptersForRef`) that clears any divergence. In `src/components/YouTubeClipper.jsx`.
3. **URL-ahead-of-DOM race (the one that defeats all of the above).** On YouTube SPA navigation the URL (and `ytInitialData`) updates BEFORE the DOM/description re-render. Every check based on page URL therefore passes while the DOM still belongs to the old video. This is the leading theory for the remaining failures.
4. **Whole-document queries catch other videos' markers** (up-next sidebar, hover cards, end screens). Status: DOM reads scoped to `ytd-watch-metadata` + `#movie_player` + description expanders; MAIN-world reader trusts the live player response first. BUT: scoping dropped the count 8→7 on E2338, so one legit marker likely lives outside the scope (candidate: player overlay chapter chip). Unresolved.
5. **Half-rendered marker lists.** Retry loop returned the first read with ≥3 items, which can be a partial render. Status: `getYouTubeChapters` in content.js now tracks the LONGEST list and returns after repeats with no growth (bounded attempts). Proven by a failing-then-passing test.

## Prescribed next step (not yet implemented)
Bind reads to the LIVE PLAYER, not the URL:
- content.js `YT_CHAPTERS` handler should take the wanted videoId (clipper must send it), wait until `#movie_player.getVideoResponse().videoDetails.videoId` equals it (bounded waits), scrape, then re-check and return `[]` on mismatch instead of caching wrong data.
- `readChaptersMainWorld` should return empty (not fall back to globals) when a live id exists and mismatches `wantId`.
- Widen DOM scope to include `#movie_player` subtree explicitly if the missing 8th marker lives there (verify against YouTube's own chapter count first).

## Test setup (all run locally, green)
- `npm test` at repo root (node --test, 75 tests last count) and `cd webapp && npm test` (25 last count).
- `test/youtubeChapters.test.js` — `readChaptersMainWorld` (extracted to `src/lib/youtubeChapters.js` precisely so it can be imported) run in `vm` with fake window/document: stale-global exclusion, live-first, markersMap CHAPTER entries, timeDescription fallback, <3 → [], duration caps incl. ad-length bypass, dedupe, shorts pageId, cyclic safety, self-containment for executeScript serialization.
- `test/contentChapters.test.js` — loads chapter fns VERBATIM out of content.js (it wraps itself in a block, so the test extracts by brace matching; note `indexOf('function …')` skips `async`, the extractor handles that) into vm with stub DOM: stable reads, progressive 7→8 resolves to 8, sidebar pollution excluded, no-markers → [], ad-duration bypass, real-duration cap.
- Gotcha: values built inside vm carry the vm realm's prototypes — JSON round-trip at the boundary or strict deepEqual fails.
- Gotcha: content.js is CRLF; the extractor regex handles `\r?\n`.
- `npm run build` at root builds the extension into `dist/` (sidepanel.js etc.); `cd webapp && npm run build` builds the site. Both must pass before any commit.

## Repo layout / conventions
- Chrome extension = repo root (`manifest.json`, `content.js`, `background.js`, `src/`, `dist/` gitignored build output, `test/`).
- `webapp/` = React/Vite site → Cloudflare Pages `annotated4.pages.dev` (~75s after push to master; verify live `assets/index-*.js` hash matches local `webapp/dist`).
- `sql/` = reviewed SQL patches (date-prefixed); `supabase/` = CLI config. Production Supabase + Pages are live; report Prod DB changes explicitly.
- `docs/extension-changelog.md` is append-only (PowerShell here-string + AppendAllText, no-BOM UTF8).
- Never commit `.env`, handoff txt files, or `webapp/dist` churn (legacy tracked files stay dirty; stage explicit paths only, never `git add -A`).
- Commits pushed freely until user said "stop releasing stuff" — current policy: commit locally, push/release only on explicit approval. **2 local commits are unpushed** (auth fixes, see below). Extension releases are manual: bump `manifest.json`, root build, zip the 9 dist files, `gh release create vN` (latest was v12; v13+ naming continues).

## Other active workstreams (all in local commits, some pushed)
- **Repost + quote** (webapp + prod DB): `toggle_repost` / `create_quote_post` RPCs live in prod (see `sql/2026-10-07-repost-quote.sql`); quote rows reuse the feed card via `embedded` prop on `ClipCard`; repost menu, playable quoted media, portal quote composer. Quote detail page composes the same way. All tested/building.
- **c/AI community**: created in prod DB + violet spark portrait at `webapp/public/pfps/ai.svg` mapped in `src/lib/community.js`.
- **Buddy/ThemeFlyer**: docks above the GitHub link, re-aims at landing, zoom-coordinate corrected for the `zoom: var(--k)` shell compensation.
- **Zoom shell**: `zoom: var(--k)` tiers on `.app-root` (125% zoom = reference, `--k: 1` below 1640px); sidebar dividers removed per user; navbar rides the shell grid.
- **Extension login**: was broken by root `.env` pointing at a dummy local Supabase (fixed by user editing `.env`); `Auth.jsx` gained popup-retry + normal-tab fallback. Extension ID `dacfaebkopjdendngddoioehkjojagjj`, callback already whitelisted in Supabase Auth URLs.
- **Chapter-adjacent shipped behavior**: word-clip confirmation persists until the clip range moves; chapters rescrape on navigation; poll invariant clears mismatches.

## Open questions for the user
- Exact YouTube chapter count on E2338 for ground truth (their "In this video" panel).
- Whether they test with the repo `dist/` folder + Reload on `chrome://extensions` (required after every fix; root `sidepanel.html` loads unbundeled `src/`, so ONLY `dist/` works unpacked).
