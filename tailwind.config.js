/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}', './sidepanel.html'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0E0E12', surface: '#17171D', raised: '#202028' },
        border: { DEFAULT: '#2C2C38', subtle: '#1F1F28' },
        text: { primary: '#EEECEA', secondary: '#8C8C9E', muted: '#52525E' },
        accent: { DEFAULT: '#E53935', dim: 'rgba(229,57,53,0.12)', text: '#EF5350' },
        claim: { DEFAULT: '#E03131', dim: 'rgba(224,49,49,0.10)' },
        success: '#2F9E44',
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
