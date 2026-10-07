# Extension changelog (Final Task List v2)

One entry per task: files touched, findings, conflicts with the plan.

---

## T1 — Find the code (map)

**a. Screens and their files**

| Screen | File |
|---|---|
| Shell / header / step machine (`clip` → `annotate` → `success`) | `src/components/ClipCreator.jsx` |
| Auth | `src/components/Auth.jsx` |
| Clip: video (YouTube) | `src/components/YouTubeClipper.jsx` |
| Clip: article quote | `src/components/ArticleClipper.jsx` |
| Clip: tweet | `src/components/TweetClipper.jsx` |
| Clip: podcast audio range | `src/components/PodcastClipper.jsx` |
| Take (annotation) | `src/components/AnnotationForm.jsx` (+ `AudioRecorder.jsx` voice mode) |
| Success | `src/components/SuccessScreen.jsx` |
| Page detection / routing to clipper | `src/lib/pageDetector.js` |
| Page info plumbing | `content.js`, `background.js` (`PAGE_INFO`, `SELECTION_CHANGED` → side panel) |

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
- ⚠️ **CONFLICT (for T10):** the finished web app has **no reader for a recorded
  video file** (no column, no player). Embed path works with no web app change;
  Record path cannot play in the web app without either a web app change or an
  existing field being reused. Per rule 6 / T1, the web app was NOT touched —
  flagged here for the master to decide at T10.

**d. Proof: start_sec + end_sec with no clip file plays via YouTube embed — TRUE**

- `webapp/src/pages/ClipPage.jsx:333-335` — any clip with
  `source_type === 'youtube'` renders `<YouTubeEmbed videoId={clip.youtube_id}
  startSec={clip.start_sec} endSec={clip.end_sec} autoplay />` and never consults a
  clip file.
- `webapp/src/lib/youtubeEmbedUrl.js` builds `https://www.youtube.com/embed/{id}` with
  start/end params; `webapp/src/components/YouTubeEmbed.jsx` is the player.
- → **Embed clip option posts today's exact payload and plays. No web app change needed.**

**e. Post-creation function**

- Extension: `src/lib/postPublishing.js` → RPC **`create_extension_post`**
  (migration `supabase/migrations/20260926020000_extension_atomic_post_publish.sql`),
  params include `p_start_sec`, `p_end_sec`, `p_youtube_id`, `p_thumbnail`,
  `p_source_audio_url`, `p_annotation_audio_url`. Returns `{ id, slug }`.
- Web app (read-only reference): `webapp/src/lib/mutations.js` → RPC
  `create_annotated_post`.

**Extra grep results (for T2/T6/T8/T11)**

- Hardcoded hex colors in extension css/jsx: **45 matches** (T2 must replace them).
- Existing preview (`YouTubeClipper.jsx`) is panel-side only (thumbnail + watch link);
  **no code currently talks to the page video's `currentTime`** — T6 adds it.
- `getSelection` lives in `content.js` (lines ~53, ~272) via `SELECTION_CHANGED`
  messages — T11 extends this.
- Transcript fetch is panel-side `src/lib/youtubeTranscript.js` (innertube), cached in
  `ClipCreator` state — T14/T15 hook into `AnnotationForm`.
- Side panel opens via `background.js` → `chrome.sidePanel.setPanelBehavior`.

**Files touched:** `docs/extension-final-task-list.md` (new, task list saved to repo),
this changelog (new).

---

## T2 — Make text bigger and brighter — SKIPPED (master's order)

The plan predates the current state: tokens.css already holds the palette, the dark
theme already uses the brighter text values, light mode is the default, and the 14px
minimum font override already exists in `panel.css`. Master reviewed and called T2 a
leftover mistake — "leave the text as it is". No code changed.

---

## T3 — Avatar menu

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

## Pre-list task (master's request) — Extension light mode (webapp palette), default

- `src/styles/tokens.css` — light block = webapp warm-pastel values, now the CSS
  default (`:root, [data-theme="light"]`); dark block = webapp dark values.
- `sidepanel.html` + `src/main.jsx` — default light, restore `annotated-theme` from
  localStorage.
- `src/components/ClipCreator.jsx` — sun/moon theme toggle in the header.
- `permission.html` — same light-default token block.
- **CONFLICT vs plan ("Dark panel, red and black"):** the master explicitly ordered
  light mode (webapp palette) as the *default* after this plan was written. Light
  stays default; dark theme is fully themed per the plan's design rules.
  Commit `c95282e`.

---

## T4 � Progress rail + source strip � REJECTED, REVERTED (master's order)

**Files touched:** commit `45f9eef`, reverted by `2e59a56`.

- Master's complaints: repetition (title shown twice), text too big, forced scrolling
  to type, visual mistakes. The whole T4 commit was reverted: FlowHeader deleted,
  old numbered step indicator restored, button spec restored (`disabled:opacity-40`).
- T5 reintroduces rail + strip + heading in a compact form (14�18px text, no repeated
  titles) per the master's feedback.

---

## Future work (master's order) � Recorded YouTube clips at 240p, hosted on server

- The clips recorded from YouTube (T7/T8 flow) must be **downgraded to 240p � or
  recorded at 240p � and then hosted on the server**. Small files, cheap storage.
- Not implemented yet; applies when T8 (record) / T10 (post the clip) are built.

---

## T5 � Redesign the clip screen (compact header, thumbnail, scrub, time cards)

**Files touched:** `src/components/YouTubeClipper.jsx` (rewrite), `src/components/FlowHeader.jsx`
(recreated, compact), `src/components/ClipCreator.jsx`, `src/styles/panel.css`,
`src/components/ArticleClipper.jsx`, `src/components/PodcastClipper.jsx`,
`src/components/TweetClipper.jsx`, this changelog.

