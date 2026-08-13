import { describe, it, expect } from 'vitest'
import { assertPaymentAllowedThisMonth, filterExpiredPackPayments } from './manualPaymentInsert'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const muro = (extra = {}) => ({ schedule_type: 'muro_libre', ...extra })
const group = (extra = {}) => ({ schedule_type: 'grupo_entrenamiento', ...extra })
const school = (id = 'escuela_multi', extra = {}) => ({ schedule_type: id, ...extra })

// ---------------------------------------------------------------------------
// assertPaymentAllowedThisMonth
// ---------------------------------------------------------------------------

describe('assertPaymentAllowedThisMonth', () => {
  describe('muro_libre', () => {
    it('permite el primer pago de muro del mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([], { scheduleId: 'muro_libre' })
      ).not.toThrow()
    })

    it('permite muro si solo hay pagos de escuela este mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([school()], { scheduleId: 'muro_libre' })
      ).not.toThrow()
    })

    it('rechaza un segundo pago de muro en el mismo mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([muro()], { scheduleId: 'muro_libre' })
      ).toThrow('ya tiene un pago de acceso libre')
    })
  })

  describe('grupo_entrenamiento', () => {
    it('permite grupo si no hay pagos este mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([], { scheduleId: 'grupo_entrenamiento' })
      ).not.toThrow()
    })

    it('permite grupo si solo hay pago de muro este mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([muro()], { scheduleId: 'grupo_entrenamiento' })
      ).not.toThrow()
    })

    it('rechaza grupo si ya hay pack de escuela este mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([school('escuela_multi')], { scheduleId: 'grupo_entrenamiento' })
      ).toThrow('grupo de entrenamiento')
    })

    it('rechaza grupo si ya hay otro schedule de escuela este mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([school('escuelita')], { scheduleId: 'grupo_entrenamiento' })
      ).toThrow('grupo de entrenamiento')
    })
  })

  describe('packs de escuela', () => {
    it('permite el primer pago de escuela del mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([], { scheduleId: 'escuela_multi' })
      ).not.toThrow()
    })

    it('permite escuela si solo hay pago de muro este mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([muro()], { scheduleId: 'escuela_multi' })
      ).not.toThrow()
    })

    it('rechaza escuela si ya hay grupo_entrenamiento este mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([group()], { scheduleId: 'escuela_multi' })
      ).toThrow('grupo de entrenamiento')
    })

    it('rechaza el mismo schedule si ya fue pagado este mes', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([school('escuela_multi')], { scheduleId: 'escuela_multi' })
      ).toThrow('Ya hay un pago registrado para este horario')
    })

    it('permite distinto schedule si no hay conflicto', () => {
      expect(() =>
        assertPaymentAllowedThisMonth([school('escuela_gordo')], { scheduleId: 'escuela_multi' })
      ).not.toThrow()
    })
  })

  describe('lista vacía y undefined', () => {
    it('trata null como lista vacía', () => {
      expect(() =>
        assertPaymentAllowedThisMonth(null, { scheduleId: 'escuela_multi' })
      ).not.toThrow()
    })

    it('trata undefined como lista vacía', () => {
      expect(() =>
        assertPaymentAllowedThisMonth(undefined, { scheduleId: 'muro_libre' })
      ).not.toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// filterExpiredPackPayments
// ---------------------------------------------------------------------------

describe('filterExpiredPackPayments', () => {
  const DAY = 24 * 60 * 60 * 1000

  // Payment helpers — paid_at in UTC ISO
  const mkPayment = (id, packType, scheduleType, paidAt) => ({
    id,
    pack_type: packType,
    schedule_type: scheduleType,
    paid_at: paidAt,
  })

  const mkAtt = (attendedAt) => ({ attended_at: attendedAt })

  describe('time-based expiry', () => {
    it('retains a payment whose cycle has not ended', () => {
      const paidAt = new Date('2025-04-01T10:00:00Z')
      const now = new Date('2025-04-20T10:00:00Z') // 19 days later, within 1-month cycle
      const payment = mkPayment('p1', 'pack8', 'escuela_multi', paidAt.toISOString())
      expect(filterExpiredPackPayments([payment], [], undefined, now)).toHaveLength(1)
    })

    it('removes a payment whose 1-month cycle has elapsed', () => {
      const paidAt = new Date('2025-03-01T10:00:00Z')
      const now = new Date('2025-04-01T10:00:00Z') // exactly 1 month later
      const payment = mkPayment('p1', 'pack8', 'escuela_multi', paidAt.toISOString())
      expect(filterExpiredPackPayments([payment], [], undefined, now)).toHaveLength(0)
    })
  })

  describe('class-count exhaustion', () => {
    it('retains payment when classes are not yet exhausted', () => {
      const paidAt = new Date('2025-04-01T10:00:00Z')
      const now = new Date('2025-04-20T10:00:00Z')
      const payment = mkPayment('p1', 'pack8', 'escuela_multi', paidAt.toISOString())
      // 7 attendances — still 1 class left in an 8-class pack
      const atts = Array.from({ length: 7 }, (_, i) =>
        mkAtt(new Date(paidAt.getTime() + (i + 1) * DAY).toISOString()),
      )
      expect(filterExpiredPackPayments([payment], atts, undefined, now)).toHaveLength(1)
    })

    it('removes payment when all classes are consumed', () => {
      const paidAt = new Date('2025-04-01T10:00:00Z')
      const now = new Date('2025-04-20T10:00:00Z')
      const payment = mkPayment('p1', 'pack8', 'escuela_multi', paidAt.toISOString())
      // 8 attendances — pack8 fully consumed
      const atts = Array.from({ length: 8 }, (_, i) =>
        mkAtt(new Date(paidAt.getTime() + (i + 1) * DAY).toISOString()),
      )
      expect(filterExpiredPackPayments([payment], atts, undefined, now)).toHaveLength(0)
    })

    it('removes pack4 when 4 classes consumed', () => {
      const paidAt = new Date('2025-04-01T10:00:00Z')
      const now = new Date('2025-04-20T10:00:00Z')
      const payment = mkPayment('p1', 'pack4', 'escuela_gordo', paidAt.toISOString())
      const atts = Array.from({ length: 4 }, (_, i) =>
        mkAtt(new Date(paidAt.getTime() + (i + 1) * DAY).toISOString()),
      )
      expect(filterExpiredPackPayments([payment], atts, undefined, now)).toHaveLength(0)
    })

    it('does not count attendances before paid_at', () => {
      const paidAt = new Date('2025-04-10T10:00:00Z')
      const now = new Date('2025-04-20T10:00:00Z')
      const payment = mkPayment('p1', 'pack4', 'escuela_multi', paidAt.toISOString())
      // 4 attendances all before the payment date — should NOT count
      const atts = Array.from({ length: 4 }, (_, i) =>
        mkAtt(new Date(paidAt.getTime() - (i + 1) * DAY).toISOString()),
      )
      expect(filterExpiredPackPayments([payment], atts, undefined, now)).toHaveLength(1)
    })

    it('retains unlimited pack (muro_libre_mensual, classes_per_month=0) regardless of attendance count', () => {
      const paidAt = new Date('2025-04-01T10:00:00Z')
      const now = new Date('2025-04-20T10:00:00Z')
      const payment = mkPayment('p1', 'muro_libre_mensual', 'muro_libre', paidAt.toISOString())
      const atts = Array.from({ length: 30 }, (_, i) =>
        mkAtt(new Date(paidAt.getTime() + (i + 1) * DAY).toISOString()),
      )
      expect(filterExpiredPackPayments([payment], atts, undefined, now)).toHaveLength(1)
    })
  })

  describe('integration with assertPaymentAllowedThisMonth', () => {
    it('allows re-purchase of same schedule when pack is exhausted', () => {
      const paidAt = new Date('2025-04-01T10:00:00Z')
      const now = new Date('2025-04-20T10:00:00Z')
      const existingPayment = mkPayment('p1', 'pack8', 'escuela_multi', paidAt.toISOString())
      const atts = Array.from({ length: 8 }, (_, i) =>
        mkAtt(new Date(paidAt.getTime() + (i + 1) * DAY).toISOString()),
      )
      const active = filterExpiredPackPayments([existingPayment], atts, undefined, now)
      expect(() =>
        assertPaymentAllowedThisMonth(active, { scheduleId: 'escuela_multi' })
      ).not.toThrow()
    })

    it('still blocks re-purchase when pack has classes remaining', () => {
      const paidAt = new Date('2025-04-01T10:00:00Z')
      const now = new Date('2025-04-20T10:00:00Z')
      const existingPayment = mkPayment('p1', 'pack8', 'escuela_multi', paidAt.toISOString())
      const atts = Array.from({ length: 5 }, (_, i) =>
        mkAtt(new Date(paidAt.getTime() + (i + 1) * DAY).toISOString()),
      )
      const active = filterExpiredPackPayments([existingPayment], atts, undefined, now)
      expect(() =>
        assertPaymentAllowedThisMonth(active, { scheduleId: 'escuela_multi' })
      ).toThrow('Ya hay un pago registrado para este horario')
    })
  })
})
