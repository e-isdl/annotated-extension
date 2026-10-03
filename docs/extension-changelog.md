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

---

## T8 ó Record the clip (browser recording, no downloader)

**Files touched:** `content.js`, `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`,
this changelog.

- **Content script `record-clip` handler** (`handleRecordClip`):
  - Finds `video.html5-main-video`, else `#movie_player video`.
  - Pre-checks with exact messages: no video / ad showing / muted or volume 0 /
    tab hidden / range invalid / no `captureStream` ("This video can''t be recorded.
    It may be protected.").
  - pause -> seek to start (wait `seeked`) -> `captureStream()` -> `play()` (wait
    `playing`; rejection -> "Press play on the video once, then try again.") ->
    audio-track check ("No sound was captured...").
  - Format order: `video/mp4;codecs=avc1.42E01E,mp4a.40.2` -> vp9/opus -> vp8/opus;
    `videoBitsPerSecond 1000000`, `audioBitsPerSecond 128000`.
  - `recorder.start(1000)`; poll every 100 ms until `currentTime >= end`, then
    `video.pause()` + `recorder.stop()`. Progress posted 4x/s.
  - Cancel (button, panel close/port disconnect, navigation, track ends early):
    stop recorder, discard data, pause video, report "Recording stopped."
- **Streaming to the panel:** port `annotated-recorder` posts `progress` / `chunk`
  (base64, encoded in 32 KB pieces from `arrayBuffer`) / `done {mime, seconds}` /
  `error {code, message}`. Panel decodes chunks into `Uint8Array` parts and builds
  `new Blob(parts, {type: mime})` on `done`; port closing before `done` discards
  everything and shows "Recording stopped."
- **Recording card** replaces the thumbnail: pulsing red dot (animation only under
  `prefers-reduced-motion: no-preference`), "Recording", "0:12 of 1:24", red
  progress bar, "Keep this tab open. Don''t pause, seek or mute.", [Cancel].
  Slider, Start/End cards and option cards dim to 45% and lock (`pointer-events:none`).
- **Failure banner** (red-soft): reason + [Try again] + [Use embed instead]
  (switches to Embed and clears the error).
- Button: recording in progress -> hidden; done -> **Continue** (carries
  `recorded_clip: {blob, mime, seconds}` in the clip payload for T9/T10);
  otherwise Embed -> Continue, Record -> Record clip.
- **Known limits (per spec):** recording runs in real time (1 min clip = 1 min);
  the YouTube tab must stay open and in front; ads and DRM videos can''t be
  recorded; quality follows the player, capped by the bitrate above.
- **Local commit only ó NOT pushed.**

---

## Clip screen compacting (master''s order) ó everything fits without scrolling

**Files touched:** `src/styles/panel.css`, this changelog.

- Master: had to scroll to reach Continue on the clip screen. Vertical cost cut:
  - Heading 20px -> **16px**, header padding 14 -> 10, heading margin 6 -> 4.
  - Thumbnail capped at **max-height 110px** (16:9 crop, object-fit cover).
  - clip-body padding 14/16 -> 10/16/12, gap 14 -> **10**.
  - Scrub padding 6 -> 4; time cards padding 12 -> 10, inner gap 8 -> 6;
    time field 24px -> **20px**; nudge gap 8 -> 6.
  - Play section/options gap 10 -> 8; option cards min-height 72 -> **64**,
    padding 12/14 -> 10/12, inner gap 12 -> 10.
  - Recording card padding 14 -> 10/12, gap 10 -> 8.
- Nothing removed, everything smaller ó Continue should now be on screen with no scroll.
- **Local commit only ó NOT pushed.**

---

## Clip screen sizing rebalanced (master''s order) ó compaction was too aggressive

**Files touched:** `src/styles/panel.css`, this changelog.

- Master: after the compacting pass, almost half the screen was empty. Scaled back
  up to a middle ground. Restored: time fields 24px, option cards 72px,
  card padding 12/14, nudge/scrub padding, gaps 12, recording card padding 14.
- Kept the modest trims: heading **18px** (was 20), thumbnail capped at
  **140px** (uncapped 16:9 is ~180), clip-body gap 12 (was 14), paddings slightly lean.
- **Local commit only ó NOT pushed.**

---

## Thumbnail resize + captions auto-off + T9 ó Show the recorded clip

**Files touched:** `src/styles/panel.css`, `content.js`, `src/components/YouTubeClipper.jsx`,
`src/components/ClipCreator.jsx`, this changelog.

- Thumbnail cap 140 -> **120px** (master''s nudge).
- **Recorder disables YouTube captions automatically:** right after the record-clip
  checks pass, `disableYouTubeCaptions()` reads the `.ytp-subtitles-button`
  aria-pressed state (falls back to caption-window visibility) and clicks it only
  when captions are ON, so burned-in-style overlays never end up in the file.

### T9 ó recorded clip preview
- On `done`, the thumbnail area becomes `<video controls>` playing the recorded
  Blob via `URL.createObjectURL` (16:9, radius 16, object-fit contain on black).
- Under it: "**1 min 24 s, 9.8 MB**" line (14px, --text-2; `formatLength` + `formatBytes`).
- Buttons under that: **Re-record** (secondary ó discards, revokes the object URL,
  unlocks everything, playMode stays Record) and **Use embed instead** (ghost ó
  discards and switches to Embed). Primary button reads **Continue**.
- While a recording exists (done), slider, Start/End cards and option cards are
  **locked** (45% dim, pointer-events off) so the range can''t drift from the file.
- Object URLs are revoked on change/unmount; after the post is made
  (`published` prop from ClipCreator''s success step) the recording is discarded,
  so a fresh Take always starts clean. Back-from-Take keeps the recording
  (component stays mounted).
- **Local commit only ó NOT pushed.**

---

## T10 ó Post the clip, remove the downloader

**Files touched:** `src/components/ClipCreator.jsx`, `src/components/AnnotationForm.jsx`,
`src/components/YouTubeClipper.jsx`, `src/lib/postPublishing.js`,
`webapp/src/pages/ClipPage.jsx`, `webapp/src/styles/globals.css`,
`supabase/migrations/20261003000000_recorded_clip_video_url.sql`, this changelog.

### Conflict + master decision
- T1 conflict resolved by explicit master override: **"Edit the web app anyway"**
  (task list said no web app edits; the web app had no reader for a recorded file).
  Web app now has a `<video>` branch: `clip.video_url` renders
  `<video controls playsInline>` inside `.source-media`, and the YouTube embed
  branch is skipped when `video_url` is present. Feed cards/thumbnails and
  transcripts untouched.

### DB (migration ready, NOT yet applied ó production push reported first per AGENTS)
- `clips.video_url text` column (nullable, commented) + `create_extension_post`
  gains `p_video_url` (https-only, youtube-only, same gating style as audio).
- **Repo migrations were behind production** (live function already had
  `p_duration`, social/X posts, `is_x_status_url`, current annotation types) ó
  so the function body in the new migration is synced from the LIVE
  `pg_get_functiondef`, then `p_video_url` added; old 19-arg signature dropped
  to avoid a PostgREST overload.

### Embed path (option 1)
- Unchanged, exactly as today: `start_sec`/`end_sec`, no file, no upload ó
  posts instantly and plays via the YouTube embed.

### Record path (option 2)
- On **Publish** with a recorded Blob: pre-check size against
  **15 MB** (`MAX_CLIP_BYTES`, matches the doc''s 15 MB figure; the `clips`
  bucket has `file_size_limit = null` ó verified live), then upload to bucket
  `clips` at `clips/recordings/{userId}/{ts}.{mp4|webm}`
  (same 3-segment pattern the storage insert policy requires ó its 3rd path
  segment must be the uid) with the recorder''s real mime/content type;
  `getPublicUrl` ? `video_url` ? RPC with the same `start_sec`/`end_sec`.
- Publish button: spinner + **"Uploading"** during upload (`onStage` callback
  from AnnotationForm -> ClipCreator), "Publishing..." for the create step.
- Errors: upload fail -> **"Couldn''t upload the clip."** + **Try again**
  (`code: upload_failed`); over limit -> **"This clip is too big. Record a
  shorter one."** + **Use embed instead** (`code: clip_too_big`, checked before
  any upload). "Use embed instead" bumps `embedRequest` -> clip screen,
  YouTubeClipper switches to Embed and discards the recording.

