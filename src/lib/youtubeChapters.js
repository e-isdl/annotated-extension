// Chapter extraction for the YouTube clipper, kept here (dependency-free)
// so it can be unit tested in Node. YouTubeClipper passes this function
// reference straight to chrome.scripting.executeScript, so the body must
// stay self-contained: no imports, no outer references, only page globals
// (window, document, URL, JSON, setTimeout) which exist in the MAIN world.

// Fingerprint of a chapter list. The panel keeps the previous video's
// fingerprint and refuses any read identical to it: during SPA navigation
// the player switches first while the DOM still shows the old video, so
// even player-verified reads can be stale. Shared by panel and page code.
export function chapterKey(list) {
  return (list || []).map((c) => `${c.t}:${c.title}`).join('|');
}
//
// Runs in the page MAIN world (not the isolated content script) because
// only there is the live player API callable: an isolated world cannot
// call page-defined functions, so any player check there silently fails.
// Single pipeline: refuse on player mismatch, DOM markers with confirmation,
// then structured player objects, then globals. No description scraping.
export async function readChaptersMainWorld(args) {
  try {
    const wantId = String((args && args.videoId) || '');
    const maxT = Number((args && args.duration) || 0);
    const prevVideoId = String((args && args.prevVideoId) || '');
    const prevKey = String((args && args.prevKey) || '');
    const isStaleEcho = (list) => Boolean(
      prevVideoId && prevVideoId !== wantId && prevKey && key(list) === prevKey && list.length,
    );
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let pageId = '';
    try {
      const u = new URL(window.location.href);
      pageId = u.searchParams.get('v') || ((u.pathname.match(/^\/shorts\/([^/?]+)/) || [])[1] || '');
    } catch (e) {}
    const seen = new Set();
    const out = [];
    const visited = new Set();
    const cleanTitle = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v.trim().slice(0, 140);
      if (v.simpleText) return String(v.simpleText).trim().slice(0, 140);
      if (Array.isArray(v.runs)) return v.runs.map((r) => r.text || '').join('').trim().slice(0, 140);
      return '';
    };
    const chapSeconds = (text) => {
      const m = String(text || '').trim().match(/^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/);
      if (!m) return null;
      return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]);
    };
    const parseT = (v) => {
      if (typeof v === 'number' && isFinite(v) && v >= 0) return Math.floor(v);
      return chapSeconds(v);
    };
    const push = (t, title) => {
      t = Math.round(Number(t));
      title = String(title || '').trim().slice(0, 140);
      if (!Number.isFinite(t) || t < 0 || !title || seen.has(t)) return;
      seen.add(t);
      out.push({ t, title });
    };
    // DOM markers, scoped to the current video's own surfaces. A
    // whole-document query also catches other videos' markers (up-next,
    // hover cards, end screens); the player's own markers may live outside
    // the description, so both are read and merged.
    const readDomMarkers = () => {
      let scopes = [];
      try {
        scopes = [
          document.querySelector('ytd-watch-metadata'),
          document.querySelector('#movie_player'),
          document.querySelector('#description-inline-expander'),
          document.querySelector('#description'),
        ].filter(Boolean);
      } catch (e) {
        scopes = [];
      }
      if (!scopes.length) return false;
      scopes.forEach((root) => {
        let els = [];
        try {
          els = root.querySelectorAll('ytd-macro-markers-list-item-renderer');
        } catch (e) {
          els = [];
        }
        els.forEach((el) => {
          const lines = String((el && el.innerText) || '').split('\n').map((s) => s.trim()).filter(Boolean);
          if (!lines.length) return;
          let t = null;
          let ti = -1;
          for (let i = 0; i < lines.length; i += 1) {
            const s = chapSeconds(lines[i]);
            if (s !== null) {
              t = s;
              ti = i;
              break;
            }
          }
          if (t === null) return;
          const title = lines.slice(ti + 1).filter((line) => chapSeconds(line) === null).join(' ').trim().slice(0, 140)
            || lines.slice(0, ti).join(' ').trim().slice(0, 140);
          if (!title) return;
          push(t, title);
        });
      });
      return true;
    };
    const scan = (node, depth) => {
      if (!node || depth > 12 || visited.has(node)) return;
      if (typeof node !== 'object') return;
      visited.add(node);
      if (Array.isArray(node)) {
        if (node.length > 400) return;
        for (const item of node) {
          if (item && typeof item === 'object') {
            const cr = item.chapterRenderer;
            if (cr) {
              const title = cleanTitle(cr.title);
              const t = cr.timeRangeStartMillis != null ? Number(cr.timeRangeStartMillis) / 1000 : null;
              if (title && t != null) push(t, title);
            }
            // Player-bar chapter maps (multiMarkersPlayerBarRenderer) carry
            // the current video's chapters in structured form.
            const cmap = item.key === 'CHAPTER' && item.value && item.value.chaptersArray;
            if (cmap && Array.isArray(cmap.chapters)) {
              cmap.chapters.forEach((ch) => {
                const ccr = ch && ch.chapterRenderer;
                if (!ccr) return;
                const title = cleanTitle(ccr.title);
                const t = ccr.timeRangeStartMillis != null ? Number(ccr.timeRangeStartMillis) / 1000 : null;
                if (title && t != null) push(t, title);
              });
            }
            const mm = item.macroMarkersListItemRenderer;
            if (mm) {
              const title = cleanTitle(mm.title);
              let t = mm.startTimeSeconds != null ? Number(mm.startTimeSeconds) : null;
              if (t == null) t = parseT(cleanTitle(mm.timeDescription));
              if (title && t != null) push(t, title);
            }
          }
          scan(item, depth + 1);
        }
        return;
      }
      let keys = [];
      try {
        keys = Object.keys(node);
      } catch (e) {
        return;
      }
      if (keys.length > 400) return;
      for (const k of keys) {
        try {
          scan(node[k], depth + 1);
        } catch (e) {}
      }
    };
    const snapshot = () => {
      const sorted = out.slice().sort((a, b) => a.t - b.t);
      // The duration cap only applies to sane feature-length values: during
      // ads the reported duration can be the ad's length, which must never
      // filter out the real chapters.
      const inRange = sorted.filter((c, i) => (i === 0 || c.t > sorted[i - 1].t) && (!(maxT > 120) || c.t < maxT));
      const list = inRange.slice(0, 200);
      return list.length >= 3 ? list : [];
    };
    // The live player response is always the current video. A player on
    // another video means mid-transition: refuse outright instead of
    // serving possibly-stale data under the wanted id.
    let liveResponse = null;
    try {
      liveResponse = document.querySelector('#movie_player') && document.querySelector('#movie_player').getPlayerResponse
        ? document.querySelector('#movie_player').getPlayerResponse()
        : null;
    } catch (e) {
      liveResponse = null;
    }
    const liveId = liveResponse && liveResponse.videoDetails ? String(liveResponse.videoDetails.videoId || '') : '';
    if (liveResponse && wantId && liveId && liveId !== wantId) {
      return { videoId: pageId, wantId, chapters: [] };
    }
    // Structured live read first: the player-bar chapter map carries the
    // COMPLETE list, while rendered DOM markers can be a virtualized subset.
    // Returning DOM-only first is how lists came back short.
    if (liveResponse && (!wantId || !liveId || liveId === wantId)) {
      try {
        scan(liveResponse, 0);
      } catch (e) {}
    }
    // DOM markers next, with confirmation: markers render progressively
    // and can pause mid-render, so track the longest list and only trust it
    // after repeats with no further growth. Everything unions into one
    // deduped list, so partial sources complete each other.
    const key = (list) => (list || []).map((c) => `${c.t}:${c.title}`).join('|');
    let best = [];
    let streak = 0;
    let scopesSeen = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (readDomMarkers()) scopesSeen = true;
      } catch (e) {}
      const list = snapshot();
      // A list identical to the previous video's is the old page still
      // rendered, not the new video: ignore it and keep waiting.
      if (!isStaleEcho(list)) {
        if (key(list) === key(best)) {
          streak += 1;
        } else if (list.length > best.length) {
          best = list;
          streak = 0;
        } else {
          streak = 0;
        }
        if (best.length >= 3 && streak >= 2 && !isStaleEcho(best)) {
          return { videoId: pageId, wantId, chapters: best.slice(0, 200) };
        }
      }
      // No marker containers at all (embeds, music, shorts): nothing will
      // ever render, so stop after one confirmation read.
      if (!scopesSeen && attempt >= 1) break;
      if (attempt < 3) {
        try {
          await sleep(700);
        } catch (e) {}
      }
    }
    if (best.length >= 3 && !isStaleEcho(best)) {
      return { videoId: pageId, wantId, chapters: best.slice(0, 200) };
    }
    // Structured fallback: the global page objects, which can lag on
    // navigation behind the live player.
    const roots = [];
    try {
      if (window.ytInitialData) roots.push(window.ytInitialData);
    } catch (e) {}
    try {
      if (window.ytInitialPlayerResponse) roots.push(window.ytInitialPlayerResponse);
    } catch (e) {}
    try {
      const raw = window.ytplayer && window.ytplayer.config && window.ytplayer.config.args
        && window.ytplayer.config.args.player_response;
      if (raw) roots.push(JSON.parse(raw));
    } catch (e) {}
    for (const r of roots) {
      try {
        scan(r, 0);
      } catch (e) {}
    }
    // NOTE: shortDescription timestamp lines are deliberately NOT harvested:
    // they vary between visits and produced phantom chapter lists.
    // Structured marker renderers above are the only fallback source.
    const chapters = snapshot();
    if (isStaleEcho(chapters)) return { videoId: pageId, wantId, chapters: [] };
    return { videoId: pageId, wantId, chapters };
  } catch (e) {
    return { videoId: '', wantId: '', chapters: [] };
  }
}
