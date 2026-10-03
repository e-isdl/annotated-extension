# Extension changelog (Final Task List v2)

One entry per task: files touched, findings, conflicts with the plan.

---

## T1 ‚Äî Find the code (map)

**a. Screens and their files**

| Screen | File |
|---|---|
| Shell / header / step machine (`clip` ‚Üí `annotate` ‚Üí `success`) | `src/components/ClipCreator.jsx` |
| Auth | `src/components/Auth.jsx` |
| Clip: video (YouTube) | `src/components/YouTubeClipper.jsx` |
| Clip: article quote | `src/components/ArticleClipper.jsx` |
| Clip: tweet | `src/components/TweetClipper.jsx` |
| Clip: podcast audio range | `src/components/PodcastClipper.jsx` |
| Take (annotation) | `src/components/AnnotationForm.jsx` (+ `AudioRecorder.jsx` voice mode) |
| Success | `src/components/SuccessScreen.jsx` |
| Page detection / routing to clipper | `src/lib/pageDetector.js` |
| Page info plumbing | `content.js`, `background.js` (`PAGE_INFO`, `SELECTION_CHANGED` ‚Üí side panel) |

**b. Where the extension asks the cloud to build the clip today**

**Nowhere. Greps for `apify|yt-dlp|ytdlp|downloader|clip.?job|build.?clip` across
`src/`, `background.js`, `content.js`, `manifest.json`, `package.json`, `.env.example`
return zero matches.** The old download flow is already gone from the code, so T10.4
has nothing left to delete (verified 2026-10-03).

**c. What the web app reads to play a recorded clip**

- **Bucket/path (existing upload patterns, extension side):** bucket `clips`,
  paths `clips/podcasts/{userId}/{ts}.webm` (podcast audio) and
  `clips/thumbs/{userId}/{ts}-tweet.jpg` (tweet screenshot); annotation voice notes go
  to bucket `annotation-audio`. Extension uploads already use the authenticated
  Supabase client + `getPublicUrl`.
- **Columns:** `clips` has `audio_url` (only file column; the `create_extension_post`
  RPC requires `source_type = 'podcast'` when `p_source_audio_url` is set),
  `thumbnail`, `youtube_id`, `transcript`, `article_text`, `start_sec`, `end_sec`,
  `duration`. **There is no `clip_url` / `video_url` / `media_url` column.**
- **Web app player:** no `<video>` element exists anywhere in `webapp/src`. Podcast
  posts play `clip.audio_url` through `AudioPlayer`; YouTube posts always play
  `YouTubeEmbed`; X posts show the captured image; articles show text.
- ‚ö†Ô∏è **CONFLICT (for T10):** the finished web app has **no reader for a recorded
  video file** (no column, no player). Embed path works with no web app change;
  Record path cannot play in the web app without either a web app change or an
  existing field being reused. Per rule 6 / T1, the web app was NOT touched ‚Äî
  flagged here for the master to decide at T10.

**d. Proof: start_sec + end_sec with no clip file plays via YouTube embed ‚Äî TRUE**

- `webapp/src/pages/ClipPage.jsx:333-335` ‚Äî any clip with
  `source_type === 'youtube'` renders `<YouTubeEmbed videoId={clip.youtube_id}
  startSec={clip.start_sec} endSec={clip.end_sec} autoplay />` and never consults a
  clip file.
- `webapp/src/lib/youtubeEmbedUrl.js` builds `https://www.youtube.com/embed/{id}` with
  start/end params; `webapp/src/components/YouTubeEmbed.jsx` is the player.
- ‚Üí **Embed clip option posts today's exact payload and plays. No web app change needed.**

**e. Post-creation function**

- Extension: `src/lib/postPublishing.js` ‚Üí RPC **`create_extension_post`**
  (migration `supabase/migrations/20260926020000_extension_atomic_post_publish.sql`),
  params include `p_start_sec`, `p_end_sec`, `p_youtube_id`, `p_thumbnail`,
  `p_source_audio_url`, `p_annotation_audio_url`. Returns `{ id, slug }`.
- Web app (read-only reference): `webapp/src/lib/mutations.js` ‚Üí RPC
  `create_annotated_post`.

**Extra grep results (for T2/T6/T8/T11)**

- Hardcoded hex colors in extension css/jsx: **45 matches** (T2 must replace them).
- Existing preview (`YouTubeClipper.jsx`) is panel-side only (thumbnail + watch link);
  **no code currently talks to the page video's `currentTime`** ‚Äî T6 adds it.
- `getSelection` lives in `content.js` (lines ~53, ~272) via `SELECTION_CHANGED`
  messages ‚Äî T11 extends this.
- Transcript fetch is panel-side `src/lib/youtubeTranscript.js` (innertube), cached in
  `ClipCreator` state ‚Äî T14/T15 hook into `AnnotationForm`.
- Side panel opens via `background.js` ‚Üí `chrome.sidePanel.setPanelBehavior`.

**Files touched:** `docs/extension-final-task-list.md` (new, task list saved to repo),
this changelog (new).

