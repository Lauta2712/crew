/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta por defecto de Crux; en runtime cada gimnasio puede pisar estas
        // variables CSS con su propio color (ver src/utils/theme.js, index.css :root).
        brand: {
          50: 'var(--color-brand-50)',
          100: 'var(--color-brand-100)',
          200: 'var(--color-brand-200)',
          300: 'var(--color-brand-300)',
          400: 'var(--color-brand-400)',
          500: 'var(--color-brand-500)',
          600: 'var(--color-brand-600)',
          700: 'var(--color-brand-700)',
          800: 'var(--color-brand-800)',
          900: 'var(--color-brand-900)',
        },
        accent: {
          100: 'var(--color-accent-100)',
          200: 'var(--color-accent-200)',
          300: 'var(--color-accent-300)',
          400: 'var(--color-accent-400)',
          500: 'var(--color-accent-500)',
          600: 'var(--color-accent-600)',
          700: 'var(--color-accent-700)',
        },
      },
      fontFamily: {
        // Tipografía por defecto del producto (Work Sans); configurable por gimnasio vía --font-sans.
        sans: ['var(--font-sans)', 'system-ui', 'ui-sans-serif', 'sans-serif'],
        // Wordmark / headings de marca — fija, no configurable por gimnasio.
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
        // Datos numéricos tabulares (montos, contadores) — fija, no configurable por gimnasio.
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}


