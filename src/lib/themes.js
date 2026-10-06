// Iconic theme registry for the side panel. Same ids, labels and hints
// as the webapp; each theme's own localStorage holds its own choice.
export const THEMES = [
  { id: 'light', label: 'Light', hint: 'Warm paper', swatches: ['#F2EEE1', '#E5192B', '#3A3A42'] },
  { id: 'dark', label: 'Dark', hint: 'Neutral black', swatches: ['#0D0D0F', '#E5192B', '#ADADB8'] },
  { id: 'synthwave', label: '80s Retro', hint: 'Neon sunset', swatches: ['#170834', '#351B6E', '#FF3E9F'] },
  { id: 'tokyo', label: 'Tokyo Night', hint: 'Rainy neon night', swatches: ['#0F1226', '#222650', '#7AA2F7'] },
  { id: 'terminal', label: 'Terminal', hint: 'Phosphor CRT', swatches: ['#010603', '#0B2112', '#00FF66'] },
  { id: 'gruvbox', label: 'Gruvbox', hint: 'Warm workshop', swatches: ['#1F1A15', '#382E23', '#FE8019'] },
  { id: 'dracula', label: 'Dracula', hint: 'Velvet night', swatches: ['#1D1E2A', '#363951', '#BD93F9'] },
];

const IDS = new Set(THEMES.map((t) => t.id));

export function isThemeId(value) {
  return typeof value === 'string' && IDS.has(value);
}

export function themeLabel(id) {
  return THEMES.find((t) => t.id === id)?.label || 'Dark';
}
