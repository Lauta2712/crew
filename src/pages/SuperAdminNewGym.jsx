import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PasswordInput } from '../components/PasswordInput'
import { WaitModal } from '../components/WaitModal'
import { invokeEdgeFunctionWithUserJwt } from '../utils/edgeFunctions'
import { getFunctionsInvokeFailureMessage, toSpanishError } from '../utils/errors'

const CREATE_GYM_ADMIN_EDGE_FUNCTION =
  import.meta.env.VITE_SUPABASE_CREATE_GYM_ADMIN_FUNCTION?.trim() ||
  'create-gym-admin'

const EMPTY_FORM = {
  gymName: '',
  adminName: '',
  adminEmail: '',
  autoGeneratePassword: true,
  adminPassword: '',
}

export function SuperAdminNewGymPage() {
  // Prefill al venir del botón "Crear gimnasio" de una suscripción a Crew ya pagada
  // (SuperAdminDashboard.jsx) — evita retipear/errar el email de contacto.
  const location = useLocation()
  const prefill = location.state ?? null
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    gymName: prefill?.gymName ?? '',
    adminName: prefill?.adminName ?? '',
    adminEmail: prefill?.adminEmail ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.gymName.trim() || !form.adminName.trim() || !form.adminEmail.trim()) return
    if (!form.autoGeneratePassword && form.adminPassword.length < 6) return

    setSaving(true)
    setError(null)
    setCopied(false)
    try {
      const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt(
        CREATE_GYM_ADMIN_EDGE_FUNCTION,
        {
          body: {
            gym_name: form.gymName.trim(),
            admin_name: form.adminName.trim(),
            admin_email: form.adminEmail.trim().toLowerCase(),
            ...(form.autoGeneratePassword ? {} : { admin_password: form.adminPassword }),
          },
        },
      )

      if (fnError) {
        const details = await getFunctionsInvokeFailureMessage(
          fnError,
          CREATE_GYM_ADMIN_EDGE_FUNCTION,
        )
        throw new Error(details || 'No se pudo crear el gimnasio')
      }
      if (data?.error) throw new Error(String(data.error))
      if (!data?.success) {
        throw new Error(
          `La función «${CREATE_GYM_ADMIN_EDGE_FUNCTION}» no confirmó la creación.`,
        )
      }

      setCreatedCredentials({
        gymId: data.gym_id,
        gymName: data.gym_name,
        adminEmail: data.admin_email,
        tempPassword: data.temp_password,
      })
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo crear el gimnasio'))
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    if (!createdCredentials?.tempPassword) return
    try {
      await navigator.clipboard.writeText(createdCredentials.tempPassword)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <WaitModal
        open={saving}
        title="Creando el gimnasio…"
        message="Se está creando el gimnasio, su configuración inicial y la cuenta admin. No cierres esta pantalla."
      />
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
          Nuevo gimnasio
        </h1>
        <p className="text-sm text-muted">
          Crea el gimnasio y su primera cuenta admin. No modifica gimnasios existentes.
        </p>
      </div>

      {prefill && (
        <p className="rounded-lg border border-accent-500/40 bg-accent-500/10 px-3 py-2.5 text-sm text-accent-600">
          Datos precargados desde una suscripción a Crew ya paga. Revisalos antes de crear el
          gimnasio.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {createdCredentials && (
        <div className="card mx-auto w-full max-w-md space-y-2 border-emerald-500/40 bg-emerald-950/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
            Gimnasio creado: «{createdCredentials.gymName}»
          </p>
          <p className="text-sm text-ink">
            Admin: <span className="font-medium">{createdCredentials.adminEmail}</span>
          </p>
          <div className="space-y-1">
            <p className="text-xs text-muted">
              Contraseña temporal: no se vuelve a mostrar, copiala y pasásela al dueño del
              gimnasio por fuera de Crew:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-line bg-surface px-3 py-2 text-sm text-ink">
                {createdCredentials.tempPassword}
              </code>
              <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={handleCopy}>
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card mx-auto w-full max-w-md space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Datos del gimnasio y su admin
        </p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Nombre del gimnasio</label>
          <input
            className="input py-2 text-sm"
            required
            value={form.gymName}
            onChange={(e) => setForm((p) => ({ ...p, gymName: e.target.value }))}
            placeholder="Ej: Boulder Norte"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Nombre del admin</label>
          <input
            className="input py-2 text-sm"
            required
            value={form.adminName}
            onChange={(e) => setForm((p) => ({ ...p, adminName: e.target.value }))}
            placeholder="Nombre y apellido"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Email del admin</label>
          <input
            className="input py-2 text-sm"
            type="email"
            required
            value={form.adminEmail}
            onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
            placeholder="admin@gimnasio.com"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={form.autoGeneratePassword}
            onChange={(e) =>
              setForm((p) => ({ ...p, autoGeneratePassword: e.target.checked, adminPassword: '' }))
            }
          />
          Generar contraseña automáticamente
        </label>

        {!form.autoGeneratePassword && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Contraseña inicial</label>
            <PasswordInput
              className="py-2 text-sm"
              minLength={6}
              required
              value={form.adminPassword}
              onChange={(e) => setForm((p) => ({ ...p, adminPassword: e.target.value }))}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? 'Creando…' : 'Crear gimnasio'}
        </button>
      </form>
    </div>
  )
}
