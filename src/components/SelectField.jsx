import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MENU_MAX_PX = 224 // ~max-h-56

const variants = {
  dark: {
    label: 'text-xs font-semibold uppercase tracking-wide text-slate-400',
    trigger: {
      base: 'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm transition-colors duration-200',
      disabled: 'cursor-not-allowed border-slate-700 bg-slate-800/70 text-slate-500',
      enabled: 'border-slate-600 bg-slate-900 text-slate-100 hover:border-brand-400',
    },
    triggerPlaceholder: 'text-slate-500',
    chevron: 'text-slate-400',
    dropdown: 'rounded-xl border border-slate-600 bg-slate-900 py-1 shadow-xl',
    option: (selected) =>
      selected
        ? 'bg-brand-600/30 text-brand-50'
        : 'text-slate-100 hover:bg-slate-800',
  },
  light: {
    label: 'text-xs font-semibold uppercase tracking-wide text-slate-600',
    trigger: {
      base: 'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm transition-colors duration-200',
      disabled: 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500',
      enabled: 'border-slate-300 bg-white text-slate-800 hover:border-brand-400',
    },
    triggerPlaceholder: 'text-slate-500',
    chevron: 'text-slate-500',
    dropdown: 'rounded-xl border border-slate-200 bg-white py-1 shadow-lg',
    option: (selected) =>
      selected
        ? 'bg-brand-100 text-brand-800'
        : 'text-slate-800 hover:bg-slate-50',
  },
}

function computeMenuCoords(buttonEl) {
  const r = buttonEl.getBoundingClientRect()
  const pad = 8
  let left = r.left
  const width = r.width
  if (left + width > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - width - pad)
  }

  const spaceBelow = window.innerHeight - r.bottom - 12
  const spaceAbove = r.top - 12
  const preferAbove = spaceBelow < 160 && spaceAbove > spaceBelow

  if (preferAbove) {
    const maxHeight = Math.min(MENU_MAX_PX, Math.max(96, spaceAbove))
    return {
      left,
      width,
      maxHeight,
      top: undefined,
      bottom: window.innerHeight - r.top + 4,
    }
  }

  const maxHeight = Math.min(MENU_MAX_PX, Math.max(96, spaceBelow))
  return {
    top: r.bottom + 4,
    left,
    width,
    maxHeight,
    bottom: undefined,
  }
}

export function SelectField({
  label,
  placeholder,
  value,
  onChange,
  options,
  disabled = false,
  variant = 'dark',
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const containerRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const v = variants[variant] ?? variants.dark

  const updateCoords = useCallback(() => {
    if (!buttonRef.current) return
    setCoords(computeMenuCoords(buttonRef.current))
  }, [])

  useLayoutEffect(() => {
    if (!open || disabled) {
      setCoords(null)
      return
    }
    updateCoords()
    window.addEventListener('resize', updateCoords)
    window.addEventListener('scroll', updateCoords, true)
    return () => {
      window.removeEventListener('resize', updateCoords)
      window.removeEventListener('scroll', updateCoords, true)
    }
  }, [open, disabled, options.length, updateCoords])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event) => {
      const t = event.target
      if (containerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selectedOption = options.find((opt) => opt.value === value)

  const menu =
    !disabled &&
    open &&
    coords &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={menuRef}
        className={`z-[200] overflow-y-auto ${v.dropdown}`}
        style={{
          position: 'fixed',
          top: coords.top,
          bottom: coords.bottom,
          left: coords.left,
          width: coords.width,
          maxHeight: coords.maxHeight,
        }}
        role="listbox"
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={opt.value === value}
            className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors duration-150 ${v.option(opt.value === value)}`}
            onClick={() => {
              onChange(opt.value)
              setOpen(false)
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>,
      document.body,
    )

  return (
    <div className="relative space-y-1.5 text-left" ref={containerRef}>
      {label && <label className={v.label}>{label}</label>}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={`${v.trigger.base} ${
          disabled ? v.trigger.disabled : v.trigger.enabled
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev)
        }}
      >
        <span className={selectedOption ? '' : v.triggerPlaceholder}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span
          className={`ml-2 shrink-0 text-xs transition-transform duration-200 ${v.chevron} ${open ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      {menu}
    </div>
  )
}
