/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}', './sidepanel.html'],
  theme: {
    extend: {
      colors: {
        bg: { base: 'var(--bg)', surface: 'var(--surface)', raised: 'var(--surface-2)' },
        border: { DEFAULT: 'var(--border)', subtle: 'var(--border-strong)' },
        text: { primary: 'var(--text)', secondary: 'var(--text-2)', muted: 'var(--text-3)' },
        accent: { DEFAULT: 'var(--red-btn)', dim: 'var(--red-soft)', text: 'var(--red)' },
        claim: { DEFAULT: 'var(--red)', dim: 'var(--red-soft)' },
        success: 'var(--ok)',
        podcast: '#A855F7',
      },
      fontFamily: {
        ui: ['Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
