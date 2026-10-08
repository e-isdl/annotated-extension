// Chapter extraction for the YouTube clipper, kept here (dependency-free)
// so it can be unit tested in Node. YouTubeClipper passes this function
// reference straight to chrome.scripting.executeScript, so the body must
// stay self-contained: no imports, no outer references, only page globals
// (window, document, URL, JSON) which exist in the MAIN world too.
export function readChaptersMainWorld(args) {
  try {
    const wantId = String((args && args.videoId) || '');
    const maxT = Number((args && args.duration) || 0);
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
    const parseT = (v) => {
      if (typeof v === 'number' && isFinite(v) && v >= 0) return Math.floor(v);
      const m = String(v || '').trim().match(/^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/);
      if (!m) return null;
      return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]);
    };
    const push = (t, title) => {
      t = Math.round(Number(t));
      title = String(title || '').trim().slice(0, 140);
      if (!Number.isFinite(t) || t < 0 || !title || seen.has(t)) return;
      seen.add(t);
      out.push({ t, title });
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
      try { keys = Object.keys(node); } catch (e) { return; }
      if (keys.length > 400) return;
      for (const k of keys) {
        try { scan(node[k], depth + 1); } catch (e) {}
      }
    };
    let pageId = '';
    try {
      const u = new URL(window.location.href);
      pageId = u.searchParams.get('v') || ((u.pathname.match(/^\/shorts\/([^/?]+)/) || [])[1] || '');
    } catch (e) {}
    // The live player response is always the current video: scan it first
    // and alone. Global page objects can hold other videos' data (up-next,
    // hover cards), so they are only a fallback.
    let liveResponse = null;
    try {
      liveResponse = document.querySelector('#movie_player') && document.querySelector('#movie_player').getPlayerResponse
        ? document.querySelector('#movie_player').getPlayerResponse()
        : null;
    } catch (e) { liveResponse = null; }
    const liveId = liveResponse && liveResponse.videoDetails ? String(liveResponse.videoDetails.videoId || '') : '';
    // A live player on another video means mid-transition: refuse outright
    // instead of serving possibly-stale globals under the wanted id.
    if (liveResponse && wantId && liveId && liveId !== wantId) {
      return { videoId: pageId, wantId, chapters: [] };
    }
    const snapshot = () => {
      const sorted = out.slice().sort((a, b) => a.t - b.t);
      // The duration cap only applies to sane feature-length values: during
      // ads the reported duration can be the ad's length, which must never
      // filter out the real chapters.
      const inRange = sorted.filter((c, i) => (i === 0 || c.t > sorted[i - 1].t) && (!(maxT > 120) || c.t < maxT));
      const list = inRange.slice(0, 200);
      return list.length >= 3 ? list : [];
    };
    if (liveResponse && (!wantId || !liveId || liveId === wantId)) {
      scan(liveResponse, 0);
      const liveOnly = snapshot();
      if (liveOnly.length) return { videoId: pageId, wantId, chapters: liveOnly };
    }
    const roots = [];
    try { if (window.ytInitialData) roots.push(window.ytInitialData); } catch (e) {}
    try { if (window.ytInitialPlayerResponse) roots.push(window.ytInitialPlayerResponse); } catch (e) {}
    try {
      const raw = window.ytplayer && window.ytplayer.config && window.ytplayer.config.args
        && window.ytplayer.config.args.player_response;
      if (raw) roots.push(JSON.parse(raw));
    } catch (e) {}
    for (const r of roots) scan(r, 0);
    // NOTE: shortDescription timestamp lines are deliberately NOT harvested:
    // they vary between visits and produced phantom chapter lists.
    // Structured marker renderers above are the only source.
    const chapters = snapshot();
    return { videoId: pageId, wantId, chapters };
  } catch (e) {
    return { videoId: '', wantId: '', chapters: [] };
  }
}
