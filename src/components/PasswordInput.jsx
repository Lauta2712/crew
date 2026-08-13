import { useState } from 'react'

export function PasswordInput({
  id,
  className = '',
  value,
  onChange,
  placeholder,
  required = false,
  minLength,
  disabled = false,
  autoComplete = 'current-password',
  name,
}) {
  const [visible, setVisible] = useState(false)

  const inputClass = (() => {
    const c = (className || '').trim()
    if (!c) return 'input'
    return /\binput\b/.test(c) ? c : `input ${c}`
  })()

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        disabled={disabled}
        autoComplete={autoComplete}
        className={`${inputClass} pr-11`.trim()}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? 'Ocultar' : 'Ver'}
      </button>
    </div>
  )
}
