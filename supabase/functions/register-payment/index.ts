import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Pack = {
  classes_per_month: number
  price: number
}

const PACKS: Record<string, Pack> = {
  single: { classes_per_month: 1, price: 10000 },
  pack4: { classes_per_month: 4, price: 27000 },
  pack8: { classes_per_month: 8, price: 40000 },
  grupo_entrenamiento: { classes_per_month: 8, price: 55000 },
}

function parseIsoDate(iso: unknown): Date | null {
  if (typeof iso !== 'string') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function isMuroSchedule(scheduleType: string): boolean {
  return scheduleType === 'muro_libre'
}

function isGroupSchedule(scheduleType: string): boolean {
  return scheduleType === 'grupo_entrenamiento'
}

function isSchoolSchedule(scheduleType: string): boolean {
  return !isMuroSchedule(scheduleType) && !isGroupSchedule(scheduleType)
}

function addOneCalendarMonth(date: Date): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  return d
}

function parseTs(raw: unknown): Date | null {
  if (!raw) return null
  const s = String(raw)
  const hasTz = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTz ? s : `${s}Z`)
  return isNaN(d.getTime()) ? null : d
}

type PaymentRow = { id: string; schedule_type: string; pack_type: string; paid_at: string }
type AttRow = { attended_at: string }

/**
 * Filters out payments whose pack cycle has already expired (by time) or whose
 * classes have been fully consumed. Returns only "active" payments that block
 * a new registration.
 */
