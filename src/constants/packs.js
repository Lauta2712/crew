/** Misma redacción en toda la app para la tarifa de acceso libre reducida. */
export const PACK8_MENSUAL_NAME = 'Pack 8 clases mensuales'
export const PACK4_MENSUAL_NAME = 'Pack 4 clases mensuales'
/** Texto corto para listas y precios de acceso libre. */
export const WALK_IN_DISCOUNT_ELIGIBLE_LABEL =
  'Pack 8 clases mensuales o grupo de entrenamiento'
export const WALK_IN_STANDARD_LABEL = 'Resto de alumnos'
/** Variante breve para selects y tarjetas de precio. */
export const WALK_IN_DISCOUNT_ELIGIBLE_SHORT = 'Pack 8 mensual o grupo de entrenamiento'
export const WALK_IN_STANDARD_SHORT = 'Demás alumnos'

/** Ids por defecto del modelo de "acceso libre" (pase diario/mensual) de este gimnasio. */
export const WALK_IN_SCHEDULE_ID = 'muro_libre'
export const WALK_IN_MONTHLY_PACK_ID = 'muro_libre_mensual'
/** Sintético: no vive en CLASS_PACKS, solo se usa en payloads de QR / lógica en memoria. */
export const WALK_IN_DAILY_PACK_ID = 'muro_libre_diario'

export const CLASS_PACKS = [
  {
    id: 'single',
    name: 'Pack 1 clase mensual',
    price: 10000,
    classes_per_month: 1,
  },
  {
    id: 'pack4',
    name: PACK4_MENSUAL_NAME,
    price: 27000,
    classes_per_month: 4,
  },
  {
    id: 'pack8',
    name: PACK8_MENSUAL_NAME,
    price: 40000,
    classes_per_month: 8,
  },
  {
    id: 'grupo_entrenamiento',
    name: 'Grupo de entrenamiento · 8 clases mensuales',
    price: 55000,
    classes_per_month: 8,
  },
  {
    id: WALK_IN_MONTHLY_PACK_ID,
    name: 'Mensualidad acceso libre',
    /** Monto según WALK_IN_DISCOUNT_ELIGIBLE_LABEL vs resto; ver WALK_IN_MONTHLY_PRICE_*. */
    price: null,
    classes_per_month: 0,
    /** Sin tope de clases: computeAttendancePolicy no descuenta cupo para este pack. */
    unlimited: true,
  },
]

/** Pase diario de acceso libre: tarifa reducida si el alumno tiene Pack 8 mensual o grupo (8 clases mensuales). */
export const WALK_IN_PRICE_WITH_DISCOUNT = 5500
export const WALK_IN_PRICE_DEFAULT = 7000

/** Mensualidad de acceso libre: misma regla de tarifa reducida (Pack 8 mensual o grupo). */
export const WALK_IN_MONTHLY_PRICE_WITH_DISCOUNT = 20000
export const WALK_IN_MONTHLY_PRICE_DEFAULT = 30000

/** Packs cuyo pago cuenta para el descuento de acceso libre. Configurable por gimnasio vía gym_settings. */
export const WALK_IN_DISCOUNT_ELIGIBLE_PACK_IDS = ['pack8', 'grupo_entrenamiento']

/**
 * Config por defecto del modelo de acceso libre (Crux). Un gym_settings custom puede reemplazar
 * cualquiera de estos campos; scheduleId: null desactiva el modelo por completo para ese gimnasio.
 */
export const DEFAULT_WALK_IN = {
  scheduleId: WALK_IN_SCHEDULE_ID,
  dailyPackId: WALK_IN_DAILY_PACK_ID,
  discountEligiblePackIds: WALK_IN_DISCOUNT_ELIGIBLE_PACK_IDS,
  priceDefault: WALK_IN_PRICE_DEFAULT,
  priceWithDiscount: WALK_IN_PRICE_WITH_DISCOUNT,
  monthlyDefault: WALK_IN_MONTHLY_PRICE_DEFAULT,
  monthlyWithDiscount: WALK_IN_MONTHLY_PRICE_WITH_DISCOUNT,
}

/** @param {string|null|undefined} scheduleId @param {typeof DEFAULT_WALK_IN | null} [walkIn] */
export function isWalkInSchedule(scheduleId, walkIn) {
  const w = walkIn ?? DEFAULT_WALK_IN
  return !!w?.scheduleId && scheduleId === w.scheduleId
}

/** @param {string|null|undefined} packType @param {typeof DEFAULT_WALK_IN | null} [walkIn] */
export function isWalkInDailyPack(packType, walkIn) {
  const w = walkIn ?? DEFAULT_WALK_IN
  return !!w?.dailyPackId && packType === w.dailyPackId
}

