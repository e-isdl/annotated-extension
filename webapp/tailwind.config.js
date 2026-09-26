/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0E1113', surface: '#181C1F', raised: '#24292D' },
        border: { DEFAULT: '#343A3E', subtle: 'rgba(255,255,255,0.09)' },
        text: { primary: '#F2F4F5', secondary: '#B8C5CC', muted: '#8B969C' },
        accent: { DEFAULT: '#D59A56', dim: 'rgba(213,154,86,0.14)', text: '#E4B16D' },
        claim: { DEFAULT: '#D59A56', dim: 'rgba(213,154,86,0.14)' },
        success: '#8EB59B',
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
