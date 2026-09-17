/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0F1113', surface: '#1A1A1B', raised: '#272729' },
        border: { DEFAULT: '#343536', subtle: '#252526' },
        text: { primary: '#D7DADC', secondary: '#818384', muted: '#5C5D5E' },
        accent: { DEFAULT: '#FF4500', dim: 'rgba(255,69,0,0.12)', text: '#FF6A3D' },
        claim: { DEFAULT: '#EA0027', dim: 'rgba(234,0,39,0.10)' },
        success: '#2F9E44',
        podcast: '#A855F7',
      },
      fontFamily: {
        ui: ['Arial', 'Helvetica Neue', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