---

## T2 ‚Äî Make text bigger and brighter ‚Äî SKIPPED (master's order)

The plan predates the current state: tokens.css already holds the palette, the dark
theme already uses the brighter text values, light mode is the default, and the 14px
minimum font override already exists in `panel.css`. Master reviewed and called T2 a
leftover mistake ‚Äî "leave the text as it is". No code changed.

---

## T3 ‚Äî Avatar menu

**Files touched:** `src/components/ClipCreator.jsx`, this changelog.

- Header is now 56px (`h-14`), 20px side padding.
- Left: red rounded "A" mark (28px) + "Annotated" wordmark at 18px/700.
- Right: theme toggle (kept from the light-mode task) + 36px round avatar button
  (Google avatar image from `user_metadata.avatar_url`/`picture`, letter fallback).
- Avatar opens a dropdown (`role="menu"`) with a single "Sign out" item; closes on
  outside click and Escape; `aria-haspopup`/`aria-expanded` set; focus rings 2px/2px
  offset using `--focus`.
- Avatar image loads from the database first: `profiles.avatar_url` (fetched for the
  signed-in user, same field the web app shows), falling back to OAuth
  `user_metadata`, then a letter; `onError` hides a broken image and shows the letter.
- Old dim "Sign out" text link removed.

---

## Pre-list task (master's request) ‚Äî Extension light mode (webapp palette), default

- `src/styles/tokens.css` ‚Äî light block = webapp warm-pastel values, now the CSS
  default (`:root, [data-theme="light"]`); dark block = webapp dark values.
- `sidepanel.html` + `src/main.jsx` ‚Äî default light, restore `annotated-theme` from
  localStorage.
- `src/components/ClipCreator.jsx` ‚Äî sun/moon theme toggle in the header.
- `permission.html` ‚Äî same light-default token block.
- **CONFLICT vs plan ("Dark panel, red and black"):** the master explicitly ordered
  light mode (webapp palette) as the *default* after this plan was written. Light
  stays default; dark theme is fully themed per the plan's design rules.
  Commit `c95282e`.

---

## T4 ó Progress rail + source strip ó REJECTED, REVERTED (master's order)

**Files touched:** commit `45f9eef`, reverted by `2e59a56`.

- Master's complaints: repetition (title shown twice), text too big, forced scrolling
  to type, visual mistakes. The whole T4 commit was reverted: FlowHeader deleted,
  old numbered step indicator restored, button spec restored (`disabled:opacity-40`).
- T5 reintroduces rail + strip + heading in a compact form (14ñ18px text, no repeated
  titles) per the master's feedback.

---

## Future work (master's order) ó Recorded YouTube clips at 240p, hosted on server

- The clips recorded from YouTube (T7/T8 flow) must be **downgraded to 240p ó or
  recorded at 240p ó and then hosted on the server**. Small files, cheap storage.
- Not implemented yet; applies when T8 (record) / T10 (post the clip) are built.

---

## T5 ó Redesign the clip screen (compact header, thumbnail, scrub, time cards)

**Files touched:** `src/components/YouTubeClipper.jsx` (rewrite), `src/components/FlowHeader.jsx`
(recreated, compact), `src/components/ClipCreator.jsx`, `src/styles/panel.css`,
`src/components/ArticleClipper.jsx`, `src/components/PodcastClipper.jsx`,
`src/components/TweetClipper.jsx`, this changelog.

