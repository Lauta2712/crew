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
        JSON.stringify({ error: 'Solo un administrador puede eliminar estudiantes.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json() as { student_id?: string }
    const studentId = body?.student_id
    if (!studentId || typeof studentId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Se requiere student_id en el cuerpo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Verificar que sea student activo.
    const { data: student, error: studentError } = await supabaseAdmin
      .from('users')
      .select('id, role, deleted_at, gym_id')
      .eq('id', studentId)
      .maybeSingle()

    if (studentError) {
      return new Response(
        JSON.stringify({ error: studentError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!student || student.role !== 'student') {
      return new Response(
        JSON.stringify({ error: 'No se encontró al alumno.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (student.deleted_at != null) {
      return new Response(
        JSON.stringify({ error: 'El alumno ya está dado de baja.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminGymId = adminProfile?.gym_id ?? null
    if (adminGymId && student.gym_id != null && student.gym_id !== adminGymId) {
      return new Response(
        JSON.stringify({ error: 'El alumno no pertenece a este gimnasio.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Limpiar tablas relacionadas primero (fallar explícito si algo va mal).
    const relatedTables = [
      'payments',
      'attendances',
      'subscriptions',
      'student_projects',
    ] as const
    for (const table of relatedTables) {
      const { error: relError } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('student_id', studentId)
      if (relError) {
        return new Response(
          JSON.stringify({ error: `${table}: ${relError.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const { error: userDeleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', studentId)

    if (userDeleteError) {
      return new Response(
        JSON.stringify({ error: userDeleteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Borrar también en Auth (para liberar el mail de verificación).
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(studentId)
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
