/**
 * Logo de marca para header/sidebar. Si el gimnasio configuró `theme.logoUrl`
 * (o `VITE_THEME_LOGO_URL` en páginas públicas), se muestra esa imagen. Si no,
 * un monograma con la inicial del nombre del gym — nunca un logo de otro cliente.
 */
export function BrandMark({ src, alt, className = '' }) {
  if (src) {
    return (
      <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />
    )
  }
  const initial = alt?.trim()?.[0]?.toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className={`brand-mark flex h-full w-full items-center justify-center ${className}`}
    >
      {initial}
    </span>
  )
}
