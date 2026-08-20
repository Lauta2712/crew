import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type LoginAsGymAdminBody = {
  gym_id?: string
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

    // 1) Verificar caller superadmin
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
        JSON.stringify({ error: 'Solo un superadmin puede entrar como admin de un gimnasio.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2) Validar body
    const body = (await req.json()) as LoginAsGymAdminBody
    const gymId = String(body?.gym_id ?? '').trim()

    if (!gymId) {
      return new Response(
        JSON.stringify({ error: 'Se requiere gym_id.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3) Elegir el admin más antiguo activo de ese gimnasio
    const { data: targetAdmin, error: targetAdminError } = await supabaseAdmin
      .from('users')
      .select('id, email, name')
      .eq('gym_id', gymId)
      .eq('role', 'admin')
      .eq('blocked', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (targetAdminError) {
      return new Response(
        JSON.stringify({ error: targetAdminError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!targetAdmin?.email) {
      return new Response(
        JSON.stringify({ error: 'Este gimnasio no tiene una cuenta admin activa para iniciar sesión.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4) Generar un token de acceso de un solo uso para ese admin (sin conocer su contraseña)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetAdmin.email,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      return new Response(
        JSON.stringify({ error: linkError?.message || 'No se pudo generar el acceso.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: targetAdmin.email,
        admin_name: targetAdmin.name,
        hashed_token: linkData.properties.hashed_token,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Error inesperado' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
