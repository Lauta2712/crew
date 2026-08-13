import { describe, it, expect } from 'vitest'
import { computeAttendancePolicy } from './attendancePolicy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crea un pago que abre ciclo, con paid_at relativo a `now`. */
function makePayment(packType, daysAgo = 0, scheduleType = null) {
  const d = new Date('2025-06-15T12:00:00Z')
  d.setDate(d.getDate() - daysAgo)
  return {
    pack_type: packType,
    paid_at: d.toISOString(),
    schedule_type: scheduleType ?? (packType === 'muro_libre_mensual' ? 'muro_libre' : 'escuela_multi'),
  }
}

/** Crea una asistencia en una fecha dada (ISO string). */
function makeAttendance(iso) {
  return { attended_at: iso }
}

// `now` fijo para todos los tests: 2025-06-20
const NOW = new Date('2025-06-20T12:00:00Z')

// ---------------------------------------------------------------------------
// computeAttendancePolicy
// ---------------------------------------------------------------------------

describe('computeAttendancePolicy', () => {
  describe('sin pagos', () => {
    it('devuelve hasQr=false y remainingClasses=0 si no hay pagos', () => {
      const result = computeAttendancePolicy({ payments: [], attendances: [], now: NOW })
      expect(result.hasQr).toBe(false)
      expect(result.remainingClasses).toBe(0)
      expect(result.currentPayment).toBeNull()
    })

    it('devuelve hasQr=false si el único pago está vencido', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('pack8', 35)], // pagado hace 35 días → ciclo de 1 mes ya venció
        attendances: [],
        now: NOW,
      })
      expect(result.hasQr).toBe(false)
      expect(result.currentPayment).toBeNull()
    })
  })

  describe('pack8 (8 clases por mes)', () => {
    it('tiene 8 clases restantes sin asistencias', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('pack8', 5)],
        attendances: [],
        now: NOW,
      })
      expect(result.hasQr).toBe(true)
      expect(result.remainingClasses).toBe(8)
      expect(result.currentUsed).toBe(0)
    })

    it('descuenta correctamente las asistencias dentro del ciclo', () => {
      const paidAt = makePayment('pack8', 5).paid_at
      const result = computeAttendancePolicy({
        payments: [makePayment('pack8', 5)],
        attendances: [
          makeAttendance('2025-06-16T10:00:00Z'),
          makeAttendance('2025-06-17T10:00:00Z'),
          makeAttendance('2025-06-18T10:00:00Z'),
        ],
        now: NOW,
      })
      expect(result.currentUsed).toBe(3)
      expect(result.remainingClasses).toBe(5)
      expect(result.hasQr).toBe(true)
    })

    it('hasQr=false cuando se agotaron todas las clases', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('pack8', 5)],
        attendances: [
          makeAttendance('2025-06-11T10:00:00Z'),
          makeAttendance('2025-06-12T10:00:00Z'),
          makeAttendance('2025-06-13T10:00:00Z'),
          makeAttendance('2025-06-14T10:00:00Z'),
          makeAttendance('2025-06-15T10:00:00Z'),
          makeAttendance('2025-06-16T10:00:00Z'),
          makeAttendance('2025-06-17T10:00:00Z'),
          makeAttendance('2025-06-18T10:00:00Z'),
        ],
        now: NOW,
      })
      expect(result.remainingClasses).toBe(0)
      expect(result.hasQr).toBe(false)
    })

    it('no cuenta asistencias fuera del ciclo activo', () => {
      // Asistencia de hace 40 días (ciclo anterior)
      const result = computeAttendancePolicy({
        payments: [makePayment('pack8', 5)],
        attendances: [makeAttendance('2025-05-01T10:00:00Z')],
        now: NOW,
      })
      expect(result.currentUsed).toBe(0)
      expect(result.remainingClasses).toBe(8)
    })
  })

  describe('pack4 (4 clases por mes)', () => {
    it('tiene 4 clases restantes sin asistencias', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('pack4', 3)],
        attendances: [],
        now: NOW,
      })
      expect(result.remainingClasses).toBe(4)
      expect(result.hasQr).toBe(true)
    })
  })

  describe('single (1 clase por mes)', () => {
    it('tiene 1 clase restante sin asistencias', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('single', 1)],
        attendances: [],
        now: NOW,
      })
      expect(result.remainingClasses).toBe(1)
      expect(result.hasQr).toBe(true)
    })

    it('hasQr=false después de usar la única clase', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('single', 1)],
        attendances: [makeAttendance('2025-06-19T10:00:00Z')],
        now: NOW,
      })
      expect(result.remainingClasses).toBe(0)
      expect(result.hasQr).toBe(false)
    })
  })

  describe('muro_libre_mensual', () => {
    it('hasQr=true y remainingClasses=null (acceso ilimitado)', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('muro_libre_mensual', 2)],
        attendances: [],
        now: NOW,
      })
      expect(result.hasQr).toBe(true)
      expect(result.remainingClasses).toBeNull()
    })

    it('hasQr=true aunque haya muchas asistencias', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('muro_libre_mensual', 2)],
        attendances: Array.from({ length: 20 }, (_, i) =>
          makeAttendance(`2025-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`)
        ),
        now: NOW,
      })
      expect(result.hasQr).toBe(true)
    })
  })

  describe('renovación de pack', () => {
    it('usa el pago más reciente como ciclo activo', () => {
      // Pack vencido hace 35 días + pack nuevo hace 5 días
      const result = computeAttendancePolicy({
        payments: [
          makePayment('pack4', 5),  // activo
          makePayment('pack8', 35), // vencido
        ],
        attendances: [],
        now: NOW,
      })
      expect(result.currentPayment?.pack_type).toBe('pack4')
      expect(result.remainingClasses).toBe(4)
    })

    it('si el pack anterior venció y no hay pack nuevo, no tiene QR', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('pack8', 35)],
        attendances: [],
        now: NOW,
      })
      expect(result.hasQr).toBe(false)
      expect(result.currentPayment).toBeNull()
    })
  })

  describe('grupo_entrenamiento (8 clases)', () => {
    it('funciona igual que pack8 en términos de cupo', () => {
      const result = computeAttendancePolicy({
        payments: [makePayment('grupo_entrenamiento', 3)],
        attendances: [],
        now: NOW,
      })
      expect(result.remainingClasses).toBe(8)
      expect(result.hasQr).toBe(true)
    })
  })
})