- **Compact flow header** (fixes T4's complaints): rail labels 14px/600, dots 12px,
  strip title 15px clamp-2 with 14px platform row, heading **18px** (was 26px),
  tight margins (12px), 16px side padding ó no more oversized text or scroll push.
- **No repeated titles:** badge/title rows removed from ArticleClipper,
  PodcastClipper, TweetClipper (strip owns platform + title now).
- **Thumbnail:** clean 16:9, bottom-left Preview/Stop chip (white on `--bg` 80%),
  bottom-right duration chip; no overlay text, no centered play button.
  Preview plays the range in-panel (YouTube iframe, start/end/autoplay); Stop
  unmounts it. Interpretation logged: doc said "runs the existing preview action"
  but also forbade the big centered play block.
- **Scrub slider:** 8px `--border` track, `--red` fill, 28px white handles with red
  ring placed **fully outside** the selected range (start `translateX(-100%)`,
  end `translateX(0)`) ? never overlap, even for a 5s clip; 44px hit area
  (`::after inset:-8px`); pointer drag (nearest-handle capture) + keyboard
  arrows (Shift = 5s); `role="slider"` + aria values.
- **Start/End cards:** side-by-side `1fr 1fr` grid, 16px radius, label 14/600,
  time field 24px/700 mono tabular (`h:mm:ss`, parse supports 1/2/3 parts),
  -5s/+5s nudge buttons 44px. Set start/end buttons come in T6.
- **Length row:** "Clip length 1 min 24 s" (red when >90s) / "Max 1:30" 14px.
- Continue button unchanged (T7 renames it).

---

## T5 fix (master's order) ó Clip handles are bars, not dots

- `.scrub-handle`: 12x32px vertical bars (`| |`), white with red ring, radius 5,
  hit area 44x48 via `::after`. Round 28px dots removed.

---

## T6 ó Set start here / Set end here

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

- Each Start/End card gets a full-width secondary button (48px, `.btn-set`):
  "Set start here" / "Set end here".
- Pressing one reads the page video's `currentTime` and puts it in that card's
  field; slider fill updates. Reuses the existing `chrome.scripting.executeScript`
  video-probing pattern already in this file (duration lookup) ó no duplicate code
  path, no content-script message added (the doc's fallback: extend the existing
  page-video access).
- Set buttons allow an invalid range (start > end) instead of clamping silently ó
  then the line "End needs to come after the start." shows under the cards
  (14px red, `.clip-error`) and Continue stays disabled. Slider fill clamps to 0 width.
- No video on the page -> "No video found on this page." error.
- Continue label/logic unchanged (T7's job).

---

## T6 redesign (master's order) ó Set start / Set end arm one handle at a time

- Labels changed: "Set start here"/"Set end here" -> **"Set start" / "Set end"**.
- New interaction: clicking **Set start** captures the page video's currentTime
  (if a video exists), then **arms the start handle** ó the Set end button ghosts
  (40% opacity, still clickable) and only the start `|` may be dragged/typed via
  arrows; clicking **Set end** switches it (Set start ghosts, end `|` free).
- Clicking the armed button again disarms (both normal, nearest-handle drag back).
- Armed handle gets focus on arm for arrow-key fine-tuning.
- If no page video, the buttons still arm (drag to set); no error shown for that.

---

## T6 REMOVED entirely (master's order) ó "those two buttons suck"

- Set start / Set end buttons, the arming/ghosting state, `getPageVideoTime`
  currentTime probe, handle refs, and `.btn-set` CSS all deleted.
- Clip screen is back to: thumbnail + Preview chip, bar-handle scrub (nearest
  handle wins on drag), Start/End cards with editable fields + -5s/+5s nudges.
- T6 in the task list is now SKIPPED (both its original and its redesign rejected).

---

## Clip screen de-clutter (master''s order) ó remove Open source + Preview, strip dead UI

**Files touched:** `src/components/FlowHeader.jsx`, `src/components/YouTubeClipper.jsx`,
`src/styles/panel.css`, this changelog.

- **Open source button deleted** from the source strip (strip = platform icon + word + title).
- **Preview chip deleted** from the thumbnail, plus the whole preview mechanism
  (previewMode state, in-panel YouTube iframe, Stop state). Thumbnail is a plain image now.
- Dead UI removed: unreachable error line (`.clip-error`, `error` state), the
  unreachable "End needs to come after the start." line, `.source-strip-open`,
  `.thumb-preview` CSS. Continue keeps silent guards; its disabled state + over-limit
  label already communicate validation.
- Kept: duration chip, heading, rail, Start/End cards, nudges, length row, Continue.
- **Local commit only ó NOT pushed** (master''s order).

---

## Clip screen de-clutter #2 (master''s order)

**Files touched:** `src/components/FlowHeader.jsx`, `src/components/ClipCreator.jsx`,
`src/styles/panel.css`, this changelog.

- Removed the Clip/Take progress rail entirely (back-nav from Take still exists via
  AnnotationForm''s own back button).
- Removed the platform icon and the video title below the rail. Header is now just a
  centered platform eyebrow ("YouTube" etc.) + centered heading.
- Heading "Which part matters?" centered and bumped 18px -> 20px.
- Continue ("Continue to Annotate") now ghosts when disabled: `.btn-primary:disabled`
  = 40% opacity + not-allowed cursor ó so it ghosts whenever the clip is over 90s
  (label already reads "Xs (max 90s to annotate)").
- Dead CSS removed: rail/strip rules, `.thumb iframe`.
- **Local commit only ó NOT pushed.**

---

## T7 ó Two ways to play: Embed or Record (choice UI)

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

- "How should it play?" section (16px/600) under the length row: `role="radiogroup"`
  with two row cards (min-height 72, radius 16, 1px --border): 24px icon,
  title 16/600, help line 14/--text-2, radio dot at the right.
- Selected card: --red border (inset 1px shadow = 2px without layout shift),
  --red-soft fill, filled radio dot; **Embed clip selected by default**.
- Embed help: "Plays from YouTube. Posts right away."
- Record help: "Saves a video with sound. Takes {length}." ó live-updates with the
  range (`formatLength`).
- Primary button: Embed -> **"Continue"** (goes to Take, nothing recorded ó T10
  posts with start/end and no file); Record -> **"Record clip"**.
  Range validity/disabled/ghost rules unchanged.
- **Note:** the Record button is not wired yet ó recording lands in T8 (content-script
  `captureStream` + MediaRecorder). Switching is always free in T7 (locking needs a
  recording, which is T9).
- **Local commit only ó NOT pushed** (master''s last push order still stands).
