import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import {
  isWalkInSchedule,
  WALK_IN_DISCOUNT_ELIGIBLE_SHORT,
  WALK_IN_STANDARD_SHORT,
} from '../constants/packs'
import { PasswordInput } from '../components/PasswordInput'
import { SelectField } from '../components/SelectField'
import { invokeEdgeFunctionWithUserJwt } from '../utils/edgeFunctions'
import { getFunctionsInvokeFailureMessage, toSpanishError } from '../utils/errors'

const CREATE_COACH_EDGE_FUNCTION =
  import.meta.env.VITE_SUPABASE_CREATE_COACH_FUNCTION?.trim() ||
  'create-coach-user'

const DELETE_COACH_EDGE_FUNCTION =
  import.meta.env.VITE_SUPABASE_DELETE_COACH_FUNCTION?.trim() ||
  'delete-coach-user'

const UPDATE_COACH_EDGE_FUNCTION =
  import.meta.env.VITE_SUPABASE_UPDATE_COACH_FUNCTION?.trim() ||
  'update-coach-user'

function scheduleLabel(id, scheduleTypes) {
  if (!id) return '—'
  return scheduleTypes.find((s) => s.id === id)?.name ?? id
}

function scheduleOptionLabel(schedule, walkIn) {
  if (!isWalkInSchedule(schedule.id, walkIn)) return schedule.name
  const with8 = walkIn.priceWithDiscount.toLocaleString('es-AR')
  const rest = walkIn.priceDefault.toLocaleString('es-AR')
  return `${schedule.name} (cobros: $${with8} ${WALK_IN_DISCOUNT_ELIGIBLE_SHORT} / $${rest} ${WALK_IN_STANDARD_SHORT})`
}

