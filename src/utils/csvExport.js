/**
 * Escapa un valor para una celda CSV (RFC 4180).
 */
function escapeCsvCell(value) {
  if (value == null || value === '') return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Genera el contenido CSV (separador coma) con BOM UTF-8 para Excel en Windows.
 * Los contadores de uso siguen la misma regla que la lista: ciclo de vigencia del
 * pago (desde paid_at hasta +1 mes), no el mes calendario.
 */
export function buildStudentsCsvContent(students) {
  const headers = [
    'ID',
    'Nombre',
    'Email',
    'Plan',
    'Cupo (clases en ciclo)',
    'Usadas (ciclo vigente)',
    'Restantes',
    'Inicio vigencia ciclo',
    'Fin vigencia ciclo',
    'Estado',
  ]

  const rows = (students ?? []).map((s) => [
    s.id ?? '',
    s.name ?? '',
    s.email ?? '',
    s.plan_name ?? '—',
    s.classes_per_month ?? '',
    s.classes_used_this_month ?? '',
    s.classes_remaining === null || s.classes_remaining === undefined
      ? '—'
      : s.classes_remaining,
    s.usage_cycle_start_label ?? '',
    s.usage_cycle_end_label ?? '',
    s.blocked ? 'Suspendido' : 'Activo',
  ])

  const body = [headers, ...rows]
    .map((r) => r.map(escapeCsvCell).join(','))
    .join('\r\n')

  return `\uFEFF${body}`
}

/**
 * Dispara la descarga de un archivo de texto (CSV) en el navegador.
 */
export function downloadTextFile(filename, content, mimeType = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadStudentsListCsv(students, options = {}) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const filename =
    options.filename ?? `alumnos-${y}-${m}-${day}-${hh}${mm}.csv`
  const content = buildStudentsCsvContent(students)
  downloadTextFile(filename, content)
}
