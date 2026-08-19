import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { supabase } from '../services/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { AttendanceHistoryTable } from '../components/AttendanceHistoryTable'
import { formatCheckinMethod } from '../utils/checkinMethodLabels'
import { toSpanishError } from '../utils/errors'

export function AttendancePage() {
  const { profile } = useAuth()
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState(null)

  const gymFilter = profile?.gym_id

  useEffect(() => {
    let active = true

    async function loadHistory() {
      setLoadingHistory(true)
      try {
        let query = supabase
          .from('attendances')
          .select(
            `
            id,
            attended_at,
            gym_id,
            checkin_method,
            users (
              id,
              name,
              deleted_at
            )
          `,
          )

        if (gymFilter) {
          query = query.eq('gym_id', gymFilter)
        }

        const { data, error } = await query
          .order('attended_at', { ascending: false })
          .limit(200)

        if (error) throw error
        if (!active) return

        const mapped =
          data
            ?.filter((row) => row.users != null && row.users?.deleted_at == null)
            ?.map((row) => ({
              id: row.id,
              student_id: row.users?.id ?? null,
              attended_at: row.attended_at,
              method: formatCheckinMethod(row.checkin_method),
              user_name: row.users?.name ?? '—',
            })) ?? []

        setHistory(mapped)
      } catch (err) {
        if (!active) return
        setError(toSpanishError(err, 'No se pudo cargar el historial de asistencias'))
      } finally {
        if (active) setLoadingHistory(false)
      }
    }

    loadHistory()

    return () => {
      active = false
    }
  }, [gymFilter])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Asistencias</h1>
          <p className="text-sm text-muted">Historial de los últimos 200 registros.</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            to="/app/checkin-manual"
            className="btn-secondary px-4 py-2 text-sm"
          >
            Check-in Manual →
          </Link>
          <Link
            to="/app/scan"
            className="btn-secondary px-4 py-2 text-sm"
          >
            Escanear QR →
          </Link>
        </div>
      </div>

      {error && (
        <p className="shrink-0 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="flex min-h-[16rem] flex-1 flex-col">
        <AttendanceHistoryTable attendances={history} loading={loadingHistory} />
      </div>
    </div>
  )
}
