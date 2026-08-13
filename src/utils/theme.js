/**
 * Theming en runtime: cada gimnasio puede definir un color primario y uno de acento
 * (ver `gym_settings.data.theme` en `gymSettingsMerge.js`); acá se deriva la escala
 * completa de tonalidades (mismo espíritu que un generador de paleta de Tailwind, no
 * pixel-perfect) y se aplica como CSS custom properties sobre `:root`. Si no se pasa
 * nada, no se toca ninguna variable — quedan los defaults literales de `index.css`.
 */

const BRAND_STEPS = [50, 100, 200, 300, 400, 600, 700, 800, 900]
const ACCENT_STEPS = [100, 200, 300, 400, 600, 700]

/** Lightness objetivo (0-100) por paso, independiente del color de entrada. El paso base (500) usa el lightness real del hex ingresado. */
const LIGHTNESS_BY_STEP = {
  50: 96,
  100: 91,
  200: 82,
  300: 70,
  400: 58,
  600: 46,
  700: 38,
  800: 30,
  900: 22,
}

export const FONT_OPTIONS = [
  { value: 'Nunito', label: 'Nunito (default)', weights: '400;500;600;700' },
  { value: 'Inter', label: 'Inter', weights: '400;500;600;700' },
  { value: 'Poppins', label: 'Poppins', weights: '400;500;600;700' },
  { value: 'Montserrat', label: 'Montserrat', weights: '400;500;600;700' },
  { value: 'Work Sans', label: 'Work Sans', weights: '400;500;600;700' },
]

function hexToHsl(hex) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0)
      break
    case g:
      h = (b - r) / d + 2
      break
    default:
      h = (r - g) / d + 4
  }
  return { h: h * 60, s: s * 100, l: l * 100 }
}

function hueToRgb(p, q, t) {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360 / 360
  const ss = Math.min(Math.max(s, 0), 100) / 100
  const ll = Math.min(Math.max(l, 0), 100) / 100
  if (ss === 0) {
    const v = Math.round(ll * 255)
    return `#${[v, v, v].map((x) => x.toString(16).padStart(2, '0')).join('')}`
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  const r = hueToRgb(p, q, hh + 1 / 3)
  const g = hueToRgb(p, q, hh)
  const b = hueToRgb(p, q, hh - 1 / 3)
  return `#${[r, g, b]
    .map((x) => Math.round(x * 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function saturationForStep(step, baseSaturation) {
  if (step <= 300) return Math.max(baseSaturation * 0.55, 20)
  if (step === 400) return Math.max(baseSaturation * 0.8, 25)
  return Math.min(baseSaturation * 1.05, 100)
}

/**
 * @param {string} hex color base — se usa tal cual como el paso 500
 * @param {number[]} [steps] pasos a generar además de 500 (default: escala completa de brand)
 * @returns {Record<number, string>} incluye siempre el paso 500 = hex de entrada
 */
export function deriveColorScale(hex, steps = BRAND_STEPS) {
  const { h, s } = hexToHsl(hex)
  const scale = { 500: hex }
  for (const step of steps) {
    scale[step] = hslToHex(h, saturationForStep(step, s), LIGHTNESS_BY_STEP[step])
  }
  return scale
}

const loadedFonts = new Set()

function loadGoogleFont(fontName) {
  if (!fontName || loadedFonts.has(fontName)) return
  const option = FONT_OPTIONS.find((f) => f.value === fontName)
  if (!option) return
  loadedFonts.add(fontName)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(option.value).replace(/%20/g, '+')}:wght@${option.weights}&display=swap`
  document.head.appendChild(link)
}

/**
 * Aplica el tema del gimnasio como CSS custom properties sobre `document.documentElement`.
 * Llamar con `undefined`/`{}` (gimnasio sin `theme` configurado) es un no-op seguro:
 * no toca ninguna variable, quedan los defaults literales de `index.css`.
 * @param {{ primaryColor?: string, accentColor?: string, font?: string }} [theme]
 */
export function applyTheme(theme) {
  if (typeof document === 'undefined' || !theme) return
  const root = document.documentElement

  if (theme.primaryColor) {
    const brand = deriveColorScale(theme.primaryColor, BRAND_STEPS)
    for (const [step, value] of Object.entries(brand)) {
      root.style.setProperty(`--color-brand-${step}`, value)
    }
  }

  if (theme.accentColor) {
    const accent = deriveColorScale(theme.accentColor, ACCENT_STEPS)
    for (const [step, value] of Object.entries(accent)) {
      root.style.setProperty(`--color-accent-${step}`, value)
    }
  }

  if (theme.font) {
    root.style.setProperty('--font-sans', `'${theme.font}'`)
    loadGoogleFont(theme.font)
  }
}

function setLinkHref(rel, href) {
  let link = document.querySelector(`link[rel="${rel}"]`)
  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    document.head.appendChild(link)
  }
  link.href = href
}

function setMetaContent(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = name
    document.head.appendChild(meta)
  }
  meta.content = content
}

/**
 * Actualiza en runtime lo que `index.html` no puede resolver dinámicamente por su cuenta:
 * título de la pestaña, favicon/apple-touch-icon, nombre corto para "agregar a inicio" y el
 * color de la barra del navegador en mobile. El HTML estático queda con los valores de Crux
 * como fallback visual antes de que corra este script (flash mínimo, inevitable sin SSR).
 * @param {{ name?: string, logoUrl?: string, primaryColor?: string }} [brand]
 */
export function applyBrandChrome(brand) {
  if (typeof document === 'undefined' || !brand) return
  if (brand.name) {
    document.title = `${brand.name} · Sistema de asistencias`
    setMetaContent('apple-mobile-web-app-title', brand.name)
  }
  if (brand.logoUrl) {
    setLinkHref('icon', brand.logoUrl)
    setLinkHref('apple-touch-icon', brand.logoUrl)
  }
  if (brand.primaryColor) {
    setMetaContent('theme-color', brand.primaryColor)
  }
}
