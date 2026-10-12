import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

function extractFns(src, names) {
  const closer = /\r?\n\}\r?\n/;
  return names.map((name) => {
    let start = src.indexOf(`async function ${name}(`);
    if (start === -1) start = src.indexOf(`function ${name}(`);
    assert.ok(start !== -1, `missing function ${name}`);
    const tail = src.slice(start);
    const m = tail.match(closer);
    assert.ok(m && m.index !== undefined, `unclosed function ${name}`);
    return tail.slice(0, m.index + m[0].length);
  }).join('\n');
}

const imageCode = extractFns(source, ['metaImageUrl', 'firstSrcsetUrl', 'looksLikeContentImage', 'absolutizeImageUrl']);

function loadPage({ metas = {}, imgs = [] }) {
  const metaEls = Object.entries(metas).map(([key, content]) => ({ key, content }));
  const imgEls = imgs.map(({ src, width, naturalWidth, attrs = {} }) => ({
    currentSrc: src,
    src,
    naturalWidth: naturalWidth ?? width,
    width: width,
    getAttribute: (name) => attrs[name] || null,
    getBoundingClientRect: () => ({ width }),
  }));
  const sandbox = {
    document: {
      title: 'Test',
      addEventListener: () => {},
      querySelector: (sel) => {
        // Generic meta mock: any meta selector returns the matching test key.
        // Supports name=/property= variants for twitter:image, og:image, secure_url, itemprop.
        if (sel.startsWith('meta[')) {
          for (const m of metaEls) {
            if (sel.includes(m.key)) return { content: m.content };
          }
          // Alias keys used in tests.
          if (sel.includes('twitter:image')) {
            const hit = metaEls.find((m) => m.key === 'twitter:image');
            if (hit) return { content: hit.content };
          }
          if (sel.includes('og:image')) {
            const hit = metaEls.find((m) => m.key === 'og:image' || m.key === 'og:secure');
            if (hit) return { content: hit.content };
          }
          if (sel.includes('itemprop')) {
            const hit = metaEls.find((m) => m.key === 'itemprop');
            if (hit) return { content: hit.content };
          }
          return null;
        }
        if (sel === 'link[rel="image_src"]') {
          const hit = metaEls.find((m) => m.key === 'image_src');
          return hit ? { href: hit.content } : null;
        }
        if (sel === 'article') return { querySelectorAll: () => imgEls };
        if (sel === 'main' || sel === 'body') return null;
        return null;
      },
    },
    window: {
      addEventListener: () => {},
      location: { href: 'https://edition.cnn.com/2026/10/08/test', search: '' },
    },
    location: { href: 'https://edition.cnn.com/2026/10/08/test', search: '' },
    chrome: {
      runtime: {
        onMessage: { removeListener: () => {}, addListener: () => {} },
        sendMessage: () => ({ catch: () => {} }),
      },
    },
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
  };
  vm.createContext(sandbox);
  vm.runInContext(imageCode, sandbox);
  return {
    imageUrl: () => vm.runInContext('metaImageUrl()', sandbox),
  };
}

test('prefers the large twitter card image over og:image', () => {
  const page = loadPage({ metas: { 'og:image': 'https://x.com/og.jpg', 'twitter:image': 'https://x.com/tw.jpg' } });
  assert.equal(page.imageUrl(), 'https://x.com/tw.jpg');
});

test('falls back through every card tag', () => {
  assert.equal(loadPage({ metas: { 'og:image': 'https://x.com/og.jpg' } }).imageUrl(), 'https://x.com/og.jpg');
  assert.equal(loadPage({ metas: { itemprop: 'https://x.com/item.jpg' } }).imageUrl(), 'https://x.com/item.jpg');
  assert.equal(loadPage({ metas: { image_src: 'https://x.com/src.jpg' } }).imageUrl(), 'https://x.com/src.jpg');
});

test('rejects data URIs and resolves relative URLs', () => {
  assert.equal(loadPage({ metas: { 'og:image': 'data:image/gif;base64,AAA' } }).imageUrl(), '');
  assert.equal(
    loadPage({ metas: { 'og:image': '/media/pic.jpg' } }).imageUrl(),
    'https://edition.cnn.com/media/pic.jpg',
  );
});

test('uses the first real content image when tags are missing', () => {
  const page = loadPage({
    imgs: [
      { src: 'https://x.com/icon.png', width: 16 },
      { src: 'https://x.com/photo.jpg', width: 800 },
    ],
  });
  assert.equal(page.imageUrl(), 'https://x.com/photo.jpg');
});

test('tiny tracking pixels do not count as content images', () => {
  const page = loadPage({ imgs: [{ src: 'https://x.com/px.gif', width: 1 }] });
  assert.equal(page.imageUrl(), '');
});

test('accepts og:image via name attribute and twitter:image via property', () => {
  // Some CMSs swap name/property; both must resolve.
  assert.equal(
    loadPage({ metas: { 'og:image': 'https://x.com/name-og.jpg' } }).imageUrl(),
    'https://x.com/name-og.jpg',
  );
  assert.equal(
    loadPage({ metas: { 'twitter:image': 'https://x.com/prop-tw.jpg' } }).imageUrl(),
    'https://x.com/prop-tw.jpg',
  );
});

test('uses naturalWidth when layout width is zero and data-src fallbacks', () => {
  const page = loadPage({
    imgs: [
      { src: '', width: 0, naturalWidth: 0, attrs: { 'data-src': 'https://x.com/lazy-photo.jpg' } },
    ],
  });
  // data-src with an image-looking URL counts even before layout.
  assert.equal(page.imageUrl(), 'https://x.com/lazy-photo.jpg');
});

test('ignores blob and data URIs for content images', () => {
  const page = loadPage({
    imgs: [
      { src: 'blob:https://x.com/123', width: 800 },
      { src: 'data:image/jpeg;base64,/9j/', width: 800 },
    ],
  });
  assert.equal(page.imageUrl(), '');
});