### T10.4 / misc
- Downloader removal: still **nothing to delete** ó re-verified greps for
  `apify|yt-dlp|ytdlp|downloader|build.?clip|clip.?job` across
  `src/`, `content.js`, `background.js`, root, `manifest.json`, `.env.example`
  return zero matches (T1 + re-check 2026-10-03).
- Articles/podcasts/X never record -> unaffected; `.env.example` unchanged.
- Checks: `npm ci && npm run build` (root) and `npm ci && npm run build`
  (webapp) both pass.
- **Local commit only ó NOT pushed.**

---

## C1 ó Article screen + page highlighter (T11 + T12 combined)

**Files touched:** `highlight.css` (new), `manifest.json`, `vite.config.js`, `background.js`,
`content.js`, `src/App.jsx`, `src/components/ClipCreator.jsx`,
`src/components/ArticleClipper.jsx`, `src/styles/panel.css`, this changelog.

### T11 ó yellow page highlighter
- `highlight.css` (root): `::highlight(annotated-selection)` + `.annotated-mark` fallback,
  fixed `#FFE14D` / `#111114` (page can be light or dark). Injected via manifest
  `content_scripts.css` (no new permission) and copied to `dist/` by the vite
  copy-files plugin; `background.js` re-inject path also calls
  `chrome.scripting.insertCSS` so tabs that outlive an extension reload get it.