export function CoachesPage() {
  const { profile } = useAuth()
  const { scheduleTypes, walkIn } = useGymCatalog()
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    scheduleTypeId: '',
  })
  const [editingCoach, setEditingCoach] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    password: '',
    scheduleTypeId: '',
  })
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const loadCoaches = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('users')
        .select('id, name, email, role, gym_id')
        .eq('role', 'coach')
        .order('name', { ascending: true })
      if (profile?.gym_id) {
        query = query.eq('gym_id', profile.gym_id)
      }
      const { data: coachRows, error: qErr } = await query
      if (qErr) throw qErr

      const ids = (coachRows ?? []).map((c) => c.id)
      const scheduleByCoach = new Map()
      if (ids.length > 0) {
        const { data: assigns, error: aErr } = await supabase
          .from('coach_assignments')
          .select('coach_id, schedule_type_id')
          .in('coach_id', ids)
        if (aErr) throw aErr
        for (const row of assigns ?? []) {
          if (!scheduleByCoach.has(row.coach_id)) {
            scheduleByCoach.set(row.coach_id, row.schedule_type_id)
          }
        }
      }

      setCoaches(
        (coachRows ?? []).map((c) => ({
          ...c,
          schedule_type_id: scheduleByCoach.get(c.id) ?? '',
        })),
      )
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo cargar la lista de profesores'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCoaches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.gym_id])

  const openEdit = (c) => {
    setEditingCoach(c)
    setEditForm({
      name: c.name ?? '',
      email: c.email ?? '',
      password: '',
      scheduleTypeId: c.schedule_type_id || '',
    })
    setError(null)
    setSuccessMessage(null)
  }

  const closeEdit = () => {
    setEditingCoach(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.email || !form.password || !form.scheduleTypeId) return
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt(
        CREATE_COACH_EDGE_FUNCTION,
        {
          body: {
            email: form.email.trim().toLowerCase(),
            password: form.password,
            name: form.name?.trim() || null,
            schedule_type_id: form.scheduleTypeId,
            gym_id: profile?.gym_id ?? null,
          },
        },
      )

      if (fnError) {
        const details = await getFunctionsInvokeFailureMessage(
          fnError,
          CREATE_COACH_EDGE_FUNCTION,
        )
        throw new Error(details || 'No se pudo crear el profesor')
      }
      if (data?.error) throw new Error(String(data.error))
      if (!data?.success) {
        throw new Error(
          `La función «${CREATE_COACH_EDGE_FUNCTION}» no confirmó la creación.`,
        )
      }

      setSuccessMessage('Profesor creado y asignado correctamente.')
      setForm({
        name: '',
        email: '',
        password: '',
        scheduleTypeId: '',
      })
      await loadCoaches()
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo crear el profesor'))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateCoach = async (event) => {
    event.preventDefault()
    if (!editingCoach) return
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const body = { coach_id: editingCoach.id }
      const nameTrim = editForm.name.trim()
      if (nameTrim !== (editingCoach.name ?? '').trim()) {
        body.name = nameTrim || null
      }
      const emailNorm = editForm.email.trim().toLowerCase()
      if (emailNorm !== (editingCoach.email ?? '').toLowerCase()) {
        body.email = emailNorm
      }
      if (editForm.password.trim().length > 0) {
        body.password = editForm.password
      }
      if (editForm.scheduleTypeId !== (editingCoach.schedule_type_id || '')) {
        body.schedule_type_id = editForm.scheduleTypeId
      }

      if (
        body.name === undefined &&
        body.email === undefined &&
        body.password === undefined &&
        body.schedule_type_id === undefined
      ) {
        setSuccessMessage('No hubo cambios para guardar.')
        closeEdit()
        return
      }

      const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt(
        UPDATE_COACH_EDGE_FUNCTION,
        { body },
      )

      if (fnError) {
        const details = await getFunctionsInvokeFailureMessage(
          fnError,
          UPDATE_COACH_EDGE_FUNCTION,
        )
        throw new Error(details || 'No se pudo actualizar el profesor')
      }
      if (data?.error) throw new Error(String(data.error))
      if (!data?.success) {
        throw new Error(
          `La función «${UPDATE_COACH_EDGE_FUNCTION}» no confirmó el cambio.`,
        )
      }

      setSuccessMessage('Profesor actualizado correctamente.')
      closeEdit()
      await loadCoaches()
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo actualizar el profesor'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCoach = async () => {
    if (!confirmDeleteId) return
    setDeleting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt(
        DELETE_COACH_EDGE_FUNCTION,
        { body: { coach_id: confirmDeleteId } },
      )

      if (fnError) {
        const details = await getFunctionsInvokeFailureMessage(
          fnError,
          DELETE_COACH_EDGE_FUNCTION,
        )
        throw new Error(details || 'No se pudo eliminar el profesor')
      }
      if (data?.error) throw new Error(String(data.error))
      if (!data?.success) {
        throw new Error(
          `La función «${DELETE_COACH_EDGE_FUNCTION}» no confirmó el borrado.`,
        )
      }

      setSuccessMessage('Profesor eliminado (Auth y base de datos).')
      setConfirmDeleteId(null)
      await loadCoaches()
    } catch (err) {
      setError(toSpanishError(err, 'No se pudo eliminar el profesor'))
    } finally {
      setDeleting(false)
    }
  }

  const coachToDelete = coaches.find((c) => c.id === confirmDeleteId)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Profesores</h1>
        <p className="text-sm text-muted">
          Creá cuentas de profesores y asignales el horario que pueden gestionar.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
      {successMessage && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-400">
          {successMessage}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
        <form
          onSubmit={handleSubmit}
          className="card space-y-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Crear profesor
          </p>
          {scheduleTypes.length === 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-400">
              Todavía no hay horarios configurados. Cargá al menos uno en{' '}
              <span className="font-medium">Configuración</span> antes de crear profesores —
              cada profesor necesita un horario asignado.
            </p>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Nombre</label>
            <input
              className="input py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nombre (opcional)"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Email</label>
            <input
              className="input py-2 text-sm"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="profe@gimnasio.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">
              Contraseña inicial
            </label>
            <PasswordInput
              className="input py-2 text-sm"
              minLength={6}
              required
              value={form.password}
              onChange={(e) =>
                setForm((p) => ({ ...p, password: e.target.value }))
              }
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          <SelectField
            label="Horario asignado"
            placeholder="Seleccioná un horario"
            value={form.scheduleTypeId}
            onChange={(value) =>
              setForm((p) => ({ ...p, scheduleTypeId: value }))
            }
            options={scheduleTypes.map((s) => ({
              value: s.id,
              label: scheduleOptionLabel(s, walkIn),
            }))}
            disabled={saving}
            variant="light"
          />
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={saving || !form.email || !form.password || !form.scheduleTypeId}
          >
            {saving ? 'Creando…' : 'Crear profesor'}
          </button>
        </form>

        <div className="card-muted space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Profesores activos
            </p>
            <p className="text-xs text-muted">Total: {coaches.length}</p>
          </div>
          {loading ? (
            <p className="text-xs text-muted">Cargando…</p>
          ) : coaches.length === 0 ? (
            <p className="text-xs text-muted">Aún no hay profesores creados.</p>
          ) : (
            <ul className="space-y-2">
              {coaches.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded border border-line bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {c.name || c.email}
                    </p>
                    <p className="text-xs text-muted">{c.email}</p>
                    <p className="text-[11px] text-muted">
                      Horario: {scheduleLabel(c.schedule_type_id, scheduleTypes)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-[11px]"
                      onClick={() => openEdit(c)}
                      disabled={saving || deleting}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-500/40 bg-surface px-3 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                      onClick={() => {
                        setConfirmDeleteId(c.id)
                        setError(null)
                      }}
                      disabled={saving || deleting}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editingCoach && (
        <div
          className="fixed inset-0 z-50 flex h-dvh items-center justify-center bg-bg/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-coach-title"
        >
          <form
            onSubmit={handleUpdateCoach}
            className="card max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto !overflow-x-visible"
          >
            <h2
              id="edit-coach-title"
              className="text-lg font-semibold text-ink"
            >
              Editar profesor
            </h2>
            <p className="text-xs text-muted">
              Dejá la contraseña vacía si no querés cambiarla.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Nombre</label>
              <input
                className="input py-2 text-sm"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Email</label>
              <input
                className="input py-2 text-sm"
                type="email"
                required
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">
                Nueva contraseña (opcional)
              </label>
              <PasswordInput
                className="input py-2 text-sm"
                minLength={6}
                value={editForm.password}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, password: e.target.value }))
                }
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </div>
            <SelectField
              label="Horario asignado"
              placeholder="Seleccioná un horario"
              value={editForm.scheduleTypeId}
              onChange={(value) =>
                setEditForm((p) => ({ ...p, scheduleTypeId: value }))
              }
              options={scheduleTypes.map((s) => ({
                value: s.id,
                label: scheduleOptionLabel(s, walkIn),
              }))}
              disabled={saving}
              variant="light"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={closeEdit}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmDeleteId && coachToDelete && (
        <div
          className="fixed inset-0 z-50 flex h-dvh items-center justify-center bg-bg/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-lg">
            <h2 className="text-lg font-semibold text-ink">
              Eliminar profesor
            </h2>
            <p className="mt-2 text-sm text-muted">
              Se va a borrar la cuenta de{' '}
              <strong>{coachToDelete.name || coachToDelete.email}</strong> en la
              base y en Authentication. Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-bg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCoach}
                disabled={deleting}
                className="flex-1 rounded-lg border border-red-500/40 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
