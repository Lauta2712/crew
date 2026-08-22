import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { SUBSCRIPTION_PLANS, getPlanPriceUsd } from '../constants/subscriptionPlans'
import { getFunctionsInvokeFailureMessage } from '../utils/errors'

/**
 * Sección de precios de Crew (el producto) para dueños de gimnasio interesados en
 * contratarlo — no confundir con los packs que un gimnasio le vende a sus alumnos.
 * El cobro real (Mercado Pago) se resuelve en la Edge Function `create-crew-checkout`;
 * acá solo se junta el contacto y se redirige al checkout.
 */
export function CrewPricingSection() {
  const [billingPeriod, setBillingPeriod] = useState('monthly')
  const [usdArsRate, setUsdArsRate] = useState(null)
  const [openPlanId, setOpenPlanId] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('https://dolarapi.com/v1/dolares/oficial')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const rate = Number(data?.venta)
        if (!cancelled && rate) setUsdArsRate(rate)
      })
      .catch(() => {
        // Estimado en ARS es solo informativo — si falla, mostramos únicamente el precio en USD.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section id="precios" className="space-y-2.5">
      <h2 className="text-center font-display text-2xl font-bold uppercase tracking-wide text-ink sm:text-3xl">
        Precios
      </h2>

      <div className="flex flex-col items-center gap-1.5">
        <div className="inline-flex rounded bg-surface-2 p-0.5 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setBillingPeriod('monthly')}
            className={`rounded px-3 py-1 font-medium transition ${
              billingPeriod === 'monthly' ? 'btn-primary !py-1' : 'text-muted'
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setBillingPeriod('annual')}
            className={`rounded px-3 py-1 font-medium transition ${
              billingPeriod === 'annual' ? 'btn-primary !py-1' : 'text-muted'
            }`}
          >
            Anual · 2 meses gratis
          </button>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Sin permanencia · cancelás cuando quieras
        </p>
      </div>

      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            billingPeriod={billingPeriod}
            usdArsRate={usdArsRate}
            open={openPlanId === plan.id}
            onToggleOpen={() => setOpenPlanId((current) => (current === plan.id ? null : plan.id))}
          />
        ))}
      </div>
    </section>
  )
}

function PlanCard({ plan, billingPeriod, usdArsRate, open, onToggleOpen }) {
  const priceUsd = getPlanPriceUsd(plan, billingPeriod)
  const periodLabel = billingPeriod === 'annual' ? '/año' : '/mes'
  const arsEstimate = usdArsRate ? Math.round(priceUsd * usdArsRate) : null

  return (
    <div
      className={`landing-panel relative flex flex-col gap-2 !p-3.5 ${
        plan.highlighted ? 'landing-panel-highlighted' : ''
      }`}
    >
      {plan.highlighted && (
        <span className="pricing-badge absolute top-3 right-3 rounded px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide">
          Más elegido
        </span>
      )}

      <div className={plan.highlighted ? 'pr-20 sm:pr-24' : undefined}>
        <h3 className="text-sm font-semibold text-ink">{plan.name}</h3>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">{plan.description}</p>
      </div>

      <div>
        <span className="font-display text-3xl font-bold text-ink">US$ {priceUsd}</span>
        <span className="text-xs text-muted">{periodLabel}</span>
        {arsEstimate && (
          <p className="text-[11px] text-muted">
            ≈ ${arsEstimate.toLocaleString('es-AR')} ARS · cotización aprox.
          </p>
        )}
      </div>

      <ul className="space-y-1 text-[11px] leading-snug text-ink">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-1.5">
            <span className="pricing-check">✓</span>
            {feature}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onToggleOpen}
        className={open ? 'btn-secondary mt-1' : 'btn-primary mt-1'}
      >
        {open ? 'Cancelar' : 'Crear cuenta'}
      </button>

      {open && (
        <CheckoutForm plan={plan} billingPeriod={billingPeriod} onClose={onToggleOpen} />
      )}
    </div>
  )
}

function CheckoutForm({ plan, billingPeriod, onClose }) {
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [gymName, setGymName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'create-crew-checkout',
        {
          body: {
            contact_name: contactName,
            contact_email: contactEmail,
            gym_name: gymName || undefined,
            plan_id: plan.id,
            billing_period: billingPeriod,
          },
        },
      )
      if (invokeError) {
        const details = await getFunctionsInvokeFailureMessage(invokeError, 'create-crew-checkout')
        throw new Error(details || 'No se pudo iniciar el pago. Probá de nuevo.')
      }
      if (!data?.init_point) throw new Error('No se pudo iniciar el pago. Probá de nuevo.')
      window.location.href = data.init_point
    } catch (err) {
      setError(err?.message || 'No se pudo iniciar la suscripción. Probá de nuevo en unos minutos.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-1.5">
      <input
        className="input !py-1.5 text-xs"
        placeholder="Tu nombre"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        required
      />
      <input
        className="input !py-1.5 text-xs"
        type="email"
        placeholder="Tu email"
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        required
      />
      <input
        className="input !py-1.5 text-xs"
        placeholder="Nombre del gimnasio (opcional)"
        value={gymName}
        onChange={(e) => setGymName(e.target.value)}
      />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? 'Redirigiendo a Mercado Pago…' : 'Continuar al pago'}
      </button>
    </form>
  )
}
