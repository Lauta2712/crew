import { WalkInPaymentsForm } from '../components/WalkInPaymentsForm'

export function CoachWalkInPaymentsPage() {
  return (
    <div className="py-2 sm:py-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-slate-800">Pagos</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Registrá pases diarios y mensualidades de acceso libre.
        </p>
        <WalkInPaymentsForm mode="coach" hideHeading />
      </div>
    </div>
  )
}
