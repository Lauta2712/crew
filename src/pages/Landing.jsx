import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { CrewPricingSection } from '../components/CrewPricingSection'
import { GYM_DISPLAY_NAME, THEME_LOGO_URL } from '../constants/gym'

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#f4fbfc] text-slate-800">
      <header className="shrink-0 border-b border-[#d0dde2] bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white shadow sm:h-10 sm:w-10 sm:rounded-xl">
              <BrandMark src={THEME_LOGO_URL} alt={GYM_DISPLAY_NAME} />
            </div>
            <p className="hidden text-sm font-semibold text-slate-800 md:block">
              {GYM_DISPLAY_NAME}{' '}
              <span className="text-xs font-normal text-slate-500">
                · Asistencia · Clases · Pagos
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
                Entrená en {GYM_DISPLAY_NAME}: asistencia, clases y pagos en un solo lugar.
              </h1>
              <p className="max-w-2xl text-xs leading-snug text-slate-600 sm:text-sm">
                Reservá tu lugar, seguí tus clases y pagá tu plan — todo desde acá.
              </p>
            </div>
          </section>

          <section id="funciones" className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Todo en un solo lugar
            </h2>
            <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
              <div className="card !p-3 sm:!p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Check-in con QR
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 sm:mt-1.5 sm:text-xs">
                  Escaneás tu QR al entrar, sin filas ni planillas en papel.
                </p>
              </div>

              <div className="card !p-3 sm:!p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Tu plan, siempre a la vista
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 sm:mt-1.5 sm:text-xs">
                  Cuántas clases te quedan y cuándo vence tu pack, sin preguntar.
                </p>
              </div>

              <div className="card !p-3 sm:!p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Pagos ordenados
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 sm:mt-1.5 sm:text-xs">
                  Registrá y consultá tus pagos sin vueltas.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-1 border-t border-[#d0dde2]/80 pt-2 sm:space-y-1.5 sm:pt-3">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Pensado para gimnasios boutique
            </h2>
            <p className="text-[11px] leading-snug text-slate-600 sm:text-sm">
              Escalada, crossfit, yoga, funcional o tu propio gimnasio — Crew se adapta a
              cómo trabajás vos, no al revés.
            </p>
          </section>

          {/*
            De acá para abajo: precios del PRODUCTO Crew (para dueños de gimnasio que
            quieren contratar el software), no de este gimnasio en particular. Sección
            temporal acá por decisión explícita — cuando exista una landing propia del
            producto (Fase 4 de docs/ROADMAP_WHITELABEL.md), esto se muda para allá.
          */}
          <CrewPricingSection />
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

