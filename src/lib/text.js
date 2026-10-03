// Display-only helpers. These never touch stored data.

// Remove speaker markers, bracketed sound tags, speech filler, stuttered repeats
// and collapse whitespace so captions read as clean sentences.
export function cleanTranscript(text, caps = true) {
  if (!text) return '';
  let out = String(text)
    .replace(/>>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(u+m+|u+h+|erm+|ah+|eh+|hmm+|mhm+)\b[,.]?\s*/gi, ' ')
    .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (caps) {
    out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, prefix, ch) => prefix + ch.toUpperCase());
  }
  return out;
}