/** @param {string|null|undefined} packType @param {typeof DEFAULT_WALK_IN | null} [walkIn] */
export function isDiscountEligiblePack(packType, walkIn) {
  if (!packType) return false
  const w = walkIn ?? DEFAULT_WALK_IN
  return !!w?.discountEligiblePackIds?.includes(packType)
}

/**
 * Pack con cupo ilimitado (no descuenta clases del ciclo). Reemplaza la comparación
 * contra un id mágico: cualquier gimnasio puede marcar su propio pack con `unlimited: true`.
 * @param {string|null|undefined} packType
 * @param {typeof CLASS_PACKS} [classPacks]
 */
export function isUnlimitedPack(packType, classPacks) {
  if (!packType) return false
  const packs = classPacks ?? CLASS_PACKS
  return !!packs.find((p) => p.id === packType)?.unlimited
}

/**
 * Pagos que abren o renuevan el ciclo de asistencias. Deriva la elegibilidad del catálogo
 * resuelto del gimnasio en vez de comparar contra listas de ids hardcodeadas: cualquier
 * pack presente en `classPacks` cuenta, salvo un pago del horario de acceso libre cuyo
 * `pack_type` no sea el pack ilimitado (eso es un pase diario, no abre ciclo).
 * @param {{pack_type?: string, paid_at?: string, schedule_type?: string}} payment
 * @param {{classPacks?: typeof CLASS_PACKS, walkIn?: typeof DEFAULT_WALK_IN}} [ctx]
 */
export function isAttendanceCyclePayment(payment, ctx = {}) {
  if (!payment?.pack_type || !payment?.paid_at) return false
  const packs = ctx.classPacks ?? CLASS_PACKS
  const isKnownPack = packs.some((p) => p.id === payment.pack_type)
  if (!isKnownPack) return false
  if (isWalkInSchedule(payment.schedule_type, ctx.walkIn) && !isUnlimitedPack(payment.pack_type, packs)) {
    return false
  }
  return true
}

/**
 * @param {typeof CLASS_PACKS[number] | null | undefined} pack
 * @param {Partial<typeof DEFAULT_WALK_IN> | null} [walkIn] desde useGymCatalog().walkIn
 */
export function formatPackOptionLabel(pack, walkIn = null) {
  if (!pack) return ''
  if (pack.unlimited) {
    const mLow = walkIn?.monthlyWithDiscount ?? WALK_IN_MONTHLY_PRICE_WITH_DISCOUNT
    const mHi = walkIn?.monthlyDefault ?? WALK_IN_MONTHLY_PRICE_DEFAULT
    return `${pack.name} · $${mLow.toLocaleString('es-AR')} (${WALK_IN_DISCOUNT_ELIGIBLE_SHORT}) / $${mHi.toLocaleString('es-AR')} (${WALK_IN_STANDARD_SHORT})`
  }
  const pricePart =
    pack.price != null
      ? `$${pack.price.toLocaleString('es-AR')}`
      : 'precio a confirmar'
  return `${pack.name} · ${pricePart}`
}

export const SCHEDULE_TYPES = [
  {
    id: WALK_IN_SCHEDULE_ID,
    name: 'Acceso libre',
    /** Modelo de acceso walk-in: pase diario o mensual, no clases-por-mes. Ver DEFAULT_WALK_IN. */
    accessMode: 'walk_in',
    slots: [
      { days: 'Martes y Jueves', time: '19:00 – 20:20' },
      { days: 'Viernes', time: '19:00 – 22:00' },
    ],
  },
  {
    id: 'escuela_multi',
    name: 'Escuela (Profe Multi)',
    slots: [
      { days: 'Lunes y Miércoles', time: '9:00 – 10:30' },
      { days: 'Martes y Jueves', time: '20:30 – 22:00' },
    ],
  },
  {
    id: 'escuela_gordo',
    name: 'Escuela (Profe Gordo)',
    slots: [
      { days: 'Lunes y Miércoles', time: '15:00 – 16:30' },
      { days: 'Lunes y Miércoles', time: '19:00 – 20:30' },
      { days: 'Martes y Jueves', time: '9:00 – 10:30' },
    ],
  },
  {
    id: 'escuelita',
    name: 'Escuelita (5 a 12 años)',
    slots: [{ days: 'Martes y Jueves', time: '18:00 – 19:00' }],
  },
  {
    id: 'grupo_entrenamiento',
    name: 'Grupo de entrenamiento',
    slots: [{ days: 'Lunes y Miércoles', time: '20:30 – 22:00' }],
  },
]

export function getPackById(id, classPacks) {
  const packs = classPacks ?? CLASS_PACKS
  return packs.find((p) => p.id === id) || null
}

export function getScheduleTypeById(id, scheduleTypes) {
  const schedules = scheduleTypes ?? SCHEDULE_TYPES
  return schedules.find((s) => s.id === id) || null
}
