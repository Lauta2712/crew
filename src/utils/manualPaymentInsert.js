import {
  CLASS_PACKS,
  DEFAULT_WALK_IN,
  isDiscountEligiblePack,
  isWalkInSchedule,
} from '../constants/packs'

function addOneCalendarMonth(date) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  return d
}

function parsePaymentDate(raw) {
  if (!raw) return null
  const s = String(raw)
  const hasTz = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTz ? s : `${s}Z`)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Filters out payments whose pack cycle has already expired (by time) or whose
 * classes have been fully consumed (attendance count ≥ classes_per_month).
 *
 * Use this before assertPaymentAllowedThisMonth to allow re-purchase when a
 * monthly pack runs out before the calendar month ends.
 *
 * @param {object[]} payments    Rows from `payments` — must include id, pack_type, paid_at, schedule_type
 * @param {object[]} attendances Rows from `attendances` for the student — must include attended_at
 * @param {object[]} [classPacks] Pack catalog (defaults to CLASS_PACKS)
 * @param {Date}     [now]        Current date (injectable for testing)
 */
export function filterExpiredPackPayments(payments, attendances, classPacks, now = new Date()) {
  const packs = classPacks ?? CLASS_PACKS
  const atts = attendances ?? []

  return (payments ?? []).filter((payment) => {
    const paidAt = parsePaymentDate(payment.paid_at)
    if (!paidAt) return true // can't determine expiry — keep to be safe

    const cycleEnd = addOneCalendarMonth(paidAt)

    // Time-based expiry: full 1-month cycle has elapsed
    if (now >= cycleEnd) return false

    // Class-count exhaustion for finite packs
    const pack = packs.find((p) => p.id === payment.pack_type)
    const classesPerMonth = pack?.classes_per_month

    // Unlimited or unknown pack type: never exhausted by count
    if (!classesPerMonth) return true

    const used = atts.filter((att) => {
      const attDate = parsePaymentDate(att.attended_at)
      return attDate && attDate >= paidAt && attDate < cycleEnd
    }).length

    return used < classesPerMonth
  })
}

/**
 * @param {object[]} [classPacks] Pack catalog (defaults a CLASS_PACKS). "Principal" = cualquier
 *   pack del catálogo que no sea el pack ilimitado del horario de acceso libre.
 */
export async function fetchLatestMainPackType(client, studentId, classPacks) {
  const packs = classPacks ?? CLASS_PACKS
  const mainPackIds = packs.filter((p) => !p.unlimited).map((p) => p.id)
  const { data, error } = await client
    .from('payments')
    .select('pack_type')
    .eq('student_id', studentId)
    .in('pack_type', mainPackIds)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.pack_type ?? null
}

/**
 * Reglas:
 * - el horario de acceso libre convive con otros, pero solo 1 pago de acceso libre por mes
 * - para otros schedules: 1 pago por schedule por mes
 * - grupo_entrenamiento NO puede convivir en el mismo mes con packs de clases de escuela
 */
export function assertPaymentAllowedThisMonth(existingRows, { scheduleId, walkIn }) {
  const rows = existingRows ?? []
  const isWalkIn = isWalkInSchedule(scheduleId, walkIn)
  const isGroup = scheduleId === 'grupo_entrenamiento'

  const isWalkInRow = (p) => isWalkInSchedule(p.schedule_type, walkIn)
  const isGroupRow = (p) => p.schedule_type === 'grupo_entrenamiento'
  const isSchoolRow = (p) => !isWalkInRow(p) && !isGroupRow(p)

  if (isWalkIn) {
    if (rows.some(isWalkInRow)) {
      throw new Error('Este alumno ya tiene un pago de acceso libre registrado en este mes.')
    }
    return
  }

  if (isGroup && rows.some(isSchoolRow)) {
    throw new Error(
      'No se puede registrar grupo de entrenamiento en un mes que ya tiene pack de clases.',
    )
  }

  if (!isGroup && rows.some(isGroupRow)) {
    throw new Error(
      'No se puede registrar pack de clases en un mes que ya tiene grupo de entrenamiento.',
    )
  }

  if (rows.some((p) => p.schedule_type === scheduleId)) {
    throw new Error('Ya hay un pago registrado para este horario en el mes.')
  }
}

/**
 * @param {object} [catalog] classPacks + walkIn fusionados (useGymCatalog)
 * @param {string|null} [scheduleSlot] Franja específica dentro del schedule: "days|time" o null.
 */
export async function resolveManualPaymentRow(client, { studentId, packId, scheduleId, scheduleSlot = null, paidAt, catalog }) {
  const packs = catalog?.classPacks ?? CLASS_PACKS
  const walkIn = catalog?.walkIn ?? DEFAULT_WALK_IN
  const pack = packs.find((p) => p.id === packId) ?? null
  let insertPackType = packId
  let amount = pack?.price != null ? pack.price : null

  if (isWalkInSchedule(scheduleId, walkIn)) {
    const latestMain = await fetchLatestMainPackType(client, studentId, packs)
    const discount =
      isDiscountEligiblePack(latestMain, walkIn) ||
      (latestMain == null && isDiscountEligiblePack(packId, walkIn))

    if (pack?.unlimited) {
      amount = discount ? walkIn.monthlyWithDiscount : walkIn.monthlyDefault
      insertPackType = packId
    } else {
      amount = discount ? walkIn.priceWithDiscount : walkIn.priceDefault
      const isMainPack = packs.some((p) => !p.unlimited && p.id === packId)
      const fallbackMainPackId = packs.find((p) => !p.unlimited)?.id ?? packId
      insertPackType = latestMain ?? (isMainPack ? packId : fallbackMainPackId)
    }
  }

  return {
    student_id: studentId,
    pack_type: insertPackType,
    schedule_type: scheduleId,
    schedule_slot: scheduleSlot || null,
    paid_at: paidAt.toISOString(),
    amount,
    payment_method: 'registro_manual',
  }
}

/** Suscripción en DB solo para packs de clases de escuela, no para pagos del horario de acceso libre. */
export function shouldSyncSubscriptionAfterManualPayment({ scheduleId, walkIn }) {
  return !isWalkInSchedule(scheduleId, walkIn)
}
