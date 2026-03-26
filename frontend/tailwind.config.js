/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'ph-bg':     'var(--ph-bg)',
        'ph-card':   'var(--ph-card)',
        'ph-border': 'var(--ph-border)',
        'ph-text':   'var(--ph-text)',
        'ph-muted':  'var(--ph-muted)',
        'ph-accent': 'var(--ph-accent)',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        sans:    ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
