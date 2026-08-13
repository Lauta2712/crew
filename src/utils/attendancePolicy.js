import { CLASS_PACKS, isAttendanceCyclePayment, isUnlimitedPack } from '../constants/packs'
import { formatDateLong } from './dateFormatting'

/**
 * Vigencia del QR / cupo: un mes desde la fecha y hora del pago (misma hora, +1 mes calendario).
 * Al vencer el plazo, las clases no usadas se pierden (sin arrastre; excepciones fuera de esta lógica).
 */

function addOneMonth(date) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  return d
}

function parseDbDate(value) {
  if (!value) return null
  if (value instanceof Date) return new Date(value)
  const raw = String(value).trim()
  if (!raw) return null
  // Si no trae zona horaria, interpretarlo como UTC para evitar desfases
  // cuando Postgres devuelve `timestamp` sin timezone (caso típico paid_at).
  const hasTz = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(raw)
  const normalized = hasTz ? raw : `${raw}Z`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function inRange(isoDate, from, toExclusive) {
  const d = parseDbDate(isoDate)
  if (!d) return false
  return d >= from && d < toExclusive
}

function countAttendancesInRange(attendances, from, toExclusive) {
  return (
    attendances?.filter((att) => inRange(att.attended_at, from, toExclusive))?.length ?? 0
  )
}

function getPackClassesByType(packType, classPacks) {
  const packs = classPacks ?? CLASS_PACKS
  if (!packType) return 0
  return packs.find((p) => p.id === packType)?.classes_per_month ?? 0
}

export function computeAttendancePolicy({
  payments = [],
  attendances = [],
  now = new Date(),
  classPacks,
  walkIn,
}) {
  const qualifying = (payments ?? [])
    .filter((p) => isAttendanceCyclePayment(p, { classPacks, walkIn }))
    .sort((a, b) => {
      const ad = parseDbDate(a.paid_at)?.getTime() ?? 0
      const bd = parseDbDate(b.paid_at)?.getTime() ?? 0
      return bd - ad
    })

  const latestQualifyingPayment = qualifying[0] ?? null

  let currentPayment = null
  let cycleStart = null
  let cycleEndExclusive = null

  for (const p of qualifying) {
    const paidAt = parseDbDate(p.paid_at)
    if (!paidAt) continue
    const end = addOneMonth(paidAt)
    if (now >= paidAt && now < end) {
      currentPayment = p
      cycleStart = paidAt
      cycleEndExclusive = end
      break
    }
  }

  const currentClasses = currentPayment
    ? getPackClassesByType(currentPayment.pack_type, classPacks)
    : 0
  const unlimitedActive = !!(currentPayment && isUnlimitedPack(currentPayment.pack_type, classPacks))

  const currentUsed =
    currentPayment && cycleStart && cycleEndExclusive
      ? countAttendancesInRange(attendances, cycleStart, cycleEndExclusive)
      : 0

  const classesTotalForCurrentCycle = unlimitedActive ? 0 : currentClasses

  const remainingClasses = !currentPayment
    ? 0
    : unlimitedActive
      ? null
      : classesTotalForCurrentCycle > 0
        ? Math.max(classesTotalForCurrentCycle - currentUsed, 0)
        : 0

  const hasQr =
    !!currentPayment &&
    (unlimitedActive ||
      (classesTotalForCurrentCycle > 0 && remainingClasses > 0))

  let validUntil = null
  if (currentPayment && cycleEndExclusive) {
    validUntil = cycleEndExclusive.toISOString()
  }

  return {
    windows: {
      cycleStart: cycleStart?.toISOString() ?? null,
      cycleEndExclusive: cycleEndExclusive?.toISOString() ?? null,
      currentStart: cycleStart?.toISOString() ?? null,
      currentEnd: cycleEndExclusive?.toISOString() ?? null,
      previousStart: null,
      previousEnd: null,
      graceEnd: null,
    },
    currentPayment,
    latestQualifyingPayment,
    previousPayment: null,
    graceActive: false,
    carryoverClasses: 0,
    classesTotalForCurrentCycle,
    currentUsed,
    previousUsed: 0,
    previousClasses: 0,
    remainingClasses,
    hasQr,
    validUntil,
  }
}

/** Texto amigable: último instante válido es justo antes de `validUntil` (fin de ciclo exclusivo). */
export function inclusiveCycleEndLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  d.setMilliseconds(d.getMilliseconds() - 1)
  return formatDateLong(d.toISOString())
}
