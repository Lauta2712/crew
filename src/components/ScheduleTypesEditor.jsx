/**
 * Editor visual de horarios (sin JSON). Misma forma que guarda gym_settings.scheduleTypes.
 * @param {{ value: Array<{ id: string, name: string, slots: Array<{ days: string, time: string }> }>, onChange: (next: typeof value) => void }} props
 */
export function ScheduleTypesEditor({ value, onChange }) {
  const updateSchedule = (index, patch) => {
    const next = value.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onChange(next)
  }

  const updateSlot = (scheduleIndex, slotIndex, patch) => {
    const sched = value[scheduleIndex]
    if (!sched) return
    const slots = sched.slots.map((sl, j) => (j === slotIndex ? { ...sl, ...patch } : sl))
    updateSchedule(scheduleIndex, { slots })
  }

  const addSlot = (scheduleIndex) => {
    const sched = value[scheduleIndex]
    if (!sched) return
    updateSchedule(scheduleIndex, {
      slots: [...(sched.slots ?? []), { days: '', time: '' }],
    })
  }

  const removeSlot = (scheduleIndex, slotIndex) => {
    const sched = value[scheduleIndex]
    if (!sched) return
    const slots = sched.slots.filter((_, j) => j !== slotIndex)
    updateSchedule(scheduleIndex, { slots: slots.length ? slots : [{ days: '', time: '' }] })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        Editá el nombre que ven los alumnos y cada franja horaria. Los días podés escribirlos en
        texto libre (ej. «Lunes y Miércoles»). El identificador interno no se modifica.
      </p>
      {value.map((sched, si) => (
        <div
          key={sched.id}
          className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm sm:p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
            <label className="min-w-0 flex-1">
              <span className="text-xs font-medium text-slate-500">Nombre del horario</span>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-900"
                value={sched.name}
                onChange={(e) => updateSchedule(si, { name: e.target.value })}
              />
            </label>
            <span
              className="shrink-0 rounded bg-slate-200/80 px-2 py-0.5 font-mono text-[10px] text-slate-600"
              title="No editable: lo usa el sistema"
            >
              id: {sched.id}
            </span>
          </div>

          <div className="mt-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Franjas
            </p>
            {(sched.slots ?? []).map((slot, li) => (
              <div
                key={`${sched.id}-slot-${li}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:flex-row sm:items-end"
              >
                <label className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium text-slate-500">Días</span>
                  <input
                    type="text"
                    className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                    value={slot.days}
                    onChange={(e) => updateSlot(si, li, { days: e.target.value })}
                    placeholder="Ej. Martes y Jueves"
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium text-slate-500">Horario</span>
                  <input
                    type="text"
                    className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                    value={slot.time}
                    onChange={(e) => updateSlot(si, li, { time: e.target.value })}
                    placeholder="Ej. 19:00 – 22:00"
                  />
                </label>
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:mb-0.5"
                  onClick={() => removeSlot(si, li)}
                  disabled={(sched.slots?.length ?? 0) <= 1}
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
              onClick={() => addSlot(si)}
            >
              + Agregar otra franja
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
