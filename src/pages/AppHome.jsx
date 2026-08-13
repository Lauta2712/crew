import { useAuth } from '../hooks/useAuth'
import { DashboardPage } from './Dashboard'
import { CoachDashboardPage } from './CoachDashboard'
import { StudentDashboardPage } from './StudentDashboard'

/**
 * Ruta /app: muestra Dashboard de admin o Inicio del alumno según el rol.
 */
export function AppHomePage() {
  const { isAdmin, isCoach } = useAuth()
  if (isAdmin) return <DashboardPage />
  if (isCoach) return <CoachDashboardPage />
  return <StudentDashboardPage />
}
