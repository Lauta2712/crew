import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useGymCatalog } from '../contexts/GymSettingsContext'
import { ScheduleTypesEditor } from '../components/ScheduleTypesEditor'
import { ClassPacksEditor } from '../components/ClassPacksEditor'
import { SelectField } from '../components/SelectField'
import { WALK_IN_DISCOUNT_ELIGIBLE_LABEL, WALK_IN_STANDARD_LABEL } from '../constants/packs'
import { FONT_OPTIONS } from '../utils/theme'
import { invokeEdgeFunctionWithUserJwt } from '../utils/edgeFunctions'
import { getFunctionsInvokeFailureMessage, toSpanishError } from '../utils/errors'

const BULK_CONFIRM_PHRASE = 'ELIMINAR TODOS'
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
const DEFAULT_FONT = 'Nunito'

function cloneScheduleDraft(scheduleTypes) {
  return (scheduleTypes ?? []).map((s) => ({
    id: s.id,
    name: s.name ?? '',
    slots: (s.slots?.length ? s.slots : [{ days: '', time: '' }]).map((sl) => ({
      days: sl.days ?? '',
      time: sl.time ?? '',
    })),
  }))
}

function clonePackDraft(classPacks) {
  return (classPacks ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? '',
    price: p.price ?? 0,
    classes_per_month: p.classes_per_month ?? 0,
    unlimited: !!p.unlimited,
  }))
}

