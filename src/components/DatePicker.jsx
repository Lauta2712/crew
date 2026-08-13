import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const DROPDOWN_W = 288 // w-72

function getFirstWeekdayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return { year: y, month: m - 1, day: d }
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function DatePicker({ value, max, onChange, className = '' }) {
  const today = useMemo(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
  }, [])

  const maxParsed = useMemo(() => parseDate(max) ?? today, [max, today])
  const valueParsed = useMemo(() => parseDate(value), [value])

  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const [viewYear, setViewYear] = useState(valueParsed?.year ?? today.year)
  const [viewMonth, setViewMonth] = useState(valueParsed?.month ?? today.month)

  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)

  // Sync view when value changes externally
  useEffect(() => {
    if (valueParsed) {
      setViewYear(valueParsed.year)
      setViewMonth(valueParsed.month)
    }
  }, [valueParsed?.year, valueParsed?.month]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        dropdownRef.current?.contains(e.target)
      ) return
      setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [open])

  const openPicker = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownH = 320 // approx height

    // Position below trigger, or above if not enough space below
    const top = spaceBelow >= dropdownH ? rect.bottom + 4 : rect.top - dropdownH - 4

    // Align left with trigger, but clamp to viewport right edge
    const left = Math.min(rect.left, window.innerWidth - DROPDOWN_W - 8)

    setCoords({ top, left })
    setOpen((o) => !o)
  }

  const canGoPrev = viewYear > 2020
  const canGoNext = !(viewYear === maxParsed.year && viewMonth >= maxParsed.month)

  const prevMonth = useCallback(() => {
    if (!canGoPrev) return
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }, [canGoPrev, viewMonth])

  const nextMonth = useCallback(() => {
    if (!canGoNext) return
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }, [canGoNext, viewMonth])

  const isDisabled = useCallback((day) => {
    if (viewYear > maxParsed.year) return true
    if (viewYear === maxParsed.year && viewMonth > maxParsed.month) return true
    if (viewYear === maxParsed.year && viewMonth === maxParsed.month && day > maxParsed.day) return true
    return false
  }, [viewYear, viewMonth, maxParsed])

  const isSelected = useCallback((day) => {
    if (!valueParsed) return false
    return viewYear === valueParsed.year && viewMonth === valueParsed.month && day === valueParsed.day
  }, [viewYear, viewMonth, valueParsed])

  const isToday = useCallback((day) => {
    return viewYear === today.year && viewMonth === today.month && day === today.day
  }, [viewYear, viewMonth, today])

  const handleDayClick = useCallback((day) => {
    if (isDisabled(day)) return
    onChange(toDateStr(viewYear, viewMonth, day))
    setOpen(false)
  }, [isDisabled, onChange, viewYear, viewMonth])

  const goToday = useCallback(() => {
    onChange(toDateStr(today.year, today.month, today.day))
    setOpen(false)
  }, [onChange, today])

  const displayLabel = valueParsed
    ? new Date(value + 'T12:00:00').toLocaleDateString('es-AR', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : 'Seleccioná una fecha'

  const firstWeekday = getFirstWeekdayOfMonth(viewYear, viewMonth)
  const daysInMonth = getDaysInMonth(viewYear, viewMonth)

  const dropdown = open && createPortal(
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: coords.top, left: coords.left, width: DROPDOWN_W, zIndex: 9999 }}
      className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xl shadow-slate-300/50"
    >
      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          aria-label="Mes anterior"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-xl leading-none text-slate-500 transition hover:bg-slate-100 disabled:opacity-25"
        >
          ‹
        </button>
        <p className="text-[13px] font-semibold capitalize text-slate-700">
          {MONTHS[viewMonth]} {viewYear}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          disabled={!canGoNext}
          aria-label="Mes siguiente"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-xl leading-none text-slate-500 transition hover:bg-slate-100 disabled:opacity-25"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1.5 grid grid-cols-7">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const disabled = isDisabled(day)
          const selected = isSelected(day)
          const tod = isToday(day)
          return (
            <button
              key={day}
              type="button"
              onClick={() => handleDayClick(day)}
              disabled={disabled}
              className={[
                'mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition',
                selected
                  ? 'cal-day-selected'
                  : tod
                    ? 'cal-day-today'
                    : disabled
                      ? 'cursor-not-allowed text-slate-300'
                      : 'cursor-pointer text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={goToday}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-brand-600 transition hover:bg-brand-50"
        >
          Hoy
        </button>
      </div>
    </div>,
    document.body,
  )

  return (
    <div className={className}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition focus:outline-none ${
          open
            ? 'border-brand-400 ring-1 ring-brand-300'
            : 'border-slate-300 hover:border-slate-400'
        } bg-white`}
      >
        <span className={valueParsed ? 'text-slate-800' : 'italic text-slate-400'}>
          {displayLabel}
        </span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition ${open ? 'text-brand-500' : 'text-slate-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {dropdown}
    </div>
  )
}
