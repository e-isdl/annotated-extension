/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0E1113', surface: '#181C1F', raised: '#24292D' },
        border: { DEFAULT: '#343A3E', subtle: 'rgba(255,255,255,0.09)' },
        text: { primary: '#F7F8F9', secondary: '#D3D9DD', muted: '#AAB5BC' },
        accent: { DEFAULT: '#E53935', hover: '#C62828', dim: 'rgba(229,57,53,0.16)', text: '#EF5350' },
        claim: { DEFAULT: '#E53935', dim: 'rgba(229,57,53,0.16)' },
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