- `content.js`: `setArticleHighlight` / `clearArticleHighlight` / `capRange` /
  `tryFallbackMark` (top-level, outside the guard). `mouseup` keeps its exact
  SELECTION_CHANGED contract and now also (re)sets the highlight on non-empty
  selections; a debounced `selectionchange` listener covers keyboard selections.
  Empty selections never clear the highlight (it survives focus moving to the panel).
  Over-cap selections are highlighted only up to `HIGHLIGHT_WORD_LIMIT = 200`
  (kept in sync with ArticleClipper WORD_LIMIT). Fallback wraps text in
  `<mark class="annotated-mark">` (extractContents, else per-text-node split) with
  safe unwrap + normalize cleanup.
- Removal: new selection replaces; panel close (`App.jsx` beforeunload + unmount
  cleanup sends `CLEAR_HIGHLIGHT`); post success (`ClipCreator.handlePublish` after
  `setStep('success')` sends `CLEAR_HIGHLIGHT`).

### T12 ó article screen redesign
- Slim source strip (title + host, 14px) above the card.
- Empty state: dashed `--border-strong` card, 32px yellow marker SVG, 18px line with
  "Select text" on `.hl-full`, 16px helper with the real 200-word cap, "Grab
  selection" ghost button (48px) reading `GET_PAGE_INFO` (the panel's read-on-open
  path); read-on-open effect kept; red Tip box removed.
- Selected state: solid card, count pill (`25 / 200 words`, `--warn` from 180, red
  over), "Edit text"/"Done" toggle swapping quote for a 16px `--surface-2` textarea,
  quote 18px/1.7 with every line on `.hl-full`, existing progress bar restyled slim.
- Footer: "Select some text to continue." / over-limit red helper, Continue keeps
  label, classes and disabled logic; `onReady` payload unchanged.
- `.annotation-mark` CSS rule kept (still used by TweetClipper).

Checks: `npm run build` passes. **Local commit only ó NOT pushed.**

---

## Clip screen: thumbnail -> Play clip button

**Files touched:** `src/components/YouTubeClipper.jsx`, `content.js`, `src/styles/panel.css`, this changelog.

- The YouTube clip screen no longer shows the video thumbnail. In its place a full-width
  **Play clip** button (surface card, play icon, range label `1:23 - 2:45`).
