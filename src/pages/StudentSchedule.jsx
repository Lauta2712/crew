import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { isUnlimitedPack } from '../constants/packs'

function useCarousel(count) {
  const ref = useRef(null)
  const [activePage, setActivePage] = useState(0)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    const card = el.querySelector(':scope > *')
    if (card) {
      const step = card.offsetWidth + 12
      setActivePage(Math.round(el.scrollLeft / step))
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [update])

  const scrollTo = useCallback((index) => {
    const el = ref.current
    if (!el) return
    const card = el.querySelector(':scope > *')
    const step = (card?.offsetWidth ?? 280) + 12
    el.scrollTo({ left: index * step, behavior: 'smooth' })
  }, [])

  const scrollBy = useCallback(
    (dir) => {
      scrollTo(Math.max(0, Math.min(count - 1, activePage + dir)))
    },
    [activePage, count, scrollTo],
  )

  return { ref, activePage, canScrollLeft, canScrollRight, scrollBy, scrollTo }
}

function CarouselSection({ title, items, renderCard, selectedIds }) {
  const carousel = useCarousel(items.length)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {title}
        </p>
        <div className="hidden gap-1 sm:flex">
          <button
            type="button"
            onClick={() => carousel.scrollBy(-1)}
            disabled={!carousel.canScrollLeft}
            aria-label="Anterior"
            className="flex items-center justify-center rounded-full border border-line bg-surface p-1.5 shadow-sm transition hover:border-brand-400 hover:bg-brand-900/25 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              className="h-3.5 w-3.5 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => carousel.scrollBy(1)}
            disabled={!carousel.canScrollRight}
            aria-label="Siguiente"
            className="flex items-center justify-center rounded-full border border-line bg-surface p-1.5 shadow-sm transition hover:border-brand-400 hover:bg-brand-900/25 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              className="h-3.5 w-3.5 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={carousel.ref}
        className="max-w-full flex flex-col gap-3 sm:flex-row sm:overflow-x-auto sm:scroll-smooth sm:pb-1 sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden sm:snap-x sm:snap-mandatory"
      >
        {items.map((item) => renderCard(item, selectedIds.has(item.id)))}
      </div>

      {items.length > 1 && (
        <div
          className="hidden sm:flex justify-center gap-1.5 pt-0.5"
          role="tablist"
          aria-label={`Paginado de ${title}`}
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === carousel.activePage}
              aria-label={`Ir a ${item.name}`}
              onClick={() => carousel.scrollTo(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === carousel.activePage
                  ? 'w-4 bg-brand-500'
                  : 'w-1.5 bg-surface-2 hover:bg-line'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PackCard({ pack, isSelected, walkIn, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-line p-4 overflow-hidden transition-all duration-200 ${
        isSelected ? 'bg-brand-900/70 shadow-sm' : 'bg-surface'
      } ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {pack.name}
      </p>
      <p className="mt-2 text-2xl font-semibold text-ink">
        {pack.unlimited && walkIn?.scheduleId
          ? `$${walkIn.monthlyWithDiscount.toLocaleString('es-AR')} / $${walkIn.monthlyDefault.toLocaleString('es-AR')}`
          : pack.price != null
            ? `$${pack.price.toLocaleString('es-AR')}`
            : 'Precio a confirmar'}
      </p>
      <p className="mt-1 text-xs text-muted">
        {pack.unlimited
          ? 'Pago mensual: acceso ilimitado, sin tope de clases'
          : pack.classes_per_month === 1
            ? 'Incluye 1 clase mensual por período de vigencia (un mes desde el pago)'
            : `Incluye ${pack.classes_per_month} clases mensuales por período de vigencia (un mes desde el pago)`}
      </p>
      {isSelected && (
        <p className="mt-3 inline-flex items-center gap-1 rounded-full border border-brand-500/40 bg-brand-900/25 px-2.5 py-0.5 text-[10px] font-semibold text-brand-400 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Tu pack
        </p>
      )}
    </div>
  )
}

function ScheduleCard({ schedule, isSelected, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-line p-4 overflow-hidden transition-all duration-200 ${
        isSelected ? 'bg-brand-900/70 shadow-sm' : 'bg-surface'
      } ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {schedule.name}
      </p>
      <div className="mt-2 space-y-1.5 text-xs text-muted">
        {schedule.slots.map((slot) => (
          <p key={`${schedule.id}-${slot.days}-${slot.time}`}>
            <span className="font-semibold">{slot.days}</span>
            <span className="mx-1 text-muted">·</span>
            <span>{slot.time}</span>
          </p>
        ))}
      </div>
      {isSelected && (
        <p className="mt-3 inline-flex items-center gap-1 rounded-full border border-brand-500/40 bg-brand-900/25 px-2.5 py-0.5 text-[10px] font-semibold text-brand-400 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Tu horario
        </p>
      )}
    </div>
  )
}

function parsePaymentDate(iso) {
  if (!iso) return null
  const s = String(iso).trim()
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  return new Date(hasTz ? s : `${s}Z`)
}

function findActivePayment(payments) {
  const now = new Date()
  return (
    payments.find((p) => {
      const paidAt = parsePaymentDate(p.paid_at)
      if (!paidAt) return false
      const end = new Date(paidAt)
      end.setMonth(end.getMonth() + 1)
      return now >= paidAt && now < end
    }) ?? null
  )
}

export function StudentSchedulePage() {
  const { profile } = useAuth()
  const { classPacks, scheduleTypes, walkIn, gymName } = useGymCatalog()
  // Un alumno puede tener hasta dos ciclos activos en simultáneo (ej. un pack de
  // clases + una mensualidad de acceso libre), por eso son sets y no un solo id.
  const [activePackIds, setActivePackIds] = useState(new Set())
  const [activeScheduleIds, setActiveScheduleIds] = useState(new Set())

  const loadSelection = useCallback(async () => {
    if (!profile) return
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('id, pack_type, schedule_type, paid_at')
        .eq('student_id', profile.id)
        .order('paid_at', { ascending: false })
        .limit(12)
      if (error) throw error

      const payments = data ?? []
      const regularPayments = payments.filter((p) => !isUnlimitedPack(p.pack_type, classPacks))
      const unlimitedPayments = payments.filter((p) => isUnlimitedPack(p.pack_type, classPacks))

      // Find the payment whose 1-month cycle is currently active (same logic as computeAttendancePolicy)
      const activeRegular = findActivePayment(regularPayments)
      const activeUnlimited = findActivePayment(unlimitedPayments)

      setActivePackIds(new Set([activeRegular?.pack_type, activeUnlimited?.pack_type].filter(Boolean)))
      setActiveScheduleIds(
        new Set([activeRegular?.schedule_type, activeUnlimited?.schedule_type].filter(Boolean)),
      )
    } catch {}
  }, [profile, classPacks])

  useEffect(() => {
    let active = true
    async function run() {
      if (!active) return
      await loadSelection()
    }
    run()
    return () => {
      active = false
    }
  }, [loadSelection])

  useEffect(() => {
    if (!profile) return undefined
    const channel = supabase
      .channel(`student-schedule-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `student_id=eq.${profile.id}` },
        () => loadSelection(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile, loadSelection])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSelection()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadSelection])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Horarios y packs</h1>
        <p className="text-sm text-muted">
          Opciones disponibles en {gymName}. Se resalta tu modalidad activa este mes.
        </p>
      </div>

      {classPacks.length === 0 && scheduleTypes.length === 0 ? (
        <p className="card p-4 text-sm text-muted">
          Tu gimnasio todavía no cargó los packs y horarios disponibles.
        </p>
      ) : (
        <div className="space-y-5">
          {classPacks.length > 0 && (
            <CarouselSection
              title="Packs disponibles"
              items={classPacks}
              selectedIds={activePackIds}
              renderCard={(pack, isSelected) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  isSelected={isSelected}
                  walkIn={walkIn}
                  className="w-full sm:w-64 sm:shrink-0 sm:snap-start"
                />
              )}
            />
          )}
          {scheduleTypes.length > 0 && (
            <CarouselSection
              title="Horarios"
              items={scheduleTypes}
              selectedIds={activeScheduleIds}
              renderCard={(schedule, isSelected) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  isSelected={isSelected}
                  className="w-full sm:w-64 sm:shrink-0 sm:snap-start"
                />
              )}
            />
          )}
        </div>
      )}
    </div>
  )
}
