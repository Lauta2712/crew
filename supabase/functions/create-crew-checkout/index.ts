import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fuente de verdad de precios del lado del servidor — nunca confiar en un precio que
// mande el cliente. Debe reflejar `src/constants/subscriptionPlans.js`.
const PLANS: Record<string, { name: string; monthlyPriceUsd: number; annualPriceUsd: number }> = {
  basico: { name: 'Básico', monthlyPriceUsd: 38, annualPriceUsd: 380 },
  pro: { name: 'Pro', monthlyPriceUsd: 78, annualPriceUsd: 780 },
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Cotización oficial del dólar, usada solo para fijar el monto en ARS al momento del alta. */
async function fetchUsdArsRate(): Promise<number> {
  const res = await fetch('https://dolarapi.com/v1/dolares/oficial')
  if (!res.ok) throw new Error('No se pudo obtener la cotización del dólar.')
  const data = await res.json()
  const rate = Number(data?.venta)
  if (!rate || Number.isNaN(rate)) throw new Error('Cotización del dólar inválida.')
  return rate
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpAccessToken) {
      return jsonResponse(
        { error: 'El método de pago todavía no está configurado. Probá de nuevo más adelante.' },
        501,
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Configuración del servidor incompleta' }, 500)
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const body = (await req.json()) as {
      contact_name?: string
      contact_email?: string
      gym_name?: string
      plan_id?: string
      billing_period?: string
    }

    const contactName = body?.contact_name?.trim()
    const contactEmail = body?.contact_email?.trim()
    const gymName = body?.gym_name?.trim() || null
    const planId = body?.plan_id
    const billingPeriod = body?.billing_period

    if (!contactName) return jsonResponse({ error: 'Falta el nombre de contacto.' }, 400)
    if (!contactEmail || !isValidEmail(contactEmail)) {
      return jsonResponse({ error: 'Falta un email de contacto válido.' }, 400)
    }
    if (!planId || !(planId in PLANS)) {
      return jsonResponse({ error: 'Plan inválido.' }, 400)
    }
    if (billingPeriod !== 'monthly' && billingPeriod !== 'annual') {
      return jsonResponse({ error: 'Período de facturación inválido.' }, 400)
    }

    const plan = PLANS[planId]
    const priceUsd = billingPeriod === 'annual' ? plan.annualPriceUsd : plan.monthlyPriceUsd
    const rate = await fetchUsdArsRate()
    const amountArs = Math.round(priceUsd * rate)

    // 1) Fila "pending" primero: si Mercado Pago falla después, queda registro del intento.
    const { data: pendingRow, error: insertError } = await supabaseAdmin
      .from('crew_subscriptions')
      .insert({
        contact_name: contactName,
        contact_email: contactEmail,
        gym_name: gymName,
        plan_id: planId,
        billing_period: billingPeriod,
        status: 'pending',
      })
      .select('id')
      .maybeSingle()

    if (insertError || !pendingRow) {
      return jsonResponse(
        { error: insertError?.message ?? 'No se pudo iniciar la suscripción.' },
        400,
      )
    }

    // 2) Crear la suscripción (preapproval) en Mercado Pago.
    const siteUrl = (Deno.env.get('CREW_SITE_URL') ?? 'https://crew.example.com').replace(/\/+$/, '')
    const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: `Crew — Plan ${plan.name} (${billingPeriod === 'annual' ? 'anual' : 'mensual'})`,
        external_reference: pendingRow.id,
        payer_email: contactEmail,
        back_url: `${siteUrl}/crew/gracias`,
        notification_url: `${supabaseUrl}/functions/v1/crew-subscription-webhook`,
        auto_recurring: {
          frequency: 1,
          frequency_type: billingPeriod === 'annual' ? 'years' : 'months',
          transaction_amount: amountArs,
          currency_id: 'ARS',
        },
        status: 'pending',
      }),
    })

    const mpData = await mpResponse.json()

    if (!mpResponse.ok) {
      console.error('Mercado Pago rechazó el preapproval:', mpResponse.status, JSON.stringify(mpData))
      await supabaseAdmin
        .from('crew_subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', pendingRow.id)
      return jsonResponse(
        { error: mpData?.message ?? 'Mercado Pago rechazó la solicitud de suscripción.' },
        502,
      )
    }

    await supabaseAdmin
      .from('crew_subscriptions')
      .update({ mp_preapproval_id: mpData.id, mp_init_point: mpData.init_point })
      .eq('id', pendingRow.id)

    return jsonResponse({ init_point: mpData.init_point }, 200)
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500)
  }
})
