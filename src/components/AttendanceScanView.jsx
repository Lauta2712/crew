import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { SelectField } from './SelectField'
import { computeAttendancePolicy } from '../utils/attendancePolicy'
import { toSpanishError } from '../utils/errors'
import { isUnlimitedPack, isWalkInDailyPack, isWalkInSchedule } from '../constants/packs'
import { formatDateTime, todayInputString, dateInputToAttendedAt } from '../utils/dateFormatting'
import { DatePicker } from './DatePicker'

function isSameDay(a, b) {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/**
 * @param {object} props
 * @param {Set<string> | null} props.allowedStudentIds - null = admin (todos los alumnos cargados)
 * @param {Set<string> | null} [props.allowedScheduleTypeIds] - null/undefined = admin (sin restricción); Set = coach (solo asistencias de esos schedule_type_id, los de sus horarios asignados)
 * @param {Array<{id: string, name?: string, email?: string}>} props.students
 * @param {boolean} props.loadingStudents
 * @param {string} props.title
 * @param {string} props.subtitle
 */
export function AttendanceScanView({
  allowedStudentIds,
  allowedScheduleTypeIds = null,
  students,
  loadingStudents,
  title,
  subtitle,
  cameraOnly = false,
}) {
  const { profile } = useAuth()
  const { classPacks, scheduleTypes, walkIn } = useGymCatalog()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const streamRef = useRef(null)
  const feedbackTimerRef = useRef(null)
  // Ref so doInsertAttendance can call handleStartCamera without stale closure
  const startCameraRef = useRef(null)

  const gymFilter = profile?.gym_id

  const [cameraActive, setCameraActive] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [recentAttendances, setRecentAttendances] = useState([])
  // { type: 'success'|'error', message: string, studentName?: string }
  const [feedback, setFeedback] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkingManual, setCheckingManual] = useState(false)
  const [pendingAttendance, setPendingAttendance] = useState(null)
  // true while validating the QR payload (fetching student/payments from DB)
  const [processingQr, setProcessingQr] = useState(false)
  // Packs activos del estudiante seleccionado en el flujo manual
  const [studentPacks, setStudentPacks] = useState([])
  const [loadingStudentPacks, setLoadingStudentPacks] = useState(false)
  const [selectedPackType, setSelectedPackType] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [manualDate, setManualDate] = useState(() => todayInputString())

  const [mobileView, setMobileView] = useState('camera')

  const todayStr = todayInputString()
  const isManualPastDate = manualDate < todayStr

  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null

  const latestAttendanceForSelected = useMemo(() => {
    if (!selectedStudentId) return null
    return recentAttendances.find((row) => row.student_id === selectedStudentId) ?? null
  }, [recentAttendances, selectedStudentId])

  const alreadyCheckedOnManualDate = useMemo(() => {
    if (!selectedStudentId) return false
    const [y, m, d] = manualDate.split('-').map(Number)
    const selDate = new Date(y, m - 1, d, 12, 0, 0)
    return recentAttendances.some(
      (row) => row.student_id === selectedStudentId && isSameDay(row.attended_at, selDate),
    )
  }, [recentAttendances, selectedStudentId, manualDate])

  // Derive schedule and slots from the selected pack
  const selectedPack = useMemo(
    () => studentPacks.find((p) => p.id === selectedPackType) ?? null,
    [studentPacks, selectedPackType],
  )
  const currentScheduleTypeId = selectedPack?.schedule_type_id ?? null
  const currentSchedule = useMemo(
    () => scheduleTypes?.find((s) => s.id === currentScheduleTypeId) ?? null,
    [scheduleTypes, currentScheduleTypeId],
  )
  const currentSlots = useMemo(() => currentSchedule?.slots ?? [], [currentSchedule])

  // Auto-select slot when there's only one option; reset when schedule changes
  useEffect(() => {
    if (currentSlots.length === 1) {
      setSelectedSlot(`${currentSlots[0].days} — ${currentSlots[0].time}`)
    } else {
      setSelectedSlot('')
    }
  }, [currentSlots])

  const refreshRecentAttendances = useCallback(async () => {
    let query = supabase
      .from('attendances')
      .select('student_id, attended_at')
      .order('attended_at', { ascending: false })
      .limit(400)

    if (gymFilter) {
      query = query.eq('gym_id', gymFilter)
    }

    if (allowedStudentIds && allowedStudentIds.size > 0) {
      query = query.in('student_id', [...allowedStudentIds])
    }

    const { data, error } = await query
    if (!error) {
      setRecentAttendances(data ?? [])
    }
  }, [gymFilter, allowedStudentIds])

  useEffect(() => {
    refreshRecentAttendances()
  }, [refreshRecentAttendances])

  /** Carga los packs activos del estudiante para el selector manual. */
  const loadStudentActivePacks = useCallback(
    async (studentId) => {
      if (!studentId) {
        setStudentPacks([])
        setSelectedPackType('')
        return
      }
      setLoadingStudentPacks(true)
      try {
        const fromDate = new Date()
        fromDate.setMonth(fromDate.getMonth() - 18)

        const [{ data: payments }, { data: attendances }] = await Promise.all([
          supabase
            .from('payments')
            .select('id, paid_at, pack_type, schedule_type')
            .eq('student_id', studentId)
            .gte('paid_at', fromDate.toISOString())
            .order('paid_at', { ascending: false })
            .limit(48),
          supabase
            .from('attendances')
            .select('id, attended_at, checkin_method')
            .eq('student_id', studentId)
            .gte('attended_at', fromDate.toISOString())
            .order('attended_at', { ascending: false })
            .limit(400),
        ])

        const allPayments = payments ?? []
        const allAttendances = attendances ?? []
        // Exclude walk-in check-ins when computing class pack quotas
        const classAttendances = allAttendances.filter(
          (a) =>
            a.checkin_method !== 'qr_muro_libre' &&
            a.checkin_method !== 'manual_muro_libre' &&
            a.checkin_method !== 'retroactivo_muro_libre',
        )
        const active = []

        // Pack de clases (single, pack4, pack8, grupo_entrenamiento)
        const classPayments = allPayments.filter(
          (p) => !isUnlimitedPack(p.pack_type, classPacks) && !isWalkInSchedule(p.schedule_type, walkIn),
        )
        const classPolicy = computeAttendancePolicy({
          payments: classPayments,
          attendances: classAttendances,
          classPacks,
          walkIn,
        })
        if (classPolicy.hasQr && classPolicy.currentPayment) {
          const packDef = classPacks?.find((p) => p.id === classPolicy.currentPayment.pack_type)
          const remaining = classPolicy.remainingClasses
          active.push({
            id: classPolicy.currentPayment.pack_type,
            label: packDef?.name ?? classPolicy.currentPayment.pack_type,
            detail:
              remaining != null
                ? `${remaining} clase${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}`
                : 'Ilimitado',
            validUntil: classPolicy.validUntil,
            schedule_type_id: classPolicy.currentPayment.schedule_type ?? null,
          })
        }

        // Acceso libre mensual (pack ilimitado)
        const unlimitedPayments = allPayments.filter((p) => isUnlimitedPack(p.pack_type, classPacks))
        const unlimitedPolicy = computeAttendancePolicy({
          payments: unlimitedPayments,
          attendances: allAttendances,
          classPacks,
          walkIn,
        })
        if (
          unlimitedPolicy.hasQr &&
          unlimitedPolicy.validUntil &&
          new Date() < new Date(unlimitedPolicy.validUntil)
        ) {
          active.push({
            id: unlimitedPolicy.currentPayment.pack_type,
            label: 'Acceso libre · mensual',
            detail: 'Acceso ilimitado',
            validUntil: unlimitedPolicy.validUntil,
            schedule_type_id: unlimitedPolicy.currentPayment.schedule_type ?? walkIn.scheduleId,
          })
        }

        // Acceso libre pase diario (pagado hoy)
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const hasDayPass = allPayments.some((p) => {
          if (isUnlimitedPack(p.pack_type, classPacks)) return false
          if (!isWalkInSchedule(p.schedule_type, walkIn)) return false
          const raw = String(p.paid_at ?? '').trim()
          const paid = new Date(/[Z+\-]\d{2}:?\d{2}$|Z$/i.test(raw) ? raw : `${raw}Z`)
          return paid >= todayStart
        })
        if (hasDayPass && walkIn.dailyPackId) {
          active.push({
            id: walkIn.dailyPackId,
            label: 'Acceso libre · pase diario',
            detail: 'Válido hasta las 23:59 de hoy',
            validUntil: null,
            schedule_type_id: walkIn.scheduleId,
          })
        }

        const visible =
          allowedScheduleTypeIds !== null && allowedScheduleTypeIds !== undefined
            ? active.filter((p) => allowedScheduleTypeIds.has(p.schedule_type_id))
            : active
        setStudentPacks(visible)
        setSelectedPackType(visible.length === 1 ? visible[0].id : '')
      } catch {
        setStudentPacks([])
        setSelectedPackType('')
      } finally {
        setLoadingStudentPacks(false)
      }
    },
    [classPacks, walkIn, allowedScheduleTypeIds],
  )

  useEffect(() => {
    loadStudentActivePacks(selectedStudentId)
  }, [selectedStudentId, loadStudentActivePacks])

  // Cleanup camera and timers on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [])

  // Lock body scroll while any full-screen overlay is visible (prevents mobile viewport shifts)
  useEffect(() => {
    const locked = !!pendingAttendance || !!feedback || processingQr
    document.body.style.overflow = locked ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [pendingAttendance, feedback, processingQr])

  const stopCamera = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  /**
   * Shows the full-screen feedback overlay and optionally auto-dismisses it.
   * @param {{ type: 'success'|'error', message: string, studentName?: string }} fb
   * @param {{ autoDismissMs?: number, onDismiss?: () => void }} [opts]
   */
  const showFeedback = useCallback((fb, { autoDismissMs, onDismiss } = {}) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setFeedback(fb)
    if (autoDismissMs) {
      feedbackTimerRef.current = setTimeout(() => {
        setFeedback(null)
        onDismiss?.()
      }, autoDismissMs)
    }
  }, [])

  /**
   * Inserts the attendance row and shows the result feedback.
   * For QR scans, auto-restarts the camera after success.
   */
  const doInsertAttendance = useCallback(
    async (
      studentId,
      studentName,
      method,
      attendedAt = new Date().toISOString(),
      scheduleTypeId = null,
      scheduleSlot = null,
    ) => {
      setSubmitting(true)
      try {
        const row = {
          student_id: studentId,
          gym_id: profile?.gym_id ?? null,
          attended_at: attendedAt,
          checkin_method: method,
        }
        if (scheduleTypeId) row.schedule_type_id = scheduleTypeId
        const { error } = await supabase.from('attendances').insert(row)
        if (error) throw error

        setPendingAttendance(null)
        setSelectedStudentId('')
        await refreshRecentAttendances()

        const isQr = method === 'qr_camera' || method === 'qr_muro_libre'
        showFeedback(
          { type: 'success', studentName, message: 'Asistencia registrada' },
          {
            autoDismissMs: 1500,
            onDismiss: isQr ? () => startCameraRef.current?.() : undefined,
          },
        )
      } catch (err) {
        const isQr = method === 'qr_camera' || method === 'qr_muro_libre'
        showFeedback(
          {
            type: 'error',
            message: toSpanishError(err, 'No se pudo registrar la asistencia.'),
          },
          isQr
            ? { autoDismissMs: 3000, onDismiss: () => startCameraRef.current?.() }
            : undefined,
        )
      } finally {
        setSubmitting(false)
      }
    },
    [profile, refreshRecentAttendances, showFeedback],
  )

  const handleDecodedPayload = useCallback(
    async (payload, method, now = new Date()) => {
      const isQr = method === 'qr_camera'
      const isRetroactive = method === 'retroactivo'

      // Determine if this is a walk-in (acceso libre) attendance (works for both QR and manual)
      const isUnlimitedQr = isUnlimitedPack(payload.pack_type, classPacks)
      // Walk-in day passes are also a walk-in type for checkin_method purposes
      const isWalkInType = isUnlimitedQr || isWalkInDailyPack(payload.pack_type, walkIn)
      // Effective check-in method stored in the DB (mismos códigos internos que siempre,
      // no dependen del nombre de dominio):
      // - QR scan de acceso libre → qr_muro_libre
      // - Registro manual de acceso libre → manual_muro_libre
      // - Registro retroactivo de acceso libre → retroactivo_muro_libre
      // - Cualquier otro → método original
      const effectiveMethod = isWalkInType
        ? isQr
          ? 'qr_muro_libre'
          : isRetroactive
            ? 'retroactivo_muro_libre'
            : 'manual_muro_libre'
        : method

      // Clears the processing spinner (only relevant for QR scans)
      const done = () => {
        if (isQr) setProcessingQr(false)
      }

      const fail = (message) => {
        done()
        if (isQr) {
          // Auto-restart camera after showing the error
          showFeedback(
            { type: 'error', message },
            { autoDismissMs: 2500, onDismiss: () => startCameraRef.current?.() },
          )
        } else {
          showFeedback({ type: 'error', message })
        }
      }

      if (payload.type !== 'attendance' || !payload.student_id) {
        fail('El código QR no corresponde a un alumno válido.')
        return
      }

      if (
        allowedStudentIds &&
        allowedStudentIds.size > 0 &&
        !allowedStudentIds.has(payload.student_id)
      ) {
        fail('Este alumno no está en tus horarios asignados (sin pago vigente a ese horario).')
        return
      }

      // Coach restriction: only allow attendances for schedules the coach is assigned to.
      // Sin schedule_type_id en el payload (QR generado antes de este cambio) no se puede
      // validar — se deja pasar, igual que el fallback histórico para QRs sin pack_type.
      if (
        allowedScheduleTypeIds !== null &&
        allowedScheduleTypeIds !== undefined &&
        payload.schedule_type_id != null &&
        !allowedScheduleTypeIds.has(payload.schedule_type_id)
      ) {
        fail('Este tipo de asistencia no está habilitado para tu perfil de instructor.')
        return
      }

      if (payload.valid_until) {
        const now = new Date()
        const validUntil = new Date(payload.valid_until)
        if (now > validUntil) {
          fail('El QR venció. El alumno debe renovar su pack para generar uno nuevo.')
          return
        }
      }

      const { data: student, error: studentError } = await supabase
        .from('users')
        .select('id, name, deleted_at')
        .eq('id', payload.student_id)
        .maybeSingle()

      if (studentError || !student) {
        fail('No se encontró al alumno.')
        return
      }
      if (student.deleted_at != null) {
        fail('El alumno fue dado de baja. No se puede registrar asistencia.')
        return
      }

      const fromDate = new Date()
      fromDate.setMonth(fromDate.getMonth() - 18)

      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('id, paid_at, pack_type, schedule_type')
        .eq('student_id', payload.student_id)
        .gte('paid_at', fromDate.toISOString())
        .order('paid_at', { ascending: false })
        .limit(24)

      const { data: attendances, error: attendancesError } = await supabase
        .from('attendances')
        .select('id, attended_at')
        .eq('student_id', payload.student_id)
        .gte('attended_at', fromDate.toISOString())
        .order('attended_at', { ascending: false })
        .limit(400)

      if (paymentsError || attendancesError) {
        fail('No se pudo validar la vigencia del alumno. Intentá nuevamente.')
        return
      }

      // Pase diario de acceso libre: pack_type sintético no guardado en DB — validar por pagos en la fecha objetivo
      if (isWalkInDailyPack(payload.pack_type, walkIn)) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
        const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
        const hasDayPassOnDate = (payments ?? []).some((p) => {
          if (isUnlimitedPack(p.pack_type, classPacks)) return false
          if (!isWalkInSchedule(p.schedule_type, walkIn)) return false
          const raw = String(p.paid_at ?? '').trim()
          const paid = new Date(/[Z+\-]\d{2}:?\d{2}$|Z$/i.test(raw) ? raw : `${raw}Z`)
          return paid >= dayStart && paid <= dayEnd
        })
        if (!hasDayPassOnDate) {
          fail(
            isRetroactive
              ? 'El alumno no tiene pase diario de acceso libre registrado para esa fecha.'
              : 'El alumno no tiene pase diario de acceso libre para hoy.',
          )
          return
        }
        done()
        setPendingAttendance({
          studentId: payload.student_id,
          studentName: student.name ?? 'Alumno',
          payload,
          method: effectiveMethod,
          pack_type: payload.pack_type,
          packLabel: 'Acceso libre · pase diario',
          attendedAt: now.toISOString(),
          scheduleTypeId: payload.schedule_type_id ?? walkIn.scheduleId,
          scheduleSlot: payload.schedule_slot ?? null,
        })
        return
      }

      // When the QR encodes a pack_type, validate only against payments of that type.
      // This prevents using a class QR for the walk-in track and vice versa.
      // Old QRs without pack_type fall back to validating all payments.
      const hasPackType = payload.pack_type != null
      const relevantPayments = hasPackType
        ? isUnlimitedQr
          ? (payments ?? []).filter((p) => isUnlimitedPack(p.pack_type, classPacks))
          : (payments ?? []).filter(
              (p) => !isUnlimitedPack(p.pack_type, classPacks) && !isWalkInSchedule(p.schedule_type, walkIn),
            )
        : (payments ?? [])

      const policy = computeAttendancePolicy({
        payments: relevantPayments,
        attendances: attendances ?? [],
        classPacks,
        walkIn,
        now,
      })

      const hasPayloadQrValidity =
        method !== 'manual' &&
        !isRetroactive &&
        !!payload.valid_until &&
        now <= new Date(payload.valid_until)

      if (!hasPayloadQrValidity) {
        if (!policy.hasQr || !policy.validUntil) {
          const msg = isUnlimitedQr
            ? 'El alumno no tiene mensualidad de acceso libre vigente.'
            : isRetroactive
              ? 'El alumno no tenía pack vigente en esa fecha.'
              : 'El alumno no tiene QR vigente: necesita un pago de pack vigente (un mes desde la fecha de pago) y clases disponibles si corresponde.'
          fail(msg)
          return
        }

        if (policy.classesTotalForCurrentCycle > 0 && policy.remainingClasses <= 0) {
          fail(
            isRetroactive
              ? 'El alumno no tenía clases disponibles en ese ciclo.'
              : 'El alumno no tiene clases disponibles en el ciclo vigente.',
          )
          return
        }
      }

      // Derive a human-readable label for the confirmation modal
      const packLabel = isUnlimitedQr
        ? 'Acceso libre · mensual'
        : (classPacks?.find((p) => p.id === payload.pack_type)?.name ?? null)

      // All validations passed — show confirmation modal for both QR and manual
      done()
      setPendingAttendance({
        studentId: payload.student_id,
        studentName: student.name ?? 'Alumno',
        payload,
        method: effectiveMethod,
        pack_type: payload.pack_type ?? null,
        packLabel,
        attendedAt: now.toISOString(),
        scheduleTypeId: payload.schedule_type_id ?? null,
        scheduleSlot: payload.schedule_slot ?? null,
      })
    },
    [allowedStudentIds, allowedScheduleTypeIds, classPacks, walkIn, showFeedback],
  )

  const handleConfirmAttendance = async () => {
    if (!pendingAttendance) return
    await doInsertAttendance(
      pendingAttendance.studentId,
      pendingAttendance.studentName,
      pendingAttendance.method,
      pendingAttendance.attendedAt,
      pendingAttendance.scheduleTypeId ?? null,
      pendingAttendance.scheduleSlot ?? null,
    )
  }

  const handleCancelPendingAttendance = () => {
    const wasQr =
      pendingAttendance?.method === 'qr_camera' ||
      pendingAttendance?.method === 'qr_muro_libre'
    setPendingAttendance(null)
    if (wasQr) {
      startCameraRef.current?.()
    }
  }

  const handleStartCamera = useCallback(async () => {
    setFeedback(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      video.setAttribute('playsInline', 'true')
      await video.play()
      setCameraActive(true)

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      const tick = () => {
        if (!video.videoWidth || !video.videoHeight) {
          animationRef.current = requestAnimationFrame(tick)
          return
        }

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })

        if (qrCode && qrCode.data) {
          stopCamera()
          let parsed
          try {
            parsed = JSON.parse(qrCode.data)
          } catch {
            showFeedback(
              { type: 'error', message: 'El QR leído no tiene un formato válido.' },
              { autoDismissMs: 2500, onDismiss: () => startCameraRef.current?.() },
            )
            return
          }
          // Show processing spinner while we fetch student data and validate
          setProcessingQr(true)
          handleDecodedPayload(parsed, 'qr_camera')
          return
        }

        animationRef.current = requestAnimationFrame(tick)
      }

      animationRef.current = requestAnimationFrame(tick)
    } catch (err) {
      showFeedback({
        type: 'error',
        message:
          err.name === 'NotAllowedError'
            ? 'La cámara está bloqueada. Habilítala en el navegador.'
            : 'No se pudo acceder a la cámara.',
      })
    }
  }, [handleDecodedPayload, showFeedback])

  // Keep ref in sync so doInsertAttendance can call it without stale closure
  useEffect(() => {
    startCameraRef.current = handleStartCamera
  }, [handleStartCamera])

  const handleManualStudentSubmit = async () => {
    if (!selectedStudentId || !selectedPackType || checkingManual) return
    if (!isManualPastDate && alreadyCheckedOnManualDate) return

    setCheckingManual(true)
    setFeedback(null)
    try {
      if (isManualPastDate) {
        const [y, m, d] = manualDate.split('-').map(Number)
        const dayStart = new Date(y, m - 1, d, 0, 0, 0)
        const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999)
        const { data: dupRows, error: dupError } = await supabase
          .from('attendances')
          .select('id')
          .eq('student_id', selectedStudentId)
          .gte('attended_at', dayStart.toISOString())
          .lte('attended_at', dayEnd.toISOString())
          .limit(1)
        if (dupError) throw dupError
        if (dupRows?.length > 0) {
          showFeedback({ type: 'error', message: 'Este alumno ya tiene asistencia registrada ese día.' })
          return
        }
      }

      const method = isManualPastDate ? 'retroactivo' : 'manual'
      const now = isManualPastDate ? new Date(dateInputToAttendedAt(manualDate)) : new Date()

      await handleDecodedPayload(
        {
          type: 'attendance',
          student_id: selectedStudentId,
          pack_type: selectedPackType,
          schedule_type_id: currentScheduleTypeId ?? null,
          schedule_slot: selectedSlot || null,
        },
        method,
        now,
      )
    } catch (err) {
      showFeedback({ type: 'error', message: 'No se pudo verificar la asistencia.' })
    } finally {
      setCheckingManual(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">{title}</h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>

      {/* Processing spinner — shown while validating the QR after detection */}
      {processingQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-label="Procesando QR…"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-10 py-8 shadow-2xl">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand-500" />
            <p className="text-sm font-medium text-ink">Verificando…</p>
          </div>
        </div>
      )}

      {/* Feedback overlay — success or error after a scan */}
      {feedback && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          role="status"
          aria-live="assertive"
        >
          <div
            className={`w-full max-w-xs rounded-2xl p-8 text-center shadow-2xl ${
              feedback.type === 'success'
                ? 'border-2 border-emerald-500/40 bg-surface'
                : 'border-2 border-red-500/40 bg-surface'
            }`}
          >
            {feedback.type === 'success' ? (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950/40">
                  <svg
                    className="h-9 w-9 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="mt-4 break-words text-xl font-bold text-ink sm:text-2xl">
                  {feedback.studentName}
                </p>
                <p className="mt-1 text-sm font-medium text-emerald-400">
                  Asistencia registrada
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-950/40">
                  <svg
                    className="h-9 w-9 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="mt-4 text-sm font-medium text-red-400">{feedback.message}</p>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="mt-5 rounded-lg border border-line px-4 py-2 text-xs font-medium text-muted hover:bg-bg"
                >
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Manual confirmation modal */}
      {pendingAttendance && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-attendance-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-lg">
            <h2
              id="confirm-attendance-title"
              className="text-lg font-semibold text-ink"
            >
              Registrar asistencia
            </h2>
            {pendingAttendance.packLabel && (
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isUnlimitedPack(pendingAttendance.pack_type, classPacks) ||
                  isWalkInDailyPack(pendingAttendance.pack_type, walkIn)
                    ? 'bg-sky-950/40 text-sky-400 border border-sky-500/40'
                    : 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/40'
                }`}
              >
                {pendingAttendance.packLabel}
              </span>
            )}
            <p className="mt-2 text-sm text-muted">
              ¿Registrar asistencia de{' '}
              <strong>{pendingAttendance.studentName}</strong>
              {pendingAttendance.method === 'retroactivo' ||
               pendingAttendance.method === 'retroactivo_muro_libre'
                ? ` para el ${new Date(pendingAttendance.attendedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : ''}
              ?
            </p>
            {pendingAttendance.scheduleSlot && (
              <p className="mt-1 text-xs text-muted">
                <span className="font-medium text-ink">Horario:</span>{' '}
                {pendingAttendance.scheduleSlot}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleCancelPendingAttendance}
                disabled={submitting}
                className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-bg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAttendance}
                disabled={submitting}
                className="btn-primary flex-1 py-2 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Registrando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile tab switcher — solo visible en < lg y cuando no es cameraOnly */}
      {!cameraOnly && <div className="flex rounded-xl border border-line bg-bg p-1 gap-1 lg:hidden">
        <button
          type="button"
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mobileView === 'camera'
              ? 'bg-surface shadow text-ink'
              : 'text-muted hover:text-ink'
          }`}
          onClick={() => setMobileView('camera')}
        >
          Cámara QR
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mobileView === 'manual'
              ? 'bg-surface shadow text-ink'
              : 'text-muted hover:text-ink'
          }`}
          onClick={() => {
            if (cameraActive) stopCamera()
            setMobileView('manual')
          }}
        >
          Manual
        </button>
      </div>}

      <div className={cameraOnly ? '' : 'grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'}>
        <div className={`card space-y-3 ${!cameraOnly && mobileView === 'manual' ? 'hidden lg:block' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Escaneo con cámara
          </p>
          <p className="text-xs text-muted">
            Apuntá al QR del alumno y esperá a que se marque en verde.
          </p>

          <div className="mt-2 flex flex-col items-center gap-2">
            <div className="relative w-full max-w-xs overflow-hidden rounded-xl border border-line bg-surface">
              <video
                ref={videoRef}
                className="h-64 w-full object-cover"
                muted
                playsInline
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-bg/10 text-[11px] text-muted">
                  Cámara inactiva
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn-primary w-full max-w-xs py-2 text-xs"
              onClick={cameraActive ? stopCamera : handleStartCamera}
            >
              {cameraActive ? 'Detener cámara' : 'Escanear con cámara'}
            </button>
          </div>
        </div>

        {!cameraOnly && <div className={`card space-y-4 ${mobileView === 'camera' ? 'hidden lg:block' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Manual
          </p>

          <p className="rounded-lg border border-line bg-bg px-3 py-2 text-[11px] text-muted">
            Misma lógica que el QR: se valida pack y clases. Elegí al alumno y
            confirmá en el siguiente paso.
          </p>

          <SelectField
            label="Alumno"
            placeholder={
              loadingStudents ? 'Cargando alumnos…' : 'Seleccioná un alumno'
            }
            value={selectedStudentId}
            onChange={(value) => {
              setSelectedStudentId(value)
              setFeedback(null)
            }}
            options={students.map((s) => ({
              value: s.id,
              label: s.name || s.email || 'Sin nombre',
            }))}
            disabled={loadingStudents}
            variant="light"
          />

          <div className="space-y-1">
            <label className="block text-xs font-medium text-ink">
              Fecha de asistencia
            </label>
            <DatePicker
              value={manualDate}
              max={todayStr}
              onChange={(d) => {
                if (d) {
                  setManualDate(d)
                  setFeedback(null)
                }
              }}
            />
          </div>

          {isManualPastDate && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-400">
              Registrando asistencia pasada: se guardará como &ldquo;Retroactivo&rdquo;.
            </p>
          )}

          {selectedStudent && (
            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
              <p>
                <span className="font-medium text-ink">Alumno:</span>{' '}
                {selectedStudent.name || selectedStudent.email || 'Sin nombre'}
              </p>
              <p className="mt-1">
                <span className="font-medium text-ink">Última asistencia:</span>{' '}
                {latestAttendanceForSelected?.attended_at
                  ? formatDateTime(latestAttendanceForSelected.attended_at)
                  : 'Sin registros recientes'}
              </p>
              {alreadyCheckedOnManualDate && (
                <p className="mt-1 text-red-400">Ya tiene asistencia registrada ese día.</p>
              )}
            </div>
          )}

          {/* Pack selector — shown once a student is selected */}
          {selectedStudentId && (
            loadingStudentPacks ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2.5 text-xs text-muted">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-brand-500" />
                Cargando packs activos…
              </div>
            ) : studentPacks.length === 0 ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-400">
                Este alumno no tiene packs activos. Verificá que tenga un pago vigente.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-ink">Pack a registrar</p>
                {studentPacks.map((pack) => (
                  <label
                    key={pack.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                      selectedPackType === pack.id
                        ? 'border-brand-400 bg-brand-900/25 ring-1 ring-brand-500/40'
                        : 'border-line bg-surface hover:border-line'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pack-type"
                      value={pack.id}
                      checked={selectedPackType === pack.id}
                      onChange={() => setSelectedPackType(pack.id)}
                      className="mt-0.5 accent-brand-500"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">{pack.label}</p>
                      <p className="text-[11px] text-muted">{pack.detail}</p>
                    </div>
                  </label>
                ))}
              </div>
            )
          )}

          {/* Slot selector — shown when the pack has multiple possible slots */}
          {selectedPackType && currentSlots.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink">
                Horario
                {currentSchedule && (
                  <span className="ml-1 font-normal text-muted">({currentSchedule.name})</span>
                )}
              </p>
              {currentSlots.map((slot) => {
                const slotLabel = `${slot.days} — ${slot.time}`
                return (
                  <label
                    key={slotLabel}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                      selectedSlot === slotLabel
                        ? 'border-brand-400 bg-brand-900/25 ring-1 ring-brand-500/40'
                        : 'border-line bg-surface hover:border-line'
                    }`}
                  >
                    <input
                      type="radio"
                      name="schedule-slot"
                      value={slotLabel}
                      checked={selectedSlot === slotLabel}
                      onChange={() => setSelectedSlot(slotLabel)}
                      className="accent-brand-500"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">{slot.days}</p>
                      <p className="text-[11px] text-muted">{slot.time}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}

          {/* Info when slot is auto-selected (only 1 option) */}
          {selectedPackType && currentSlots.length === 1 && (
            <p className="rounded-lg border border-line bg-bg px-3 py-2 text-[11px] text-muted">
              <span className="font-medium text-ink">Horario:</span>{' '}
              {currentSlots[0].days} · {currentSlots[0].time}
            </p>
          )}

          <button
            type="button"
            className="btn-primary w-full py-2 text-xs"
            disabled={
              !selectedStudentId ||
              !selectedPackType ||
              loadingStudentPacks ||
              checkingManual ||
              submitting ||
              (!isManualPastDate && alreadyCheckedOnManualDate) ||
              (currentSlots.length > 1 && !selectedSlot)
            }
            onClick={handleManualStudentSubmit}
          >
            {checkingManual
              ? 'Verificando…'
              : isManualPastDate
                ? 'Verificar y registrar (pasada)'
                : 'Verificar y registrar'}
          </button>
        </div>}
      </div>

      <canvas
        ref={canvasRef}
        className="hidden"
        width={320}
        height={240}
        aria-hidden="true"
      />
    </div>
  )
}
