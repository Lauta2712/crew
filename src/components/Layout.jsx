import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { useAuth } from '../hooks/useAuth'
import { AmountVisibilityProvider, useAmountVisibility } from '../hooks/useAmountVisibility'
import { GymSettingsProvider, useGymCatalog } from '../contexts/GymSettingsContext'
import { supabase } from '../services/supabaseClient'
import {
  clearSupportReturnSession,
  getSupportReturnSession,
} from '../utils/supportMode'

function EyeIcon({ hidden }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {hidden && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

function AmountVisibilityToggle({ className = '' }) {
  const { amountsHidden, toggleAmountsHidden } = useAmountVisibility()
  return (
    <button
      type="button"
      onClick={toggleAmountsHidden}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-ink ${className}`}
      aria-pressed={amountsHidden}
      aria-label={amountsHidden ? 'Mostrar montos' : 'Ocultar montos'}
      title={amountsHidden ? 'Mostrar montos' : 'Ocultar montos'}
    >
      <EyeIcon hidden={amountsHidden} />
    </button>
  )
}

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function NavItem({ item, onClick }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? item.to === '/app'}
      onClick={onClick}
      className={({ isActive }) =>
        classNames(
          'flex items-center justify-between rounded px-3 py-2 text-sm font-medium transition',
          isActive
            ? 'bg-brand-500 text-bg font-semibold'
            : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      <span>{item.name}</span>
      {item.badge && (
        <span className="rounded border border-amber-500/40 bg-amber-950/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-400">
          {item.badge}
        </span>
      )}
    </NavLink>
  )
}

function NavGroups({ groups, onItemClick }) {
  return groups.map((group, groupIndex) => (
    <div
      key={group.section ?? `group-${groupIndex}`}
      className={groupIndex > 0 ? 'mt-3 border-t border-line pt-3' : ''}
    >
      {group.section && (
        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
          {group.section}
        </p>
      )}
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <NavItem key={item.name} item={item} onClick={onItemClick} />
        ))}
      </div>
    </div>
  ))
}

export function Layout() {
  return (
    <AmountVisibilityProvider>
      <GymSettingsProvider>
        <LayoutInner />
      </GymSettingsProvider>
    </AmountVisibilityProvider>
  )
}

function LayoutInner() {
  const { profile, isAdmin, isCoach, isSuperAdmin, signOut } = useAuth()
  const { gymName, theme } = useGymCatalog()
  const logoSrc = theme?.logoUrl
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileAnimatingIn, setMobileAnimatingIn] = useState(false)
  const [emailConfirmedNotice, setEmailConfirmedNotice] = useState(false)
  const [supportReturn, setSupportReturn] = useState(() => getSupportReturnSession())
  const [returningToSuperadmin, setReturningToSuperadmin] = useState(false)
  const navigate = useNavigate()

  const handleSignOut = async () => {
    clearSupportReturnSession()
    try {
      await signOut()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cerrando sesión', error)
    } finally {
      navigate('/', { replace: true })
    }
  }

  const handleReturnToSuperadmin = async () => {
    if (!supportReturn) return
    setReturningToSuperadmin(true)
    try {
      const { error } = await supabase.auth.setSession({
        access_token: supportReturn.access_token,
        refresh_token: supportReturn.refresh_token,
      })
      if (error) throw error
      clearSupportReturnSession()
      setSupportReturn(null)
      navigate('/app', { replace: true })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error volviendo a superadmin', error)
      setReturningToSuperadmin(false)
    }
  }

  const adminNavigation = [
    {
      section: null,
      items: [{ name: 'Dashboard', to: '/app' }],
    },
    {
      section: 'Gestión',
      items: [
        { name: 'Alumnos', to: '/app/students' },
        { name: 'Profesores', to: '/app/coaches' },
      ],
    },
    {
      section: 'Operación diaria',
      items: [
        { name: 'Asistencias', to: '/app/attendance' },
        { name: 'Check-in Manual', to: '/app/checkin-manual', badge: 'Beta' },
        { name: 'Escanear QR', to: '/app/scan' },
      ],
    },
    {
      section: 'Finanzas',
      items: [{ name: 'Pagos', to: '/app/payments' }],
    },
    {
      section: 'Sistema',
      items: [{ name: 'Configuración', to: '/app/configuration' }],
    },
  ]

  const studentNavigation = [
    {
      section: null,
      items: [{ name: 'Inicio', to: '/app' }],
    },
    {
      section: 'Mi actividad',
      items: [
        { name: 'Horarios', to: '/app/schedule' },
        { name: 'Calendario', to: '/app/calendar' },
        { name: 'Cursos', to: '/app/courses' },
      ],
    },
    {
      section: 'Mis códigos QR',
      items: [
        { name: 'QR Clases/Grupo', to: '/app/qr' },
        { name: 'QR Acceso libre', to: '/app/walkin-qr' },
      ],
    },
    {
      section: 'Cuenta',
      items: [{ name: 'Perfil', to: '/app/profile' }],
    },
  ]

  const coachNavigation = [
    {
      section: null,
      items: [{ name: 'Alumnos', to: '/app', end: true }],
    },
    {
      section: 'Operación diaria',
      items: [
        { name: 'Asistencias', to: '/app/coach/asistencias', end: true, badge: 'Nuevo' },
        { name: 'Check-in Manual', to: '/app/coach/checkin', end: true, badge: 'Nuevo' },
        { name: 'Escanear QR', to: '/app/coach/scan', end: true },
      ],
    },
    {
      section: 'Finanzas',
      items: [{ name: 'Pagos', to: '/app/coach/cobros-libre', end: true }],
    },
  ]

  const superAdminNavigation = [
    {
      section: null,
      items: [
        { name: 'Dashboard', to: '/app', end: true },
        { name: 'Nuevo gimnasio', to: '/app/superadmin/gyms/new', end: true, badge: 'Nuevo' },
      ],
    },
  ]

  const navigation = isSuperAdmin
    ? superAdminNavigation
    : isAdmin
      ? adminNavigation
      : isCoach
        ? coachNavigation
        : studentNavigation

  const openMobileMenu = () => {
    setMobileOpen(true)
    // esperamos al siguiente tick para asegurar el mount antes de animar
    requestAnimationFrame(() => setMobileAnimatingIn(true))
  }

  const closeMobileMenu = () => {
    setMobileAnimatingIn(false)
    // esperamos a que termine la transición antes de desmontar
    setTimeout(() => {
      setMobileOpen(false)
    }, 200)
  }

  useEffect(() => {
    const hash = window.location.hash?.replace(/^#/, '')
    if (!hash) return
    const params = new URLSearchParams(hash)
    const type = params.get('type')
    const accessToken = params.get('access_token')
    if (type === 'signup' && accessToken) {
      setEmailConfirmedNotice(true)
    }
  }, [])

  return (
    <div className="app-shell flex h-dvh overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col overflow-hidden bg-surface p-3 md:flex">
        <div className="mb-4 flex shrink-0 items-center gap-2">
          {logoSrc && (
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded bg-bg">
              <BrandMark src={logoSrc} alt={gymName} />
            </div>
          )}
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-wide text-ink">
              {gymName}
            </p>
            <p className="text-xs text-muted">
              Sistema de asistencias
            </p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1 pr-0.5">
          <NavGroups groups={navigation} />
        </nav>

        <div className="mt-4 shrink-0">
          <p className="text-[10px] font-medium text-muted">Conectado</p>
          <p className="truncate text-xs font-semibold text-ink">
            {profile?.name || profile?.name || profile?.email || 'Usuario'}
          </p>
          {profile?.role && (isAdmin || isSuperAdmin) && (
            <p className="text-[10px] capitalize text-muted">
              Rol: {profile.role}
            </p>
          )}
          <button
            type="button"
            className="btn-secondary mt-2 w-full px-2 py-1.5 text-[11px]"
            onClick={handleSignOut}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="flex min-h-[56px] items-center justify-between bg-surface/90 px-5 py-4 backdrop-blur md:min-h-0 md:bg-surface md:py-3 md:px-6">
          <div className="flex flex-1 items-center gap-3 md:flex-initial">
            {/* Botón menú mobile: círculo a la izquierda del logo */}
            <button
              type="button"
              className="flex shrink-0 items-center justify-center p-2 text-ink md:hidden"
              onClick={openMobileMenu}
            >
              <span className="sr-only">Abrir menú</span>
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 rounded bg-ink" />
                <span className="block h-0.5 w-4 rounded bg-ink" />
                <span className="block h-0.5 w-4 rounded bg-ink" />
              </span>
            </button>
            {logoSrc && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-bg md:hidden">
                <BrandMark src={logoSrc} alt={gymName} />
              </div>
            )}
            <div className="min-w-0 md:hidden">
              <p className="text-sm font-semibold text-ink">
                {gymName}
              </p>
              <p className="text-xs text-muted">
                Sistema de asistencias
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {(isAdmin || isCoach || isSuperAdmin) && <AmountVisibilityToggle />}
            <p className="hidden text-xs text-muted sm:block">
              {profile?.name || profile?.name || profile?.email}
            </p>
            {/* Botón salir desktop */}
            <button
              type="button"
              className="btn-secondary hidden px-3 py-1 text-xs md:inline-flex"
              onClick={handleSignOut}
            >
              Salir
            </button>
          </div>
        </header>

        {supportReturn && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-950/40 px-5 py-2 text-xs text-amber-400 md:px-6">
            <p>
              Modo soporte: viendo como admin de «{supportReturn.gym_name || 'gimnasio'}».
            </p>
            <button
              type="button"
              className="font-semibold underline-offset-2 hover:underline disabled:opacity-50"
              onClick={handleReturnToSuperadmin}
              disabled={returningToSuperadmin}
            >
              {returningToSuperadmin ? 'Volviendo…' : 'Volver a superadmin'}
            </button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-28 md:px-6 md:pt-5 md:pb-12">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 min-w-0">
            {emailConfirmedNotice && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-400">
                <div className="flex items-center justify-between gap-3">
                  <p>Email confirmado correctamente.</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
                    onClick={() => setEmailConfirmedNotice(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
            {/* Las rutas pueden usar flex-1 + min-h-0 en la raíz para ocupar el alto disponible */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Menú mobile tipo drawer */}
      {mobileOpen && (
        <div
          className={`fixed inset-0 z-40 bg-bg/40 transition-opacity duration-200 md:hidden ${
            mobileAnimatingIn ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className={`fixed inset-y-0 left-0 w-64 bg-surface p-4 transition-transform duration-200 ease-out ${
              mobileAnimatingIn ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {logoSrc && (
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded bg-bg">
                    <BrandMark src={logoSrc} alt={gymName} />
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {gymName}
                  </p>
                  <p className="text-[11px] text-muted">
                    Sistema de asistencias
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded bg-surface-2 text-ink"
                onClick={closeMobileMenu}
              >
                ×
              </button>
            </div>

            <nav className="mb-4">
              <NavGroups groups={navigation} onItemClick={closeMobileMenu} />
            </nav>

            <div className="mt-4">
              <p className="text-[10px] font-medium text-muted">
                Conectado
              </p>
              <p className="truncate text-xs font-semibold text-ink">
                {profile?.name || profile?.name || profile?.email || 'Usuario'}
              </p>
              {profile?.role && (isAdmin || isSuperAdmin) && (
                <p className="text-[10px] capitalize text-muted">
                  Rol: {profile.role}
                </p>
              )}
              <button
                type="button"
                className="btn-secondary mt-2 w-full px-2 py-1.5 text-[11px]"
                onClick={() => {
                  closeMobileMenu()
                  handleSignOut()
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

