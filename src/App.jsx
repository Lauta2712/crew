import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/Login'
import { AppHomePage } from './pages/AppHome'
import { StudentsPage } from './pages/Students'
import { AttendancePage } from './pages/Attendance'
import { StudentSchedulePage } from './pages/StudentSchedule'
import { StudentCalendarPage } from './pages/StudentCalendar'
import { StudentCoursesPage } from './pages/StudentCourses'
import { StudentProfilePage } from './pages/StudentProfile'
import { StudentClassQrPage } from './pages/StudentClassQrPage'
import { StudentWalkInQrPage } from './pages/StudentWalkInQrPage'
import { AdminScanPage } from './pages/AdminScan'
import { CheckinManualPage } from './pages/CheckinManual'
import { LandingPage } from './pages/Landing'
import { CrewThankYouPage } from './pages/CrewThankYou'
import { AdminPaymentsPage } from './pages/AdminPayments'
import { AdminConfigurationPage } from './pages/AdminConfiguration'
import { CoachesPage } from './pages/Coaches'
import { CoachDashboardPage } from './pages/CoachDashboard'
import { CoachWalkInPaymentsPage } from './pages/CoachWalkInPaymentsPage'
import { CoachScanPage } from './pages/CoachScan'
import { CoachAttendancePage } from './pages/CoachAttendancePage'
import { CoachCheckinPage } from './pages/CoachCheckinPage'
import { SuperAdminNewGymPage } from './pages/SuperAdminNewGym'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/crew/gracias" element={<CrewThankYouPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<Layout />}>
              <Route index element={<AppHomePage />} />

              {/* Vistas de alumno */}
              <Route element={<ProtectedRoute allowedRoles={['student']} />}>
                <Route path="schedule" element={<StudentSchedulePage />} />
                <Route path="calendar" element={<StudentCalendarPage />} />
                <Route path="courses" element={<StudentCoursesPage />} />
                <Route path="profile" element={<StudentProfilePage />} />
                <Route path="qr" element={<StudentClassQrPage />} />
                <Route path="walkin-qr" element={<StudentWalkInQrPage />} />
              </Route>

              {/* Vista solo profesor */}
              <Route element={<ProtectedRoute allowedRoles={['coach']} />}>
                <Route path="coach" element={<Navigate to="/app" replace />} />
                <Route path="coach/asistencias" element={<CoachAttendancePage />} />
                <Route path="coach/checkin" element={<CoachCheckinPage />} />
                <Route path="coach/cobros-libre" element={<CoachWalkInPaymentsPage />} />
                <Route path="coach/scan" element={<CoachScanPage />} />
              </Route>

              {/* Vistas solo admin */}
              <Route element={<ProtectedRoute requireAdmin />}>
                <Route path="scan" element={<AdminScanPage />} />
                <Route path="checkin-manual" element={<CheckinManualPage />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="payments" element={<AdminPaymentsPage />} />
                <Route path="configuration" element={<AdminConfigurationPage />} />
                <Route path="coaches" element={<CoachesPage />} />
              </Route>

              {/* Vista solo superadmin */}
              <Route element={<ProtectedRoute allowedRoles={['superadmin']} />}>
                <Route path="superadmin/gyms/new" element={<SuperAdminNewGymPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
