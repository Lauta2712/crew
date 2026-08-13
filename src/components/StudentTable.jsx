import { useState } from 'react'
import { SelectField } from './SelectField'
import { formatPackOptionLabel } from '../constants/packs'
import { StudentDetailModal } from './StudentDetailModal'

export function StudentTable({
  students,
  loading,
  isAdmin = false,
  onRegisterPayment,
  isSavingPayment = false,
  onBlockStudent,
  onDeleteStudent,
  packs = [],
  schedules = [],
  walkIn = null,
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [selectedPackId, setSelectedPackId] = useState('')
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [selectedScheduleSlot, setSelectedScheduleSlot] = useState('')
  const [confirmBlock, setConfirmBlock] = useState(null) // { id, name, blocked }
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, name }
  const [detailStudent, setDetailStudent] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredStudents = searchQuery.trim()
    ? (students ?? []).filter((s) =>
        s.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : (students ?? [])

  const selectedScheduleType = schedules.find((s) => s.id === selectedScheduleId) ?? null
  const selectedScheduleSlots = selectedScheduleType?.slots ?? []
  const requiresSlotPick = selectedScheduleSlots.length > 1

  const resetForm = () => {
    setSelectedStudentId(null)
    setSelectedPackId('')
    setSelectedScheduleId('')
    setSelectedScheduleSlot('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!onRegisterPayment || !selectedStudentId || !selectedPackId || !selectedScheduleId) return
    if (requiresSlotPick && !selectedScheduleSlot) return

    const paidAt = new Date()
    await onRegisterPayment({
      studentId: selectedStudentId,
      packId: selectedPackId,
      scheduleTypeId: selectedScheduleId,
      scheduleSlot: selectedScheduleSlot || null,
      paidAt,
    })
    resetForm()
  }

  if (loading) {
    return (
      <div className="card-muted">
        <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Alumnos
        </p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-slate-100"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card-muted overflow-hidden">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Alumnos
        </p>
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Buscar por nombre…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-400 sm:w-48"
          />
          <p className="shrink-0 text-xs text-slate-500">
            {searchQuery.trim()
              ? `${filteredStudents.length} / ${students?.length ?? 0}`
              : `Total: ${students?.length ?? 0}`}
          </p>
        </div>
      </div>

      {/* Vista mobile en cards */}
      <div className="space-y-2 md:hidden">
        {filteredStudents.map((student) => (
          <div
            key={student.id}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-2">
              <button
                type="button"
                className="text-left font-semibold text-slate-800 underline-offset-2 hover:underline"
                onClick={() => setDetailStudent(student)}
              >
                {student.name}
              </button>
              <span className="text-[11px] text-slate-500">
                {student.plan_name ?? 'Sin plan'}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] uppercase text-slate-500">Cupo pack</p>
                <p className="text-slate-700">{student.classes_per_month ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-500">Usadas (período)</p>
                <p className="text-slate-700">{student.classes_used_this_month ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-500">Restantes</p>
                <p className="font-semibold text-brand-600">
                  {student.classes_remaining ?? '—'}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {isAdmin && onRegisterPayment && (
                <button
                  type="button"
                  className="btn-primary inline-flex items-center px-2 py-1 text-[11px]"
                  onClick={() => setSelectedStudentId(student.id)}
                >
                  Registrar pago
                </button>
              )}
              {isAdmin && onBlockStudent && (
                <button
                  type="button"
                  className={
                    student.blocked
                      ? 'inline-flex items-center rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-600'
                      : 'inline-flex items-center rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-600'
                  }
                  onClick={() =>
                    setConfirmBlock({
                      id: student.id,
                      name: student.name,
                      blocked: !student.blocked,
                    })
                  }
                >
                  {student.blocked ? 'Desuspender' : 'Suspender'}
                </button>
              )}
              {isAdmin && onDeleteStudent && (
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600"
                  onClick={() =>
                    setConfirmDelete({ id: student.id, name: student.name })
                  }
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
        {filteredStudents.length === 0 && (
          <p className="text-xs text-slate-400">
            {searchQuery.trim() ? 'Sin resultados para esa búsqueda.' : 'No hay alumnos cargados.'}
          </p>
        )}
      </div>

      {/* Tabla solo para md+ */}
      <div className="hidden overflow-x-auto md:block">
        <table className="table min-w-[720px] text-xs sm:text-sm">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Plan</th>
              <th>Cupo pack</th>
              <th>Usadas (período)</th>
              <th>Restantes</th>
              {isAdmin && (onRegisterPayment || onBlockStudent || onDeleteStudent) && (
                <th className="min-w-[200px]">Acciones</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => (
              <tr key={student.id}>
                <td className="font-medium text-slate-800">
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => setDetailStudent(student)}
                  >
                    {student.name}
                  </button>
                  {student.blocked && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                      Suspendido
                    </span>
                  )}
                </td>
                <td className="text-slate-500">
                  {student.plan_name ?? 'Sin plan'}
                </td>
                <td className="text-slate-700">{student.classes_per_month ?? '—'}</td>
                <td className="text-slate-700">{student.classes_used_this_month ?? 0}</td>
                <td className="font-semibold text-brand-600">
                  {student.classes_remaining ?? '—'}
                </td>
                {isAdmin && (onRegisterPayment || onBlockStudent || onDeleteStudent) && (
                  <td className="space-x-2">
                    {onRegisterPayment && (
                      <button
                        type="button"
                        className="btn-primary inline-flex items-center px-2 py-1 text-[11px]"
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        Registrar pago
                      </button>
                    )}
                    {onBlockStudent && (
                      <button
                        type="button"
                        className={
                          student.blocked
                            ? 'inline-flex rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-600'
                            : 'inline-flex rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-600'
                        }
                        onClick={() =>
                          setConfirmBlock({
                            id: student.id,
                            name: student.name,
                            blocked: !student.blocked,
                          })
                        }
                      >
                        {student.blocked ? 'Desuspender' : 'Suspender'}
                      </button>
                    )}
                    {onDeleteStudent && (
                      <button
                        type="button"
                        className="inline-flex rounded-lg bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600"
                        onClick={() =>
                          setConfirmDelete({
                            id: student.id,
                            name: student.name,
                          })
                        }
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Modal confirmar suspender / desuspender */}
      {confirmBlock && (
        <div className="fixed inset-0 z-40 flex h-dvh items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#d0dde2] bg-white p-4 shadow-xl">
            <p className="text-sm text-slate-700">
              {confirmBlock.blocked
                ? `¿Suspender a ${confirmBlock.name}? No podrá iniciar sesión hasta que lo desuspendas.`
                : `¿Desuspender a ${confirmBlock.name}?`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm"
                onClick={() => setConfirmBlock(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-sm"
                onClick={() => {
                  onBlockStudent?.(confirmBlock.id, confirmBlock.blocked)
                  setConfirmBlock(null)
                }}
              >
                {confirmBlock.blocked ? 'Suspender' : 'Desuspender'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminar */}
      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex h-dvh items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#d0dde2] bg-white p-4 shadow-xl">
            <p className="text-sm text-slate-700">
              ¿Eliminar definitivamente a <strong>{confirmDelete.name}</strong>? Se borrarán también los registros asociados (pagos, asistencias, suscripciones y proyectos). Esta acción no se puede revertir desde la app.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm"
                onClick={() => setConfirmDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
                onClick={() => {
                  onDeleteStudent?.(confirmDelete.id)
                  setConfirmDelete(null)
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          isAdmin={isAdmin}
          onClose={() => setDetailStudent(null)}
          onRegisterPayment={
            onRegisterPayment
              ? (s) => {
                  setDetailStudent(null)
                  setSelectedStudentId(s.id)
                }
              : undefined
          }
          onBlockStudent={
            onBlockStudent
              ? (s) => {
                  setDetailStudent(null)
                  setConfirmBlock({ id: s.id, name: s.name, blocked: !s.blocked })
                }
              : undefined
          }
          onDeleteStudent={
            onDeleteStudent
              ? (s) => {
                  setDetailStudent(null)
                  setConfirmDelete({ id: s.id, name: s.name })
                }
              : undefined
          }
        />
      )}

      {isAdmin && onRegisterPayment && selectedStudentId && (
        <div className="fixed inset-0 z-40 flex h-dvh items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#d0dde2] bg-white p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-800">Registrar pago</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Elegí pack y horario. El pago se registra con la fecha y hora de ahora.
            </p>

            <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
              <SelectField
                label="Pack de clases"
                placeholder="Seleccionar pack"
                value={selectedPackId}
                onChange={setSelectedPackId}
                options={packs.map((pack) => ({
                  value: pack.id,
                  label: formatPackOptionLabel(pack, walkIn),
                }))}
              />

              <div className="space-y-2">
                <SelectField
                  label="Tipo de horario"
                  placeholder="Seleccionar horario"
                  value={selectedScheduleId}
                  onChange={(value) => {
                    setSelectedScheduleId(value)
                    setSelectedScheduleSlot('')
                  }}
                  options={schedules.map((schedule) => ({
                    value: schedule.id,
                    label: schedule.name,
                  }))}
                />
                {requiresSlotPick && (
                  <SelectField
                    label="Turno / franja horaria"
                    placeholder="Seleccionar turno"
                    value={selectedScheduleSlot}
                    onChange={setSelectedScheduleSlot}
                    options={selectedScheduleSlots.map((slot) => ({
                      value: `${slot.days}|${slot.time}`,
                      label: `${slot.days} · ${slot.time}`,
                    }))}
                  />
                )}
                {!requiresSlotPick && selectedScheduleSlots.length === 1 && (
                  <div className="rounded-lg border border-[#d0dde2] bg-[#f7fbfd] px-3 py-2 text-[11px] text-slate-600">
                    Turno:{' '}
                    <span className="font-semibold text-slate-800">
                      {selectedScheduleSlots[0].days} · {selectedScheduleSlots[0].time}
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-slate-400">
                  Los días y horarios detallados se verán en el calendario del alumno.
                </p>
              </div>

              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-[11px]"
                  onClick={resetForm}
                  disabled={isSavingPayment}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary px-3 py-1.5 text-[11px]"
                  disabled={isSavingPayment || (requiresSlotPick && !selectedScheduleSlot)}
                >
                  {isSavingPayment ? 'Guardando…' : 'Guardar pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