export function AdminConfigurationPage() {
  const { profile } = useAuth()
  const {
    classPacks,
    scheduleTypes,
    walkIn,
    theme,
    loading: catalogLoading,
    saveSettingsData,
    reload,
  } = useGymCatalog()

  const [packDraft, setPackDraft] = useState([])
  const [fw, setFw] = useState({
    priceDefault: 0,
    priceWithDiscount: 0,
    monthlyDefault: 0,
    monthlyWithDiscount: 0,
  })
  const [scheduleDraft, setScheduleDraft] = useState([])
  const [themeDraft, setThemeDraft] = useState({
    primaryColor: '',
    accentColor: '',
    font: DEFAULT_FONT,
    logoUrl: '',
  })
  const [settingsError, setSettingsError] = useState(null)
  const [settingsOk, setSettingsOk] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)

  const [inviteCopied, setInviteCopied] = useState(false)

  const [bulkPhrase, setBulkPhrase] = useState('')
  const [bulkBusy, setBulkBusy] = useState(null)
  const [bulkLog, setBulkLog] = useState('')
  const [bulkError, setBulkError] = useState(null)

  useEffect(() => {
    if (catalogLoading) return
    setPackDraft(clonePackDraft(classPacks))
    setFw({ ...walkIn })
    setScheduleDraft(cloneScheduleDraft(scheduleTypes))
    setThemeDraft({
      primaryColor: theme?.primaryColor ?? '',
      accentColor: theme?.accentColor ?? '',
      font: theme?.font ?? DEFAULT_FONT,
      logoUrl: theme?.logoUrl ?? '',
    })
  }, [catalogLoading, classPacks, walkIn, scheduleTypes, theme])

  const handleSaveSettings = async (event) => {
    event.preventDefault()
    setSettingsError(null)
    setSettingsOk(null)

    setSavingSettings(true)
    try {
      const classPacksOut = []
      for (const p of packDraft) {
        if (!p.id?.trim()) {
          throw new Error('Hay un pack sin identificador interno.')
        }
        if (!p.name?.trim()) {
          throw new Error(`Completá el nombre del pack «${p.id}».`)
        }
        const price = Number(p.price)
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`Precio inválido para el pack «${p.name}».`)
        }
        const classesPerMonth = Number(p.classes_per_month)
        if (!p.unlimited && (!Number.isFinite(classesPerMonth) || classesPerMonth < 0)) {
          throw new Error(`Cantidad de clases inválida para el pack «${p.name}».`)
        }
        classPacksOut.push({
          id: p.id,
          name: p.name.trim(),
          price: Math.round(price),
          classes_per_month: p.unlimited ? 0 : Math.round(classesPerMonth),
          unlimited: !!p.unlimited,
        })
      }

      for (const sched of scheduleDraft) {
        if (!sched.id?.trim()) {
          throw new Error('Hay un horario sin identificador interno.')
        }
        if (!sched.name?.trim()) {
          throw new Error(`Completá el nombre del horario «${sched.id}».`)
        }
        const slots = sched.slots ?? []
        const invalid = slots.some(
          (sl) => !String(sl.days ?? '').trim() || !String(sl.time ?? '').trim(),
        )
        if (invalid) {
          throw new Error(
            `Revisá las franjas de «${sched.name}»: cada una necesita días y horario completos.`,
          )
        }
      }

      const primaryColor = themeDraft.primaryColor.trim()
      const accentColor = themeDraft.accentColor.trim()
      if (primaryColor && !HEX_COLOR_RE.test(primaryColor)) {
        throw new Error('El color primario debe ser un hex válido, ej. #ff4500.')
      }
      if (accentColor && !HEX_COLOR_RE.test(accentColor)) {
        throw new Error('El color de acento debe ser un hex válido, ej. #1e90ff.')
      }
      const themeOut = {}
      if (primaryColor) themeOut.primaryColor = primaryColor
      if (accentColor) themeOut.accentColor = accentColor
      if (themeDraft.font && themeDraft.font !== DEFAULT_FONT) themeOut.font = themeDraft.font
      if (themeDraft.logoUrl.trim()) themeOut.logoUrl = themeDraft.logoUrl.trim()

      const walkInOut = walkIn?.scheduleId
        ? {
            scheduleId: walkIn.scheduleId,
            dailyPackId: walkIn.dailyPackId,
            discountEligiblePackIds: walkIn.discountEligiblePackIds,
            priceDefault: Math.round(Number(fw.priceDefault)) || 0,
            priceWithDiscount: Math.round(Number(fw.priceWithDiscount)) || 0,
            monthlyDefault: Math.round(Number(fw.monthlyDefault)) || 0,
            monthlyWithDiscount: Math.round(Number(fw.monthlyWithDiscount)) || 0,
          }
        : undefined

      await saveSettingsData({
        catalogMode: 'custom',
        classPacks: classPacksOut,
        scheduleTypes: scheduleDraft,
        ...(walkInOut ? { walkIn: walkInOut } : {}),
        theme: themeOut,
      })
      setSettingsOk('Configuración guardada. Los cambios ya aplican en la app.')
      await reload()
    } catch (err) {
      setSettingsError(toSpanishError(err, 'No se pudo guardar la configuración'))
    } finally {
      setSavingSettings(false)
    }
  }

  const loadStudentIds = useCallback(async () => {
    let query = supabase.from('users').select('id').eq('role', 'student').is('deleted_at', null)
    if (profile?.gym_id) {
      query = query.or(`gym_id.eq.${profile.gym_id},gym_id.is.null`)
    }
    const { data, error: qErr } = await query
    if (qErr) throw qErr
    return (data ?? []).map((r) => r.id)
  }, [profile?.gym_id])

  const loadCoachIds = useCallback(async () => {
    let query = supabase.from('users').select('id').eq('role', 'coach')
    if (profile?.gym_id) {
      query = query.or(`gym_id.eq.${profile.gym_id},gym_id.is.null`)
    }
    const { data, error: qErr } = await query
    if (qErr) throw qErr
    return (data ?? []).map((r) => r.id)
  }, [profile?.gym_id])

  const runBulkDeleteStudents = async () => {
    setBulkError(null)
    setBulkLog('')
    if (bulkPhrase.trim() !== BULK_CONFIRM_PHRASE) {
      setBulkError(`Escribí exactamente: ${BULK_CONFIRM_PHRASE}`)
      return
    }
    setBulkBusy('students')
    try {
      const ids = await loadStudentIds()
      let ok = 0
      for (const student_id of ids) {
        const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt('delete-student', {
          body: { student_id },
        })
        if (fnError) {
          const msg = await getFunctionsInvokeFailureMessage(fnError, 'delete-student')
          throw new Error(msg || `Falló delete-student en ${student_id}`)
        }
        if (data?.error) throw new Error(String(data.error))
        if (!data?.success) throw new Error('delete-student no confirmó el borrado.')
        ok += 1
        setBulkLog(`Alumnos eliminados: ${ok}/${ids.length}`)
      }
      setBulkLog(`Listo. Alumnos eliminados: ${ok}.`)
      setBulkPhrase('')
    } catch (e) {
      setBulkError(toSpanishError(e, 'Borrado masivo interrumpido'))
    } finally {
      setBulkBusy(null)
    }
  }

  const runBulkDeleteCoaches = async () => {
    setBulkError(null)
    setBulkLog('')
    if (bulkPhrase.trim() !== BULK_CONFIRM_PHRASE) {
      setBulkError(`Escribí exactamente: ${BULK_CONFIRM_PHRASE}`)
      return
    }
    setBulkBusy('coaches')
    try {
      const ids = await loadCoachIds()
      let ok = 0
      for (const coach_id of ids) {
        const { data, error: fnError } = await invokeEdgeFunctionWithUserJwt('delete-coach-user', {
          body: { coach_id },
        })
        if (fnError) {
          const msg = await getFunctionsInvokeFailureMessage(fnError, 'delete-coach-user')
          throw new Error(msg || `Falló delete-coach-user en ${coach_id}`)
        }
        if (data?.error) throw new Error(String(data.error))
        if (!data?.success) {
          throw new Error('delete-coach-user no confirmó el borrado.')
        }
        ok += 1
        setBulkLog(`Profesores eliminados: ${ok}/${ids.length}`)
      }
      setBulkLog(`Listo. Profesores eliminados: ${ok}.`)
      setBulkPhrase('')
    } catch (e) {
      setBulkError(toSpanishError(e, 'Borrado masivo interrumpido'))
    } finally {
      setBulkBusy(null)
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-8 py-2">
      <div>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Configuración del gimnasio</h1>
        <p className="mt-1 text-sm text-muted">
          Precios, horarios visibles para alumnos y herramientas de mantenimiento (solo administradores).
        </p>
      </div>

      {profile?.gym_id && (
        <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Link de invitación para alumnos</h2>
          <p className="mt-1 text-xs text-muted">
            Compartí este link con tus alumnos para que se registren directamente en tu gimnasio
            (Crew es un sistema compartido por varios gimnasios — este link asegura que se anoten
            en el tuyo).
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              className="w-full min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink"
              value={`${window.location.origin}/login?gym=${profile.gym_id}`}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/login?gym=${profile.gym_id}`,
                )
                setInviteCopied(true)
                setTimeout(() => setInviteCopied(false), 2000)
              }}
            >
              {inviteCopied ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Precios y horarios</h2>
        <p className="mt-1 text-xs text-muted">
          Packs y horarios propios de tu gimnasio — se guardan tal cual los definas acá, sin
          valores por defecto de otro gimnasio.
        </p>

        {settingsError && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            {settingsError}
          </p>
        )}
        {settingsOk && (
          <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-400">
            {settingsOk}
          </p>
        )}

        <form className="mt-4 space-y-5" onSubmit={handleSaveSettings}>
          <div>
            <h3 className="text-sm font-semibold text-ink">Packs de clases</h3>
            {catalogLoading ? (
              <p className="mt-2 text-sm text-muted">Cargando…</p>
            ) : (
              <div className="mt-3">
                <ClassPacksEditor value={packDraft} onChange={setPackDraft} />
              </div>
            )}
          </div>

          {walkIn?.scheduleId && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Acceso libre (ARS)</p>
              <p className="mt-1 text-[11px] text-muted">
                Tarifa reducida: {WALK_IN_DISCOUNT_ELIGIBLE_LABEL}. Tarifa estándar:{' '}
                {WALK_IN_STANDARD_LABEL}.
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {[
                  ['priceDefault', `Pase diario — ${WALK_IN_STANDARD_LABEL}`],
                  ['priceWithDiscount', `Pase diario — ${WALK_IN_DISCOUNT_ELIGIBLE_LABEL}`],
                  ['monthlyDefault', `Mensual acceso libre — ${WALK_IN_STANDARD_LABEL}`],
                  ['monthlyWithDiscount', `Mensual acceso libre — ${WALK_IN_DISCOUNT_ELIGIBLE_LABEL}`],
                ].map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="text-muted">{label}</span>
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm"
                      value={fw[key] ?? ''}
                      onChange={(e) => setFw((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-ink">Horarios que ven los alumnos</h3>
            {catalogLoading ? (
              <p className="mt-2 text-sm text-muted">Cargando…</p>
            ) : (
              <div className="mt-3">
                <ScheduleTypesEditor value={scheduleDraft} onChange={setScheduleDraft} />
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Identidad visual
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Color primario y de acento del gimnasio. Sin configurar, se usa la paleta por
              defecto (volt/naranja).
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {[
                ['primaryColor', 'Color primario'],
                ['accentColor', 'Color de acento'],
              ].map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="text-muted">{label}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line p-0.5"
                      value={HEX_COLOR_RE.test(themeDraft[key]) ? themeDraft[key] : '#ffffff'}
                      onChange={(e) =>
                        setThemeDraft((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                    <input
                      type="text"
                      placeholder={key === 'primaryColor' ? '#ff4500' : '#1e90ff'}
                      className="w-full rounded-lg border border-line px-2 py-1.5 text-sm"
                      value={themeDraft[key]}
                      onChange={(e) =>
                        setThemeDraft((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Tipografía"
                value={themeDraft.font}
                onChange={(value) => setThemeDraft((prev) => ({ ...prev, font: value }))}
                options={FONT_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
                variant="light"
              />
              <label className="block text-sm">
                <span className="text-muted">URL del logo</span>
                <input
                  type="text"
                  placeholder="https://…/logo.png"
                  className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm"
                  value={themeDraft.logoUrl}
                  onChange={(e) =>
                    setThemeDraft((prev) => ({ ...prev, logoUrl: e.target.value }))
                  }
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary px-4 py-2 text-sm"
            disabled={savingSettings || catalogLoading}
          >
            {savingSettings ? 'Guardando…' : 'Guardar precios y horarios'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-amber-500/40 bg-amber-950/40/80 p-4">
        <h2 className="text-sm font-semibold text-amber-400">Zona peligrosa — borrado masivo</h2>
        <p className="mt-1 text-xs text-amber-400/90">
          Elimina <span className="font-semibold">todos</span> los alumnos o{' '}
          <span className="font-semibold">todos</span> los profesores visibles para tu alcance
          (mismo criterio que las listas: si tenés <code className="rounded bg-surface/80 px-0.5">gym_id</code>, solo
          ese gimnasio y filas sin gimnasio). Requiere las edge functions{' '}
          <code className="rounded bg-surface/80 px-0.5">delete-student</code> y{' '}
          <code className="rounded bg-surface/80 px-0.5">delete-coach-user</code>.
        </p>

        <label className="mt-3 block text-sm text-amber-400">
          Para confirmar, escribí: <span className="font-mono font-semibold">{BULK_CONFIRM_PHRASE}</span>
          <input
            type="text"
            className="mt-1 w-full max-w-md rounded-lg border border-amber-500/40 bg-surface px-2 py-1.5 text-sm"
            value={bulkPhrase}
            onChange={(e) => setBulkPhrase(e.target.value)}
            autoComplete="off"
          />
        </label>

        {bulkError && (
          <p className="mt-2 text-xs font-medium text-red-400">{bulkError}</p>
        )}
        {bulkLog && (
          <p className="mt-2 text-xs text-amber-400">{bulkLog}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-red-500/40 bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            disabled={!!bulkBusy}
            onClick={runBulkDeleteStudents}
          >
            {bulkBusy === 'students' ? 'Eliminando alumnos…' : 'Eliminar todos los alumnos'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-red-400 bg-surface px-3 py-2 text-xs font-semibold text-red-400 shadow-sm hover:bg-red-950/40 disabled:opacity-50"
            disabled={!!bulkBusy}
            onClick={runBulkDeleteCoaches}
          >
            {bulkBusy === 'coaches' ? 'Eliminando profes…' : 'Eliminar todos los profesores'}
          </button>
        </div>
      </section>
    </div>
  )
}
