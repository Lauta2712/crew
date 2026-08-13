import { describe, it, expect } from 'vitest'
import {
  resolveManualPaymentRow,
  shouldSyncSubscriptionAfterManualPayment,
} from './manualPaymentInsert'
import {
  WALK_IN_PRICE_DEFAULT,
  WALK_IN_PRICE_WITH_DISCOUNT,
  WALK_IN_MONTHLY_PRICE_DEFAULT,
  WALK_IN_MONTHLY_PRICE_WITH_DISCOUNT,
} from '../constants/packs'

// ---------------------------------------------------------------------------
// Mock del cliente Supabase
// Simula: client.from('payments').select(...).eq(...).in(...).order(...).limit(1).maybeSingle()
// ---------------------------------------------------------------------------

function makeClient(latestPackType = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: latestPackType ? { pack_type: latestPackType } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }
}

const STUDENT_ID = 'student-uuid-123'
const PAID_AT = new Date('2025-06-15T12:00:00Z')

// ---------------------------------------------------------------------------
// shouldSyncSubscriptionAfterManualPayment
// ---------------------------------------------------------------------------

describe('shouldSyncSubscriptionAfterManualPayment', () => {
  it('devuelve true para schedules de escuela', () => {
    expect(shouldSyncSubscriptionAfterManualPayment({ scheduleId: 'escuela_multi' })).toBe(true)
    expect(shouldSyncSubscriptionAfterManualPayment({ scheduleId: 'escuela_gordo' })).toBe(true)
    expect(shouldSyncSubscriptionAfterManualPayment({ scheduleId: 'escuelita' })).toBe(true)
    expect(shouldSyncSubscriptionAfterManualPayment({ scheduleId: 'grupo_entrenamiento' })).toBe(true)
  })

  it('devuelve false para el horario de acceso libre (default Crux: muro_libre)', () => {
    expect(shouldSyncSubscriptionAfterManualPayment({ scheduleId: 'muro_libre' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveManualPaymentRow — packs de escuela
// ---------------------------------------------------------------------------

describe('resolveManualPaymentRow — packs de escuela', () => {
  it('resuelve correctamente un pack4 para escuela_multi', async () => {
    const row = await resolveManualPaymentRow(makeClient(), {
      studentId: STUDENT_ID,
      packId: 'pack4',
      scheduleId: 'escuela_multi',
      paidAt: PAID_AT,
    })
    expect(row.pack_type).toBe('pack4')
    expect(row.schedule_type).toBe('escuela_multi')
    expect(row.student_id).toBe(STUDENT_ID)
    expect(row.payment_method).toBe('registro_manual')
    expect(row.paid_at).toBe(PAID_AT.toISOString())
  })

  it('resuelve un pack8 con el precio correcto', async () => {
    const row = await resolveManualPaymentRow(makeClient(), {
      studentId: STUDENT_ID,
      packId: 'pack8',
      scheduleId: 'escuela_gordo',
      paidAt: PAID_AT,
    })
    expect(row.pack_type).toBe('pack8')
    expect(row.amount).toBe(40000)
  })

  it('resuelve grupo_entrenamiento con precio correcto', async () => {
    const row = await resolveManualPaymentRow(makeClient(), {
      studentId: STUDENT_ID,
      packId: 'grupo_entrenamiento',
      scheduleId: 'grupo_entrenamiento',
      paidAt: PAID_AT,
    })
    expect(row.pack_type).toBe('grupo_entrenamiento')
    expect(row.amount).toBe(55000)
  })
})

// ---------------------------------------------------------------------------
// resolveManualPaymentRow — acceso libre (pase diario), default Crux (sin catalog)
// ---------------------------------------------------------------------------

describe('resolveManualPaymentRow — acceso libre pase diario', () => {
  it('aplica tarifa estándar si el alumno no tiene pack8 ni grupo', async () => {
    const row = await resolveManualPaymentRow(makeClient(null), {
      studentId: STUDENT_ID,
      packId: 'single',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.amount).toBe(WALK_IN_PRICE_DEFAULT)
    expect(row.schedule_type).toBe('muro_libre')
  })

  it('aplica tarifa reducida si el alumno tiene pack8', async () => {
    const row = await resolveManualPaymentRow(makeClient('pack8'), {
      studentId: STUDENT_ID,
      packId: 'single',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.amount).toBe(WALK_IN_PRICE_WITH_DISCOUNT)
  })

  it('aplica tarifa reducida si el alumno tiene grupo_entrenamiento', async () => {
    const row = await resolveManualPaymentRow(makeClient('grupo_entrenamiento'), {
      studentId: STUDENT_ID,
      packId: 'single',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.amount).toBe(WALK_IN_PRICE_WITH_DISCOUNT)
  })

  it('aplica tarifa estándar si el alumno tiene pack4 (no califica para descuento)', async () => {
    const row = await resolveManualPaymentRow(makeClient('pack4'), {
      studentId: STUDENT_ID,
      packId: 'single',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.amount).toBe(WALK_IN_PRICE_DEFAULT)
  })

  it('hereda el pack_type del último pago principal del alumno', async () => {
    const row = await resolveManualPaymentRow(makeClient('pack8'), {
      studentId: STUDENT_ID,
      packId: 'single',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    // El pack_type en el registro debe reflejar el pack principal del alumno
    expect(row.pack_type).toBe('pack8')
  })

  it('usa packId como pack_type si no hay historial y el packId es un pack principal', async () => {
    const row = await resolveManualPaymentRow(makeClient(null), {
      studentId: STUDENT_ID,
      packId: 'pack8',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.pack_type).toBe('pack8')
    expect(row.amount).toBe(WALK_IN_PRICE_WITH_DISCOUNT) // califica por el packId actual
  })

  it('usa "single" como pack_type si no hay historial y packId no es principal', async () => {
    const row = await resolveManualPaymentRow(makeClient(null), {
      studentId: STUDENT_ID,
      packId: 'single',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.pack_type).toBe('single')
  })
})

// ---------------------------------------------------------------------------
// resolveManualPaymentRow — acceso libre mensual, default Crux (sin catalog)
// ---------------------------------------------------------------------------

describe('resolveManualPaymentRow — acceso libre mensual', () => {
  it('aplica precio mensual estándar sin pack8', async () => {
    const row = await resolveManualPaymentRow(makeClient(null), {
      studentId: STUDENT_ID,
      packId: 'muro_libre_mensual',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.pack_type).toBe('muro_libre_mensual')
    expect(row.amount).toBe(WALK_IN_MONTHLY_PRICE_DEFAULT)
  })

  it('aplica precio mensual reducido con pack8', async () => {
    const row = await resolveManualPaymentRow(makeClient('pack8'), {
      studentId: STUDENT_ID,
      packId: 'muro_libre_mensual',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.pack_type).toBe('muro_libre_mensual')
    expect(row.amount).toBe(WALK_IN_MONTHLY_PRICE_WITH_DISCOUNT)
  })

  it('aplica precio mensual reducido con grupo_entrenamiento', async () => {
    const row = await resolveManualPaymentRow(makeClient('grupo_entrenamiento'), {
      studentId: STUDENT_ID,
      packId: 'muro_libre_mensual',
      scheduleId: 'muro_libre',
      paidAt: PAID_AT,
    })
    expect(row.amount).toBe(WALK_IN_MONTHLY_PRICE_WITH_DISCOUNT)
  })
})

// ---------------------------------------------------------------------------
// resolveManualPaymentRow — catálogo personalizado (gym_settings modo 'custom')
// ---------------------------------------------------------------------------

describe('resolveManualPaymentRow — catálogo personalizado', () => {
  const customCatalog = {
    classPacks: [
      { id: 'pack4', name: 'Pack 4', price: 30000, classes_per_month: 4 },
      { id: 'pack8', name: 'Pack 8', price: 45000, classes_per_month: 8 },
      { id: 'ilimitado', name: 'Ilimitado', price: null, classes_per_month: 0, unlimited: true },
    ],
    walkIn: {
      scheduleId: 'clase_suelta',
      dailyPackId: 'clase_suelta_diaria',
      discountEligiblePackIds: ['pack8'],
      priceDefault: 8000,
      priceWithDiscount: 6000,
      monthlyDefault: 35000,
      monthlyWithDiscount: 22000,
    },
  }

  it('usa precios del catálogo personalizado para pack4', async () => {
    const row = await resolveManualPaymentRow(makeClient(), {
      studentId: STUDENT_ID,
      packId: 'pack4',
      scheduleId: 'escuela_multi',
      paidAt: PAID_AT,
      catalog: customCatalog,
    })
    expect(row.amount).toBe(30000)
  })

  it('usa precio de acceso libre personalizado para tarifa estándar, con el scheduleId propio del gym', async () => {
    const row = await resolveManualPaymentRow(makeClient(null), {
      studentId: STUDENT_ID,
      packId: 'pack4',
      scheduleId: 'clase_suelta',
      paidAt: PAID_AT,
      catalog: customCatalog,
    })
    expect(row.amount).toBe(8000)
  })

  it('usa precio de acceso libre mensual personalizado con descuento', async () => {
    const row = await resolveManualPaymentRow(makeClient('pack8'), {
      studentId: STUDENT_ID,
      packId: 'ilimitado',
      scheduleId: 'clase_suelta',
      paidAt: PAID_AT,
      catalog: customCatalog,
    })
    expect(row.amount).toBe(22000)
    expect(row.pack_type).toBe('ilimitado')
  })
})
