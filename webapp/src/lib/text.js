// Display-only helpers. These never touch stored data.

// Remove speech filler, sound tags and immediate word repeats for display.
export function cleanTranscript(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[(music|laughter|applause|clears throat|inaudible|sighs|laughs)[^\]]*\]/gi, ' ')
    .replace(/\b(u+m+|u+h+|erm+)\b[,.]?\s+/gi, ' ')
    .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Drop a wrapping pair of quote marks so text can be re-wrapped without
// producing a doubled opening quote. Leaves inner quotes alone.
export function stripWrappingQuotes(text) {
  if (!text) return '';
  let value = String(text).trim();
  const isQuote = (char) => Boolean(char) && /["'\u201C\u201D\u2018\u2019]/.test(char);
  const hadLeading = isQuote(value[0]);
  value = value.replace(/^["'\u201C\u201D\u2018\u2019]+/, '');
  if (hadLeading) value = value.replace(/["'\u201C\u201D\u2018\u2019]+$/, '');
  return value.trim();
}