- Clicking it sends `PLAY_FROM { start }` to the tab; `content.js` seeks
  `video.html5-main-video` to the clip start and plays, so the person previews the exact
  range they are about to clip. Disabled while recording/recorded (locked).
- **Local commit only ó NOT pushed.**

---

## Play clip: auto-pause at the clip end

**Files touched:** `content.js`, `src/components/YouTubeClipper.jsx`, this changelog.

- `PLAY_FROM` now carries `end` too. After seeking to the clip start and playing,
  `content.js` runs a 200 ms monitor that pauses the video the moment it reaches the
  clip end, so the preview plays exactly the selected range and stops.
- A `pause` listener stops the monitor: if the person pauses (or seeks) manually, the
  auto-pause never fires later. Monitor is also replaced on the next Play clip press.
- **Local commit only ó NOT pushed.**

---

## Play clip is now a play/pause toggle

**Files touched:** `content.js`, `src/components/YouTubeClipper.jsx`, this changelog.

- The Play clip button toggles: if the YouTube video is playing it pauses it; if it is
  paused it seeks to the clip start and plays (still auto-pausing at the clip end).
- The decision uses the video''s real state in `content.js` (not panel state), and the
  response reports the new state so the button flips between play / pause icons and
  "Play clip" / "Pause" labels.
- **Local commit only ó NOT pushed.**

---

## C2 ó Take screen + transcript (T13 + T14 + T15 combined)

**Files touched:** `src/components/AnnotationForm.jsx`, `src/styles/panel.css`, this changelog.

### T13 ó take screen reorder + redesign
- Order is now: source strip -> **take box first** -> transcript toggle -> Community ->
  Post type -> Post annotation. The commentary is the first thing under the heading.
- Take box: `--surface`, 1px `--border`, radius 16, min-height 160px growing textarea,
  16px, placeholder "What stood out to you?" in `--text-3`. Bottom bar: ghost mic button
  "Speak it" + "up to 3 min" (real `MAX_SECONDS = 180` from AudioRecorder, kept in sync)
  on the left, character counter (real per-type `ANNOTATION_LIMITS`) on the right.
- The old Text/Audio segmented control is removed: text is the default mode, the mic
  button switches to the existing audio recording mode (recording logic/limits unchanged);
  "Remove audio" returns to text mode.
- Community + Post type are now 48px selects with visible borders/chevrons (radius 12),
  "(optional)" on the Community label line.
- Publish button renamed to **Post annotation** (52px, radius 12, no icon) with the
  14px `--text-2` line "Everyone can see this. It links to the original." under it.
- All existing validation, loading, error behavior (incl. T10 upload errors, Try again,
  Use embed instead, Uploading/Publishing stages) unchanged. The back button stays
  (the plan''s rail was removed by the master earlier ó conflict logged, code kept).

### T14 ó transcript behind a toggle (videos only)
- One 52px full-width real button: chevron + "Transcript" + Show/Hide, collapsed by
  default, `aria-expanded`. Articles never render it.
- Open state: "Clip" / "Full" tabs replace the two red links; scroll area max-height
  240px, 15px/1.6 `--text-2`. Word count shows only inside the Full tab.
- Red uppercase TRANSCRIPT label and red link styling removed. Edit affordances kept
  (clip edit with -5/+5 words tools, full edit), loading/error/no-transcript states kept,
  transcriptCache + onTranscriptChange wiring untouched.

### T15 ó cleaned transcript text
- Verified `src/lib/text.js` `cleanTranscript` already implements the spec (strips
  [music]/[laughter]/[applause]/[clears throat]/[inaudible] tags, um/uh/erm fillers,
  stutter repeats, collapses spaces) and is already applied at BOTH display sites
  (clip view + full view). Display-only; stored text never changes. No code change
  needed ó logged as verified.

Checks: `npm run build` passes. **Local commit only ó NOT pushed.**

---

## Play clip: Start / Pause / Replay buttons

