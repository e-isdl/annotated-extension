/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: 'var(--bg)', surface: 'var(--surface)', raised: 'var(--surface-2)' },
        border: { DEFAULT: 'var(--border)', subtle: 'var(--border-strong)' },
        text: { primary: 'var(--text)', secondary: 'var(--text-2)', muted: 'var(--text-3)' },
        accent: { DEFAULT: 'var(--red-btn)', hover: 'var(--red-btn-hover)', dim: 'var(--red-soft)', text: 'var(--red)' },
        claim: { DEFAULT: 'var(--red-btn)', dim: 'var(--red-soft)' },
        success: 'var(--ok)',
        podcast: '#B8C5CC',
      },
      fontFamily: {
        ui: ['Reddit Sans', 'Inter', 'Segoe UI Variable', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        reading: ['Source Serif 4', 'Georgia', 'serif'],
        mono: ['Reddit Sans', 'Inter', 'monospace'],
      },
    },
  },
  plugins: [],
};
