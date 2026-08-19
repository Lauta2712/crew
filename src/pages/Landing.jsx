import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { CrewPricingSection } from '../components/CrewPricingSection'
import { GYM_DISPLAY_NAME, THEME_LOGO_URL } from '../constants/gym'

export function LandingPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
      <header className="shrink-0 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded bg-surface sm:h-10 sm:w-10">
              <BrandMark src={THEME_LOGO_URL} alt={GYM_DISPLAY_NAME} />
            </div>
            <p className="hidden font-display text-sm font-bold uppercase tracking-wide text-ink md:block">
              {GYM_DISPLAY_NAME}
            </p>
          </div>
          <Link
            to="/login"
            className="btn-primary px-4 py-1.5 text-xs md:px-6 md:py-2 md:text-sm"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 py-3 sm:py-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 lg:gap-6">
          <section className="relative isolate space-y-3">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -left-4 -z-10 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl sm:h-72 sm:w-72"
            />
            <p className="animate-fade-rise font-mono text-[11px] uppercase tracking-[0.2em] text-brand-500">
              QR · Clases · Pagos
            </p>
            <h1 className="animate-fade-rise animate-delay-1 max-w-3xl font-display text-3xl font-bold uppercase leading-[1.05] text-ink sm:text-4xl">
              Entrená en {GYM_DISPLAY_NAME}. Todo en un solo lugar.
            </h1>
          </section>

          <section
            id="funciones"
            className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2"
          >
            <div className="animate-fade-rise animate-delay-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 bg-brand-500" />
              <p className="text-xs font-medium text-ink sm:text-sm">
                Check-in con QR, sin filas
              </p>
            </div>
            <div className="animate-fade-rise animate-delay-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 bg-brand-500" />
              <p className="text-xs font-medium text-ink sm:text-sm">
                Tu plan y clases, siempre a la vista
              </p>
            </div>
            <div className="animate-fade-rise animate-delay-4 flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 bg-brand-500" />
              <p className="text-xs font-medium text-ink sm:text-sm">
                Pagos ordenados, sin planillas
              </p>
            </div>
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

      <footer className="shrink-0 px-4 py-3 text-center text-[10px] text-muted sm:text-[11px]">
        Desarrollado por{' '}
        <a
          href="https://www.pulsostudio.site/"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-accent-500 underline-offset-2 hover:underline"
        >
          Pulso Studio
        </a>
      </footer>
    </div>
  )
}

