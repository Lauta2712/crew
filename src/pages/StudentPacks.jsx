export function StudentPacksPage() {
  // Esta vista queda como alias de la de horarios,
  // para que ambos accesos muestren la misma información unificada.
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-slate-800">Packs de clases</h1>
        <p className="text-sm text-slate-500">
          Encontrá toda la información de horarios y packs en la pestaña{' '}
          <span className="font-semibold">Horarios</span>.
        </p>
      </div>
      <p className="text-sm text-slate-500">
        Usamos una sola vista unificada para que sea más simple ver qué packs existen y en qué
        días/horarios se cursan.
      </p>
    </div>
  )
}

