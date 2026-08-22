import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Falta el token de autorización' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Configuración del servidor incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1) Verificar caller superadmin — crew_subscriptions no tiene ninguna policy RLS
    // para authenticated/anon a propósito (ver schema_completo.sql), así que esta es
    // la única forma de leerla desde el frontend.
    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user: caller },
    } = await supabaseAdmin.auth.getUser(token)

    if (!caller) {
      return new Response(
        JSON.stringify({ error: 'Sesión inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()

    if (callerProfileError) {
      return new Response(
        JSON.stringify({ error: callerProfileError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (callerProfile?.role !== 'superadmin') {
      return new Response(
        JSON.stringify({ error: 'Solo un superadmin puede ver las suscripciones a Crew.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2) Leer — solo lectura, sin mutar nada.
    const { data: subscriptions, error: listError } = await supabaseAdmin
      .from('crew_subscriptions')
      .select(
        'id, contact_name, contact_email, gym_name, plan_id, billing_period, status, created_at, updated_at',
      )
      .order('created_at', { ascending: false })
      .limit(200)

    if (listError) {
      return new Response(
        JSON.stringify({ error: listError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, subscriptions: subscriptions ?? [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Error inesperado' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
