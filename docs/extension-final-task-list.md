# ANNOTATED EXTENSION: FINAL TASK LIST (v2)

Scope: the Chrome extension (side panel) only. The web app is finished.
Do not edit the web app. Read it only where a task says so.

Each task has three parts:
- WHY — the reason the task exists
- DO — exactly what to build
- RESULT THE MASTER WANTS — what the owner should see when it is done

The extension has not been touched yet. Build in the order below.

## COMBINED FINAL PHASE — 3 tasks (master's order, replaces T11–T16 as separate units)

Status: **T1–T10 are DONE** (one commit each; changelog in `docs/extension-changelog.md`).
The remaining work is regrouped into 3 bigger tasks to move faster. Each combined
task keeps the full original DO/RESULT text of the tasks it swallows, gets built,
built-checked, changelogged and committed as ONE commit.

| Combined task | Swallows | What the master sees |
|---|---|---|
| **C1 — Article screen + page highlighter** | T11 + T12 | Selecting article text glows yellow on the page; the article screen gets the marker design (empty + selected states, Grab selection, Edit text). |
| **C2 — Take screen + transcript** | T13 + T14 + T15 | Take box on top with Speak it; community/post type below; transcript behind a Show/Hide toggle with Clip/Full tabs; transcript text cleaned of um/[music]/stutters. |
| **C3 — Final test pass** | T16 | Full checklist run on real pages (embed + record end-to-end, errors, design checks), fixes for anything found, final changelog. |

