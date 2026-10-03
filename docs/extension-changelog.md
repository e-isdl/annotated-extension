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
