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

const imageCode = extractFns(source, ['metaImageUrl', 'absolutizeImageUrl']);

function loadPage({ metas = {}, imgs = [] }) {
  const metaEls = Object.entries(metas).map(([key, content]) => ({ key, content }));
  const imgEls = imgs.map(({ src, width }) => ({
    currentSrc: src,
    src,
    getBoundingClientRect: () => ({ width }),
  }));
  const sandbox = {
    document: {
      title: 'Test',
      addEventListener: () => {},
      querySelector: (sel) => {
        if (sel === 'meta[property="og:image"]') {
          const hit = metaEls.find((m) => m.key === 'og:image');
          return hit ? { content: hit.content } : null;
        }
        if (sel === 'meta[name="twitter:image"]') {
          const hit = metaEls.find((m) => m.key === 'twitter:image');
          return hit ? { content: hit.content } : null;
        }
        if (sel === 'meta[itemprop="image"]') {
          const hit = metaEls.find((m) => m.key === 'itemprop');
          return hit ? { content: hit.content } : null;
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
