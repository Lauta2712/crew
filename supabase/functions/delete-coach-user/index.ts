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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) {
      return new Response(
        JSON.stringify({ error: 'Sesión inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from('users')
      .select('role, gym_id')
      .eq('id', caller.id)
      .maybeSingle()

    if (adminProfileError) {
      return new Response(
        JSON.stringify({ error: adminProfileError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (adminProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Solo un administrador puede eliminar profesores.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = (await req.json()) as { coach_id?: string }
    const coachId = body?.coach_id
    if (!coachId || typeof coachId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Se requiere coach_id en el cuerpo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: coach, error: coachError } = await supabaseAdmin
      .from('users')
      .select('id, role, gym_id')
      .eq('id', coachId)
      .maybeSingle()

    if (coachError) {
      return new Response(
        JSON.stringify({ error: coachError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!coach || coach.role !== 'coach') {
      return new Response(
        JSON.stringify({ error: 'No se encontró al profesor.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminGymId = adminProfile?.gym_id ?? null
    if (adminGymId && coach.gym_id != null && coach.gym_id !== adminGymId) {
      return new Response(
        JSON.stringify({ error: 'El profesor no pertenece a este gimnasio.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { error: assignDelError } = await supabaseAdmin
      .from('coach_assignments')
      .delete()
      .eq('coach_id', coachId)

    if (assignDelError) {
      return new Response(
        JSON.stringify({ error: assignDelError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { error: userDeleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', coachId)

    if (userDeleteError) {
      return new Response(
        JSON.stringify({ error: userDeleteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(coachId)
    if (authDeleteError) {
      return new Response(
        JSON.stringify({ error: authDeleteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Error inesperado' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
