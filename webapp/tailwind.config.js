/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0F1113', surface: '#1A1A1B', raised: '#272729' },
        border: { DEFAULT: '#343536', subtle: '#252526' },
        text: { primary: '#D7DADC', secondary: '#818384', muted: '#5C5D5E' },
        accent: { DEFAULT: '#E85B38', dim: 'rgba(232,91,56,0.12)', text: '#F07A5A' },
        claim: { DEFAULT: '#EA0027', dim: 'rgba(234,0,39,0.10)' },
        success: '#2F9E44',
        podcast: '#A855F7',
      },
      fontFamily: {
        ui: ['Inter', 'Segoe UI Variable', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        reading: ['Source Serif 4', 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
