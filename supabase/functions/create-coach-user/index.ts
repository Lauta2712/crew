import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type CreateCoachBody = {
  email?: string
  password?: string
  name?: string | null
  schedule_type_id?: string
  gym_id?: string | null
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

    // 1) Verificar caller admin
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
        JSON.stringify({ error: 'Solo un administrador puede crear profesores.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2) Validar body
    const body = (await req.json()) as CreateCoachBody

    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const scheduleTypeId = String(body?.schedule_type_id ?? '').trim()
    const name = body?.name && String(body.name).trim().length > 0
      ? String(body.name).trim()
      : null

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un email válido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'La contraseña inicial debe tener al menos 6 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!scheduleTypeId) {
      return new Response(
        JSON.stringify({ error: 'Se requiere schedule_type_id.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminGymId = adminProfile?.gym_id ?? null
    const requestedGymId = body?.gym_id ?? null
    if (adminGymId && requestedGymId && requestedGymId !== adminGymId) {
      return new Response(
        JSON.stringify({ error: 'No podés crear profesores en otro gimnasio.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const finalGymId = adminGymId ?? requestedGymId ?? null

    // 3a) Verificar que el email no exista ya en public.users
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .ilike('email', email)
      .maybeSingle()

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: `Ya existe una cuenta con ese email (rol: ${existingUser.role}). Usá otro correo o modificá la cuenta existente.` }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3b) Crear auth user
    const { data: createdAuth, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: name ?? email,
        role: 'coach',
      },
    })

    if (createAuthError || !createdAuth?.user?.id) {
      return new Response(
        JSON.stringify({ error: createAuthError?.message || 'No se pudo crear el usuario en Auth.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const coachId = createdAuth.user.id

    // 4) Upsert en public.users (por compatibilidad si existe trigger)
    const { error: upsertUserError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: coachId,
          email,
          name: name ?? email,
          role: 'coach',
          gym_id: finalGymId,
          blocked: false,
        },
        { onConflict: 'id' },
      )

    if (upsertUserError) {
      await supabaseAdmin.auth.admin.deleteUser(coachId)
      return new Response(
        JSON.stringify({ error: upsertUserError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5) Asignación de horario del coach
    const { error: assignError } = await supabaseAdmin
      .from('coach_assignments')
      .upsert(
        {
          coach_id: coachId,
          schedule_type_id: scheduleTypeId,
          gym_id: finalGymId,
        },
        { onConflict: 'coach_id,schedule_type_id' },
      )

    if (assignError) {
      await supabaseAdmin.from('users').delete().eq('id', coachId)
      await supabaseAdmin.auth.admin.deleteUser(coachId)
      return new Response(
        JSON.stringify({ error: assignError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        coach_id: coachId,
        email,
        schedule_type_id: scheduleTypeId,
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
