import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute({ requireAdmin = false, allowedRoles = null }) {
  const { session, authLoading, isAdmin, profile } = useAuth()

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand-400" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/" replace />
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/app" replace />
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(profile?.role)
  ) {
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}

