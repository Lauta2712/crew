import { CLASS_PACKS, DEFAULT_WALK_IN, SCHEDULE_TYPES } from '../constants/packs'

/**
 * @typedef {object} GymSettingsData
 * @property {'legacy'|'custom'} [catalogMode] 'legacy' (default, sin este campo): pisa precios/nombres
 *   sobre el catálogo hardcodeado de Crux — comportamiento histórico, usado por el row ya guardado de
 *   Crux en producción. 'custom': classPacks/scheduleTypes son la lista completa y autoritativa, sin
 *   mezclar con los defaults de Crux — para gimnasios nuevos con su propio catálogo desde cero.
 * @property {Record<string, { price?: number }> | Array<object>} [classPacks]
 * @property {Array<{ id: string, name?: string, slots?: Array<{ days: string, time: string }> }>} [scheduleTypes]
 * @property {Partial<typeof DEFAULT_WALK_IN>} [walkIn] Solo en modo 'custom'.
 * @property {Partial<{ priceDefault: number, priceWithPack8: number, monthlyDefault: number, monthlyWithPack8: number }>} [freeWall]
 *   Clave JSON persistida en modo 'legacy' (nombre histórico — ver mergeWalkInPricing).
 */

function isCustomMode(data) {
  return data?.catalogMode === 'custom'
}

/** @param {Record<string, { price?: number }> | undefined} overrides */
export function mergeClassPacks(overrides = {}) {
  return CLASS_PACKS.map((p) => {
    const o = overrides[p.id]
    if (o != null && typeof o.price === 'number') {
      return { ...p, price: o.price }
    }
    return { ...p }
  })
}

/** Catálogo completo provisto por el gimnasio (modo 'custom'): sin los defaults de Crux. */
function customClassPacks(list) {
  return (Array.isArray(list) ? list : []).map((p) => ({ ...p }))
}

/** @param {GymSettingsData['scheduleTypes'] | undefined} overrideList */
export function mergeScheduleTypes(overrideList) {
  if (!Array.isArray(overrideList) || overrideList.length === 0) {
    return SCHEDULE_TYPES.map((s) => ({ ...s, slots: s.slots.map((sl) => ({ ...sl })) }))
  }
  const byId = new Map(
    overrideList.filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x]),
  )
  return SCHEDULE_TYPES.map((s) => {
    const o = byId.get(s.id)
    if (!o) {
      return { ...s, slots: s.slots.map((sl) => ({ ...sl })) }
    }
    return {
      ...s,
      name: typeof o.name === 'string' && o.name.trim() ? o.name : s.name,
      slots: Array.isArray(o.slots) && o.slots.length > 0 ? o.slots : s.slots,
    }
  })
}

function customScheduleTypes(list) {
  return (Array.isArray(list) ? list : []).map((s) => ({
    ...s,
    slots: Array.isArray(s.slots) ? s.slots.map((sl) => ({ ...sl })) : [],
  }))
}

/**
 * Precios del modelo de acceso libre en modo legacy. La clave JSON persistida sigue siendo
 * `freeWall` (nombre histórico) para no requerir una migración de datos del row ya guardado
 * de Crux — el resto del código ya no usa ese nombre, solo esta función lo traduce.
 * @param {GymSettingsData['freeWall'] | undefined} o
 */
export function mergeWalkInPricing(o = {}) {
  return {
    priceDefault: typeof o.priceDefault === 'number' ? o.priceDefault : DEFAULT_WALK_IN.priceDefault,
    priceWithDiscount:
      typeof o.priceWithPack8 === 'number' ? o.priceWithPack8 : DEFAULT_WALK_IN.priceWithDiscount,
    monthlyDefault:
      typeof o.monthlyDefault === 'number' ? o.monthlyDefault : DEFAULT_WALK_IN.monthlyDefault,
    monthlyWithDiscount:
      typeof o.monthlyWithPack8 === 'number' ? o.monthlyWithPack8 : DEFAULT_WALK_IN.monthlyWithDiscount,
  }
}

/**
 * Resuelve la config completa del modelo de acceso libre. En modo legacy usa los defaults de
 * Crux (scheduleId 'muro_libre', etc.) combinados con `mergeWalkInPricing`. En modo custom, el
 * gimnasio define todo desde cero vía `data.walkIn` — `scheduleId: null` desactiva el modelo
 * por completo (gimnasio 100% por clases, ej. yoga).
 */
function mergeWalkIn(data) {
  if (isCustomMode(data)) {
    const w = data?.walkIn ?? {}
    return {
      scheduleId: typeof w.scheduleId === 'string' ? w.scheduleId : null,
      dailyPackId: typeof w.dailyPackId === 'string' ? w.dailyPackId : null,
      discountEligiblePackIds: Array.isArray(w.discountEligiblePackIds) ? w.discountEligiblePackIds : [],
      priceDefault: typeof w.priceDefault === 'number' ? w.priceDefault : 0,
      priceWithDiscount: typeof w.priceWithDiscount === 'number' ? w.priceWithDiscount : 0,
      monthlyDefault: typeof w.monthlyDefault === 'number' ? w.monthlyDefault : 0,
      monthlyWithDiscount: typeof w.monthlyWithDiscount === 'number' ? w.monthlyWithDiscount : 0,
    }
  }
  return {
    scheduleId: DEFAULT_WALK_IN.scheduleId,
    dailyPackId: DEFAULT_WALK_IN.dailyPackId,
    discountEligiblePackIds: DEFAULT_WALK_IN.discountEligiblePackIds,
    ...mergeWalkInPricing(data?.freeWall),
  }
}

/**
 * Identidad visual del gimnasio (color primario/acento/fuente) — ver `src/utils/theme.js`
 * (`applyTheme`) para cómo se convierte esto en CSS custom properties. Sin merge/derivación
 * acá: un gimnasio sin `theme` configurado devuelve `{}` — es `applyTheme` quien resuelve
 * ese `{}` contra el tema de bootstrap del deploy (o lo resetea), no esta función.
 * @param {unknown} raw
 * @returns {{ primaryColor?: string, accentColor?: string, font?: string, logoUrl?: string }}
 */
function mergeTheme(data) {
  const t = data?.theme
  return t && typeof t === 'object' ? { ...t } : {}
}

/** @param {unknown} raw */
export function buildCatalogFromSettingsJson(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  if (isCustomMode(data)) {
    return {
      classPacks: customClassPacks(data.classPacks),
      scheduleTypes: customScheduleTypes(data.scheduleTypes),
      walkIn: mergeWalkIn(data),
      theme: mergeTheme(data),
    }
  }
  return {
    classPacks: mergeClassPacks(data.classPacks),
    scheduleTypes: mergeScheduleTypes(data.scheduleTypes),
    walkIn: mergeWalkIn(data),
    theme: mergeTheme(data),
  }
}
