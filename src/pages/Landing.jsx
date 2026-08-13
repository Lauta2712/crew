import { Link } from 'react-router-dom'
import cruxLogo from '../../crux_logo.jpg'
import { GYM_DISPLAY_NAME, THEME_LOGO_URL } from '../constants/gym'

const logoSrc = THEME_LOGO_URL || cruxLogo

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#f4fbfc] text-slate-800">
      <header className="shrink-0 border-b border-[#d0dde2] bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white shadow sm:h-10 sm:w-10 sm:rounded-xl">
              <img
                src={logoSrc}
                alt={GYM_DISPLAY_NAME}
                className="h-full w-full object-cover"
              />
            </div>
            <p className="hidden text-sm font-semibold text-slate-800 md:block">
              {GYM_DISPLAY_NAME}{' '}
              <span className="text-xs font-normal text-slate-500">
                · Acceso libre · Escuela · Entrenamiento
              </span>
            </p>
          </div>
          <div className="flex justify-end">
            <Link
              to="/login"
              className="btn-primary px-4 py-1.5 text-xs md:px-6 md:py-2 md:text-sm md:rounded-full"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col justify-center px-4 py-3 sm:py-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:gap-5">
          <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="min-w-0 space-y-1.5">
              <h1 className="text-xl font-semibold leading-tight text-slate-900 sm:text-2xl">
                Escalá en {GYM_DISPLAY_NAME}: entrená, aprendé, disfrutá.
              </h1>
              <p className="max-w-2xl text-xs leading-snug text-slate-600 sm:text-sm">
                Packs flexibles: acceso libre, escuela adultos, entrenamiento y
                escuela infantil.
              </p>
            </div>
            {/* <a
              href="#packs"
              className="btn-secondary w-fit shrink-0 self-start text-[11px] sm:self-end sm:text-xs"
            >
              Ver packs y precios
            </a> */}
          </section>

          <section id="packs" className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Packs principales
            </h2>
            <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
              <div className="card !p-3 sm:!p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Acceso libre
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 sm:mt-1.5 sm:text-xs">
                  Escalada por cuenta propia en el sector abierto.
                </p>
                <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-slate-600 sm:text-xs">
                  <li>· Horarios de acceso libre habilitado.</li>
                  <li>· Ideal con experiencia.</li>
                </ul>
              </div>

              <div className="card !p-3 sm:!p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Escuela para adultos
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 sm:mt-1.5 sm:text-xs">
                  Clases guiadas desde cero o para mejorar técnica.
                </p>
                <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-slate-600 sm:text-xs">
                  <li>· Grupos reducidos.</li>
                  <li>· Técnica, seguridad y progresión.</li>
                </ul>
              </div>

              <div className="card !p-3 sm:!p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Grupo de entrenamiento
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 sm:mt-1.5 sm:text-xs">
                  Planificación y carga para potenciar rendimiento.
                </p>
                <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-slate-600 sm:text-xs">
                  <li>· Cargas semanales.</li>
                  <li>· Seguimiento por entrenador.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-1 border-t border-[#d0dde2]/80 pt-2 sm:space-y-1.5 sm:pt-3">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Escuela de escalada para niños
            </h2>
            <p className="text-[11px] leading-snug text-slate-600 sm:text-sm">
              Clases lúdicas y seguras — coordinación, confianza y equipo.
            </p>
            <ul className="flex flex-col gap-0.5 text-[10px] leading-snug text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:text-xs">
              <li>· Horarios según temporada.</li>
              <li>· Grupos por edad y costos: consultar.</li>
              <li>· Cupos limitados.</li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="shrink-0 border-t border-[#d0dde2] bg-white/80 px-4 py-2 text-center text-[10px] text-slate-500 sm:text-[11px]">
        Desarrollado por{' '}
        <a
          href="https://www.pulsostudio.site/"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand-600 underline-offset-2 hover:underline"
        >
          Pulso Studio
        </a>
      </footer>
    </div>
  )
}

