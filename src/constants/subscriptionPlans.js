/**
 * Planes de suscripción del producto (Crew) — lo que paga el dueño del gimnasio por usar
 * el sistema. No confundir con `src/constants/packs.js` (`CLASS_PACKS`), que son los planes
 * que un gimnasio le vende a SUS alumnos.
 *
 * Precios en USD, cobrados en ARS al tipo de cambio del día vía Mercado Pago (evita
 * repricing manual por inflación). `annualMonthlyEquivalent` = precio anual / 12, para
 * mostrar el ahorro sin hardcodear el % en cada lugar que lo muestra.
 */
export const SUBSCRIPTION_PLANS = [
  {
    id: 'basico',
    name: 'Básico',
    description: 'Para gimnasios que recién arrancan a digitalizar la gestión.',
    monthlyPriceUsd: 38,
    annualPriceUsd: 380, // 10x mensual = 2 meses gratis pagando anual
    highlighted: false,
    maxActiveStudents: 60,
    maxCoaches: 1,
    features: [
      'Hasta 60 alumnos activos',
      '1 coach',
      'Asistencia, pagos y check-in manual',
      'Escáner QR',
      'Soporte por email',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Para gimnasios en crecimiento que necesitan su propia identidad.',
    monthlyPriceUsd: 78,
    annualPriceUsd: 780,
    highlighted: true,
    maxActiveStudents: null, // ilimitado
    maxCoaches: null,
    features: [
      'Alumnos activos ilimitados',
      'Coaches ilimitados',
      'Todo lo de Básico',
      'Identidad visual propia (logo, colores, tipografía)',
      'Soporte prioritario',
    ],
  },
]

export function getSubscriptionPlan(planId) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) ?? null
}

/** @param {'monthly'|'annual'} billingPeriod */
export function getPlanPriceUsd(plan, billingPeriod) {
  return billingPeriod === 'annual' ? plan.annualPriceUsd : plan.monthlyPriceUsd
}
