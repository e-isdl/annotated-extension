// Iconic theme registry. Light and Dark are the originals; the five
// below are faithful ports of famous palettes (verified against the
// Tokyo Night and Dracula official specs). Add new themes here and in
// tokens.css only; Navbar and main.jsx read this list.
export const THEMES = [
  { id: 'light', label: 'Light', hint: 'Warm paper', swatches: ['#F2EEE1', '#E5192B', '#3A3A42'] },
  { id: 'dark', label: 'Dark', hint: 'Neutral black', swatches: ['#08090B', '#E5192B', '#A2A2AB'] },
  { id: 'synthwave', label: '80s Retro', hint: 'Neon dusk', swatches: ['#201436', '#FF2E88', '#22D3EE'] },
  { id: 'tokyo', label: 'Tokyo Night', hint: 'City lights', swatches: ['#1A1B26', '#7AA2F7', '#BB9AF7'] },
  { id: 'terminal', label: 'Terminal', hint: 'Phosphor green', swatches: ['#050805', '#33FF66', '#FFB000'] },
  { id: 'gruvbox', label: 'Gruvbox', hint: 'Retro groove', swatches: ['#282828', '#FE8019', '#FABD2F'] },
  { id: 'dracula', label: 'Dracula', hint: 'Purple reign', swatches: ['#282A36', '#BD93F9', '#FF79C6'] },
];

const IDS = new Set(THEMES.map((t) => t.id));

export function isThemeId(value) {
  return typeof value === 'string' && IDS.has(value);
}

export function themeLabel(id) {
  return THEMES.find((t) => t.id === id)?.label || 'Dark';
}
