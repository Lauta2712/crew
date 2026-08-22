/**
 * Modal bloqueante genérico para esperas que no son instantáneas y merecen
 * explicación (ej: autoprovisioning, operaciones con varios pasos en el
 * backend). Pensado para cualquier rol, no solo admin/superadmin.
 */
export function WaitModal({ open, title, message }) {
  if (!open) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-lg border border-line bg-surface p-6 text-center shadow-lg">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand-400" />
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {message && <p className="mt-1 text-xs text-muted">{message}</p>}
        </div>
      </div>
    </div>
  )
}