Rules stay identical (one commit per combined task, no new permissions, yellow only
for highlight, 14px minimum). The "Do not edit the web app" rule remains lifted for
the clip-file playback added in T10 (master's explicit override).

## What changed from v1
1. The design is now clearly Annotated's own. It no longer follows the reference screens closely.
2. All on-screen wording is new. No line is reused from the reference.
3. YouTube clips now have two options: Embed clip and Record clip.

## Attached references
- Current Annotated extension screenshots (the "before").
- Three screenshots of another product's side panel, for mood only (friendly, spacious, one clear action per screen). Do not follow their layout, icons or wording.

## Keep these differences from the reference. Do not drift back:
- No numbered circle badge. A two-stop progress rail is used instead.
- No small uppercase label above a big heading.
- No boxed source card with a link icon. A slim source strip is used.
- No solid yellow slab. The article screen uses yellow marker on text.
- No big centered play button. Preview sits in the thumbnail corner.
- No pill-shaped buttons. Buttons are rounded rectangles (radius 12).
- No separate "record a voice take" row. Speaking lives inside the take box.
- No "Back to" link. The progress rail takes you back.
- No wording copied from the reference. Use the wording in this file.

## Rules for every task
1. Add nothing that is not in this file.
2. Keep the existing font families. Add no fonts. Add no dependencies.
3. Keep limits already in the code (word cap, clip length cap, text length, audio length). Show them in the UI.
4. Do not change auth or the existing message contracts. Tasks T6, T7, T8 and T10 are the only ones that add behavior.
5. Add no new manifest permissions. Do not add tabCapture.
6. If this file conflicts with what the code does, keep the code's behavior, apply the design, and list the conflict in the changelog.
7. After each task: build, load unpacked, take a screenshot, commit.

## Design rules for every task
- Dark panel, red and black. Near-white text on near-black.
- Red is for actions and the progress rail. Never for body text.
- Yellow is only for highlighted or selected text. Nothing else.
- Minimum text size 14px. Body 16px.
- One primary action per screen.
- Short, friendly, active wording.
- Every control has default, hover, active, focus, disabled and loading states. Focus ring: 2px solid, 2px offset.

---

# PART A: FOUNDATION

## T1. FIND THE CODE

WHY
: The new recorder and the embed option must plug into what already exists, and the old download flow must be removed cleanly. Guessing here breaks posting.

DO
: Run these in the extension repo (adjust folder names):

```
git ls-files | head -300
grep -rniE "apify|yt-dlp|ytdlp|downloader|clip.?job|build.?clip" src extension | head -50
grep -rniE "storage\.from|createSignedUploadUrl|\.upload\(" src extension | head -50
grep -rniE "start_sec|end_sec|clip_url|clipUrl|video_url" src extension | head -50
grep -rniE "preview.?clip|transcript|getSelection|currentTime|sidePanel" src extension | head -50
grep -rnE "#[0-9a-fA-F]{3,8}\b" src extension --include=*.css --include=*.ts --include=*.tsx --include=*.jsx | wc -l
```

Then open the web app code read-only and run the start_sec / clip_url / storage greps there. Write down:
- a. the screens (clip, article, take) and their files
- b. where the extension asks the cloud to build the clip today
- c. what the web app reads to play a recorded clip: storage bucket, path pattern, column names, file type
- d. proof that a post with start_sec and end_sec and no clip file plays through the YouTube embed in the web app (this is the Embed clip option)
- e. the post-creation function

If (d) is not true, do not fix it in the web app. Report it in the changelog.

RESULT THE MASTER WANTS
: A short map in the changelog. No guessing about where anything lives or what the web app expects for each option.

## T2. MAKE TEXT BIGGER AND BRIGHTER

WHY
: The current text is small and dim gray on near-black. It is hard to read and looks dull. The master asked for brighter, bigger, easy-to-read text in a red and black look.

DO
: Put these tokens in one tokens.css. Replace every hardcoded color found by the grep in T1 with a variable.

```css
:root {
  --bg:#0D0D0F;  --surface:#17171A;  --surface-2:#212126;  --surface-3:#2B2B32;
  --border:#3A3A42;  --border-strong:#53535E;
  --text:#FAFAFA;  --text-2:#D0D0D6;  --text-3:#A8A8B3;
  --red:#FF4545;  --red-btn:#E5192B;  --red-btn-hover:#FF2E3F;  --on-red:#FFFFFF;
  --red-soft:rgba(255,69,69,.14);
  --yellow:#FFE14D;  --on-yellow:#111114;
  --ok:#3DDC84;  --warn:#FFB020;
  --focus:#FFE14D;
  --r-btn:12px;  --r-card:16px;
}
```

Sizes:
- Minimum text 14px. Body 16px. Headings 26px/700, sentence case.
- Buttons use --r-btn (12px). Cards use --r-card (16px). No pills.
- Text is never dimmer than --text-3.

Create scripts/contrast.mjs and fix every FAIL it prints:

```js
const lum = h => { const [r,g,b] = [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255)
  .map(c => c <= .03928 ? c/12.92 : ((c+.055)/1.055)**2.4);
  return .2126*r + .7152*g + .0722*b };
const ratio = (a,b) => { const [hi,lo] = [lum(a),lum(b)].sort((x,y)=>y-x);
  return (hi+.05)/(lo+.05) };
const t = { bg:'#0D0D0F', surface:'#17171A', s2:'#212126', text:'#FAFAFA',
            t2:'#D0D0D6', t3:'#A8A8B3', red:'#FF4545', btn:'#E5192B' };
const pairs = [['text','bg',7],['text','surface',7],['t2','bg',7],['t2','surface',7],
  ['t3','bg',4.5],['t3','surface',4.5],['t3','s2',4.5],['red','bg',4.5],['red','surface',4.5]];
for (const [fg,bg,min] of pairs) { const r = ratio(t[fg], t[bg]);
  console.log(fg, 'on', bg, r.toFixed(2), r >= min ? 'ok' : 'FAIL (min '+min+')'); }
const b = ratio('#FFFFFF', t.btn);
console.log('white on button', b.toFixed(2), b >= 4.5 ? 'ok' : 'FAIL');
```

RESULT THE MASTER WANTS
: Every label, hint, time and button reads clearly at a glance. Nothing is dim or tiny. The panel looks red and black, not gray.

## T3. ADD THE AVATAR MENU

WHY
: "Sign out" as a dim text link in the corner is easy to miss and easy to hit by accident. The master liked putting sign out inside an avatar menu.

DO
: Header, 56px tall.
- Left: red "A" mark and the "Annotated" wordmark (18px/700).
- Right: 36px round avatar button. It opens a small menu with "Sign out".
- Remove the old "Sign out" text link.

Chrome owns the pin and close buttons above the panel. Do not touch them.

RESULT THE MASTER WANTS
: A clean header with the person's avatar at the right. Sign out is one tap inside the avatar menu.

## T4. ADD THE PROGRESS RAIL AND SOURCE STRIP

WHY
: Every screen should tell the person two things right away: where they are in the flow and what they are annotating. A slim rail and a slim strip do that without taking much room, and give the panel its own look.

DO
: Progress rail (under the header)
- Two stops joined by a 2px line:
  - videos: Clip ---------- Take
  - articles: Quote --------- Take
- Stop = 12px dot + label (16px/600). The current stop has a filled red dot and a --text label. The other stop has a hollow dot (--border-strong) and a --text-3 label. The line is red up to the current stop and --border after it.
- A finished stop is a button. On the Take screen, "Clip" (or "Quote") takes the person back and keeps what they did. On the first screen, "Take" is not clickable.

Source strip (under the rail)
- No card fill. A 3px left rule in --border-strong, 12px of padding to its right.
- Row 1: platform icon (16px) and the word "YouTube" or "Article" (14px/600, --text-2). At the far right, a ghost text button "Open source" (14px/600, --red) that opens the page in a new tab.
- Row 2: the page title, 16px/600, up to 2 lines, never cut to one line.

Headings
- Sentence case, 26px/700, left aligned, 16px above the content.
- Clip screen "Which part matters?"
- Article screen "Pick your quote."
- Take screen "Say what you think."

Buttons
- Primary: solid red, 52px, white 16px/600, radius 12, full width.
- Secondary: --surface-2 fill, 1px --border, --text, 48px, radius 12.
- Ghost: text only, --text-2, 44px.
- Disabled primary: --surface-2 fill, --text-3 text. Never dark red on black.

Spacing: panel padding 20px, 24px between groups.

RESULT THE MASTER WANTS
: Every screen has the same clean top: rail, source strip, plain heading. The person always knows where they are, and the look is clearly Annotated's own.

---

# PART B: THE CLIP SCREEN (VIDEOS)

## T5. REDESIGN THE CLIP SCREEN

WHY
: The current clip screen has text over the thumbnail, a slider whose two handles overlap, and time fields that cut off ("9:2", "10:"). It is hard to read and hard to use. Putting Start and End into two matching cards also removes the clutter of separate buttons and fields.

DO
: (wireframe in original — clip screen layout: header, rail, source strip, heading, thumbnail with corner Preview chip + length chip, slider, Start/End cards side by side, clip length row, "How should it play?" radio options, Continue)

Thumbnail
- 16:9, radius 16, nothing written across the picture.
- Bottom-left: a small chip with a play icon and "Preview" (14px/600, white on --bg at 80%). It runs the existing preview action. While previewing it reads "Stop". Remove the old red "Preview clip" link.
- Bottom-right: a chip with the video length (14px).

Slider (existing, restyled)
- 8px track in --border, selected range in --red.
- Handles 28px, white, red ring, placed just outside the selected range edges so they never overlap, even for a 5 second clip. 44px hit area.

Start and End cards (existing fields, new home)
- Two equal cards side by side, --surface fill, 1px --border, radius 16, 12px padding. At 320px wide they still sit side by side.
- Inside each: label ("Start" or "End", 14px/600, --text-2); the time as an editable field (24px/700, tabular numbers, wide enough for h:mm:ss, never truncates); the Set button (T6); two nudge buttons "-5s" and "+5s" (44px, secondary).
- Under both cards: "Clip length 1 min 24 s" on the left. If the code has a maximum clip length, "Max 1:30" on the right. The length turns red when it is over the maximum.

How should it play? (T7). Primary button: see T7.

RESULT THE MASTER WANTS
: A clean clip screen in red and black with its own look: slim rail and source strip, a thumbnail with a corner Preview, and two matching Start and End cards. Nothing overlapping, nothing cut off.

## T6. ADD SET START HERE AND SET END HERE

WHY
: Finding 30 seconds inside a 26 minute (or 2 hour) video by dragging a slider is slow and inaccurate. Pressing a button at the exact moment you hear it is fast. The master called this "awesome" and "perfect".

DO
- Each Start and End card has a full-width secondary button, 48px: "Set start here" and "Set end here".
- Pressing one reads the current playback time of the video on the page and puts it in that card's time field. The slider updates to match.
- If the end is not after the start, show one line under the cards: "End needs to come after the start."
- Content script: expose the page video's currentTime to the panel (panel asks, content script answers with video.currentTime). If the existing preview already talks to the page video, extend that code. Do not duplicate it.
- Flow: play or scrub the video on the page, press Set start here, play on, press Set end here.

RESULT THE MASTER WANTS
: A 20 second moment inside a 2 hour video takes under 15 seconds to mark: play, press Set start here, press Set end here.

## T7. OFFER TWO WAYS TO PLAY: EMBED OR RECORD

WHY
: The master wants two options for every YouTube clip. Embed is instant and cannot fail, but it depends on YouTube. Record saves the master's own copy with sound, so the clip plays even if YouTube blocks it. The person should choose.

DO
: Option cards under the Start and End cards, titled "How should it play?" (16px/600). Build them as a radio group (role="radiogroup").
- Each option is a row card: 24px icon, title (16px/600), one line of help (14px, --text-2). Min height 72px, radius 16, 1px --border.
- Selected: 2px --red border, --red-soft fill, filled radio dot.
- Embed clip — "Plays from YouTube. Posts right away."
- Record clip — "Saves a video with sound. Takes {length}." where {length} is the current clip length (e.g. "1 min 24 s"). It updates as the range changes.
- Embed clip is selected by default.

Primary button on this screen
- Embed selected: "Continue"
- Record selected, no recording: "Record clip" (starts T8)
- Recording in progress: the recording card replaces the button (T8)
- Recording finished: "Continue" (T9)
- Disabled until the range is valid (existing rule).

Embed path
- "Continue" goes straight to the Take screen. Nothing is recorded or uploaded.
- On post, the extension creates the post with start_sec and end_sec and no clip file (T10). The web app plays it through the YouTube embed, as confirmed in T1.

Record path
- Runs T8, T9 and T10.

Switching
- Switching options before anything is recorded is free.
- While a recording exists, the two option cards are locked. The person unlocks them with "Re-record" or "Use embed instead" (T9).

RESULT THE MASTER WANTS
: On every YouTube clip I choose: Embed clip, which posts instantly and plays from YouTube, or Record clip, which makes my own copy with sound. Either way the flow feels the same and nothing breaks.

## T8. RECORD THE CLIP

WHY
: The old way sent the YouTube link to a cloud downloader (Apify, yt-dlp). YouTube blocks those downloaders, so clips failed, were slow and cost money. The browser is already playing the video with sound. Recording what it plays needs no download, cannot be bot-blocked, and keeps the audio exactly as it plays. The master wants the extension to record the clip, not fetch the link and download the link.

HOW IT WORKS
: Record the video element itself, not the whole tab.
- The content script on youtube.com calls video.captureStream(). That gives the video picture and its sound without the YouTube page around it. It needs no new permission and no screen-share picker.
- MediaRecorder turns that stream into a file while the chosen range plays once.
- The file travels to the side panel in chunks and waits there until posting (T10).

DO
1. Content script: add recordClip({ start, end }).
   - a. Find the video: document.querySelector('video.html5-main-video'), else the first video inside #movie_player.
   - b. Check before starting. If a check fails, do nothing and send the panel the matching message:
     - no video found → "Open a YouTube video to record a clip."
     - an ad is playing (#movie_player has class ad-showing) → "Wait for the ad to finish, then try again."
     - video muted or volume 0 → "Unmute the video so the clip has sound."
     - tab hidden (document.visibilityState is not 'visible') → "Keep this tab in front while recording."
     - end <= start, or longer than the max clip length → use the existing validation message
     - captureStream missing, or no video track → "This video can't be recorded. It may be protected."
   - c. video.pause(); set video.currentTime = start; wait for 'seeked'.
   - d. const stream = video.captureStream(); then video.play() and wait for 'playing'.
     - If play() is rejected: "Press play on the video once, then try again."
     - If the stream has no audio track once playing: stop and show "No sound was captured. Check that the video isn't muted."
   - e. Pick the format with MediaRecorder.isTypeSupported, in this order:
     - video/mp4;codecs=avc1.42E01E,mp4a.40.2 (plays everywhere)
     - video/webm;codecs=vp9,opus
     - video/webm;codecs=vp8,opus
     Options: videoBitsPerSecond 1000000, audioBitsPerSecond 128000. Adjust so a 90 second clip stays under 15 MB and under the storage bucket's file size limit.
   - f. recorder.start(1000). Stop when video.currentTime >= end. Poll every 100 ms (timeupdate alone is too coarse). Then video.pause() and recorder.stop().
   - g. Cancel handling. If the person presses Cancel, closes the panel, leaves the page, the video changes, or a track ends early: stop the recorder, throw the data away, pause the video, and report "Recording stopped."
2. Sending to the side panel
   - The panel starts a recording with chrome.tabs.sendMessage(tabId, { type: 'record-clip', start, end }).
   - The content script opens chrome.runtime.connect({ name: 'annotated-recorder' }) and posts:
     - { type:'progress', t } — 4 times a second (seconds recorded)
     - { type:'chunk', i, data } — each recorder chunk as base64 text
     - { type:'done', mime, seconds }
     - { type:'error', code, message }
   - Runtime messages cannot carry Blobs, so chunks go as base64 text (read each chunk with blob.arrayBuffer(), encode in 32 KB pieces).
   - The panel listens with chrome.runtime.onConnect, decodes the chunks, and builds new Blob(parts, { type: mime }).
   - If the port closes before 'done', discard everything and show "Recording stopped."
3. Recording card (takes the place of the thumbnail; the Start and End cards, slider and option cards are dimmed and locked):
   - (red dot) Recording / 0:12 of 1:24 / progress bar / "Keep this tab open. Don't pause, seek or mute." / [ Cancel ]
   - The red dot pulses (no motion with prefers-reduced-motion).
   - Progress bar is red. Main text 16px. Note 14px, --text-2.
4. If recording fails, show a banner with the reason and two buttons: "Try again" and "Use embed instead". The second one switches the option to Embed clip and carries on.
5. Known limits. Put these in the changelog so the master knows:
   - Recording runs in real time. A 1 minute clip takes 1 minute.
   - The YouTube tab must stay open and in front.
   - Ads and protected (DRM) videos cannot be recorded.
   - The file quality follows the player's current quality, capped by the bitrate above.

RESULT THE MASTER WANTS
: I pick Record clip, press the button, and the video plays that part once. I end up with a real video file of it, with sound. No link goes to any downloader.

## T9. SHOW THE RECORDED CLIP

WHY
: The person should see and hear exactly what will be posted before they continue, and be able to redo it or switch to embed. Recording in real time means a bad take should be cheap to retry.

DO
- When the recorder reports 'done', the thumbnail area becomes a <video controls> that plays the recorded Blob (URL.createObjectURL) with sound. 16:9, radius 16.
- Under it, one line: "1 min 24 s, 9.8 MB" (14px, --text-2).
- Two buttons under that line:
  - "Re-record" (secondary). Throws the recording away, revokes the object URL, and unlocks the cards, slider and options.
  - "Use embed instead" (ghost). Throws the recording away and switches the option to Embed clip.
- The primary button reads "Continue".
- While a recording exists, the Start and End cards, slider and option cards stay locked, because changing them would no longer match the file.
- Going back with the rail ("Clip") from the Take screen returns here and keeps the recording until the post is made or the person re-records.

RESULT THE MASTER WANTS
: I watch my own clip with sound right in the panel, redo it until I like it, or switch to embed, then continue.

## T10. POST THE CLIP AND REMOVE THE DOWNLOADER

WHY
: Each option needs a different posting path. Record needs the file in our own cloud storage so the web app can play it without YouTube. Embed needs no file at all. Removing the old cloud download flow stops the failures, the waiting and the cost.

DO
1. Use what you found in T1 so the finished web app plays each option with no web app change. Do not edit the web app.
2. Embed clip: on "Post annotation", create the post exactly as today with start_sec and end_sec and no clip file. Upload nothing.
3. Record clip: on "Post annotation", upload the Blob to the bucket and path pattern found in T1, using the extension's existing authenticated Supabase client. Use the correct file extension and content type (.mp4 or .webm). The button shows a spinner and "Uploading". After the upload succeeds, create the post with the same start_sec and end_sec and set the clip file reference the way the web app expects.
4. Delete from the extension: the request that asks the cloud to build the clip, every Apify call, related keys and settings, and code that is no longer used.
5. Errors
   - upload fails → "Couldn't upload the clip." + "Try again"
   - file over the limit → "This clip is too big. Record a shorter one." (check before uploading) + "Use embed instead"
6. Feed thumbnails and transcripts keep working exactly as they do now.
7. Articles do not record anything and skip all of this.

RESULT THE MASTER WANTS
: Embed posts go live instantly and play from YouTube. Recorded posts play my own clip, with sound, from our storage. YouTube blocking downloaders no longer matters, and nothing in the extension talks to a downloader any more.

---

# PART C: THE ARTICLE SCREEN

## T11. HIGHLIGHT TEXT ON THE PAGE

WHY
: The master wants a yellow highlighter when selecting article text, so the person sees on the page exactly what they are about to quote.

DO
- Use the CSS Custom Highlight API so the page's HTML is never changed (X and other React sites break if the DOM is edited):
  ```js
  const h = new Highlight(range.cloneRange());
  CSS.highlights.set('annotated-selection', h);
  ```
  Inject this CSS from the manifest content_scripts "css" field (or chrome.scripting.insertCSS) so a strict page CSP cannot block it:
  ```css
  ::highlight(annotated-selection){ background-color:#FFE14D; color:#111114; }
  ```
  Use fixed values, not tokens, because the page can be light or dark.
- Keep the highlight after the page selection is cleared (for example when focus moves to the panel). Remove it when the person makes a new selection, closes the panel, or posts.
- If the selection is over the word cap, highlight only the allowed part.
- Test on x.com, a news article and Wikipedia. If the API fails in the isolated world on any of them, fall back to a temporary <mark> wrapper using Range.surroundContents with safe cleanup.

RESULT THE MASTER WANTS
: When I select text on a page, it glows yellow like a real highlighter and stays yellow while I work in the panel.

## T12. REDESIGN THE ARTICLE SCREEN

WHY
: The current screen has dim, small text and a tip that is hard to read. Nothing shows the person what to do. The master wants a highlighter touch that tells you to highlight. Marker on text does that and keeps the panel's own look.

DO
: Empty state (wireframe: rail Quote–Take, source strip, "Pick your quote.", dashed card with marker icon + "Select text" yellow-marked line + helper line + "Grab selection" secondary button, helper line, disabled Continue)

- The card is --surface with a 1.5px dashed --border-strong outline, radius 16, 20px padding. It is dark, not yellow.
- A chunky highlighter-marker icon, 32px, yellow fill.
- First line 18px/1.5, --text. The words "Select text" sit on a yellow marker (class hl-full: background var(--yellow), color var(--on-yellow), box-decoration-break: clone). That is the highlighter hint.
- Second line 16px, --text-2.
- Use the real cap and unit from the code in the copy.
- "Grab selection" is a secondary button (48px, radius 12). It reads the text currently selected on the page, using the same function the panel uses today when it opens. Keep the read-on-open behavior too.
- Remove the old red-bordered "Tip" box.

Selected state
- The card becomes solid (--surface, 1px --border, no dashes).
- Top row: a count pill on the left ("25 / 200 words"; --surface-2, turns --warn from 90% of the cap and red over it) and a ghost button "Edit text" on the right.
- The quote below, 18px/1.7, set in the font the app already uses for quotes, with every line on the yellow marker (class hl-full), like a real highlighted paragraph.
- "Edit text" swaps the quote for a textarea (16px, --surface-2) so the existing editing still works. The button then reads "Done".
- Keep the existing progress behavior, restyled to match.

Footer: "Continue", disabled until text exists. Helper line above it when empty: "Select some text to continue."

RESULT THE MASTER WANTS
: A friendly screen where the words "Select text" are already marked in yellow, so I know what to do. When I pick a passage it appears as bright yellow-highlighted text I can read easily.

---

# PART D: THE TAKE SCREEN

## T13. REDESIGN THE TAKE SCREEN

WHY
: Today the screen starts with community and post type and buries the commentary under a transcript block. The commentary is the point of the whole app. The master wants it at the top, with community and post type below.

DO
: (wireframe: header, rail with both stops filled, source strip with range + Embedded/Recorded chips, "Say what you think.", take box with mic "Speak it" + counter, Transcript toggle, Community + Post type selects, Post annotation + helper line)

- Going back is done with the "Clip" (or "Quote") stop in the rail. No separate back link.
- Video posts show two small chips under the title in the source strip: the range ("9:21 to 10:45") and how it plays ("Embedded" or "Recorded"). 14px, --surface-2 fill, radius 8.
- Take box: --surface fill, 1px --border, radius 16, min-height 160px for the text area, grows with the text, 16px text, placeholder "What stood out to you?" in --text-3.
- Bottom bar inside the box: on the left a ghost button with a mic icon, "Speak it", followed by "up to {max} min" in 14px --text-2 (use the real limit from the code). It opens the existing audio recording mode. On the right, the character counter using the real limit. Remove the old Text/Audio segmented control. Keep the recording logic and limits unchanged.
- Transcript toggle (T14) sits under the box. Videos only.
- Community and Post type sit under the toggle as 48px selects with visible borders and chevrons, radius 12. "(optional)" sits on the same line as the Community label.
- Post annotation: the primary button (52px, radius 12), no icon. Under it a 14px --text-2 line: "Everyone can see this. It links to the original."
- Existing validation, loading and error behavior stay.

RESULT THE MASTER WANTS
: I open this screen and the first thing I see is the box for my take, with the option to speak it. Community and post type are below it where they belong.

## T14. HIDE THE TRANSCRIPT BEHIND A TOGGLE

WHY
: The transcript is long. Showing it by default pushes the commentary out of view, and the current red links and red uppercase label look messy. The master wants it under a toggle with a friendlier design.

DO
: Videos only. Articles skip this.
- One 52px full-width row: chevron, "Transcript", and "Show" or "Hide" on the right. Collapsed by default. Use a real button with aria-expanded.
- Open state: two tabs, "Clip" and "Full" (these replace the two red links "Show clip transcript" and "Show full transcript"). Under the tabs a scroll area, max-height 240px, 15px/1.6, --text-2.
- Show the full word count only inside the Full tab.
- Remove the red uppercase "TRANSCRIPT" label.
- The text shown goes through T15.

RESULT THE MASTER WANTS
: The transcript is out of the way until I want it. One tap shows it, clean and easy to read, with Clip and Full tabs.

## T15. CLEAN UP THE TRANSCRIPT TEXT

WHY
: Raw transcripts are full of "um", "uh", "[music]" and "[laughter]". They are hard to read and look sloppy. The master liked cleaning them.

DO
: Add one function and use it everywhere the extension shows transcript text (the toggle in T14). Display only. Never change the stored text.

```ts
export function cleanTranscript(t: string) {
  return t
    .replace(/\[(music|laughter|applause|clears throat|inaudible)[^\]]*\]/gi, '')
    .replace(/\b(u+m+|u+h+|erm+)\b[,.]?\s*/gi, '')
    .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')      // "my my" becomes "my"
    .replace(/\s{2,}/g, ' ')
    .trim();
}
```

RESULT THE MASTER WANTS
: Transcripts read like clean sentences: no "um", no "uh", no bracketed sound tags, no stuttered repeats.

---

# PART E: FINAL CHECK

## T16. TEST EVERYTHING

WHY
: The recorder depends on browser behavior that differs by video, page state and network, and the two options must both work end to end. This has to be proven on real videos before the master sends the extension to anyone.

DO
: Embed clip
- [ ] Choose Embed clip, post, and open the post in the web app. It plays through the YouTube embed from start to end.
- [ ] Nothing is uploaded and no recorder code runs.

Record clip
- [ ] Record 30 seconds from the middle of a 2 hour video. Open the saved file in a normal video player: the sound is there, the picture matches, the length is about 30 seconds, and no YouTube page or controls are in the picture.
- [ ] Try with the video muted: the panel refuses with the message.
- [ ] Try during an ad: the panel refuses with the message.
- [ ] Press Cancel mid-recording: nothing is uploaded and the video pauses.
- [ ] Close the panel mid-recording: recording stops, nothing uploaded.
- [ ] Switch to another video mid-recording: recording stops.
- [ ] Post: the file appears in storage and the web app plays it with sound and a working progress bar and seek in Chrome and Safari. If seeking or duration is broken for a WebM file, patch the duration after recording with a small helper or prefer the MP4 format.
- [ ] Turn the network off during upload: the error shows and "Try again" works.
- [ ] Open the browser Network tab while posting: no request goes to Apify or any downloader, in either option.
- [ ] "Use embed instead" switches the option and the post works.

Design
- [ ] Contrast script passes. No text under 14px.
- [ ] Fluid at 320, 400 and 520px wide with no sideways scroll. The Start and End cards stay side by side at 320px.
- [ ] Keyboard only: every control reachable, focus ring visible.
- [ ] Handles never overlap; time fields never cut off.
- [ ] No numbered badge, no uppercase label above headings, no pill buttons, no solid yellow slab, no wording from the reference.
- [ ] Article text turns yellow on the page, stays after clicking into the panel, and Grab selection fills the quote card.
- [ ] Take box is the first control under the heading on the take screen.
- [ ] Transcript is collapsed on load and shows cleaned text.
- [ ] Avatar menu has Sign out and the old link is gone.

Test pages: youtube.com/watch, a news article, and x.com.

RESULT THE MASTER WANTS
: Both clip options work on real videos and pages, the recorded clip plays with sound in the web app, the look is clearly Annotated's own, and the master can send the extension to the launch team without worrying about bugs.

---

# DO NOT
- Add anything not listed in this file.
- Edit the web app.
- Add fonts, dependencies or manifest permissions.
- Use yellow for anything except selected or highlighted text.
- Use red for body text.
- Use text under 14px or text dimmer than --text-3.
- Send a YouTube link to any downloader or cloud clipper.
- Reuse wording, icons or layout details from the reference screens.

# DELIVERABLES
1. Working extension code, one commit per task.
2. Before and after screenshots of every screen and state.
3. Contrast script output.
4. A changelog: the map from T1, files touched, the known recording limits from T8, conflicts between this plan and existing behavior, and anything not done with the reason.
