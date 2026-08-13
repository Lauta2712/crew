import { useState } from 'react'
import { formatDateTime } from '../utils/dateFormatting'

export function AttendanceHistoryTable({ attendances, loading }) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredAttendances = searchQuery.trim()
    ? (attendances ?? []).filter((a) =>
        a.user_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : (attendances ?? [])

  if (loading) {
    return (
      <div className="card-muted flex h-full min-h-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Historial reciente
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2 md:hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-16 w-full animate-pulse rounded-xl bg-slate-200"
              />
            ))}
          </div>
          <div className="hidden space-y-2 md:block">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-10 w-full animate-pulse rounded bg-slate-200"
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const formatDate = (iso) => formatDateTime(iso)

  return (
    <div className="card-muted flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Historial reciente
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
              ? `${filteredAttendances.length} / ${attendances?.length ?? 0}`
              : `Total: ${attendances?.length ?? 0}`}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Mobile: lista de tarjetas sin scroll horizontal */}
        <div className="space-y-2 md:hidden">
          {filteredAttendances.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              {searchQuery.trim() ? 'Sin resultados para esa búsqueda.' : 'Aún no hay asistencias registradas.'}
            </p>
          ) : (
            filteredAttendances.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
              >
                <p className="font-medium text-slate-800">
                  {item.user_name ?? '—'}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDate(item.attended_at)}
                </p>
                <p className="text-[11px] capitalize text-slate-400">
                  {item.method ?? 'manual'}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Desktop: tabla */}
        <div className="hidden overflow-x-auto md:block">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Fecha</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendances.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="py-6 text-center text-xs text-slate-500"
                  >
                    {searchQuery.trim() ? 'Sin resultados para esa búsqueda.' : 'Aún no hay asistencias registradas.'}
                  </td>
                </tr>
              ) : (
                filteredAttendances.map((item) => (
                  <tr key={item.id}>
                    <td className="font-medium text-slate-800">
                      {item.user_name ?? '—'}
                    </td>
                    <td className="text-slate-600">
                      {formatDate(item.attended_at)}
                    </td>
                    <td className="capitalize text-slate-500">
                      {item.method ?? 'manual'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

