// Iconic theme registry. Light and Dark are the originals; the five
// below are faithful ports of famous palettes (verified against the
// Tokyo Night and Dracula official specs). Add new themes here and in
// tokens.css only; Navbar and main.jsx read this list.
export const THEMES = [
  { id: 'light', label: 'Light', hint: 'Warm paper', swatches: ['#F2EEE1', '#E5192B', '#3A3A42'] },
  { id: 'dark', label: 'Dark', hint: 'Neutral black', swatches: ['#08090B', '#E5192B', '#A2A2AB'] },
  { id: 'synthwave', label: '80s Retro', hint: 'Neon dusk', swatches: ['#130C25', '#2A1C4E', '#FF3E9F'] },
  { id: 'tokyo', label: 'Tokyo Night', hint: 'City lights', swatches: ['#11121A', '#252839', '#7AA2F7'] },
  { id: 'terminal', label: 'Terminal', hint: 'Phosphor green', swatches: ['#050906', '#132118', '#3DFF7F'] },
  { id: 'gruvbox', label: 'Gruvbox', hint: 'Retro groove', swatches: ['#1D2021', '#32302F', '#FE8019'] },
  { id: 'dracula', label: 'Dracula', hint: 'Purple reign', swatches: ['#1E1F29', '#333646', '#BD93F9'] },
];

const IDS = new Set(THEMES.map((t) => t.id));

export function isThemeId(value) {
  return typeof value === 'string' && IDS.has(value);
}

export function themeLabel(id) {
  return THEMES.find((t) => t.id === id)?.label || 'Dark';
}
