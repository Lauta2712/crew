import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type CreateGymAdminBody = {
  gym_name?: string
  admin_name?: string
  admin_email?: string
  admin_password?: string
}

const PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*'

function generateTempPassword(length = 16) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARSET[bytes[i] % PASSWORD_CHARSET.length]
  }
  return out
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
        JSON.stringify({ error: 'Solo un superadmin puede dar de alta un gimnasio nuevo.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2) Validar body
    const body = (await req.json()) as CreateGymAdminBody

    const gymName = String(body?.gym_name ?? '').trim()
    const adminName = String(body?.admin_name ?? '').trim()
    const adminEmail = String(body?.admin_email ?? '').trim().toLowerCase()
    const requestedPassword = String(body?.admin_password ?? '').trim()

    if (!gymName) {
      return new Response(
        JSON.stringify({ error: 'Se requiere el nombre del gimnasio.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!adminName) {
      return new Response(
        JSON.stringify({ error: 'Se requiere el nombre del administrador.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!adminEmail || !adminEmail.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un email válido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (requestedPassword && requestedPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3) Verificar que el email no exista ya en public.users
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .ilike('email', adminEmail)
      .maybeSingle()

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: `Ya existe una cuenta con ese email (rol: ${existingUser.role}). Usá otro correo.` }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4) Crear gimnasio
    const { data: createdGym, error: createGymError } = await supabaseAdmin
      .from('gyms')
      .insert({ name: gymName })
      .select('id')
      .single()

    if (createGymError || !createdGym?.id) {
      return new Response(
        JSON.stringify({ error: createGymError?.message || 'No se pudo crear el gimnasio.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const gymId = createdGym.id

    // 5) Crear gym_settings en modo custom, catálogo vacío (evita heredar el catálogo de Crux)
    const { error: settingsError } = await supabaseAdmin.from('gym_settings').insert({
      gym_id: gymId,
      data: { catalogMode: 'custom', classPacks: [], scheduleTypes: [] },
    })

    if (settingsError) {
      await supabaseAdmin.from('gyms').delete().eq('id', gymId)
      return new Response(
        JSON.stringify({ error: settingsError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 6) Contraseña: la que mandó el superadmin, o generada en el servidor
    const tempPassword = requestedPassword || generateTempPassword()

    // 7) Crear auth user
    const { data: createdAuth, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: adminName,
        role: 'admin',
        gym_id: gymId,
      },
    })

    if (createAuthError || !createdAuth?.user?.id) {
      await supabaseAdmin.from('gym_settings').delete().eq('gym_id', gymId)
      await supabaseAdmin.from('gyms').delete().eq('id', gymId)
      return new Response(
        JSON.stringify({ error: createAuthError?.message || 'No se pudo crear el usuario en Auth.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminId = createdAuth.user.id

    // 8) Upsert en public.users (por compatibilidad si existe trigger)
    const { error: upsertUserError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: adminId,
          email: adminEmail,
          name: adminName,
          role: 'admin',
          gym_id: gymId,
          blocked: false,
        },
        { onConflict: 'id' },
      )

    if (upsertUserError) {
      await supabaseAdmin.auth.admin.deleteUser(adminId)
      await supabaseAdmin.from('gym_settings').delete().eq('gym_id', gymId)
      await supabaseAdmin.from('gyms').delete().eq('id', gymId)
      return new Response(
        JSON.stringify({ error: upsertUserError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        gym_id: gymId,
        gym_name: gymName,
        admin_id: adminId,
        admin_email: adminEmail,
        temp_password: tempPassword,
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