- **Compact flow header** (fixes T4's complaints): rail labels 14px/600, dots 12px,
  strip title 15px clamp-2 with 14px platform row, heading **18px** (was 26px),
  tight margins (12px), 16px side padding � no more oversized text or scroll push.
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

## T5 fix (master's order) � Clip handles are bars, not dots

- `.scrub-handle`: 12x32px vertical bars (`| |`), white with red ring, radius 5,
  hit area 44x48 via `::after`. Round 28px dots removed.

---

## T6 � Set start here / Set end here

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

- Each Start/End card gets a full-width secondary button (48px, `.btn-set`):
  "Set start here" / "Set end here".
- Pressing one reads the page video's `currentTime` and puts it in that card's
  field; slider fill updates. Reuses the existing `chrome.scripting.executeScript`
  video-probing pattern already in this file (duration lookup) � no duplicate code
  path, no content-script message added (the doc's fallback: extend the existing
  page-video access).
- Set buttons allow an invalid range (start > end) instead of clamping silently �
  then the line "End needs to come after the start." shows under the cards
  (14px red, `.clip-error`) and Continue stays disabled. Slider fill clamps to 0 width.
- No video on the page -> "No video found on this page." error.
- Continue label/logic unchanged (T7's job).

---

## T6 redesign (master's order) � Set start / Set end arm one handle at a time

- Labels changed: "Set start here"/"Set end here" -> **"Set start" / "Set end"**.
- New interaction: clicking **Set start** captures the page video's currentTime
  (if a video exists), then **arms the start handle** � the Set end button ghosts
  (40% opacity, still clickable) and only the start `|` may be dragged/typed via
  arrows; clicking **Set end** switches it (Set start ghosts, end `|` free).
- Clicking the armed button again disarms (both normal, nearest-handle drag back).
- Armed handle gets focus on arm for arrow-key fine-tuning.
- If no page video, the buttons still arm (drag to set); no error shown for that.

---

## T6 REMOVED entirely (master's order) � "those two buttons suck"

- Set start / Set end buttons, the arming/ghosting state, `getPageVideoTime`
  currentTime probe, handle refs, and `.btn-set` CSS all deleted.
- Clip screen is back to: thumbnail + Preview chip, bar-handle scrub (nearest
  handle wins on drag), Start/End cards with editable fields + -5s/+5s nudges.
- T6 in the task list is now SKIPPED (both its original and its redesign rejected).

---

## Clip screen de-clutter (master''s order) � remove Open source + Preview, strip dead UI

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
- **Local commit only � NOT pushed** (master''s order).

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
  = 40% opacity + not-allowed cursor � so it ghosts whenever the clip is over 90s
  (label already reads "Xs (max 90s to annotate)").
- Dead CSS removed: rail/strip rules, `.thumb iframe`.
- **Local commit only � NOT pushed.**

---

## T7 � Two ways to play: Embed or Record (choice UI)

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

- "How should it play?" section (16px/600) under the length row: `role="radiogroup"`
  with two row cards (min-height 72, radius 16, 1px --border): 24px icon,
  title 16/600, help line 14/--text-2, radio dot at the right.
- Selected card: --red border (inset 1px shadow = 2px without layout shift),
  --red-soft fill, filled radio dot; **Embed clip selected by default**.
- Embed help: "Plays from YouTube. Posts right away."
- Record help: "Saves a video with sound. Takes {length}." � live-updates with the
  range (`formatLength`).
- Primary button: Embed -> **"Continue"** (goes to Take, nothing recorded � T10
  posts with start/end and no file); Record -> **"Record clip"**.
  Range validity/disabled/ghost rules unchanged.
- **Note:** the Record button is not wired yet � recording lands in T8 (content-script
  `captureStream` + MediaRecorder). Switching is always free in T7 (locking needs a
  recording, which is T9).
- **Local commit only � NOT pushed** (master''s last push order still stands).

---

## T8 � Record the clip (browser recording, no downloader)

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
- **Local commit only � NOT pushed.**

---

## Clip screen compacting (master''s order) � everything fits without scrolling

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
- Nothing removed, everything smaller � Continue should now be on screen with no scroll.
- **Local commit only � NOT pushed.**

---

## Clip screen sizing rebalanced (master''s order) � compaction was too aggressive

**Files touched:** `src/styles/panel.css`, this changelog.

- Master: after the compacting pass, almost half the screen was empty. Scaled back
  up to a middle ground. Restored: time fields 24px, option cards 72px,
  card padding 12/14, nudge/scrub padding, gaps 12, recording card padding 14.
- Kept the modest trims: heading **18px** (was 20), thumbnail capped at
  **140px** (uncapped 16:9 is ~180), clip-body gap 12 (was 14), paddings slightly lean.
- **Local commit only � NOT pushed.**

---

## Thumbnail resize + captions auto-off + T9 � Show the recorded clip

**Files touched:** `src/styles/panel.css`, `content.js`, `src/components/YouTubeClipper.jsx`,
`src/components/ClipCreator.jsx`, this changelog.

- Thumbnail cap 140 -> **120px** (master''s nudge).
- **Recorder disables YouTube captions automatically:** right after the record-clip
  checks pass, `disableYouTubeCaptions()` reads the `.ytp-subtitles-button`
  aria-pressed state (falls back to caption-window visibility) and clicks it only
  when captions are ON, so burned-in-style overlays never end up in the file.

### T9 � recorded clip preview
- On `done`, the thumbnail area becomes `<video controls>` playing the recorded
  Blob via `URL.createObjectURL` (16:9, radius 16, object-fit contain on black).
- Under it: "**1 min 24 s, 9.8 MB**" line (14px, --text-2; `formatLength` + `formatBytes`).
- Buttons under that: **Re-record** (secondary � discards, revokes the object URL,
  unlocks everything, playMode stays Record) and **Use embed instead** (ghost �
  discards and switches to Embed). Primary button reads **Continue**.
- While a recording exists (done), slider, Start/End cards and option cards are
  **locked** (45% dim, pointer-events off) so the range can''t drift from the file.
- Object URLs are revoked on change/unmount; after the post is made
  (`published` prop from ClipCreator''s success step) the recording is discarded,
  so a fresh Take always starts clean. Back-from-Take keeps the recording
  (component stays mounted).
- **Local commit only � NOT pushed.**

---

## T10 � Post the clip, remove the downloader

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

### DB (migration ready, NOT yet applied � production push reported first per AGENTS)
- `clips.video_url text` column (nullable, commented) + `create_extension_post`
  gains `p_video_url` (https-only, youtube-only, same gating style as audio).
- **Repo migrations were behind production** (live function already had
  `p_duration`, social/X posts, `is_x_status_url`, current annotation types) �
  so the function body in the new migration is synced from the LIVE
  `pg_get_functiondef`, then `p_video_url` added; old 19-arg signature dropped
  to avoid a PostgREST overload.

### Embed path (option 1)
- Unchanged, exactly as today: `start_sec`/`end_sec`, no file, no upload �
  posts instantly and plays via the YouTube embed.

### Record path (option 2)
- On **Publish** with a recorded Blob: pre-check size against
  **15 MB** (`MAX_CLIP_BYTES`, matches the doc''s 15 MB figure; the `clips`
  bucket has `file_size_limit = null` � verified live), then upload to bucket
  `clips` at `clips/recordings/{userId}/{ts}.{mp4|webm}`
  (same 3-segment pattern the storage insert policy requires � its 3rd path
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
- Downloader removal: still **nothing to delete** � re-verified greps for
  `apify|yt-dlp|ytdlp|downloader|build.?clip|clip.?job` across
  `src/`, `content.js`, `background.js`, root, `manifest.json`, `.env.example`
  return zero matches (T1 + re-check 2026-10-03).
- Articles/podcasts/X never record -> unaffected; `.env.example` unchanged.
- Checks: `npm ci && npm run build` (root) and `npm ci && npm run build`
  (webapp) both pass.
- **Local commit only � NOT pushed.**

---

## C1 � Article screen + page highlighter (T11 + T12 combined)

**Files touched:** `highlight.css` (new), `manifest.json`, `vite.config.js`, `background.js`,
`content.js`, `src/App.jsx`, `src/components/ClipCreator.jsx`,
`src/components/ArticleClipper.jsx`, `src/styles/panel.css`, this changelog.

### T11 � yellow page highlighter
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

### T12 � article screen redesign
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

Checks: `npm run build` passes. **Local commit only � NOT pushed.**

---

## Clip screen: thumbnail -> Play clip button

**Files touched:** `src/components/YouTubeClipper.jsx`, `content.js`, `src/styles/panel.css`, this changelog.

- The YouTube clip screen no longer shows the video thumbnail. In its place a full-width
  **Play clip** button (surface card, play icon, range label `1:23 - 2:45`).
- Clicking it sends `PLAY_FROM { start }` to the tab; `content.js` seeks
  `video.html5-main-video` to the clip start and plays, so the person previews the exact
  range they are about to clip. Disabled while recording/recorded (locked).
- **Local commit only � NOT pushed.**

---

## Play clip: auto-pause at the clip end

**Files touched:** `content.js`, `src/components/YouTubeClipper.jsx`, this changelog.

- `PLAY_FROM` now carries `end` too. After seeking to the clip start and playing,
  `content.js` runs a 200 ms monitor that pauses the video the moment it reaches the
  clip end, so the preview plays exactly the selected range and stops.
- A `pause` listener stops the monitor: if the person pauses (or seeks) manually, the
  auto-pause never fires later. Monitor is also replaced on the next Play clip press.
- **Local commit only � NOT pushed.**

---

## Play clip is now a play/pause toggle

**Files touched:** `content.js`, `src/components/YouTubeClipper.jsx`, this changelog.

- The Play clip button toggles: if the YouTube video is playing it pauses it; if it is
  paused it seeks to the clip start and plays (still auto-pausing at the clip end).
- The decision uses the video''s real state in `content.js` (not panel state), and the
  response reports the new state so the button flips between play / pause icons and
  "Play clip" / "Pause" labels.
- **Local commit only � NOT pushed.**

---

## C2 � Take screen + transcript (T13 + T14 + T15 combined)

**Files touched:** `src/components/AnnotationForm.jsx`, `src/styles/panel.css`, this changelog.

### T13 � take screen reorder + redesign
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
  (the plan''s rail was removed by the master earlier � conflict logged, code kept).

### T14 � transcript behind a toggle (videos only)
- One 52px full-width real button: chevron + "Transcript" + Show/Hide, collapsed by
  default, `aria-expanded`. Articles never render it.
- Open state: "Clip" / "Full" tabs replace the two red links; scroll area max-height
  240px, 15px/1.6 `--text-2`. Word count shows only inside the Full tab.
- Red uppercase TRANSCRIPT label and red link styling removed. Edit affordances kept
  (clip edit with -5/+5 words tools, full edit), loading/error/no-transcript states kept,
  transcriptCache + onTranscriptChange wiring untouched.

### T15 � cleaned transcript text
- Verified `src/lib/text.js` `cleanTranscript` already implements the spec (strips
  [music]/[laughter]/[applause]/[clears throat]/[inaudible] tags, um/uh/erm fillers,
  stutter repeats, collapses spaces) and is already applied at BOTH display sites
  (clip view + full view). Display-only; stored text never changes. No code change
  needed � logged as verified.

Checks: `npm run build` passes. **Local commit only � NOT pushed.**

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
- **Local commit only � NOT pushed.**

---

## Play clip: single play/pause toggle + Replay

**Files touched:** `src/components/YouTubeClipper.jsx`, `content.js`, `src/styles/panel.css`, this changelog.

- The separate Start/Pause buttons were redundant: the main button is now a single
  **Play / Pause toggle** (icon + label flip with the real video state reported by
  `content.js`), and **Replay** restarts the clip from its start even mid-playback.
- `PLAY_FROM` with `action: 'toggle'` pauses when the video is playing and seeks to the
  clip start + plays (auto-pause at end) when paused; `action: 'replay'` always
  restarts. Video lookup falls back to any `video` element.
- **Local commit only � NOT pushed.**

---

## Play clip: resume (not restart), live time, button animation

**Files touched:** `src/components/YouTubeClipper.jsx`, `content.js`, `src/styles/panel.css`, this changelog.

- **Play resumes**: `PLAY_FROM` with `action: 'toggle'` no longer seeks when the video
  is paused � it just calls `play()`, so pressing Play continues from where the video
  was paused. Only **Replay** (`action: 'replay'`) seeks back to the clip start. The
  auto-pause-at-clip-end monitor (and its pause-listener cleanup) is (re)armed on
  every play/resume.
- **Live time**: new `VIDEO_TIME` message returns `{ time, paused }`; while the video
  plays, the panel polls it every 250 ms and the label right of Replay shows the
  moving current time (`formatShort`). If the poll sees the video paused (manual
  pause, monitor auto-pause, or end), the button flips back to Play and polling stops.
- **Animation**: the play icon gently pulses while the video is playing
  (`play-pulse` keyframes on `.play-clip-main.playing svg`).
- **Local commit only � NOT pushed.**

---

## Play clip: video title instead of the range/time label

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

- The label right of Replay now shows the current video''s title (truncated with an
  ellipsis) instead of the clip range / moving time. The `VIDEO_TIME` poll stays �
  it only keeps the Play/Pause icon in sync with the real video state now.
- **Local commit only � NOT pushed.**

---

## Clip heading: video title instead of "Which part matters?"

**Files touched:** `src/components/FlowHeader.jsx`, `src/styles/panel.css`, this changelog.

- The YouTube clip screen heading was the static "Which part matters?" (FlowHeader).
  It now shows the current video''s title (from `pageInfo.data.title`, ellipsis on
  overflow), falling back to the old wording only if the title is missing.
- **Local commit only � NOT pushed.**

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
  `video_status = 'uploading'` and no file � the person lands on the success screen
  instantly. The blob uploads in the background (`uploadRecordedClip`), then flips the
  post to `ready` with the public URL (or `failed` on error, web app falls back to embed).
- The 15 MB pre-check still blocks posting with "This clip is too big. Record a
  shorter one." + Use embed instead. The old blocking "Uploading" stage is gone.

### Web app
- `ClipPage`: while `video_status === 'uploading'` the source area shows an
  **Uploading�** spinner block (16:9, black) instead of the embed; once `ready` with a
  `video_url` it plays the recorded file in the `<video>` player (embed branch skipped).
- **The web app changes are committed locally but NOT yet deployed to Cloudflare
  Pages** � production still serves the old build, which is why the owner saw only the
  embed. Deploying the web app is a production deploy and needs the master''s OK
  (AGENTS.md) � requested next.

Checks: `npm run build` (root + webapp) pass. **Local commit only � NOT pushed.**

---

## Play clip: live time back right of Replay (title removed)

**Files touched:** `src/components/YouTubeClipper.jsx`, this changelog.

- The label right of Replay is the moving current time again (`formatShort(currentTime)`,
  250 ms `VIDEO_TIME` poll while playing, updated from the toggle response too). The video
  title stays only in the clip heading (FlowHeader).
- **Local commit only � NOT pushed.**

---

## Webapp: Continue after clip end + Word clipper (T11-T16 extra)

**Files touched:** `webapp/src/components/YouTubeEmbed.jsx`, `webapp/src/styles/globals.css`,
`src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

### Webapp � Continue button after the clip ends
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

Checks: `npm run build` (root + webapp) pass. **Local commit only � NOT pushed.**
Webapp changes are NOT yet deployed to Cloudflare Pages (production deploy needs the
master''s OK per AGENTS.md).

---

## Word clipper fix: wrong video id field

**Files touched:** `src/components/YouTubeClipper.jsx`, this changelog.

- The word clipper called `fetchYouTubeTranscript(data.youtube_id)`, but the clip
  screen''s pageInfo carries the id as `data.videoId` � so the fetch ran with
  `undefined` and the tab check threw "Return to the selected YouTube video tab to
  load its captions." Now uses `data.videoId`.
- **Local commit only � NOT pushed.**

---

## Fixes: play/pause desync, instant-pause, word clipper fighting

**Files touched:** `content.js`, `src/components/YouTubeClipper.jsx`, this changelog.

1. **Play/pause no longer inverts**: the panel only polled the video while it thought
   the video was playing, so the label desynced from reality (video already playing ->
   "Play" paused it; video paused -> "Pause" started it). The panel now polls
   `VIDEO_TIME` every 500 ms unconditionally and mirrors the real paused state, so the
   button always does what it says.
2. **No more instant pause**: `PLAY_FROM` toggle now seeks to the clip start when the
   video is outside the clip range (before start / at or past the end), so the
   auto-pause-at-end monitor can never fire the moment playback starts. Resuming from
   inside the range still continues without seeking. The monitor''s end is a mutable
   `clipEnd` that the 500 ms poll keeps current, so moving the End handle while
   previewing moves the auto-pause point too.
3. **Word clipper glides**: the drag rounded word times to whole seconds, which made the
   time->word mapping snap back a word and fight the drag. Word drags now pass exact
   fractional times, and the time<->word sync runs in a `useLayoutEffect` so the
   selection never flickers or jumps. Time scrub and word bars stay in both-way sync.
- **Local commit only � NOT pushed.**

---

## Web app DEPLOYED to Cloudflare Pages

- The owner explicitly ordered the webapp deploy. No wrangler credentials/config exist
  in the environment, so the deploy path is Cloudflare Pages'' Git connection: pushed
  `master` to origin (`1a16b2b..6ad4c04`). Pages will build and publish the webapp with:
  the recorded-clip `<video>` player, the Uploading spinner state, and the Continue
  button after a clip ends.
- NOTE: the push also published the local-only extension commits (T10, C1, C2, play-clip
  and word-clipper work) � the standing "local commits only" rule was overridden by the
  explicit deploy order.

---

## White screen fix + word clipper takeover + clean captions

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/lib/text.js`, `src/styles/panel.css`, this changelog.

### White screen (critical)
- The play/pause fix removed the `currentTime` state declaration but left two
  references (`formatShort(currentTime)` in the label, `setCurrentTime` in the toggle
  response) -> `ReferenceError` on render -> blank panel. State restored.

### Word clipper full-screen takeover
- Clicking "Open word clipper" now returns an early full-screen view: the word clipper
  takes over the entire side panel (word area grows to fill it, no 240px cap). The close
  button in the card header returns to the normal clip screen. The toggle button on the
  normal screen just reads "Open word clipper".

### Captions properly cleaned
- `cleanTranscript` (lib/text.js) now also strips `>>` speaker markers and ALL
  bracketed tags (`[music]`, `[laughter]`, `[applause]`, `[clears throat]`,
  `[inaudible]`, etc.), more fillers (um/uh/erm/ah/eh/hmm/mhm), stutter repeats, and
  capitalizes sentence starts so text reads as proper sentences.
- The word clipper expands its segment range to full sentence boundaries (no mid-sentence
  cuts at the clip edges) and cleans each segment''s text before splitting into words, so
  the displayed transcript is clean sentences. Word->time mapping is unchanged
  (interpolated per segment), so two-way sync with the time clipper still holds.

Checks: `npm run build` passes. **Local commit only � NOT pushed.**

---

## Word clipper performance: glide like butter

**Files touched:** `src/components/YouTubeClipper.jsx`, this changelog.

- Root cause of the lag: `wordIndexFromX` called `getBoundingClientRect()` on every
  one of the ~225 word elements on every pointermove (forced layout each time), and
  every word span re-rendered on each move.
- Word centers are now cached once per drag (on pointerdown) and moves read the cached
  array � zero layout reads during the drag.
- The drag handler is a single stable `useCallback` that reads live state from a ref
  (no stale closures, no re-created handlers), and moves are batched through
  `requestAnimationFrame` (one update per frame).
- Word spans are `React.memo`-ized: only the words whose selection/handle state
  actually changes re-render (typically 2-4 per move), not all 225.
- Pointerdown no longer moves the selection � it only caches rects and arms the drag,
  so a plain click does not jump.
- **Local commit only � NOT pushed.**

---

## Word clipper rebuilt as separate full-transcript screen

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`, this changelog.

- The word clipper is now its own screen: it renders the FULL cleaned transcript
  (top to bottom, scrollable) instead of a slice tied to the clip range. The word list
  is built once per transcript so indices never shift mid-drag (that index shifting was
  the source of the jumps and lag).
- Yellow highlight follows the time clipper: words between start/end are marked, and
  the highlight re-derives whenever the times change outside a drag.
- Top bar: "Back to time clipper" on the left, "Continue" (or "Record clip", same rule
  as the main screen) on the right. The title/count row stays below it.
- Double-click any word to drop the start bar there; the count pill and time readout
  update. Drag the red bars to fine-tune either end.
- Drag mechanics fixed: the drag runs on window-level pointer listeners with one
  `requestAnimationFrame` update per frame and resolves the target word with a single
  `elementFromPoint` hit per frame (no per-word rect reads, no layout thrash). The
  sync effect is paused during drags so nothing fights the pointer, and it re-derives
  once on release. Times are set with sub-second precision instead of full-second
  clamps, so the start bar no longer snaps back.
- **Local commit only � NOT pushed.**

---

## Smooth word drag, double-click moves window, uploads visible

Files touched: src/components/YouTubeClipper.jsx, src/components/ClipCreator.jsx,
src/components/SuccessScreen.jsx, src/styles/panel.css,
webapp/src/pages/ClipPage.jsx,
supabase/migrations/20261003000200_clip_video_view.sql, this changelog.

### Word clipper smoothness
- Handles are now absolutely-positioned overlays pinned to the boundary words via
  direct style writes (no React state, no extra renders). The text never reflows
  during a drag - that reflow of the whole word area every frame was the remaining
  jank. Each word is a single flat span (wrapper spans removed, DOM nodes halved).
- Double-clicking a word now moves the whole clip window there, preserving the clip
  length (clamped to the video end), so jumping to the bottom of a long transcript
  takes one action instead of scrolling plus dragging.
- Opening the word clipper auto-scrolls the current selection into view
  (block: center), so a clip at the bottom of the transcript is right there.

### Recorded uploads actually play
- Root cause of only-the-embed-plays: ClipPage reads clips_with_scores first,
  and that view was created before video_url / video_status existed, so the player
  could never see uploads even when they succeeded. New migration recreates the view
  with both columns appended (needs applying to prod - no DB access from here).
- Belt and suspenders in the webapp: if the view row lacks the video fields, ClipPage
  fetches them from the base clips table; while video_status is uploading it
  re-checks every 4s so the video appears without a reload; if the video element
  errors (e.g. unreachable URL) it falls back to the YouTube embed.
- Extension: upload failures are no longer silent - the success screen shows
  Uploading recorded video... while it runs and a failure box with a
  Retry upload button if it fails; failures are console.error-logged. Empty
  recordings are rejected before upload.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Embed/Record choice from the word clipper

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css, this changelog.

- The Embed/Record choice lives on the time clipper under How should it play, but it
  was unreachable once the word clipper took over the screen. Added a compact
  Embed clip / Record clip toggle to the word clipper, under the top bar.
- Picking Record returns to the time screen so the recording UI (progress, cancel)
  stays visible; picking Embed stays on the word screen. If a recording already
  exists, picking Record stays too and Continue posts it.
- The top-bar button now reads Continue when ready, otherwise Record clip which goes
  back to the time screen - it never starts a blind recording from the word screen.
- Local commit only - NOT pushed.
---

## Word clipper lands exactly where dropped

Files touched: src/components/YouTubeClipper.jsx, this changelog.

- Root cause of the 2-3-words-back jump: YouTube caption segments overlap (segment B
  starts before segment A ends), so the interpolated word times overlapped too. The
  time-to-word derivation (first word with end > start) then matched an earlier
  overlapped word and overwrote the dragged / double-clicked pick on release. The
  double-click case proved it - the index was passed directly, no pointing involved,
  yet it still jumped back.
- Fix: word times are now forced strictly sequential when the list is built (each
  start clamped to the previous end, each end kept after its start), so time-to-index
  round-trips exactly. Drag and double-click also set exact word times instead of
  padded clamps, which could themselves disagree with the derivation at the edges.
- Local commit only - NOT pushed.
---

## View migration applied to prod: uploads now visible

- The Supabase tools do work from here after all. Verified live: clips has
  video_url/video_status, clips_with_scores lacked both, and the newest clip
  already had a storage video_url with status ready - the upload path was fine,
  only the view hid it.
- Applied clip_video_view to production (create or replace view, two columns
  appended, grants preserved) and re-verified both columns present.
- No code change. Local commit only - NOT pushed. Webapp NOT deployed.
---

## Article clip copy trim

Files touched: src/components/ArticleClipper.jsx, src/components/AnnotationForm.jsx,
this changelog.

- Empty article card now reads Quote up to 200 words, you can edit it before posting
  (em dash and trailing period removed).
- Grab selection ghost button removed, plus its now-unused grabSelection handler.
  Selecting text on the page still auto-fills via the page-info flow.
- Removed the Everyone can see this. It links to the original. note from under
  Post annotation.
- Local commit only - NOT pushed.
---

## Recordings no longer empty + premium hover player

Files touched: content.js, src/components/YouTubeClipper.jsx,
webapp/src/components/ClipPlayer.jsx (new), webapp/src/styles/globals.css,
webapp/src/pages/ClipPage.jsx, this changelog.

- Root cause of the flash-then-embed: the uploaded file was 0 bytes. Two bugs:
  recorder posted done before the final chunks finished base64 encoding (encode is
  async, done was sync), so short clips assembled zero parts; and the panel pushed
  chunks in arrival order, ignoring the index, so any file could be scrambled.
- content.js now counts in-flight chunk encodes and only posts done once all are
  flushed, and reports the total chunk count. The panel assembles parts in index
  order and, if chunks are missing or the total is 0 bytes, shows Recording
  captured no video. Try again. instead of posting an empty file.
- New ClipPlayer on the post page: no native controls. Click toggles play, one
  frosted play button when paused, and a slim bar (play, time, seek with buffered
  fill, mute, fullscreen) that fades in only on hover, over a gradient scrim.
  A spinner covers buffering. Broken video URLs still fall back to the embed.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Scroll to selection, autoplay, view embed, takes redesign

Files touched: src/components/YouTubeClipper.jsx,
webapp/src/components/ClipPlayer.jsx, webapp/src/pages/ClipPage.jsx,
webapp/src/components/RightRail.jsx, webapp/src/styles/globals.css, this changelog.

- Word clipper auto-scroll rewritten: scroll arms only on the open transition and
  the effect tracks the derived wordStart, so even if the first attempt targets a
  stale index the correction scroll lands on the selection. Any wheel, touch, drag
  or double-click disarms it, so it never yanks mid-read.
- Recorded clips autoplay (with sound; muted fallback where the browser blocks
  sound). Switching back to a recording replays it.
- Post page has a View embed / View recording toggle under the player when both
  exist. Broken video URLs still fall back to the embed.
- Get the extension now renders in the feed rail only, not inside posts.
- Other takes redesigned: count pill in the header, rank badges, vote pills with a
  caret, row hover states, no more divider lines.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Word clipper floating actions + two-word double-click

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css, this changelog.

- New floating actions button in the word clipper: once scrolled more than 120px
  down the transcript, a circular button appears bottom-right holding Back to time
  clipper, Continue (or Record clip), Embed clip and Record clip with the current
  choice ticked. Same handlers as the top bar, extracted into shared helpers.
- Double-click redefined: start becomes the tapped word, end becomes the very next
  word beside it. No more window preserving.
- Local commit only - NOT pushed.
---

## Word clipper white screen: crushed toggle restored

Files touched: src/components/YouTubeClipper.jsx, this changelog.

- Cause: the floating-actions edit matched the toggle inner if as a substring and
  swallowed the toggleWordClipper opener, trapping closeWordClipper and friends
  inside it. Opening the clipper then threw ReferenceError on first render.
- Fix: rebuilt the toggle plus the four helpers as proper component-level
  functions, verified the diff is purely structural, build passes.
- Local commit only - NOT pushed.
---

## Clip starts where the video is

Files touched: src/components/YouTubeClipper.jsx, this changelog.

- Opening the clipper on a video now asks the tab for the live playback position
  and sets start there with end 30s later (clamped to duration), instead of 0:00.
  Runs once duration is known so the end never gets clobbered, and again whenever
  the panel becomes visible.
- Any manual touch (scrub, inputs, nudges, word drag, double-click) marks the times
  touched and disables further auto-sync, so your adjustments are never overwritten.
- Local commit only - NOT pushed.
---

## Player unmutes itself

Files touched: webapp/src/components/ClipPlayer.jsx, webapp/src/styles/globals.css,
this changelog.

- Browsers force-muted autoplay, so the player now tries sound first, falls back to
  muted only if blocked, then unmutes on the first tap or keypress anywhere. Manual
  mute stays respected and never auto-reverses.
- A Tap for sound pill sits bottom-left whenever muted.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Floating button actually appears (scroll chain fix)

Files touched: src/styles/panel.css, this changelog.

- The floating actions button existed but never showed: the word area height was
  unconstrained, so the outer panel scrolled instead of it, its onScroll never
  fired, and the button stayed hidden (pinned at the bottom of a miles-long page).
- word-clipper-full is now height-locked to its container and the word area gets
  min-height 0, so the transcript pane itself is the scroller. Scroll down 120px
  and the button appears.
- Local commit only - NOT pushed.
---

## Word clipper: one Continue, back to time screen

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css, this changelog.

- The word clipper keeps a single Continue: top bar and hover button both return to
  the time screen, where watch, replay, record and embed all live. Removed the Back
  button, the Embed/Record toggle and the three now-dead helpers.
- Local commit only - NOT pushed.
---

## Continue can never scroll away (sticky bar)

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css, this changelog.

- The floating popup is gone. A full-width Continue bar now sits as the last child
  of the transcript pane with sticky bottom positioning, so it sticks to the
  bottom of whichever container scrolls (inner pane or outer panel) and is always
  reachable, no scroll threshold, no tap-to-open menu.
- Removed the fab state, menu JSX and its CSS.
- Local commit only - NOT pushed.
---

## Word times from caption data, not guesswork

Files touched: src/lib/youtubeTranscript.js, src/lib/text.js,
src/components/YouTubeClipper.jsx, this changelog.

- The replay path was verified innocent: replay always seeks to the chosen start.
  The offset came from the word clock. Words were spread evenly across whole
  caption events, so any uneven speech put the replay seconds away from the
  highlighted word.
- The json3 caption feed carries per-word offsets and the parser now keeps them.
  Word times come from those real offsets (interpolated only inside sub-second
  caption pieces), with the old event-wide spread as fallback when a track has
  no offsets. Sequential guard retained so time-to-word still round-trips.
- cleanTranscript gained a caps flag: piece-level cleaning skips capitalization,
  then one pass over the final word list capitalizes true sentence starts, so the
  display reads exactly as before.
- Local commit only - NOT pushed.
---

## Continue bar outside the scroll flow

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css, this changelog.

- A sticky element at the end of scrolled content rides up with the page, so the
  previous bar scrolled away like everything else. Replaced it with a full-width
  Continue bar as a flex sibling after the transcript pane and readout, outside
  every scroll container. It is structurally impossible for it to scroll away.
- Local commit only - NOT pushed.
---

## Release v2.3.4

- Manifest bumped 2.3.3 to 2.3.4. Ships everything since the last release:
  full-transcript word clipper (drag bars, double-click select, true caption
  timings, live-position start, permanent Continue), empty-recording fix with
  upload retry, play preview with live time, article copy trim.
- Pushed to master. Webapp NOT deployed by this step.
---

## TV and Film community + searchable extension picker

Files touched: src/components/AnnotationForm.jsx, src/styles/panel.css,
webapp/public/pfps/tv-and-film.svg (new), webapp/src/lib/community.js,
this changelog. Production: one row inserted into communities.

- New community TV and Film (slug tv-and-film) live in the database with a
  clapperboard SVG pfp (cinema red/gold, same 160px family style) wired into the
  pfp map, so its avatar renders everywhere CommunityAvatar does.
- The extension take screen community select is now a searchable picker: button
  shows the current pick, opens a menu with autofocus search over the live
  Supabase list (name + slug), No community always present, Escape/backdrop
  close, empty state included.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Release v2.3.5

- Manifest bumped 2.3.4 to 2.3.5. Ships the TV and Film community plus the
  searchable community picker, the permanent word-clipper Continue bar, true
  caption word timings, live-position clip start, and the scroll-chain fix.
- Pushed to master (webapp redeploys from it).
---

## Politics community

Files touched: webapp/public/pfps/politics.svg (new),
webapp/src/lib/community.js, this changelog. Production: one row inserted
into communities.

- New community Politics (slug politics) live in the database, with a red/blue
  split ballot-box SVG pfp wired into the pfp map.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Publish sends whole seconds

Files touched: src/components/YouTubeClipper.jsx, this changelog.

- The invalid-input-syntax-for-integer errors came from the word clipper keeping
  sub-second times all the way into create_extension_post, whose timestamp args
  are integers. handleContinue now floors start and ceils end, which also keeps
  end after start for every valid clip. Webapp embed already floored its inputs.
- Local commit only - NOT pushed.
---

## Uploads cannot hang forever

Files touched: src/components/ClipCreator.jsx, webapp/src/pages/ClipPage.jsx,
this changelog. Production: one stuck uploading row repaired to failed.

- Found a clip stuck on uploading with no storage file at all: the fire-and-
  forget upload promise never settled (stall or closed panel), so no status
  update ever ran. Repaired the row to failed so it shows the embed.
- Extension: publish now awaits the upload (3-minute timeout, late success still
  flips to ready) instead of firing and forgetting. The publish button already
  showed an Uploading stage, so the panel naturally stays open.
- Webapp: uploads older than 20 minutes stop spinning and fall back to the
  embed. No more eternal Uploading state.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Release v2.3.6

- Manifest bumped 2.3.5 to 2.3.6. Ships the integer-timestamp publish fix and
  awaited uploads with timeout plus stale-upload fallback.
- Pushed to master.
---

## Recordings locked to 240p

Files touched: content.js, this changelog.

- The quality hint was only a suggestion and capture grabbed full-res frames, so
  recordings came out sharper (and heavier) than 240p. Frames now go through a
  426x240 canvas (cover-fit) whose stream is recorded, so 240p is guaranteed no
  matter what YouTube plays. Bitrate retuned for the size (700k video, 96k
  audio). Draw loop and canvas track are torn down on stop and on cancel.
- Local commit only - NOT pushed.
---

## Release v2.3.7

- Manifest bumped 2.3.6 to 2.3.7. Ships true 240p recording lock via canvas
  downscale with retuned bitrate.
- Pushed to master.
---

## Sticky word-clipper header

Files touched: src/styles/panel.css, this changelog.

- The top header (title, count, red Continue) is now sticky with an opaque card
  background and full-bleed positioning, so it stays pinned at the top of the
  panel at any scroll position. Together with the permanent bottom Continue bar,
  the action is reachable from everywhere.
- Local commit only - NOT pushed.
---

## Release v2.3.8

- Manifest bumped 2.3.7 to 2.3.8. Ships the sticky word-clipper header and the
  permanent bottom Continue bar.
- Pushed to master.
---

## Feed video plays inline

Files touched: webapp/src/components/ClipCard.jsx, webapp/src/styles/globals.css,
this changelog.

- Root cause of the hostage thumbnail: feed cards had no player at all. Every
  click ran the image expander, including on video posts. The expander now only
  serves plain images.
- YouTube posts show a play-button thumbnail. Click (or Enter) swaps in the real
  player inline: the recorded ClipPlayer when a finished upload exists, else the
  YouTube embed autoplaying from the left timestamp with the right timestamp as
  the stop bound. Dead recording URLs fall through to the embed automatically.
- Clicks inside the player are fenced off from the card link so controls never
  navigate away. Escape closes the player. Uploading posts show an Uploading
  badge instead of a fake player, and uploads dead over 20 minutes fall through
  to the embed like the detail page.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Player duration and overflow hardening

Files touched: webapp/src/components/ClipPlayer.jsx,
webapp/src/components/ClipCard.jsx, webapp/src/pages/ClipPage.jsx,
webapp/src/styles/globals.css, this changelog.

- Duration: the player only read metadata once, so mp4s without faststart stuck
  at 0:00 with a pinned-full bar. It now also tracks durationchange (fires when
  the browser resolves it late), preloads auto, and falls back to the known
  clip length for the total and progress until real metadata arrives.
- Overflow: flex min-width guards on the bar, seek and player wrapper, plus
  max-width on the player and video, so the bar can no longer push past the
  card and clip the fullscreen button.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Clip-scoped YouTube player bar

Files touched: webapp/src/components/YouTubeClipPlayer.jsx (new),
webapp/src/pages/ClipPage.jsx, webapp/src/components/ClipCard.jsx,
webapp/src/styles/globals.css, this changelog. Self-hosted recordings and the
old embed on the demo page untouched.

- New shared YouTubeClipPlayer on detail and feed: embed locked to the clip
  with its own bar (play/pause, native range seek, clip-time readout). Seeks
  clamp into bounds, end pauses and resets to start, play restarts from start.
  No end param (dodges the related-videos end screen), stop enforced on a
  100ms poll plus ENDED fallback, state synced from player events, shield div
  toggles play on video click, destroy on unmount, iframe fallback if the API
  never loads.
- Detail page range strip removed with its helpers. Feed opens the same
  component with autoplay and a close button; opening another tears down the
  previous one, collapsing destroys the player.
- Styling: theme vars only, red fill and thumb, 24px touch target, tabular
  time, hover/drag thumb reveal, mobile-safe flex.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## YouTube iframe lockdown, cover screen, ghost-drag kill

Files touched: webapp/src/components/YouTubeClipPlayer.jsx,
webapp/src/components/ClipCard.jsx, webapp/src/pages/ClipPage.jsx,
webapp/src/components/AudioPlayer.tsx, webapp/src/styles/globals.css,
this changelog. Self-hosted player and demo embed untouched.

- The iframe is now untouchable: pointer-events none, out of the tab order,
  click handling on the frame wrapper. YouTube hover chrome (title, share,
  More videos) can never render or intercept.
- Cover screen over the iframe in every non-playing, non-buffering state:
  post thumbnail else maxres with hq fallback, big round play button, 120ms
  fade. Pause shows it synchronously so no YouTube overlay flashes. Cover
  hides only on PLAYING; play state never set optimistically.
- Ghost drag: found the per-card <style> tag in AudioPlayer leaking CSS text
  into native drag previews. Its rules moved to the global stylesheet.
  Player root kills dragstart, range is non-draggable with pointer capture,
  touch-action none and lostpointercapture handling, card link marked
  non-draggable, focus fenced to the wrapper with iframe blur backup.
- Feed passes its thumbnail as the poster; detail passes its thumbnail.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## YouTube UI fully cropped and defused

Files touched: webapp/src/components/YouTubeClipPlayer.jsx,
webapp/src/styles/globals.css, this changelog.

- FIX 1: clicks can no longer reach YouTube. The live iframe gets inline
  pointer-events none plus tabIndex -1 in onReady (immune to cascade or
  replacement timing), on top of the stylesheet rule. Cover stays mounted and
  play-only; pause still flips it synchronously.
- FIX 2: letterbox crop. The iframe renders taller than the 16:9 window so the
  video letterboxes inside it and title bar, share icons, More videos and logo
  land on the hidden bars. No video content cropped, cover/close/bar anchor to
  the window, not the iframe.
- FIX 3: close button defused. Real button with preventDefault, pointerdown and
  mousedown stopPropagation, and pause-destroy-collapse ordering. Player root
  stops every click so nothing inside can navigate the card.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Card delinked, crop out, circles out

Files touched: webapp/src/components/ClipCard.jsx,
webapp/src/components/YouTubeClipPlayer.jsx, webapp/src/styles/globals.css,
this changelog. Self-hosted player, demo embed and transcripts untouched.
Thumbnail stays per order (change 4 skipped).

- Seek nav kill: the player is no longer a descendant of any anchor. The card
  is a div, the post link is an absolutely positioned sibling overlay, and all
  card content floats above it. Player root carries data-no-nav with click,
  pointer and mouse guards; the card link bails on data-no-nav hits and while
  a module-level post-drag suppression window is open (set on seek
  pointerdown, refreshed on pointerup). Range keeps pointer capture.
- Crop removed: iframe fills the 16:9 frame exactly, still untouchable and
  still covered while not playing.
- No dark circles: cover is poster-only, thumbnail keeps no overlay. The bar
  play button remains the visible control.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Stash: save clips now, annotate later

Files touched: supabase/migrations/20261004000100_clip_drafts.sql (new, applied
to prod), src/lib/postPublishing.js, src/components/ClipCreator.jsx,
src/components/YouTubeClipper.jsx, src/components/ArticleClipper.jsx,
src/components/TweetClipper.jsx, src/components/PodcastClipper.jsx,
src/components/SuccessScreen.jsx, webapp/src/lib/mutations.js,
webapp/src/pages/StashPage.jsx (new), webapp/src/App.jsx,
webapp/src/components/Navbar.jsx, webapp/src/pages/CreatePage.jsx,
this changelog.

- New clip_drafts table, owner-only RLS (select/insert/delete), separate from
  clips so drafts can never leak into feed, profiles or search. Validated
  create_clip_draft RPC live in prod.
- Extension: Stash for later on all four clippers. Recordings upload first,
  then the draft stores the URL (upload helper split out and shared with the
  publish path). Size and empty guards shared. Stashed success screen links to
  /stash. Podcast holds its payload for review with Continue plus Stash.
- Webapp: /stash lists own drafts with Finish (prefills Create: mode, URL,
  title, quote, times, recording carried through) and two-tap delete. Publish
  uses the video-capable RPC when the draft has a recording, otherwise the
  normal path, then deletes the draft. Stash link in the account menu.
- Known limits: stashed YouTube clips carry no transcript (fetched in the
  take flow, not saved); repurposing a recording draft to another source
  drops its video.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Player rollback to first version plus seeking fixes

Files touched: webapp/src/components/YouTubeClipPlayer.jsx,
webapp/src/components/ClipCard.jsx, webapp/src/pages/ClipPage.jsx,
webapp/src/styles/globals.css, this changelog. Self-hosted player, demo
embed and transcripts untouched. Thumbnail kept per order (no4 skipped).

- Rolled back: cover/poster layer and its state gone, thumbnail play circle
  restored, no crop (plain 16:9 iframe fill), no warm-up code anywhere (none
  existed). Click shield restored over the iframe; pause is pauseVideo,
  play is playVideo, YouTube pause screen accepted.
- Seeking: player was already out of every anchor from the delink work, and
  that holds. Root data-no-nav with click/pointer/mouse guards, card link
  bails on data-no-nav and during the post-drag suppression window, range
  with pointer capture, touch-action none and lostpointercapture, card link
  non-draggable, ghost <style> already global.
- Close keeps pause-destroy-collapse with full guards and sits above the
  shield.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Drafts replace Stash

Files touched: supabase/migrations/20261004000200_annotation_drafts.sql (new,
applied: drafts table, owner RLS, drop of the unreleased stash objects),
src/lib/drafts.js + webapp/src/lib/drafts.js (new shared module),
src/components/ClipCreator.jsx, src/components/DraftsScreen.jsx (new),
src/components/AnnotationForm.jsx, src/components/YouTubeClipper.jsx,
src/components/ArticleClipper.jsx, src/components/TweetClipper.jsx,
src/components/PodcastClipper.jsx, src/components/SuccessScreen.jsx,
src/lib/postPublishing.js, content.js, src/styles/panel.css,
webapp/src/pages/DraftsPage.jsx + DraftEditPage.jsx (new),
webapp/src/App.jsx, webapp/src/components/AppSidebar.jsx,
webapp/src/components/Navbar.jsx, webapp/src/pages/CreatePage.jsx,
webapp/src/lib/mutations.js, webapp/src/styles/globals.css, this changelog.
Removed: stash buttons/handlers/screens/routes and the clip_drafts objects.

- Drafts live in one drafts table (jsonb payload, kind equals post type) with
  owner-only RLS, a user recency index and an updated_at trigger. Verified
  policies plus advisor pass (fixed the trigger search_path flag).
- Extension: Drafts pill with count in the header, drafts screen (thumbnail,
  kind chip, range, preview, edited-ago, Continue, delete with 5s Undo),
  Save draft plus 800ms autosave with Saving/Draft saved status, draft id in
  session storage, record-mode resume prefills the clip screen, articles
  reopen their page and restore the highlight with a form fallback, publish
  deletes the draft, sign-in guard.
- Webapp: Drafts under Saved with live count, /drafts in feed language with
  focus refetch, /drafts/:id edit page (commentary, community, type, range,
  passage; Save, Publish, Delete with undo), Create composes with the same
  autosave rules, publish cleans up. Mobile stacking, skeletons, retry.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Feed video mode: hide transcripts, muted autoplay

Files touched: webapp/src/pages/Feed.jsx, webapp/src/components/ClipCard.jsx,
webapp/src/components/ClipPlayer.jsx,
webapp/src/components/YouTubeClipPlayer.jsx, webapp/src/styles/globals.css,
this changelog.

- Feed header has a Hide transcripts toggle (persisted). On: transcript
  excerpts hide and every video post autoplays muted, Twitter-style. Off:
  everything back to thumbnails.
- Both players take a muted-autoplay mode: start muted, first tap on the
  video unmutes and keeps playing, later taps toggle play. Manual mute is
  respected and never auto-reverses. Tap-for-sound pill on both while muted.
  Detail-page behavior unchanged.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Feed video-mode fixes

Files touched: webapp/src/components/Navbar.jsx, webapp/src/pages/Feed.jsx,
webapp/src/lib/transcriptPrefs.js (new), webapp/src/components/ClipCard.jsx,
webapp/src/components/ClipPlayer.jsx,
webapp/src/components/YouTubeClipPlayer.jsx, webapp/src/styles/globals.css,
this changelog. Also removes the leftover StashPage file.

- Transcripts toggle moved to the Navbar beside the theme button, backed by a
  shared persisted prefs module so Navbar and Feed never drift.
- Hiding applies to YouTube captions and X text only. Articles and podcasts
  keep their quotes. X cards go screenshot-only in this mode, as wanted.
- Fixed the autoplay massacre: muted autoplay no longer claims playback, so
  all embeds play instead of murdering each other. Only an explicit
  tap-for-sound takes over. Both Tap-for-sound pills removed, tap behavior
  kept.
- Both players pause below 20 percent visibility and on tab hide, no
  auto-resume. No more background audio while scrolling.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Feed video-mode fixes plus annotate-screen Drafts entry

Files touched: src/components/AnnotationForm.jsx,
src/components/ClipCreator.jsx, webapp/src/components/Navbar.jsx,
webapp/src/pages/Feed.jsx, webapp/src/lib/transcriptPrefs.js (new),
webapp/src/components/ClipCard.jsx, webapp/src/components/ClipPlayer.jsx,
webapp/src/components/YouTubeClipPlayer.jsx, webapp/src/styles/globals.css,
this changelog.

- View drafts button below Save draft on the annotate screen, in addition to
  the header pill.
- Transcripts toggle moved to the Navbar beside the theme button, backed by a
  shared persisted prefs module so Navbar and Feed never drift.
- Hiding applies to YouTube captions and X text only. Articles and podcasts
  keep their quotes. X cards go screenshot-only in this mode, as wanted.
- Fixed the autoplay massacre: muted autoplay no longer claims playback, so
  all embeds play instead of murdering each other. Only an explicit
  tap-for-sound takes over. Both Tap-for-sound pills removed, tap behavior
  kept.
- Both players pause below 20 percent visibility and on tab hide, no
  auto-resume. No more background audio while scrolling.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## White-screen crash: state read before declaration

Files touched: src/components/ClipCreator.jsx,
webapp/src/components/ClipPlayer.jsx,
webapp/src/components/YouTubeClipPlayer.jsx, this changelog.

- Same bug in three places: a ref mirror like playingRef.current = playing
  ran before the matching useState line, throwing on every render of any
  player or the clipper shell. Declarations reordered so state always comes
  first. Pattern-swept both codebases, no other instances.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Drafts go manual and resume through the tab

Files touched: src/components/AnnotationForm.jsx,
src/components/ClipCreator.jsx, this changelog.

- Autosave deleted. Draft rows are created or updated only on an explicit
  Save draft click, and Draft saved confirms only that click. Save draft and
  View drafts are the only draft actions on the annotate screen.
- Continue on any draft now opens its source URL in the active tab (unless
  already there) and resumes on arrival: record-mode drafts land on the clip
  screen with the saved range, everything else lands on the annotate form
  with saved fields, articles re-highlight with the form fallback. Stale
  pending resumes are dropped instead of hijacking later navigation.
- Local commit only - NOT pushed.
---

## Drafts: explicit create, silent background updates

Files touched: src/components/AnnotationForm.jsx,
webapp/src/pages/CreatePage.jsx, webapp/src/pages/DraftEditPage.jsx,
this changelog.

- Rule change: no draft row exists until a Save control is clicked. After
  that, background autosave (800ms, silent, no status) keeps the row fresh
  on the annotate screen, the Create page and the draft edit page. Manual
  saves still report status; empty forms still refuse.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Crash safety: error boundaries plus storage guards

Files touched: src/main.jsx, src/components/ErrorBoundary.jsx (new),
webapp/src/main.jsx, webapp/src/components/ErrorBoundary.jsx (new),
src/components/ClipCreator.jsx, webapp/src/components/Navbar.jsx,
this changelog.

- Both roots wrapped in an error boundary: any render crash now shows its
  message with a reload button instead of a blank screen.
- All localStorage reads and writes guarded so blocked site data can never
  kill either bundle at boot.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Find bar, 15s undo, lazy video mount

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css,
src/components/DraftsScreen.jsx, webapp/src/components/ClipCard.jsx,
webapp/src/pages/DraftsPage.jsx, webapp/src/pages/DraftEditPage.jsx,
this changelog.

- Word clipper find: magnifier button in the top bar plus Ctrl/Cmd+F focus,
  Esc close. Match count, wrap-around arrows, Enter/Shift+Enter, all matches
  outlined with the current one filled, centered on jump. Case-insensitive,
  memoized spans, never touches clip times.
- Draft delete: immediate optimistic removal everywhere with the Undo window
  stretched to 15 seconds.
- Feed videos mount only when their card scrolls into view, so toggling
  video mode no longer spins up dozens of players at once. Scroll-pause
  still parks off-screen ones without auto-resume.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Twitter-style feed playback

Files touched: webapp/src/lib/feedPlayback.js (new),
webapp/src/components/ClipCard.jsx, webapp/src/components/YouTubeClipPlayer.jsx,
webapp/src/components/ClipPlayer.jsx, this changelog.

- Videos preload paused within one screen of the viewport and unpause the
  instant they scroll into view. Scrolling away pauses; scrolling back
  resumes from the exact spot. Explicit pauses stick.
- Positions survive unmounts in shared memory, so evicted players remount
  where they left off. Mount pool capped at 10 with visible players never
  evicted. Muted resume never steals playback; tap-for-sound still does.
- Removed a dead posterSrc prop left over from the rollback.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Find bar always on

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css,
this changelog.

- The find bar (input, counts, up/down) is now permanently under the header,
  like Continue. Removed the magnifier toggle, the close button and all
  show/hide state. Ctrl/Cmd+F still focuses the input, Esc clears it.
- Local commit only - NOT pushed.
---

## Full-width X screenshots in video mode

Files touched: webapp/src/components/ClipCard.jsx,
webapp/src/styles/globals.css, this changelog.

- In video mode, X posts with screenshots now render the image full-width
  under the source line, on the same stage videos get, instead of the small
  side thumbnail. Click expands it as before. Normal mode untouched.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Video mode means See-tweet, zero-shift thumbs

Files touched: webapp/src/components/ClipCard.jsx,
webapp/src/styles/globals.css, this changelog.

- Hide-transcripts on an X post is now exactly See-tweet-clicked: the
  expanded screenshot renders by default and the See/Hide toggle hides
  itself in this mode. Removed the separate full-width branch.
- Video posts in video mode show a full-width 16:9 thumbnail, the exact
  geometry of the player that replaces it, so tapping play no longer moves
  the feed. Quote text hides only when an image will actually render.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Sticky find bar

Files touched: src/styles/panel.css, this changelog.

- The Find in transcript bar is now sticky beneath the pinned header
  (top: 64px, the header exact height) with a solid card background, so it
  stays visible while the transcript scrolls. Top header keeps z-index 10,
  find bar sits at 9.
- Local commit only - NOT pushed.
---

## Bottom-anchored clip bar, top Continue removed

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css,
this changelog.

- Removed the upper Continue button. The top header keeps title and count
  only.
- The time readout, hint text and Continue button now live in one sticky
  bottom bar pinned to the viewport bottom with a solid card background,
  mirroring the sticky top header and find bar.
- Local commit only - NOT pushed.
---

## White-screen crash: use-before-declare in feed card

Files touched: webapp/src/components/ClipCard.jsx, this changelog.

- The See-tweet-equivalence edit placed hideQuote and tweetExpanded above
  the sourceImage and isXPost declarations they read, throwing on every
  feed card render. Moved both below their dependencies. The on-screen
  error boundary caught it and printed Cannot access Pe before
  initialization.
- Local commit only - NOT pushed. Webapp NOT deployed.
---

## Single sticky header block

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css,
this changelog.

- The header and find bar are now one sticky wrapper pinned at top 0, so no
  pixel math can drift again (the old top: 64px broke when the upper button
  left). Solid card background, hairline divider and soft shadow seal it
  against scrolling text in both themes.
- Local commit only - NOT pushed.
---

## True word times, frozen derivation, sealed header

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css,
this changelog.

- Front cutoff root cause: the sequential clamp pushed every overlapped
  caption word forward and never let later words come back, drifting
  starts later and later. Word times are now raw per-cue truth.
- A skip flag freezes the time-to-word derivation after drags and double
  clicks, so nothing overwrites the picked indices; time-scrub sync still
  derives normally.
- Sticky header sealed with higher stacking, paint isolation and a stronger
  shadow so transcript can never bleed through in either theme.
- Local commit only - NOT pushed.
---

## X video/GIF recorder (silent looping clips)

Files touched: content.js, src/components/TweetClipper.jsx,
src/components/ClipCreator.jsx, src/lib/postPublishing.js,
webapp/src/components/LoopPlayer.jsx (new),
webapp/src/components/ClipCard.jsx, webapp/src/pages/ClipPage.jsx,
webapp/src/styles/globals.css,
supabase/migrations/20261004000300_tweet_loop_media.sql, this changelog.

- TweetClipper now probes for video/GIF on open and auto-records a silent
  loop of at most 5 seconds, with progress, cancel, preview, and Retake.
- Capture keeps source resolution (1280px cap only) at 5 Mbps so text in
  the video stays readable; protected players fall back to a fetched file
  rebuilt as a same-origin blob video. Pure-photo posts keep the old
  screenshot flow, and a screenshot-instead toggle covers mixed posts.
- DB (applied): clips gains media_url, media_kind (loop), media_w,
  media_h, media_duration_ms, poster_url; create_extension_post stores them
  (social-only, duration capped at 6s); clips_with_scores exposes them.
- Feed renders loops full-width above the quote via LoopPlayer (muted
  ambient autoplay, pauses offscreen, poster + tap-to-play for
  reduced-motion); detail page plays the loop large. See tweet stays.
- Local commit only - NOT pushed.
---

## Whole-tweet screen recording (no loops)

Files touched: content.js, background.js,
src/components/TweetClipper.jsx, webapp/src/components/LoopPlayer.jsx,
webapp/src/components/ClipCard.jsx, webapp/src/pages/ClipPage.jsx,
supabase/migrations/20261004000400_tweet_recorded_clips.sql, this changelog.

- Recorder redesigned: captures the whole tweet card (author, text, video)
  as one normal video instead of extracting just the video file, and
  nothing loops - kind clip plays once with tap-replay in feed and native
  controls on detail.
- Panel-side capture: background hands the tab stream id to the panel,
  which crops the tweet card on a canvas at up to 2x DPR so text stays
  readable, records at 2 Mbps, and follows the card if layout shifts.
  Records the video full length up to 60s with progress and cancel; the
  poster is grabbed from an early frame.
- Content script slimmed to a record probe plus live bounds; the old
  file-extraction recorder is gone. Pure-photo posts keep screenshots.
- DB (applied): media_kind now allows loop or clip, duration cap raised
  to 65s.
- Local commit only - NOT pushed.
---

## Tweet recordings loop again, full length

Files touched: src/components/TweetClipper.jsx, this changelog.

- Tweet recordings publish as media_kind loop and the panel preview
  loops, so feed and detail repeat them silently like a GIF.
- Length is the video full duration up to 60s - no 5s cap remains. If a
  recording still stops at 5s, the old build is loaded: reload the
  extension on chrome://extensions and refresh the X tab, then retry.
- Local commit only - NOT pushed.
---

## Tweet recorder self-heals stale tabs

Files touched: content.js, src/components/TweetClipper.jsx, this changelog.

- The 0.0s-of-0s stall was the panel talking to a stale tab script that
  knows no probe message. The panel now re-injects content.js before
  probing, so no tab refresh is needed.
- content.js is wrapped in a block scope so re-injection redefines fresh
  handlers without const collisions; the load-once guard still prevents
  duplicate listeners.
- A probe timeout now says to refresh the X tab instead of a bare failure.
- Local commit only - NOT pushed.
---

## Tweet recorder shows its failure stage

Files touched: src/components/TweetClipper.jsx, this changelog.

- Recording now reports its stage on screen (reading the post, opening
  tab capture, starting the camera, warming up) and failures say which
  stage died with the raw error, so the next failure pinpoints the cause
  instead of a bare Working stall.
- Local commit only - NOT pushed.
---

## Re-injected tab script actually answers now

Files touched: content.js, this changelog.

- Root cause of No-reply: a re-injected script hit the load-once guard,
  so the fresh probe handler never registered. The message handler now
  registers on every injection (previous one removed first) while DOM
  listeners stay load-once guarded behind a second flag.
- Local commit only - NOT pushed.
---

## Tweet recorder rebuilt on screenshots, zero tab trust

Files touched: src/components/TweetClipper.jsx, content.js,
background.js, this changelog.

- The tabCapture chain is gone. Recording now loops chrome visible-tab
  shots cropped to the tweet card on a canvas, so it uses only the
  proven screenshot mechanism and depends on no tab script, stream id,
  or microphone-style camera permission.
- Page measuring runs through self-contained scripting functions, so a
  stale or missing content script can no longer stall the probe. The
  dead probe, live-bounds, and stream-id code is removed.
- Records the video full length up to 60s at 2 Mbps, follows the card
  if layout shifts, aborts if the X tab loses focus, and publishes a
  silent looping kind loop clip as before.
- Honest limit: frame rate is whatever visible-tab shots deliver
  (roughly GIF-like), not full 30fps.
- Local commit only - NOT pushed.
---

## Recording text shows elapsed seconds only

Files touched: src/components/TweetClipper.jsx, this changelog.

- While recording, the status now reads Recording… Ns with whole
  seconds and nothing else.
- Local commit only - push and release follow on user order.
---

## Screenshots only for no-video X posts

Files touched: src/components/TweetClipper.jsx, this changelog.

- Rule enforced: a post with video always records - the screenshot
  toggle, the screenshot-instead fallback, and every useShot branch are
  gone. Recording failure offers only Try recording again.
- Screenshots now run solely on the no-video path, with phase handling
  no longer reading a stale clip value, and the unread recTarget state
  removed.
- Local commit only - NOT pushed.
---

## Tweet video found page-wide, no article guessing

Files touched: src/components/TweetClipper.jsx, this changelog.

- A video tweet wrongly fell through to no-video because the prep
  searched one guessed article. It now takes the largest visible page
  video and measures its enclosing card, so quote-tweet players and
  off-guess articles can no longer hide it. Empty pages still report
  no-media with article and video counts and keep the screenshot path.
- Local commit only - NOT pushed.
---

## Paused videos play for the recording, screenshot on failure

Files touched: src/components/TweetClipper.jsx, this changelog.

- The prep unpauses the tweet video (muted) so the recording captures
  motion, and restores the previous paused and muted state when the
  recording ends, is cancelled, or fails.
- Recording failure now falls back to the screenshot flow instead of a
  dead end, with its own status line. Screenshots therefore cover
  no-video posts plus failed recordings; tab-away and user-cancel stay
  hard stops.
- Local commit only - NOT pushed.
---

## Tweet zoom-fit: 110 percent down to 67 percent floor

Files touched: src/components/TweetClipper.jsx, this changelog.

- Before recording, the tab zooms to 110 percent and steps out through
  100, 90, 80, 75, down to a 67 percent floor until the author header
  and likes row fit the viewport, re-measuring after each step. The
  panel shows Fitting the tweet while it works.
- The previous zoom is restored on every exit: done, cancel, tab-away,
  failure, and unmount, next to the existing video state restore.
- Local commit only - NOT pushed.
---

## Recording failures name their stage again

Files touched: src/components/TweetClipper.jsx, this changelog.

- The failure fallback hid the cause, so stage tracking is back:
  finding video, capturing, finishing. The reason survives onto the
  screenshot screens instead of being overwritten, so a failed
  recording reports exactly where it died.
- Local commit only - NOT pushed.
---

## Fit check scrolls card top into view, lazy players woken first

Files touched: src/components/TweetClipper.jsx, this changelog.

- The fit check now scrolls the card top under the X header and looks
  for the likes row at the bottom instead of center-scrolling and
  comparing heights, matching the record framing exactly.
- The prep nudges the first tweet into view before hunting the video so
  lazy-mounted players exist to be found.
- Local commit only - release follows.
---

## Record shots routed through the background

Files touched: background.js, src/components/TweetClipper.jsx,
this changelog.

- Panel-side visible-tab shots came back empty while the background
  identical call succeeds, so each frame is now captured in the service
  worker and handed to the panel. Single-frame misses no longer kill a
  take: three strikes before any frame, ten mid-take, and a partial take
  still previews instead of failing.
- The background reports its own capture error, which the empty-take
  reason now carries.
- Local commit only - release follows.
---

## Tweet recordings fixed at 5 seconds

Files touched: src/components/TweetClipper.jsx, this changelog.

- The take is always a 5 second loop. The duration-based target up to
  60s is gone, replaced by a single RECORD_MS constant.
- Local commit only - release follows.
---

## Hybrid tweet takes: crisp card plus full-rate video, honest feed sizing

Files touched: src/components/TweetClipper.jsx,
webapp/src/components/LoopPlayer.jsx,
webapp/src/components/ClipCard.jsx, webapp/src/pages/ClipPage.jsx,
webapp/src/styles/globals.css, this changelog.

- Takes are now hybrid: one crisp card shot as the backdrop with the
  real video file composited over it at 30fps in the page, so text is
  sharp and motion is smooth. The shot loop stays as the fallback when
  the file cannot be fetched, plus the screenshot last resort.
- The page-video unpause dance is gone: nothing on the page is touched,
  so there is nothing to restore. Zoom fit and restore stay.
- Feed and detail size each loop by its own recorded aspect ratio with
  no height cap and no distortion, so portrait cards render full width
  instead of a crushed strip.
- Local commit only - release follows.
---

## Recordings take the media block, not the essay

Files touched: src/components/TweetClipper.jsx, this changelog.

- The recording bounds are now the author header through the video and
  actions row. Body text stays out of the file because it already ships
  in the post quote - tall tweets produce a compact clip instead of a
  three-scroll tower. Screenshot posts are untouched.
- Local commit only - release follows.
---

## Recorder reverted to full card, towers collapse in the webapp

Files touched: src/components/TweetClipper.jsx,
webapp/src/components/LoopPlayer.jsx,
webapp/src/components/ClipCard.jsx, webapp/src/pages/ClipPage.jsx,
webapp/src/styles/globals.css, this changelog.

- Recorder untouched apart from restoring the full-card bounds: tall
  tweets are a display problem, solved where displayed.
- Portrait loops collapse to a 520px bottom-anchored window showing the
  video and actions, with a Show full recording toggle for the rest.
  Landscape and square clips render whole as before. Same on detail.
- Local commit only - release follows.
---

## Webapp loop presentation reverted to pre-hybrid state

Reverted webapp/src/components/LoopPlayer.jsx,
webapp/src/components/ClipCard.jsx, webapp/src/pages/ClipPage.jsx and
the loop rules in webapp/src/styles/globals.css to their 9ce87fb state.
The recorder is untouched. Mute-button styles stay.

---

## Word clipper words override sentence rules (local fix)

Files touched: src/components/YouTubeClipper.jsx, src/components/AnnotationForm.jsx.

- Problem: the clipper forwarded only integer seconds, and the annotate step
  re-cut the text with complete-sentence rules, dropping the exact clipped
  words (leading/trailing fragments trimmed, neighboring sentences pulled in).
- YouTubeClipper now tracks word-clip use (double-click or bar drag) and
  forwards the exact picked words as word_transcript. Any scrub/time/input
  edit clears the flag, so manual time edits fall back to sentence rules.
- AnnotationForm uses word_transcript verbatim as the clip transcript when
  present (display and publish), still loading the full transcript for the
  Full tab and the Edit expand/contract tools.
- Build passes. Local commit only - NOT pushed.
---

## Hybrid recorder uses live capture, hits full frame rate

Files touched: src/components/TweetClipper.jsx, this changelog.

- The fetch-based hybrid died on HLS and stream sources, dropping takes
  to the 1fps shot loop. The recorder now captures the live playing
  element directly and composites decoded frames over the crisp card at
  rAF rate, which works for mp4, HLS, MSE and blob sources with no fetch
  and no CORS taint. Page pause and mute state is restored after the take.
- Shot loop fallback, screenshot last resort, zoom fit, 5s cap, full-card
  bounds and publish path all unchanged.
- Local commit only - release follows.

---

## Timeline rebuild: modes, two bars, chapters, YT sync (local)

Files touched: content.js, src/components/YouTubeClipper.jsx,
src/styles/panel.css, this changelog.

- Modes: Seek / Set start / Set end segmented row between the bar and the
  Start/End cards (Seek default). Set buttons stamp current YT time with
  the spec rules (auto-extend to 30 s past the stamp when out of range);
  re-press re-stamps; tapping a time box arms without stamping and seeks
  the video there. Active button filled red, armed card red outline.
- Markers: I-shape start, bracket-shape end, 3 px red, 24 px hit areas,
  range filled red at 20%, min 8 px range, dimmed marker ignores pointer,
  mono time bubble while dragging, dark playhead line with knob. Markers
  keep keyboard arrows (1 s, shift 5 s). Old scrub bar and its CSS removed.
- Two bars: overview (whole video, chapter ticks, pale detail window) plus
  detail window (default 120 s, chips 10m/2m/30s, 10 s ticks, 30 s labels
  at 2m and below, 60/120 s at 10m). Detail shows only when D >= 240 s and
  D/barWidth > 0.5 s/px. Whole-second snapping, click/drag moves the armed
  marker or playhead, edge pan at W/2 per second, recenter if the active
  item leaves the middle 60% on release, window clamped to 0..D.
- Sync: panel polls YT_STATE every 250 ms (time, duration, paused, ad);
  drags pause, seek at most every 150 ms, exact seek plus resume on
  release, incoming time ignored mid-drag. Ads disable the timeline with
  an Ad playing badge; content refuses seeks during ads.
- Chapters: Chapters button beside Open word clipper (disabled with
  No chapters tooltip when absent); page macro-markers first, description
  timestamps second (0:00 first, 3+, ascending). List capped at 45vh with
  current chapter highlighted; row tap seeks, moves an armed marker with
  drag clamps, closes and recenters. Current title above the bar.
- Rules: exact drag/stamp clamp formulas; 90 s cap stops the handle and
  flashes Max 1:30 red. All boxes, nudges, Play/Replay and length share
  the same start/end state. Word clipper flag still clears on any time
  edit. Embed/Record cards, Continue, header and word clipper untouched.
- Build passes. Local commit only - NOT pushed.

---

## Simplified clip screen (local)

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css,
this changelog.

- Removed: mode row, zoom chips (fixed 120 s window), handle lock/dim and
  all armed state, edge pan, replay time readout.
- Tools row is Chapters + Word clipper at half width, 36 px, outline.
  Chapters button force-refreshes content.js before asking, fixing the
  dead button on stale tabs. Chapter tap only seeks and closes.
- Overview is an 8 px strip (chapter ticks grey, solid red range min 6 px,
  dark dot playhead, outline window rect, no handles, click/drag moves
  playhead). Detail bar is 56 px with 10 s ticks and 30 s-only labels,
  full-height red handles, playhead knob, mono bubble. Detail shows only
  when D/barWidth > 0.5. Off-window markers hide behind edge chips that
  seek on tap (one chip per side).
- Detail grab: nearest handle within 14 px (midpoint tiebreak), else the
  playhead. Window frozen during drags; 150 ms ease recenter when the
  playhead leaves the middle 60% on release.
- Time cards rebuilt: label + outlined red Set button on top, mono input
  with small -5s/+5s below (nudges move the marker and seek to it).
- Play row shows playhead / duration right; play-mode cards sit side by
  side; Continue is sticky at the panel bottom.
- Red only on markers, ranges, Continue and the selected play card.
- Build passes. Local commit only - NOT pushed.

---

## Clip screen v2 (local)

Files touched: src/components/YouTubeClipper.jsx, src/styles/panel.css,
this changelog.

- Compile fixes: duplicate `markDirty` declaration removed; `DETAIL_WIN`
  replaced with `winSpan()` (classic = full duration, advanced = frozen
  300 s window); old density heuristic (`overW`/`effOverW`/`showDetail`)
  deleted in favor of `variant === 'advanced'`.
- Drag repaint: `applyDragValue` and `beginDrag`'s non-jump grab branches
  now call `setDragVal(...)`, so render helpers (`markerValue`, `playValue`,
  `renderRange`, `renderMarkers`, `renderBubble`) repaint during drags.
- Classic variant renders one 56 px bar (`tl-classic`, classicRef) with
  chapter ticks, 10 s ticks / 30 s labels, range, bracket handles, chips,
  playhead and bubble - short videos no longer lose their handles.
- Time-cards block removed entirely (Set start / Set end buttons, inputs,
  ±5s nudges and their handlers are gone per the v2 order). Arrow-key
  nudge on the handles stays wired.
- rAF smooth loop: one continuous requestAnimationFrame effect extrapolates
  `lastT + elapsed * rate` while playing, blends `easeRef` jumps with
  cubicEaseOut, feeds readouts at 10 Hz (`setUiTime`) and owns the
  playheads' `style.left` directly (React renders a static initial left;
  poll no longer calls `setUiTime`). Transport readout and chapter
  detection use `uiTime`.
- Bracket handles: vertical markers replaced with `[` / `]` grips on the
  track. Each handle carries a time chip (start chip left, end chip
  right); tapping the chip selects the handle, tapping again edits the
  time via `editingChip`/`chipDraft` (Enter commits, Esc cancels).
  Selected chips turn dark and gain ‹ › arrows with hold-repeat
  (single step on press, repeat from 400 ms, 90 ms cadence after 1 s).
- Chapters bottom sheet replaces the inline list: backdrop, drag grip,
  close button and a search input (`sheetSearch`) filtering rows;
  180 ms closing animation honours reduced motion; row tap seeks and
  closes as before.
- CSS: added missing v2 styles for `.find-tile*`, `.len-meter` (4 px
  track), `.play-seg*`, `.play-help-line`, `.continue-sticky` kept, plus
  `.tl-classic`, `.tl-grip*`, `.tl-chip*` and the `.chapter-sheet*` set.
  Dead time-card / marker-line / inline chapters CSS removed.
- Build passes. Local commit only - NOT pushed.

---

## Chapters found on videos like the TWiST episode (player pill present, sheet said none)

**Files touched:** `content.js`, `src/components/YouTubeClipper.jsx`, this changelog.

- Root cause, two dead paths: the content-script description fallback called
  `movie_player.getPlayerResponse()` and read `window.ytInitialPlayerResponse`,
  both page JS and invisible from the isolated world, so it always yielded
  nothing; the DOM marker path needs an expanded description, which a fresh
  video page never has. The MAIN-world scan also missed lazy engagement-panel
  markers and rejected the whole list when a single entry was out of range.
- `content.js`: new lossy `ytCleanChapters` (sort, drop dup/out-of-range
  times, keep >= 3) replaces the all-or-nothing validator; DOM-marker and
  rendered-text parsing split into helpers; `YT_CHAPTERS` handler now falls
  back to expanding the description (...more), re-reading markers + full
  text, and collapsing again, leaving the page as found.
- MAIN world: scan depth 9 -> 12, two more roots (`ytplayer` config response,
  live `getPlayerResponse()`), plus direct `shortDescription` harvesting
  ("0:00 Intro" lines) from every root; over-duration entries are dropped
  instead of voiding the list.
- Checks: `npm run build` passes; `npm test` 45/46 (same pre-existing
  `youtubeTranscript` JSON3 failure, untouched by this change).
- Local commit only - NOT pushed. Needs a Chrome check on the TWiST video.

---

## Timeline: labeled bars, supreme window, dot seeker, free handles

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`,
this changelog.

1. Every bar has a function label above it: Overview (move the window),
   Clip (handles set start/end), Seek (scrub the video).
2. Window drag is one state flush per animation frame and cancels all
   competing easings at drag start, so window box, clip handles and seek
   dot move in the same frame instead of trailing behind.
3. Seek playhead is a 12px dot on the track; the seek bar cursor is back
   to default (no crosshair).
4. Handles drag freely past 90s (drag, nudge, arrows, chip edit); the
   90s cap now only gates Continue (button disabled + red length row +
   cap flash), so long drags stay smooth.
5. Numerals unified to 12px mono tabular (labels, chips, edges, meta row);
   labels sit in their own 4px-gapped blocks for a symmetric stack.
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed. Needs a Chrome drag check.

---

## Timeline rewritten to the two-bar spec (seek + 2-min clip window)

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`,
this changelog.

- Two bars, one mapping: seek bar spans 0..duration (`overPct`), clip bar
  spans winStart..winStart+120s (`detailPct`). The classic/advanced split,
  the third bar and the 300s window are gone; `WIN_SPAN` is 120.
- Seek bar: dot dragger at playback time, drag seeks with no snapping,
  tap anywhere jumps + keeps seeking. Dragging the red window box moves
  the window with a grab offset (no jump); Up/Down arrows move it too.
- Window moves never touch X/Y (the auto-centering 30s reform is
  deleted). Window drags flush once per animation frame with easings
  killed, so box, handles and dot move in the same frame. Scrubbing or
  playing past the edges pages the window with a minimal shift.
- Handles drag free (1s resolution, label + range every frame, nearest
  handle on tap); the 90s cap gates Continue only. Y stops at the
  duration without shifting X. Off-window X/Y get edge chips that jump
  the window back to them.
- Labels: Seek (whole video) on top, Clip (2-minute window) below;
  numerals unified 12px mono; dead classic/seek CSS removed.
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed. Verify against the spec acceptance
  checks in Chrome (50% seek, 30s/120s init, window move keeps X/Y,
  3-second X drag continuity, Y end-stop, alignment).

---

## Photo redesign + dot/X coupling (no thumbnail block)

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`,
this changelog.

- Dot/X drive each other: seek-bar drags move X live (Y shifts only to
  keep the 1s minimum); X drags/nudges/edits already seek the video.
  Arrow-key scrub and playback never move X.
- Layout follows the photo while keeping our tokens: `Full Video Timeline
  (40:10)` label, seek bar with minor ticks + pinned 0:00/duration edge
  labels, clip work in a `2-Minute Clipping Window` card ending in a
  centered 17px `Clip X – Y (len)` footer (red past the cap). The window
  readout and the old length-meter row are gone; their info lives in the
  footer. The small video preview block from the photo is skipped per
  order. Chapters/Word tiles gain chevrons (count stays); Continue reads
  `Continue →`.
- Handles are white pills with a pause-bars glyph, centered on the track;
  time chips below stay as the edit/nudge surface.
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed. Needs a Chrome look-and-drag check.

---

## Fixed-30s model per the mock (seeker = X, Y = X + 30)

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`,
this changelog.

- Only three movables: seek dot, X handle, Y handle. Edge chips, window
  dragging, window glides and the follow effects are deleted (this also
  removes a live `tweenRef is not defined` crash on window drags).
- Invariant `Y = X + 30` enforced in every setter: seek-dot drags move X
  (Y derived), X drags shift the whole clip and seek the video, Y drags
  shift the whole clip with the seeker following. Chip/nudge/arrow
  edits route through the same setters. Near the video end Y stops at
  the duration without shifting X.
- The window is derived state (`X - 45`, clamped): fixed viewport, moving
  scale, zero animation code left. Chapters pick moves the clip; the
  window follows on its own.
- Mock layout in our tokens: `Full Video Timeline (40:10)` with minor
  ticks + pinned edge labels; `2-Minute Clipping Window` card with info
  icon, circular pause-glyph handles, tailed time chips, tick labels
  under the rail, red bracket under the clip, and a centered link-icon
  pill `Clip 6:42 – 7:12 (0:30)`. Window readout, length meter and edge
  chips removed. Tiles gain chevrons; Continue reads `Continue →`.
  No video preview block added per order.
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed. Chrome-verify: seek→X→Y+30 lockstep,
  fixed viewport with gliding scale, pill updates, no extra controls.

---

## Locked 180s window, 90s-max free clip, no seek on clamp edits

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`,
this changelog.

- The red window box is off the seek bar (it sat on top of the dot).
  The seek bar is now dot + ticks + labels + chapter ticks only.
- Clip unlocked from 30s: X/Y independent, 0 <= X < Y <= duration, 90s
  max enforced at Continue (disabled + guard); footer shows the live
  length. Drags stay free with cap-flash feedback past 90s.
- Window is 180s, locked on every seek (dot drag/tap, arrows, chapters,
  init, resume, video change) at X - 30 (30s behind, 150s after). Clip
  edits (drags, chips, nudges, arrows) never seek the video and never
  move the window; X is only pulled minimally if it would leave the
  locked window and hide the handles. Seeking preserves the clip length.
- Card head reads `3-Minute Clipping Window` (plain `Clipping Window`
  under 3 minutes).
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed. Chrome-verify on the TWiST video:
  seek to 7:12, window locks 6:42-9:42, drag clamps without the video
  or window moving.

---

## Audit fixes, helper copy, Spotify podcast routing

**Files touched:** `src/components/YouTubeClipper.jsx`, `src/styles/panel.css`,
`content.js`, `src/components/PodcastClipper.jsx`, this changelog.

### Audit (clipper read end to end)
- Real bug fixed: `anchorClip`, `syncStartToVideoTime` and the draft
  resume set clip state without updating `viewRef`, so the first handle
  drag afterwards read a stale opposite endpoint and the clip jumped.
  All three now sync `viewRef`.
- Cleared, no change needed: `rec.url` revocation already covers every
  discard path; Continue gating, publish flooring, snap scope, poll seq
  guards, drag cleanup, short-video branches and word-clipper interplay
  all behave.
- Helper copy above the timeline: "Seek to the moment you want — the
  clip starts there and the window locks around it. Then drag the
  handles to set its length."

### Spotify podcast
- Root cause: Spotify streams through encrypted MSE with no plain
  `<audio src>`, so detection missed it and episodes opened the article
  clipper. New explicit `open.spotify.com/episode` branch (episode id +
  `og:title`) plus a host-gated fallback for src-less `<audio>` on
  podcast hosts.
- `PodcastClipper` reworked: episode title shown, record → listen-back
  preview → Re-record / Continue (upload runs on Continue, then
  annotate). The dead `readyPayload` button now works; object URLs are
  ref-tracked so unmounts never leak; empty recordings rejected.
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed. Chrome-verify on a Spotify episode:
  podcast screen appears with the episode title, record → preview →
  Continue reaches the take screen.

---

## Show pages route to podcast, helper copy names the timeline

- `content.js` Spotify branch extended to `/show/` pages (episode id or
  show id + `og:title`); panel-side `pageDetector` matches both. Show
  pages previously fell through to the article clipper.
- Helper copy above the timeline rewritten to name the UI: "Scrub the
  Full Video Timeline to the moment you want. The clip starts there
  inside a locked 3-minute window. Drag the handles to set its length,
  up to 1:30." No em dashes.
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed.

---

## Podcast: real episode audio, silence rejection, slim player

**Files touched:** `src/components/PodcastClipper.jsx`,
`src/styles/panel.css`, this changelog.

- Why clips came back silent: the recorder only ever used the
  microphone, so it never captured the episode itself. It now captures
  real tab audio through the system share picker (no new extension
  permission needed): pick the Spotify tab and tick audio sharing. The
  microphone stays as an explicit fallback with a picker when several
  inputs exist.
- Silent takes are now impossible to miss: a live input-level meter
  runs while recording, and every finished take is decoded and
  RMS-checked. Flat takes are rejected with what to check instead of
  posting quiet audio.
- The giant native audio element is replaced with a slim preview
  player (play/pause, time readout, seek bar).
- "Recorded 9s — listen back" reworded with no em dash.
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed. Chrome-verify on Spotify: Capture
  episode audio with tab audio shared, watch the meter move, preview
  with sound, Continue reaches the take screen.

---

## Podcast feed cards play the episode, waveforms are real

**Files touched:** `src/components/PodcastClipper.jsx`,
`webapp/src/components/AudioPlayer.tsx`,
`webapp/src/components/ClipCard.jsx`, `webapp/src/pages/ClipPage.jsx`,
`webapp/src/styles/globals.css`, this changelog.

- Extension sends the recorded length as `duration` (flows into
  `p_duration`, so cards know runtimes without probing metadata).
- Feed podcast cards get an episode block: caption with runtime plus a
  compact player. The "open the source" placeholder no longer shows
  when episode audio exists.
- Detail page gets the episode block with a 96-bar player.
- Waveform honesty: peaks are decoded from the real file and cached
  across mounts (feed + detail decode once), with a Safari callback
  fallback and explicit CORS fetch. While loading, bars render flat
  (clearly pending) instead of fake variance. Dynamics reshaped with
  square-root scaling and a lower floor so quiet clips read correctly.
- Checks: webapp + extension builds pass; `npm test` 45/46
  (pre-existing transcript failure).
- Local commit only - NOT pushed. Chrome-verify: feed card plays the
  episode inline with duration, detail waveform matches the audio.

---

## Spotify-style podcast feed cards

**Files touched:** `webapp/src/components/AudioPlayer.tsx` (accent prop),
`webapp/src/components/PodcastEpisode.jsx` (new),
`webapp/src/components/ClipCard.jsx`,
`webapp/src/styles/globals.css`, this changelog.

- Feed podcast cards render an episode block per the mock: cover art
  (Spotify oEmbed, cached per URL, icon fallback), episode title,
  green play button, real waveform, runtime, and a "Spotify Clip"
  stamp. Placeholder quote stays hidden when episode audio exists.
- Checks: webapp build passes.
- Local commit only - NOT pushed. Chrome-verify on feed: artwork,
  green play, waveform seeks, runtime shows, stamp renders.

---

## Tighter podcast cards, muted dark blues

**Files touched:** `webapp/src/components/ClipCard.jsx`,
`webapp/src/styles/globals.css`, `webapp/src/styles/tokens.css`,
this changelog.

- Podcast cards with episode audio skip the redundant source-preview
  block (domain link + repeated title + 132px min-height box), so the
  card collapses to episode block plus actions. Episode block spacing
  tightened.
- Dark tokens desaturated toward neutral: background, cards, surfaces,
  borders and secondary text keep the premium dark feel with much less
  blue. Light theme untouched.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Webapp dark theme goes blue-black

**Files touched:** `webapp/src/styles/tokens.css`, this changelog.

- Dark tokens only, nothing else: background `#0D0D0F` to `#06090D`,
  cards/surfaces into dark blue-gray, borders to subtle blue-gray,
  primary text brighter white, secondary to soft blue-gray. Light
  theme and all accents untouched.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Release v6 (manifest 2.3.20)

- Ships everything since v5: episode transport in the panel (Play/Pause
  + time, recording follows episode pause), tab-audio-only podcast
  capture, feed episode blocks with inline player and runtime, real
  cached waveforms (96 bars detail, 48 feed, no fake variance) with
  Safari fallback, Spotify show-page routing on both detectors, helper
  copy naming the Full Video Timeline.
- Webapp source pushed (Cloudflare rebuilds from it).
- Pushed to master. Released as v6 with annotated-extension.zip.

---

## Podcast: episode transport in the panel, recording follows pause

**Files touched:** `content.js`, `src/components/PodcastClipper.jsx`,
this changelog.

- New tab messages `PODCAST_STATE` (playing state, time, duration from
  the page audio element) and `PODCAST_TOGGLE` (Spotify play/pause
  button first, audio element fallback).
- Panel polls episode state every second and shows Play/Pause plus
  time like the video clipper. Pausing the episode mid-take pauses the
  recorder (paused spans cost no 90s budget and bake no silence in);
  playing resumes it, with an "Episode paused. Recording waits" note.
- Checks: `npm run build` passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Local commit only - NOT pushed. Chrome-verify on Spotify: panel
  Play/Pause drives the episode, pausing mid-take freezes the timer
  and resumes cleanly.

---

## Tweet video search scoped to the post, fit loop bounded

**Files touched:** `src/components/TweetClipper.jsx`, this changelog.

- Root cause of photo posts entering the recording flow: all three page
  functions hunted the largest `<video>` page-wide, so a stray player
  anywhere (ads, other posts) sent photo-only posts down the recording
  path where they hung at fitting. Prep, hybrid capture and live bounds
  now search only inside this post's own article; prep marks its video
  so capture grabs that exact element. No video in the article means
  the screenshot flow, immediately.
- The zoom-fit loop gets a 25s deadline after which it fails over to
  the screenshot flow instead of hanging on "Framing" forever.
- Checks: `npm run build` passes.
- Local commit only - NOT pushed. Chrome-verify on a photo-only post:
  "No video here. Taking a screenshot instead…" with no recording
  text, and on a video post the clip records the right player.

---

## Recording UI gated behind confirmed video, exact-article targeting

**Files touched:** `src/components/TweetClipper.jsx`, this changelog.

- "Found video" still appeared first because the recording phase (and
  its Cancel button) switched on before prep resolved, and the poll
  accepted any element without proof of media from possibly the wrong
  article. Now: phase stays neutral ("Looking for video…", no Cancel
  button) through search and framing; recording UI appears only when
  capture actually starts.
- Prep takes the post's status ID and targets the article linking that
  exact status timestamp (first article was sometimes a reply or
  promoted post). A candidate counts only with real media signs
  (frames, progress, or playing); placeholders no longer qualify.
- Checks: `npm run build` passes.
- Local commit only - NOT pushed. Chrome-verify on the David Sacks
  photo post: neutral checking text straight to the screenshot flow,
  never recording UI.

---

## Podcast: tab audio only, mic path removed

- The microphone fallback is gone from the podcast clipper: one button,
  "Capture episode audio", with copy telling the user to pick the
  Spotify tab and turn on tab audio. All mic states, errors and the
  device picker deleted (take-screen voice notes untouched).
- Recording block restored after an edit collision, with the Spotify
  tab instruction in the level caption.

---

## Release v5 (manifest 2.3.19)

- Ships everything since v4: tweet clipper text rewritten per state
  (photo posts never see recording UI), video search scoped to the
  post's own article with media-proof acceptance, recording UI gated
  behind confirmed video, fit loop bounded, podcast via tab audio with
  silence rejection and slim player, Spotify show pages routed, helper
  copy naming the Full Video Timeline, white-screen TDZ fix.
- Pushed to master. Released as v5 with annotated-extension.zip.

---

## Five iconic themes, picker in the navbar

**Files touched:** `webapp/src/lib/themes.js` (new),
`webapp/src/styles/tokens.css`, `webapp/src/main.jsx`,
`webapp/src/components/Navbar.jsx`, `webapp/src/styles/globals.css`,
this changelog.

- Light and Dark frozen. New: 80s Retro (synthwave neon dusk),
  Tokyo Night (official Night palette), Terminal (phosphor green),
  Gruvbox (retro groove orange), Dracula (official spec purple).
  Each sets the full token set, persisted in the same localStorage
  key, honored on boot.
- Sun/moon toggle replaced with a palette button in the navbar:
  dropdown with swatch trios, hints, active check, outside-click and
  Escape to close.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Podcast trimmer in the clipper, detail matches feed

**Files touched:** `src/components/PodcastClipper.jsx`,
`src/styles/panel.css`, `webapp/src/components/PodcastEpisode.jsx`,
`webapp/src/pages/ClipPage.jsx`, `webapp/src/styles/globals.css`,
this changelog.

- Extension: recorded takes open a trimmer (real decoded waveform,
  two draggable handles, region-only preview, live
  `Trim X – Y (len)` readout). Continue uploads the trimmed slice
  re-encoded as WAV (full takes still upload raw); duration sent is
  the trimmed length. Decode happens once per take and is reused for
  the silence check.
- Detail page renders the same feed component in a larger layout
  (bigger art and title, 96-bar player) instead of its own plain
  block.
- Checks: extension + webapp builds pass; `npm test` 45/46
  (pre-existing transcript failure).
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Sonnet palette applied to the five themes

**Files touched:** `webapp/src/styles/tokens.css`,
`webapp/src/lib/themes.js`, this changelog.

- Replaced all five theme blocks verbatim; light and dark untouched.
- Highlighter check passed: the webapp mark (`::selection`) forces
  near-black `--on-yellow` text, so every `yellow-soft` alpha raised
  to .78 per the delivery note.
- Swatch trios in the picker updated to the new bg/surface/accent
  hexes.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Terminal text readability bump

**Files touched:** `webapp/src/styles/tokens.css`, this changelog.

- Terminal theme text steps brightened toward mint
  (text/text-2/text-3 up one notch each). Terminal block only.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

**Files touched:** `webapp/src/styles/tokens.css`,
`webapp/src/styles/globals.css`, `webapp/index.html`,
`webapp/src/lib/themes.js`, `webapp/src/components/Navbar.jsx`,
`webapp/src/components/PodcastEpisode.jsx`,
`webapp/src/components/RightRail.jsx`, `webapp/src/pages/ClipPage.jsx`,
`webapp/src/pages/Profile.jsx`, this changelog.

- tokens.css: `:root` defaults for 16 new tokens (danger, accent-2,
  play, vote-down moved here, avatar-default, community-s/l, btn-bg,
  glow, text-glow, bg-image, overlay, active-*, chip-*, card-*,
  scroll-thumb, display-font); five theme blocks replaced verbatim
  per order as `html[data-theme]` with yellow-soft at .78 (mark
  forces on-yellow). Light/Dark blocks untouched.
- globals.css wiring, all token-driven: body backdrop + text glow +
  overlay layer, gradient/glow buttons, danger for field/profile/
  toast errors and delete confirm, active pills, chips, card
  border/hover-shadow, accent-2 secondary links, display font on
  headings/titles/logo/buttons, themed scrollbar + Firefox-only
  themed scrollbars, community/avatar vars, play var.
- Navbar: logo-text hook, theme menu unchanged, meta sync on switch.
  index.html: 9 font families merged into the Fonts link + pre-paint
  boot script (allowlist, per-theme meta). themes.js: meta map.
- Theme extras, all reduced-motion gated: tokyo rain + Tokyo Nights
  logo suffix, terminal blinking cursor, synthwave logo glow.
- Skipped per order optionality: view-transition crossfade.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Terminal scanlines sparser

**Files touched:** `webapp/src/styles/tokens.css`, this changelog.

- Terminal overlay scanlines every 6px instead of every 3px.
  Terminal block only.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Terminal scanlines every 2px, fainter, readable font

**Files touched:** `webapp/src/styles/tokens.css`, this changelog.

- Overlay scanlines back to every 2px but fainter (.16 opacity).
  Display font VT323 replaced with JetBrains Mono. Terminal block
  only.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Tokyo-type lines everywhere, overlay below media

**Files touched:** `webapp/src/styles/tokens.css`,
`webapp/src/styles/globals.css`, this changelog.

- 80s + terminal scanlines rebuilt as faint diagonal wide-spaced
  lines (pink / phosphor tints), ending the horizontal scroll
  shimmer. Terminal keeps its vignette.
- Overlay layer dropped to z-index 1; photos, video and embeds in
  the three line-overlay themes paint just above it, so scanlines
  never sit on media. Menus, dialogs and toasts unaffected.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Overlay below content, terminal titles reverted

**Files touched:** `webapp/src/styles/globals.css`, this changelog.

- Why feed media still caught lines: feed cards wrap content in a
  z-index:1 context, capping everything inside below the overlay no
  matter the media rule. Overlay now sits at z-index 0: above page
  and card backgrounds and bare text, below all positioned content,
  so photos, video, embeds, menus, dialogs and toasts stay clean in
  every theme including Light/Dark (no-op there).
- Terminal titles back to the UI font (display font stays on logo
  and buttons only).
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Rain everywhere, media stays clean

**Files touched:** `webapp/src/styles/globals.css`, this changelog.

- 80s and terminal overlays drift on the same rain loop as Tokyo.
  Terminal uses a two-layer keyframe so its vignette stays pinned
  while only the lines move.
- Media exclusion confirmed across tokyo, synthwave and terminal:
  overlay at z-index 1, photos/video/embeds paint just above it.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Card hover glow removed

**Files touched:** `webapp/src/styles/globals.css`, this changelog.

- `.post-card:hover` deleted: no more border light-up or glow on
  hover. Borders stay static. (The now-unused `--card-hover-shadow`
  token stays defined, unconsumed.)
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Terminal titles sized to match 80s retro

**Files touched:** `webapp/src/styles/globals.css`, this changelog.

- Terminal-only: feed/detail/page headings stepped down to match
  the visual size of other themes under the wider mono face.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Themes in the extension side panel

**Files touched:** `src/styles/tokens.css`, `src/styles/panel.css`,
`src/lib/themes.js` (new), `src/main.jsx`,
`src/components/ClipCreator.jsx`, `sidepanel.html`, this changelog.

- Same five themes (80s Retro, Tokyo Night, Terminal, Gruvbox,
  Dracula) appended to the panel tokens; Light/Dark untouched.
  Panel body now reads `--ui-font`, so each theme brings its own
  typeface. No backdrops, rain, or cursor extras in the narrow
  panel: colors and type only.
- Sun/moon header toggle replaced with a palette dropdown (swatches,
  hints, active check, outside-click + Escape). Boot allowlisted.
  Panel Fonts link extended with the theme families.
- Deliberately separate choice from the webapp (different origins,
  different storage). No inline boot script possible under MV3
  extension-page CSP, so first paint behavior is unchanged.
- Checks: extension build passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Committed + pushed; dist rebuilt in place (panel loads from
  dist, reload it on chrome://extensions).

---

## Theme effects in the extension panel

**Files touched:** `src/styles/tokens.css`, `src/styles/panel.css`,
`src/components/ClipCreator.jsx`, this changelog.

- Panel tokens gain the effect set (backdrop, overlay, button
  gradient/glow, text glow, themed scrollbar, display font) with
  `:root` defaults equal to today's values; the five theme blocks
  carry the same effect values as the webapp. Light/Dark untouched.
- Panel wiring: token-driven backdrop + text glow on body, overlay
  layer with rain on all three line themes (two-layer keyframe pins
  the terminal vignette), gradient glow buttons, display type on
  headings/titles/logo/buttons, themed scrollbar. Photos and video
  paint above the overlay; reduced-motion gates kept.
- One deliberate call: button hover stays opacity-only (a gradient
  hover swap would have altered Light/Dark).
- Checks: extension build passes; `npm test` 45/46 (pre-existing
  transcript failure).
- Committed + pushed; dist rebuilt in place (reload the panel on
  chrome://extensions).

---

## Drift masked out of the content column, both surfaces

**Files touched:** `webapp/src/styles/globals.css`,
`src/styles/panel.css`, this changelog.

- The animated overlay is masked transparent across the middle
  content (webapp: outside a centered ~700px band on wide screens;
  panel: outside a centered ~260px band), so rain/scanlines live in
  the background and sides, never marching over cards and text.
- Checks: webapp + extension builds pass; `npm test` 45/46
  (pre-existing transcript failure).
- Committed + pushed; dist rebuilt in place (reload the panel on
  chrome://extensions).

---

## Shibuya photo behind Tokyo theme, any-Spotify routing

**Files touched:** `webapp/public/themes/tokyo-night.jpg` (new, 301KB),
`webapp/src/styles/tokens.css`, `content.js`,
`src/lib/pageDetector.js`, this changelog.

- Tokyo `--bg-image` gains the rainy-Shibuya photo (optimized JPEG)
  under an .80/.86 theme-tinted veil with the aurora glows kept on
  top. Fixed attachment, full-bleed behind cards.
- Any `open.spotify.com` page (album, track, playlist included)
  opens the recorder; `/intl/` marketing paths still fall through.
- Checks: webapp + extension builds pass.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## New is the default feed

**Files touched:** `webapp/src/pages/Feed.jsx`, this changelog.

- Landing `/` now opens on the New tab for everyone; Best stays one
  tap away with its Home heading. Clean URLs follow the new default.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Tokyo photo via real element, not CSS

**Files touched:** `webapp/src/components/ThemeBackdrop.jsx` (new),
`webapp/src/App.jsx`, `webapp/src/styles/globals.css`,
`webapp/src/styles/tokens.css`, this changelog.

- Gradients from the same rule painted while the `url()` layer in
  it never did, so the photo now rides a real fixed `<img>` (which
  provably loads) with the veil + glows in a div above it and rain
  above that. Dead `url()` layer removed from the token.
- Theme-keyed map (Tokyo only for now), follows theme switches live.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Backdrop positioning immune to stale CSS

**Files touched:** `webapp/src/components/ThemeBackdrop.jsx`,
this changelog.

- The photo rendered in-flow (pushing the page down) when a fresh
  JS bundle met a cached stylesheet without its rules. Positioning
  is now inline styles (fixed, full viewport, behind content), which
  no cache mismatch can strip.
- Checks: webapp build passes.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Tokyo backdrop removed, muted text fixed

**Files touched:** `webapp/src/App.jsx`,
`webapp/src/components/ThemeBackdrop.jsx` (deleted),
`webapp/src/styles/globals.css`, `webapp/src/styles/tokens.css`,
`webapp/public/themes/tokyo-night.jpg` (deleted), this changelog.

- The Tokyo photo backdrop (fixed img + veil div) was the cause of
  muted text on every non-card page: the veil had no z-index, so it
  painted above all normal-flow content, while only feed cards
  (lifted by z-index 1) escaped it. Detail, drafts, saved and
  leaderboard text all sat under the dark veil.
- Feature removed entirely per decision: component, mount, CSS
  rules and the photo asset are gone; Tokyo's `--bg-image` is now
  `none`, so the theme is flat `--bg` plus the existing rain
  overlay.
- Checks: root build and webapp build pass; built CSS contains no
  `theme-backdrop` rules and no `themes/` asset.
- Pushed to master with this entry (Cloudflare rebuilds from source).

---

## Theme nudge buddy and extension-updated line

**Files touched:** `webapp/src/components/ThemeNudge.jsx` (new),
`webapp/src/components/Navbar.jsx`, `webapp/src/components/RightRail.jsx`,
`webapp/src/styles/globals.css`, this changelog.

- A small animated buddy pops under the navbar theme button on every
  full page load (homepage refresh included): blinks, bobs, points
  up at the button, says "Try themes!". Clicking it opens the theme
  menu; it hides itself when the menu opens and auto-dismisses after
  14s. Shown from 640px up, respects reduced motion.
- The RightRail footer now reads "Extension updated October 6,
  5:20 PM" under "Get the extension".
- Checks: webapp build passes.
---

## Release v7: themes in the side panel, podcast trimmer

**Files touched:** `manifest.json` (2.3.20 -> 2.3.21), this changelog.

- Ships everything since v6: seven themes with a picker in the
  side panel (rain/drift effects, per-theme fonts and glows), the
  podcast trimmer in the clipper, Spotify show pages routing to the
  podcast clipper, and drift masked out of the content column.
- Checks: root build passes; release zip built from `dist` (9 files).
- v7 published on GitHub with `annotated-extension.zip`.
---

## Buddy flies to the GitHub link, releases URL on the rail

**Files touched:** `webapp/src/components/ThemeFlyer.jsx` (new),
`webapp/src/components/ThemeNudge.jsx`, `webapp/src/components/Navbar.jsx`,
`webapp/src/components/RightRail.jsx`, `webapp/src/App.jsx`,
`webapp/src/styles/globals.css`, this changelog.

- On an actual theme change the buddy launches from the theme
  button and flies across the screen (1.3s eased glide, no
  teleporting) to the right-rail GitHub link, lands beside it and
  pops a bubble: "Download the extension here!" - clicking it opens
  the releases page. Docked buddy fades after 15s; pages without
  the rail dock him to the bottom-right corner.
- The load-time "Try themes!" nudge steps aside when a theme
  change fires so the two never overlap; the shared buddy SVG now
  lives in `ThemeNudge` and is reused by the flyer.
- The rail "GitHub" link now points at
  `https://github.com/e-isdl/annotated-extension/releases`.
- Checks: webapp build passes.
---

## Buddy lands below the GitHub link, cute face

**Files touched:** `webapp/src/components/ThemeFlyer.jsx`,
`webapp/src/components/ThemeNudge.jsx`, this changelog.

- The flyer now docks just below the GitHub link instead of above
  it, arm pointing up at the link.
- Docked look is a new "cute" buddy variant: happy arc eyes, open
  smile and blush cheeks; the normal blinking face is kept for the
  load nudge and for the flight.
- Checks: webapp build passes.
---

## Slow jetpack flight along a long winding journey

**Files touched:** `webapp/src/components/ThemeFlyer.jsx`,
`webapp/src/components/ThemeNudge.jsx`, `webapp/src/styles/globals.css`,
this changelog.

- The post-theme-change flight is now a long, slow, curved journey
  (~4.2s eased): he dives left across the feed, sweeps along the
  bottom, then rises to the GitHub link. Progress is mapped onto
  arc length so the pace stays steady and watchable, with a gentle
  bank into each turn.
- He rides a jetpack for the trip: a tank on his back with a
  flickering flame, and a jetpack face (wide eyes, open excited
  mouth) that switches to the cute face only once docked.
- The landed bubble now matches the "Try themes!" pill: text and
  buddy share one rounded pill with a tail pointing up at the
  link, copy wrapping inside a max width so nothing overflows the
  right edge (the old side bubble is gone).
- Checks: webapp build passes.
---

## Big advanced jetpack, natural thrust, determined pilot

**Files touched:** `webapp/src/components/ThemeNudge.jsx`,
`webapp/src/components/ThemeFlyer.jsx`, `webapp/src/styles/globals.css`,
this changelog.

- The jetpack is now a proper advanced rig: a big tank with an
  accent stripe and gauge light, a valve cap, and a flared nozzle,
  drawn over his back so it is fully visible.
- Natural thrust: a layered plume (orange outer, yellow mid, hot
  white core) that trails opposite his velocity every frame - the
  jetpack mirrors to whichever side is his back, and when a
  backward direction would cross the tank it flattens to trail
  straight behind instead.
- Fierce determined expression in flight: angled brows, focused
  eyes and a wide confident grin (replaces the old wide-eyed open
  mouth); the bobbing idle animation is off while he is piloting.
- The route now boosts straight up first, cruises across the top,
  carves down the left side, sweeps low and climbs to the link -
  and his body leans into the direction of travel instead of the
  old gravity-pull bank (which pointed the wrong way on leftward
  moves). Flight lengthened to 4.6s.
- Checks: webapp build passes.
### Buddy flight quality pass (Sonnet) — theme-change flight

- Flight speed is now a thrust clock, not a symmetric ease: burst launch (first 10%), long steady cruise, gentle arrival (last 20%), with a power surge on the final pull-up segment so the climb feels powered.
- Banking is curvature-based: the buddy slows through tight waypoints and speeds up on straights, so turns read as real flight instead of constant-velocity sliding.
- Whole-body pitch along the path (climb nose-up, dive nose-down, clamped to ±52°) that levels out for the dock; turn-around is a smooth mirrored scale flip instead of a snap.
- Launch coil-and-pop: brief crouch, squash-and-stretch burst, decayed by ~420ms; landing squash on the docked pill with the bob resuming after 0.55s.
- Exhaust plume length now follows thrust level (crouch, launch burst, cruise, surge, taper) and rotates with the body frame; added heat glow at the nozzle exit under the plume.
- New pooled spark trail: up to 18 world-space dots behind the nozzle during launch burst and cruise, stopping on approach; hidden under reduced motion.
- Bolder determined expression: heavier brows touching larger eyes, wider grin; tail pops in on dock (delayed, springy).
- Files: webapp/src/components/ThemeFlyer.jsx, webapp/src/components/ThemeNudge.jsx, webapp/src/styles/globals.css buddy block.
- Checks: webapp build passes.
### Buddy revert to the simple glider, with puppy manners

- Brought back the original buddy: plain round face, no jetpack, no winding journey - after a theme change he glides in a straight line from the theme button to the GitHub releases link over 2.4s.
- On page refresh he pops up under the theme button saying "Hi!" (then back to "Try themes!"); steps aside on a real theme change and never returns until the page is refreshed.
- After landing he says "hello!", huffs like a puppy (quick body bob + panting mouth), waves his arm excitedly, happy face - for exactly 15 seconds.
- He then fades out and stays gone until the page is refreshed; only one flight per page load (later theme changes do not bring him back).
- Removed the jetpack, spark trail, thrust plume, flight pill copy and all flight-path machinery (ThemeNudge/ThemeFlyer/globals.css buddy block reverted to the simple originals plus the new behaviors).
- Checks: webapp build passes.
### Buddy wording and docked behavior corrected

- At the extension the pill now reads "Try the extension" and its tail points up at the GitHub link (same pill shape as before, retargeted from the buddy to the link).
- Docked buddy now jumps up and down with squash-and-stretch, happy face, still waving - replaced the huffing/panting.
- Removed "hello!" and "Hi!" everywhere: the button buddy says only "Try themes!" (original wording).
- Checks: webapp build passes.
### Buddy rides inside the pill, docked flush under the link

- The flying buddy now rides inside a "Try themes!"-style pill (buddy left, "Try the extension" right, tail on top) instead of a separate bubble.
- The pill glides from the theme button to the GitHub link, lands flush with the link's right edge so the tail points straight up at "GitHub", measured after render for accurate placement.
- At the dock the whole pill jumps up and down with squash-and-stretch while the buddy waves (happy face); pill pops in on launch.
- Removed the old separate bubble element entirely.
- Checks: webapp build passes.
### Buddy flies alone, pill lands around him

- During the flight only the bare buddy glides to the extension - no pill moves.
- The "Try the extension" pill appears (pops in) only after he arrives, flush under the GitHub link with the tail pointing up at it; its width is measured from a hidden copy laid out during the start phase.
- At the dock the pill stays static and the buddy jumps up and down inside it with the smiling face (and waving arm), delayed until the pill has popped in.
- Checks: webapp build passes.
### Buddy redesign: no longer looks like the Reddit logo

- The buddy is now a little puppy: two perky ears with inner-ear detail, two small feet below the body, and a bent raised arm at his side (moved off the top of the head, where it read as Snoo's antenna).
- Arm pivot moved to the new shoulder (33, 29) so pointing and waving swing from the side naturally; arm stays behind the ears and head in layer order.
- Face, cute landed variant, blink/bob/pop animations and all flight behavior unchanged; still only theme variables.
- Checks: root build and webapp build both pass.
### Cuter buddy: shining eyes, gloss, wagging tail

- Big eyes (r3.2) with white glints and a smaller smile; blush cheeks now on both the normal and landed looks.
- Glossy highlight on the forehead and a little curled tail that wags (faster once he lands at the extension).
- Tail added to the reduced-motion freeze list; arm/ears/feet and all flight behavior unchanged.
- Checks: root build and webapp build both pass.
### Word clipper: window follows, finds phrases and sentences

- The 3-minute clipping window now jumps to the selection when you double-click a word and when you drop the start handle (same 30s-behind lock as a real seek), and when closing the word clipper after moving the start - so scrubbing to a later part of the video moves the window there instead of leaving it stale.
- The transcript find box now matches multi-word phrases and whole sentences: the query is split into atomic tokens (lowercased, apostrophes folded, split on punctuation) so "real world engineering" finds "Real-World Engineering" and "dont stop" finds "don't stop". Single-word substring search still works as before; every word of a matched phrase highlights.
- Double-clicking a word inside a find match selects the whole matched phrase (capped at the 90s clip limit), and its text is attached to the clip as the transcript.
- Checks: find-matcher unit checks pass (13/13: phrases, sentences, punctuation, apostrophes, hyphens, overlaps, cap math); extension build passes.
### Stronger theme shimmer, moonlight logo in Tokyo Night

- The animated scanline shimmer (body overlay) is now clearly visible where allowed: 80s Retro pink .06 -> .13, Tokyo Night pale blue .045 -> .10, Terminal green .05 -> .11. Light, dark, gruvbox and dracula untouched.
- Tokyo Night logo glows like moonlight: the mark wears a pale three-layer halo that slowly breathes (4.5s, disabled under reduced motion) and the wordmark carries a moonlit text-shadow - matching the existing per-theme logo treatments (synthwave neon, terminal cursor).
- Checks: webapp build passes.
### Tokyo Night moonlight becomes a corner wash

- Replaced the tight neon-like glow on the logo mark with a still, soft moonlight wash over the whole top-left corner (body::before, above the navbar but below menus, pointer-events none): a brighter heart near the corner melting into a wide faint falloff, so the logo reads as the light source.
- Removed the breathing halo animation, the mark glow and the wordmark glow entirely; the mark is back to plain accent.
- Checks: webapp build passes.
### Buddy guided tour (T button), extension + webapp

- New T button in the extension header and the webapp navbar. Pressing T starts a buddy-guided tour with spotlight bubble, Back/Next/Skip/dots, Esc to exit, T to toggle.
- Extension: DOM-driving engine (new files src/components/tour/: PanelTour engine+scripts, TourBuddy, TourButton; src/styles/tour.css). YouTube tour drives the real UI: seeks, chapter pick, word find + phrase select, embed/record mode switches, take typing. Articles/X/Spotify tours are explain-only. Hard NEVER list enforced in the runner (post, save, drafts-resume, captures, all Continues outside YouTube).
- Webapp: engine copy + reaction tour (WebappTour.jsx, TourButton.jsx, styles/tour.css): reacts to one article/X/YT/podcast card each, plays + pauses YT and episode audio ("this is how it sounds like"), visits the X comments, then tours sidebar/sort/search/create/rail/themes. xCommentPath config present (null = reacted post; installer fills when the user names the X post).
- RULE ZERO enforced: nothing posts, saves, votes or submits anywhere. Exit restores video time, take text and play mode. Clip-range restore is unavailable through the DOM (documented): range stays where the tour left it.
- Tour anchors added via data-tour attributes across clippers, annotation, drafts, cards, players, comments, navbar, sidebar, feed, create and rail. Reduced-motion support throughout, theme vars only.
- Checks: root build and webapp build both pass; tour engine/events/copy verified in both bundles.
### Tour rework: slow auto-play, buddy cursor, no dim, themes first

- The tour is now fully automatic and slow: no Back/Next/Skip buttons or dots, no background dimming. A soft ring marks the stop, the buddy himself glides to each button, taps it with a bounce and ripple, then moves on. Esc or the Tour pill stops it.
- New Tour pill button (mini buddy + "Tour") in the extension header and the webapp navbar; the old bare-T is gone.
- Webapp tour opens with themes: white, dark, 80s, tokyo, terminal at 3s+ each, settling on 80s. Theme flights stay suppressed while touring.
- Copy rewritten short and plain: one line per stop. X tour explains photo vs video (record just the player small and silent, or one crisp screenshot sized to fit) plus the zoom-to-fit framing.
- Post cards drop their harsh borders for a borderless card with soft shadow.
- Checks: root build and webapp build both pass; ring/cursor/ripple/themes-first verified in both bundles.
### Tour quality pass from self-testing

- Ran the full webapp tour in headless Chrome (Playwright, 35 stops, ~4 min): fixed everything found. Longer anchor waits (3.5s default, 9s on async clip pages) so late-loading stops no longer skip; clip-page guard so play/reaction steps never fire on feed cards; recorded-video clips get their own Listen stop (ClipPlayer button) beside the YT-embed one.
- Reactions now quote the source title/caption, not our own take text.
- ThemeNudge hides while touring (no competing buddy); favicon added (killed the only 404s); post cards borderless with soft shadow.
- Full retest: 35/35 stops resolve, zero JS errors, zero failed requests.
### Tour removed from extension and webapp

- Removed the buddy guided tour entirely: deleted the tour components, buttons, styles and engine from both apps, unmounted everything, and stripped all data-tour anchors.
- Kept the unrelated improvements that came with it: borderless post cards, favicon, word-clipper phrase matching and window-follow.
- Checks: root build and webapp build both pass; no tour strings remain in either bundle.
### Corner buddy guide replaces the tour and the theme nudge

- New BuddyGuide: the buddy lives fixed in the bottom-right corner, leans toward the cursor (lerped, capped), and explains whatever is hovered via data-buddy tips with a soft ring. No autoplay, no navigation, no dimming, no sound. One-time greeting bubble, Esc-equivalent exits via pointer leave, typing/clicking dismisses politely.
- Header Tour pill is now his on/off switch (default on, persisted, sleepy dimmed state when off).
- Deleted the old autoplay tour leftovers and the under-theme-button ThemeNudge; buddy art moved verbatim to BuddyArt shared by the flyer and the guide.
- New For You sidebar section with Following, opening a placeholder wall until the feature exists.
- Post cards drop harsh borders for a borderless card with soft shadow.
- Checks: webapp build passes; guide engine, ring, bubble, toggle and all 36 tip anchors verified in the bundle.
### Guide removed, minimal Hi kept, For You on top

- Removed the corner buddy guide entirely (engine, toggle, tips, ring, tracking, all data-buddy hooks). Kept a minimal one-time corner Hi bubble, no tracking or tips.
- For You section moved to the top of the sidebar above Discover; the old sidebar Following link removed. Inside the For You page, Following is a section linking to the not-available wall.
- Checks: webapp build passes; no guide remnants in the bundle.
### Yellow highlight gated, Try-themes nudge back, For You on top

- Double-clicking words no longer paints them yellow everywhere: the content script only highlights while the side panel article clipper explicitly arms it (disarms on leave/close). Explicit restores still paint.
- The Try themes buddy is back under the theme button, flying to the extension on theme change. Corner Hi greeting removed with the rest of the guide.
- Sidebar is now For You (with Following) on top, Discover below it. Following opens the not-available wall directly; the unlinked For You page is gone.
- Checks: root build and webapp build both pass.