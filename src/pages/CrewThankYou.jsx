import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { GYM_DISPLAY_NAME, THEME_LOGO_URL } from '../constants/gym'

/**
 * back_url de Mercado Pago tras completar (o cancelar) el checkout de
 * create-crew-checkout — ver supabase/functions/create-crew-checkout/index.ts.
 * El alta del gimnasio en sí sigue siendo manual (Fase 3 de
 * docs/ROADMAP_WHITELABEL.md): esta página no consulta el estado real de la
 * suscripción, solo confirma que el pago se envió y qué sigue.
 */
export function CrewThankYouPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-ink">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded border border-line bg-surface/95 p-8 text-center backdrop-blur">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded bg-bg">
          <BrandMark src={THEME_LOGO_URL} alt={GYM_DISPLAY_NAME} />
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950/40">
          <svg
            className="h-6 w-6 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="space-y-1.5">
          <h1 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
            ¡Gracias!
          </h1>
          <p className="text-sm text-muted">
            Recibimos tu suscripción a {GYM_DISPLAY_NAME}. En las próximas horas te vamos a
            contactar por el email que dejaste para dar de alta tu gimnasio y crear la cuenta
            de administrador.
          </p>
        </div>

        <p className="rounded-lg border border-line bg-bg px-3 py-2 text-xs text-muted">
          Si Mercado Pago no llegó a confirmar el pago, no te preocupes — te vamos a escribir
          igual para coordinar.
        </p>

        <Link to="/" className="btn-primary mt-1 w-full">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
