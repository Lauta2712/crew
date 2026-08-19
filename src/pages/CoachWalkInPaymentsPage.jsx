import { WalkInPaymentsForm } from '../components/WalkInPaymentsForm'

export function CoachWalkInPaymentsPage() {
  return (
    <div className="py-2 sm:py-4">
      <div className="mx-auto max-w-lg">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Pagos</h1>
        <p className="mt-1 mb-6 text-sm text-muted">
          Registrá pases diarios y mensualidades de acceso libre.
        </p>
        <WalkInPaymentsForm mode="coach" hideHeading />
      </div>
    </div>
  )
}
