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
