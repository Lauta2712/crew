import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = {
  coach_id?: string
  name?: string | null
  email?: string | null
  password?: string | null
  schedule_type_id?: string | null
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
        JSON.stringify({ error: 'Solo un administrador puede editar profesores.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = (await req.json()) as Body
    const coachId = body?.coach_id
    if (!coachId || typeof coachId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Se requiere coach_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: coach, error: coachError } = await supabaseAdmin
      .from('users')
      .select('id, role, gym_id, email, name')
      .eq('id', coachId)
      .maybeSingle()

    if (coachError || !coach || coach.role !== 'coach') {
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

    const hasName = Object.prototype.hasOwnProperty.call(body, 'name')
    const hasEmail =
      body.email !== undefined &&
      body.email !== null &&
      String(body.email).trim() !== ''
    const hasPassword = body.password != null && String(body.password).length > 0
    const hasSchedule =
      body.schedule_type_id != null && String(body.schedule_type_id).trim() !== ''

    if (!hasName && !hasEmail && !hasPassword && !hasSchedule) {
      return new Response(
        JSON.stringify({ error: 'Enviá al menos un campo para actualizar (nombre, email, contraseña u horario).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const email = hasEmail ? String(body.email).trim().toLowerCase() : undefined
    if (email !== undefined && (!email.includes('@'))) {
      return new Response(
        JSON.stringify({ error: 'Email inválido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const password = hasPassword ? String(body.password) : undefined
    if (password !== undefined && password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const name = hasName
      ? body.name != null && String(body.name).trim().length > 0
        ? String(body.name).trim()
        : null
      : undefined

    const authUpdate: Record<string, unknown> = {}
    if (email !== undefined) authUpdate.email = email
    if (password !== undefined) authUpdate.password = password
    if (name !== undefined) {
      authUpdate.user_metadata = {
        name: name ?? email ?? coach.email,
        role: 'coach',
      }
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: authUpdErr } = await supabaseAdmin.auth.admin.updateUserById(coachId, authUpdate)
      if (authUpdErr) {
        return new Response(
          JSON.stringify({ error: authUpdErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const userRow: Record<string, unknown> = {}
    if (name !== undefined) userRow.name = name ?? email ?? coach.email
    if (email !== undefined) userRow.email = email

    if (Object.keys(userRow).length > 0) {
      const { error: userUpdErr } = await supabaseAdmin
        .from('users')
        .update(userRow)
        .eq('id', coachId)

      if (userUpdErr) {
        return new Response(
          JSON.stringify({ error: userUpdErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    if (hasSchedule) {
      const scheduleTypeId = String(body.schedule_type_id).trim()
      const finalGymId = coach.gym_id ?? adminGymId ?? null

      const { error: delErr } = await supabaseAdmin
        .from('coach_assignments')
        .delete()
        .eq('coach_id', coachId)

      if (delErr) {
        return new Response(
          JSON.stringify({ error: delErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { error: insErr } = await supabaseAdmin
        .from('coach_assignments')
        .insert({
          coach_id: coachId,
          schedule_type_id: scheduleTypeId,
          gym_id: finalGymId,
        })

      if (insErr) {
        return new Response(
          JSON.stringify({ error: insErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
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
