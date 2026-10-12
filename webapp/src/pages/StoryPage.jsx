import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../styles/story.css';

function useReveal() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const items = el.querySelectorAll('.reveal');
    if (typeof IntersectionObserver === 'undefined') return undefined;
    items.forEach((item) => item.classList.add('reveal-init'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
  return root;
}

const SPEC = [
  ['01', 'Sidebar Chrome extension', 'The side panel is the primary surface, on every page.'],
  ['02', 'File-a-claim button', 'Clearly visible on every annotation page.'],
  ['03', 'Every clip links its source', 'Text, audio, and video open the original URL.'],
  ['04', '90 seconds, 240p video', 'Clips capped at 90s and downscaled under 480p.'],
  ['05', 'X or Google sign-in only', 'No email or password flow anywhere.'],
  ['06', 'Social feed, text and audio takes', 'Follow, comment, write or record commentary.'],
];

const CLIPPERS = [
  ['02', 'YouTube, frame-accurate', 'Real 90-second 240p recordings or a light embed. Word-level bounds from transcript double-clicks, verified chapters, and whole-word find with sentence snap.'],
  ['03', 'Articles, quoted with paint', 'Yellow word paint arms only while clipping. A 200-word budget with live count, editable before posting, plus page metadata.'],
  ['04', 'X posts, pixel-perfect', 'Per-post media hunt that never grabs ads. Stitched full-post screenshots, silent loop recording, clean text extraction.'],
  ['05', 'Podcasts, where streams encrypt', 'Episode transport in the panel, a recorder that follows pauses, a waveform trimmer, and no tab-capture permission by design.'],
];

export default function StoryPage() {
  const root = useReveal();
  return (
    <div ref={root} className="story-page" data-theme="dark">
      <div className="story-wrap">
        <header className="story-hero">
          <div>
            <p className="story-eyebrow">The Annotated story</p>
            <h1>Point at the exact <em>moment</em> you mean.</h1>
            <p className="story-sub">A sidebar clipper plus a social feed. Capture the sentence, scene, or second — then say why it matters.</p>
            <div className="story-cta-row">
              <Link to="/" className="btn-primary">Open the feed</Link>
              <a className="btn-ghost" href="https://github.com/e-isdl/annotated-extension/releases/latest" target="_blank" rel="noopener noreferrer">Get the extension</a>
            </div>
          </div>
        </header>

        <section className="story-section" id="spec">
          <p className="story-eyebrow">The bounty spec</p>
          <h2>Every non-negotiable, shipped.</h2>
          <div className="story-rules reveal">
            {SPEC.map(([n, t, d]) => (
              <div key={n} className="story-rule">
                <span className="n">{n}</span>
                <span className="t">{t}</span>
                <span className="d">{d}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="story-section" id="clippers">
          <h2>One clipper per medium. Each the hard way.</h2>
          <p className="story-lede">YouTube gets recordings, not embeds. Articles get paint, not copy-paste. X posts get stitched captures. Podcasts work where streams encrypt.</p>
          <div className="story-stats reveal">
            <div className="story-stat"><div className="v">90<span>s</span></div><div className="k">Maximum clip length, enforced before upload, on video and audio alike.</div></div>
            <div className="story-stat"><div className="v">240<span>p</span></div><div className="k">Recorded video downscaled under the 480p ceiling, every time.</div></div>
            <div className="story-stat"><div className="v">200<span>w</span></div><div className="k">Article quote budget with a live counter, editable before posting.</div></div>
          </div>
        </section>

        <section className="story-section">
          <div className="story-rules reveal">
            {CLIPPERS.map(([n, t, d]) => (
              <div key={n} className="story-rule">
                <span className="n">{n}</span>
                <span className="t">{t}</span>
                <span className="d">{d}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="story-section" id="feed">
          <h2>A feed built for discussion.</h2>
          <div className="story-bento reveal">
            <div className="story-cell tint">
              <div className="t">Takes rail and threads</div>
              <div className="d">Every other take on the same source sits one click away, with threaded follow-ups.</div>
            </div>
            <div className="story-cell">
              <div className="t">Communities, drafts, reposts</div>
              <div className="d">Topic hubs, autosaved drafts, quotes, saves, and follows.</div>
            </div>
            <div className="story-cell">
              <div className="t">Four sorts, demo feed</div>
              <div className="d">Best, Hot, New, and Top, with an editorial demo until the community takes over.</div>
            </div>
            <div className="story-cell">
              <div className="t">Seven themes, claims with reply</div>
              <div className="d">From newsprint light to terminal. Owners reply to claims by email.</div>
            </div>
          </div>
        </section>

        <section className="story-close">
          <h2>A link without the why is just another tab.</h2>
          <p>Annotated keeps the source, the exact moment, and your point of view attached — so the next reader gets context, not just content.</p>
          <div className="story-cta-row">
            <Link to="/" className="btn-primary">Open the feed</Link>
          </div>
          <div className="story-foot">
            <span>Annotated · Chrome extension + social feed</span>
            <span><Link to="/">Home</Link> · <Link to="/explore">Explore</Link></span>
          </div>
        </section>
      </div>
    </div>
  );
}