**Files touched:** `src/components/YouTubeClipper.jsx`, `content.js`, `src/styles/panel.css`, this changelog.

- The single Play clip button is replaced by three explicit controls + the range label:
  **Start** (play triangle), **Pause** (pause bars), **Replay** (circular arrow).
- Start: seeks to the clip start and plays only if the video is paused (auto-pauses at
  the clip end, monitor unchanged). Replay: always seeks back to the clip start and plays
  again, even mid-playback. Pause: sends the existing `PAUSE_MEDIA` message (pauses all
  page media; the clip monitor stops via its pause listener).
- `PLAY_FROM` now takes `action: 'start' | 'replay'` and falls back to any `video`
  element if the YouTube selectors miss. All three disabled while recording/recorded.
- **Local commit only ó NOT pushed.**

---

## Play clip: single play/pause toggle + Replay

**Files touched:** `src/components/YouTubeClipper.jsx`, `content.js`, `src/styles/panel.css`, this changelog.

- The separate Start/Pause buttons were redundant: the main button is now a single
  **Play / Pause toggle** (icon + label flip with the real video state reported by
  `content.js`), and **Replay** restarts the clip from its start even mid-playback.
- `PLAY_FROM` with `action: 'toggle'` pauses when the video is playing and seeks to the
  clip start + plays (auto-pause at end) when paused; `action: 'replay'` always
  restarts. Video lookup falls back to any `video` element.
- **Local commit only ó NOT pushed.**

---

## Play clip: resume (not restart), live time, button animation

**Files touched:** `src/components/YouTubeClipper.jsx`, `content.js`, `src/styles/panel.css`, this changelog.

- **Play resumes**: `PLAY_FROM` with `action: 'toggle'` no longer seeks when the video
  is paused ó it just calls `play()`, so pressing Play continues from where the video
  was paused. Only **Replay** (`action: 'replay'`) seeks back to the clip start. The
  auto-pause-at-clip-end monitor (and its pause-listener cleanup) is (re)armed on
  every play/resume.
- **Live time**: new `VIDEO_TIME` message returns `{ time, paused }`; while the video
  plays, the panel polls it every 250 ms and the label right of Replay shows the
  moving current time (`formatShort`). If the poll sees the video paused (manual
  pause, monitor auto-pause, or end), the button flips back to Play and polling stops.
- **Animation**: the play icon gently pulses while the video is playing
  (`play-pulse` keyframes on `.play-clip-main.playing svg`).
- **Local commit only ó NOT pushed.**

---

## Play clip: video title instead of the range/time label

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

- The label right of Replay now shows the current video''s title (truncated with an
  ellipsis) instead of the clip range / moving time. The `VIDEO_TIME` poll stays ó
  it only keeps the Play/Pause icon in sync with the real video state now.
- **Local commit only ó NOT pushed.**

---

## Clip heading: video title instead of "Which part matters?"

**Files touched:** `src/components/FlowHeader.jsx`, `src/styles/panel.css`, this changelog.

- The YouTube clip screen heading was the static "Which part matters?" (FlowHeader).
  It now shows the current video''s title (from `pageInfo.data.title`, ellipsis on
  overflow), falling back to the old wording only if the title is missing.
- **Local commit only ó NOT pushed.**

---

## PRODUCTION DB: video_url migration APPLIED

- `supabase/migrations/20261003000000_recorded_clip_video_url.sql` was applied to the
  production Supabase project (2026-10-03, after the owner hit the PostgREST
  "could not find the function ... p_video_url" error). Verified: the live
  `create_extension_post` now has the 20-arg signature ending in
  `p_video_url text default null`, and `clips.video_url` exists.
- Record-clip posting (upload -> video_url -> post) is now unblocked.

---

## 240p recording + background upload + webapp Uploading state

**Files touched:** `content.js`, `src/lib/postPublishing.js`, `src/components/ClipCreator.jsx`,
`webapp/src/pages/ClipPage.jsx`, `webapp/src/styles/globals.css`,
`supabase/migrations/20261003000100_background_clip_upload.sql` (applied to production), this changelog.

