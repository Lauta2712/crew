import { useAuth } from '../hooks/useAuth'
import { DashboardPage } from './Dashboard'
import { CoachDashboardPage } from './CoachDashboard'
import { StudentDashboardPage } from './StudentDashboard'
import { SuperAdminDashboardPage } from './SuperAdminDashboard'

/**
 * Ruta /app: muestra Dashboard de admin o Inicio del alumno según el rol.
 */
export function AppHomePage() {
  const { isAdmin, isCoach, isSuperAdmin } = useAuth()
  if (isSuperAdmin) return <SuperAdminDashboardPage />
  if (isAdmin) return <DashboardPage />
  if (isCoach) return <CoachDashboardPage />
  return <StudentDashboardPage />
}
