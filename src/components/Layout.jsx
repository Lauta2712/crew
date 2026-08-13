import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import cruxLogo from '../../crux_logo.jpg'
import { useAuth } from '../hooks/useAuth'
import { GymSettingsProvider, useGymCatalog } from '../contexts/GymSettingsContext'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Layout() {
  return (
    <GymSettingsProvider>
      <LayoutInner />
    </GymSettingsProvider>
  )
}

function LayoutInner() {
  const { profile, isAdmin, isCoach, signOut } = useAuth()
  const { gymName, theme } = useGymCatalog()
  const logoSrc = theme?.logoUrl || cruxLogo
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileAnimatingIn, setMobileAnimatingIn] = useState(false)
  const [emailConfirmedNotice, setEmailConfirmedNotice] = useState(false)
  const navigate = useNavigate()

  const adminNavigation = [
    { name: 'Dashboard', to: '/app', icon: '🏠' },
    { name: 'Alumnos', to: '/app/students', icon: '👥' },
    { name: 'Asistencias', to: '/app/attendance', icon: '✅' },
    { name: 'Pagos', to: '/app/payments', icon: '💳' },
    { name: 'Profesores', to: '/app/coaches', icon: '🧑‍🏫' },
    { name: 'Configuración', to: '/app/configuration', icon: '⚙️' },
    { name: 'Check-in Manual', to: '/app/checkin-manual', icon: '✏️', badge: 'Beta' },
    { name: 'Escanear QR', to: '/app/scan', icon: '📷' },
  ]

  const studentNavigation = [
    { name: 'Inicio', to: '/app', icon: '🏠' },
    { name: 'Horarios', to: '/app/schedule', icon: '🕒' },
    { name: 'Calendario', to: '/app/calendar', icon: '📅' },
    { name: 'Cursos', to: '/app/courses', icon: '📘' },
    { name: 'Perfil', to: '/app/profile', icon: '👤' },
    { name: 'QR Clases/Grupo', to: '/app/qr', icon: '🎫' },
    { name: 'QR Acceso libre', to: '/app/walkin-qr', icon: '🔓' },
  ]

  const coachNavigation = [
    { name: 'Alumnos', to: '/app', icon: '👥', end: true },
    { name: 'Asistencias', to: '/app/coach/asistencias', icon: '✅', end: true, badge: 'Nuevo' },
    { name: 'Check-in Manual', to: '/app/coach/checkin', icon: '✏️', end: true, badge: 'Nuevo' },
    { name: 'Pagos', to: '/app/coach/cobros-libre', icon: '💳', end: true },
    { name: 'Escanear QR', to: '/app/coach/scan', icon: '📷', end: true },
  ]

  const navigation = isAdmin
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
      <aside className="hidden w-64 shrink-0 flex-col overflow-hidden border-r border-[#d0dde2] bg-[#ecf3f7] p-3 shadow-lg shadow-[#c3d4dd]/60 md:flex">
        <div className="mb-4 flex shrink-0 items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow">
            <img
              src={logoSrc}
              alt={gymName}
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {gymName}
            </p>
            <p className="text-xs text-slate-500">
              Sistema de asistencias
            </p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-1 pr-0.5">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              end={item.end ?? item.to === '/app'}
              className={({ isActive }) =>
                classNames(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-700 hover:bg-white hover:text-slate-900',
                )
              }
            >
              <span>{item.name}</span>
              {item.badge && (
                <span className="rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-2 shrink-0 border-t border-[#d0dde2] pt-2">
          <p className="text-[10px] font-medium text-slate-500">Conectado</p>
          <p className="truncate text-xs font-semibold text-slate-800">
            {profile?.name || profile?.name || profile?.email || 'Usuario'}
          </p>
          {profile?.role && isAdmin && (
            <p className="text-[10px] capitalize text-slate-500">
              Rol: {profile.role}
            </p>
          )}
          <button
            type="button"
            className="btn-secondary mt-2 w-full px-2 py-1.5 text-[11px]"
            onClick={async () => {
              try {
                await signOut()
              } catch (error) {
                // eslint-disable-next-line no-console
                console.error('Error cerrando sesión', error)
              } finally {
                navigate('/', { replace: true })
              }
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="flex min-h-[56px] items-center justify-between border-b border-[#d0dde2] bg-white/90 px-5 py-4 shadow-sm backdrop-blur md:min-h-0 md:bg-[#f7fbfd] md:py-3 md:shadow-md md:shadow-[#c3d4dd]/60 md:px-6">
          <div className="flex flex-1 items-center gap-3 md:flex-initial">
            {/* Botón menú mobile: círculo a la izquierda del logo */}
            <button
              type="button"
              className="flex shrink-0 items-center justify-center p-2 text-slate-700 md:hidden"
              onClick={openMobileMenu}
            >
              <span className="sr-only">Abrir menú</span>
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 rounded bg-slate-700" />
                <span className="block h-0.5 w-4 rounded bg-slate-700" />
                <span className="block h-0.5 w-4 rounded bg-slate-700" />
              </span>
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow md:hidden">
              <img src={logoSrc} alt={gymName} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 md:hidden">
              <p className="text-sm font-semibold text-slate-800">
                {gymName}
              </p>
              <p className="text-xs text-slate-500">
                Sistema de asistencias
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <p className="hidden text-xs text-slate-500 sm:block">
              {profile?.name || profile?.name || profile?.email}
            </p>
            {/* Botón salir desktop */}
            <button
              type="button"
              className="btn-secondary hidden px-3 py-1 text-xs md:inline-flex"
              onClick={async () => {
                try {
                  await signOut()
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error('Error cerrando sesión', error)
                } finally {
                  navigate('/', { replace: true })
                }
              }}
            >
              Salir
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-28 md:px-6 md:pt-5 md:pb-12">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 min-w-0">
            {emailConfirmedNotice && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <div className="flex items-center justify-between gap-3">
                  <p>Email confirmado correctamente.</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
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
          className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200 md:hidden ${
            mobileAnimatingIn ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className={`fixed inset-y-0 left-0 w-64 bg-[#ecf3f7] p-4 shadow-2xl transition-transform duration-200 ease-out ${
              mobileAnimatingIn ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white shadow">
                  <img
                    src={logoSrc}
                    alt={gymName}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    {gymName}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Sistema de asistencias
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700"
                onClick={closeMobileMenu}
              >
                ×
              </button>
            </div>

            <nav className="mb-4 space-y-1">
              {navigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.to}
                  end={item.end ?? item.to === '/app'}
                  onClick={closeMobileMenu}
                  className={({ isActive }) =>
                    classNames(
                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium',
                      isActive
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-700 hover:bg-white hover:text-slate-900',
                    )
                  }
                >
                  <span>{item.name}</span>
                  {item.badge && (
                    <span className="rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-[#d0dde2] pt-3">
              <p className="text-[10px] font-medium text-slate-500">
                Conectado
              </p>
              <p className="truncate text-xs font-semibold text-slate-800">
                {profile?.name || profile?.name || profile?.email || 'Usuario'}
              </p>
              {profile?.role && isAdmin && (
                <p className="text-[10px] capitalize text-slate-500">
                  Rol: {profile.role}
                </p>
              )}
              <button
                type="button"
                className="btn-secondary mt-2 w-full px-2 py-1.5 text-[11px]"
                onClick={async () => {
                  try {
                    await signOut()
                  } catch (error) {
                    // eslint-disable-next-line no-console
                    console.error('Error cerrando sesión', error)
                  } finally {
                    closeMobileMenu()
                    navigate('/', { replace: true })
                  }
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