### 240p
- `handleRecordClip` now calls `player.setPlaybackQualityRange('small')` (YouTube 'small'
  = 240p) and waits 1.5 s for the quality switch before capturing, so recordings are
  240p per the master''s standing order.

### Background upload (production DB migration applied)
- `clips.video_status text` ('uploading' | 'ready' | 'failed', default 'ready');
  `create_extension_post` gains `p_video_status`; new owner-only RPC
  `update_clip_video_url(clip_id, video_url, video_status)`.
- Posting a recorded clip now creates the post **immediately** with
  `video_status = 'uploading'` and no file ó the person lands on the success screen
  instantly. The blob uploads in the background (`uploadRecordedClip`), then flips the
  post to `ready` with the public URL (or `failed` on error, web app falls back to embed).
- The 15 MB pre-check still blocks posting with "This clip is too big. Record a
  shorter one." + Use embed instead. The old blocking "Uploading" stage is gone.

### Web app
- `ClipPage`: while `video_status === 'uploading'` the source area shows an
  **UploadingÖ** spinner block (16:9, black) instead of the embed; once `ready` with a
  `video_url` it plays the recorded file in the `<video>` player (embed branch skipped).
- **The web app changes are committed locally but NOT yet deployed to Cloudflare
  Pages** ó production still serves the old build, which is why the owner saw only the
  embed. Deploying the web app is a production deploy and needs the master''s OK
  (AGENTS.md) ó requested next.

Checks: `npm run build` (root + webapp) pass. **Local commit only ó NOT pushed.**

---

## Play clip: live time back right of Replay (title removed)

**Files touched:** `src/components/YouTubeClipper.jsx`, this changelog.

- The label right of Replay is the moving current time again (`formatShort(currentTime)`,
  250 ms `VIDEO_TIME` poll while playing, updated from the toggle response too). The video
  title stays only in the clip heading (FlowHeader).
- **Local commit only ó NOT pushed.**

---

## Webapp: Continue after clip end + Word clipper (T11-T16 extra)

**Files touched:** `webapp/src/components/YouTubeEmbed.jsx`, `webapp/src/styles/globals.css`,
`src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

### Webapp ó Continue button after the clip ends
- When the embed reaches the clip end, the overlay now offers **Replay clip** AND
  **Continue** side by side. Continue seeks just past the clip end and plays on (sets a
  `continuedRef` flag so the 500 ms end-enforcement poll never pauses again); the flag
  resets on player cleanup. Overlay restyled from a full-cover button to a two-pill row.

### Word clipper (clip screen, below the time clipper)
- "Open word clipper" ghost button toggles a card with the transcript of the current
  time range. Words are rendered as a flowing paragraph; the selected range sits on a
  yellow marker, and two draggable bars (`| |`, pointer-capture, nearest-word hit
  testing) set the selection by WORDS.
- **Two-way sync**: dragging the time scrub recomputes the word selection from the
  segment times (words are interpolated per segment); dragging a word bar updates
  Start/End through the existing `updateStart`/`updateEnd`, so the time clipper follows.
  The word list is derived client-side from the full caption segments (fetched once per
  video via `fetchYouTubeTranscript`), so moving the time range never refetches.
- Card shows word count, the mapped time range, and a hint; loading / error /
  no-transcript-in-range states included. Selected words use the highlight yellow
  (allowed: selected text).

Checks: `npm run build` (root + webapp) pass. **Local commit only ó NOT pushed.**
Webapp changes are NOT yet deployed to Cloudflare Pages (production deploy needs the
master''s OK per AGENTS.md).

---

## Word clipper fix: wrong video id field

**Files touched:** `src/components/YouTubeClipper.jsx`, this changelog.

- The word clipper called `fetchYouTubeTranscript(data.youtube_id)`, but the clip
  screen''s pageInfo carries the id as `data.videoId` ó so the fetch ran with
  `undefined` and the tab check threw "Return to the selected YouTube video tab to
  load its captions." Now uses `data.videoId`.
- **Local commit only ó NOT pushed.**