function filterExpiredPackPayments(
  payments: PaymentRow[],
  attendances: AttRow[],
  now: Date,
): PaymentRow[] {
  return payments.filter((payment) => {
    const paidAt = parseTs(payment.paid_at)
    if (!paidAt) return true

    const cycleEnd = addOneCalendarMonth(paidAt)

    // Time-based expiry
    if (now >= cycleEnd) return false

    // Class-count exhaustion for finite packs
    const pack = PACKS[payment.pack_type]
    const classesPerMonth = pack?.classes_per_month ?? 0

    if (classesPerMonth === 0) return true // unlimited pack

    const used = attendances.filter((att) => {
      const attDate = parseTs(att.attended_at)
      return attDate && attDate >= paidAt && attDate < cycleEnd
    }).length

    return used < classesPerMonth
  })
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

    // 1) Verificar que el caller sea admin
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
        JSON.stringify({ error: 'Solo un administrador puede registrar pagos.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json() as {
      student_id?: string
      pack_type?: string
      schedule_type?: string
      paid_at?: string
    }

    const studentId = body?.student_id
    const packType = body?.pack_type
    const scheduleType = body?.schedule_type
    const paidAtIso = body?.paid_at

    if (!studentId || typeof studentId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Se requiere student_id en el cuerpo.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (!packType || typeof packType !== 'string' || !(packType in PACKS)) {
      return new Response(
        JSON.stringify({ error: 'pack_type inválido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (!scheduleType || typeof scheduleType !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Se requiere schedule_type en el cuerpo.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const paidAt = parseIsoDate(paidAtIso)
    if (!paidAt) {
      return new Response(
        JSON.stringify({ error: 'paid_at inválido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const pack = PACKS[packType]

    // 2) Validar que el student existe y es student no dado de baja
    const { data: studentRow, error: studentError } = await supabaseAdmin
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
    if (!studentRow || studentRow.role !== 'student' || studentRow.deleted_at != null) {
      return new Response(
        JSON.stringify({ error: 'No se encontró al alumno activo.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminGymId = adminProfile?.gym_id ?? null
    if (adminGymId) {
      if (studentRow.gym_id != null && studentRow.gym_id !== adminGymId) {
        return new Response(
          JSON.stringify({ error: 'El alumno no pertenece a este gimnasio.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const monthStart = new Date(paidAt.getFullYear(), paidAt.getMonth(), 1)
    const nextMonthStart = new Date(paidAt.getFullYear(), paidAt.getMonth() + 1, 1)

    // 3) Validar superposición por mes
    const { data: existingPayments, error: existingError } = await supabaseAdmin
      .from('payments')
      .select('id, schedule_type, pack_type, paid_at')
      .eq('student_id', studentId)
      .gte('paid_at', monthStart.toISOString())
      .lt('paid_at', nextMonthStart.toISOString())

    if (existingError) {
      return new Response(
        JSON.stringify({ error: existingError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: recentAttendances } = await supabaseAdmin
      .from('attendances')
      .select('attended_at')
      .eq('student_id', studentId)
      .gte('attended_at', monthStart.toISOString())

    const monthlyRows = filterExpiredPackPayments(
      (existingPayments ?? []) as PaymentRow[],
      (recentAttendances ?? []) as AttRow[],
      paidAt,
    )

    if (isMuroSchedule(scheduleType)) {
      if (monthlyRows.some((p) => isMuroSchedule(p.schedule_type))) {
        return new Response(
          JSON.stringify({ error: 'Ya existe un pago de muro libre para este estudiante en el mes.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } else {
      if (monthlyRows.some((p) => p.schedule_type === scheduleType)) {
        return new Response(
          JSON.stringify({ error: 'Ya existe un pago para este horario en el mes.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (isGroupSchedule(scheduleType) && monthlyRows.some((p) => isSchoolSchedule(p.schedule_type))) {
        return new Response(
          JSON.stringify({
            error: 'No se puede registrar grupo de entrenamiento en un mes que ya tiene pack de clases.',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (isSchoolSchedule(scheduleType) && monthlyRows.some((p) => isGroupSchedule(p.schedule_type))) {
        return new Response(
          JSON.stringify({
            error: 'No se puede registrar pack de clases en un mes que ya tiene grupo de entrenamiento.',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // 4) Insertar payment
    const { data: insertedPayment, error: insertError } = await supabaseAdmin
      .from('payments')
      .insert({
        student_id: studentId,
        pack_type: packType,
        schedule_type: scheduleType,
        paid_at: paidAt.toISOString(),
        amount: pack.price,
        payment_method: 'registro_manual',
      })
      .select('id, student_id, pack_type, schedule_type, paid_at, amount')
      .maybeSingle()

    if (insertError || !insertedPayment) {
      return new Response(
        JSON.stringify({ error: insertError?.message ?? 'No se pudo insertar el pago.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5) Actualizar/crear subscription según pack
    let subscriptionId: string | null = null

    if (adminGymId) {
      const { data: planRow, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id')
        .eq('gym_id', adminGymId)
        .eq('classes_per_month', pack.classes_per_month)
        .maybeSingle()

      if (planError || !planRow) {
        return new Response(
          JSON.stringify({
            error:
              planError?.message ??
              'No se encontró un plan para el gym_id y la cantidad de clases del pack.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { data: existingSubs, error: subsError } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('student_id', studentId)
        .limit(1)

      if (subsError) {
        return new Response(
          JSON.stringify({ error: subsError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const startDate = paidAt.toISOString().slice(0, 10)

      if (existingSubs && existingSubs.length > 0) {
        const { data: updatedSubs, error: updError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            plan_id: planRow.id,
            classes_total: pack.classes_per_month,
            start_date: startDate,
          })
          .eq('id', existingSubs[0].id)
          .select('id')
          .maybeSingle()

        if (updError || !updatedSubs) {
          return new Response(
            JSON.stringify({
              error: updError?.message ?? 'No se pudo actualizar la suscripción.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
        subscriptionId = updatedSubs.id
      } else {
        const { data: newSubs, error: insSubsError } = await supabaseAdmin
          .from('subscriptions')
          .insert({
            student_id: studentId,
            plan_id: planRow.id,
            classes_total: pack.classes_per_month,
            start_date: startDate,
          })
          .select('id')
          .maybeSingle()

        if (insSubsError || !newSubs) {
          return new Response(
            JSON.stringify({
              error: insSubsError?.message ?? 'No se pudo crear la suscripción.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
        subscriptionId = newSubs.id
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment: insertedPayment,
        subscription_id: subscriptionId,
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
