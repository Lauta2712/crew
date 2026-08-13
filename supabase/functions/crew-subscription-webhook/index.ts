import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mercado Pago usa varios estados de preapproval; los que no mapeamos explícito quedan
// "pending" (ej. no debería pasar, pero mejor no perder la notificación).
const MP_STATUS_TO_ROW_STATUS: Record<string, string> = {
  authorized: 'authorized',
  paused: 'paused',
  cancelled: 'cancelled',
  pending: 'pending',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Mercado Pago siempre espera 200 rápido, incluso si algo interno falla, para no reintentar
  // en loop una notificación que nunca vamos a poder procesar (ej. body malformado).
  try {
    const url = new URL(req.url)
    const preapprovalId =
      url.searchParams.get('data.id') ??
      url.searchParams.get('id') ??
      (await req.clone().json().catch(() => null))?.data?.id

    const topic = url.searchParams.get('type') ?? url.searchParams.get('topic')

    if (topic && topic !== 'preapproval' && topic !== 'subscription_preapproval') {
      // Notificación de otro tipo de evento (ej. pagos individuales) — no nos interesa acá.
      return new Response('ok', { status: 200, headers: corsHeaders })
    }

    if (!preapprovalId) {
      return new Response('ok', { status: 200, headers: corsHeaders })
    }

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!mpAccessToken || !supabaseUrl || !serviceRoleKey) {
      return new Response('ok', { status: 200, headers: corsHeaders })
    }

    // Nunca confiar en el body de la notificación: siempre volver a pedirle el estado
    // real a la API de Mercado Pago con el id recibido.
    const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    })
    if (!mpResponse.ok) {
      return new Response('ok', { status: 200, headers: corsHeaders })
    }
    const mpData = await mpResponse.json()
    const rowStatus = MP_STATUS_TO_ROW_STATUS[mpData.status] ?? 'pending'

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    await supabaseAdmin
      .from('crew_subscriptions')
      .update({ status: rowStatus, updated_at: new Date().toISOString() })
      .eq('mp_preapproval_id', preapprovalId)

    return new Response('ok', { status: 200, headers: corsHeaders })
  } catch {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
})
