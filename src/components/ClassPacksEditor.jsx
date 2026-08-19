function slugify(name, existingIds) {
  let base = String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes tras normalize('NFD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base) base = 'pack'
  let id = base
  let n = 2
  while (existingIds.includes(id)) {
    id = `${base}_${n}`
    n++
  }
  return id
}

/**
 * Editor visual de packs de clases (sin JSON). Misma forma que guarda gym_settings.classPacks
 * en modo 'custom': array completo de { id, name, price, classes_per_month, unlimited }.
 * @param {{ value: Array<{ id: string, name: string, price: number|null, classes_per_month: number, unlimited?: boolean }>, onChange: (next: typeof value) => void }} props
 */
export function ClassPacksEditor({ value, onChange }) {
  const updatePack = (index, patch) => {
    onChange(value.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const removePack = (index) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const addPack = () => {
    const id = slugify('Pack nuevo', value.map((p) => p.id))
    onChange([
      ...value,
      { id, name: 'Pack nuevo', price: 0, classes_per_month: 1, unlimited: false },
    ])
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Definí los packs que ven los alumnos: nombre, precio y clases incluidas por mes. Marcá
        «Ilimitado» para un plan sin tope de clases (ej. mensualidad libre).
      </p>
      {value.map((pack, i) => (
        <div
          key={pack.id}
          className="rounded-xl border border-line bg-bg/80 p-3 shadow-sm sm:p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
            <label className="min-w-0 flex-1">
              <span className="text-xs font-medium text-muted">Nombre del pack</span>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm font-medium text-ink"
                value={pack.name}
                onChange={(e) => updatePack(i, { name: e.target.value })}
              />
            </label>
            <span
              className="shrink-0 rounded bg-surface-2/80 px-2 py-0.5 font-mono text-[10px] text-muted"
              title="No editable: lo usa el sistema"
            >
              id: {pack.id}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-950/40"
              onClick={() => removePack(i)}
            >
              Eliminar pack
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="text-[11px] font-medium text-muted">Precio (ARS)</span>
              <input
                type="number"
                min={0}
                className="mt-0.5 w-full rounded-md border border-line px-2 py-1.5 text-sm"
                value={pack.price ?? ''}
                onChange={(e) => updatePack(i, { price: e.target.value })}
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="text-[11px] font-medium text-muted">Clases por mes</span>
              <input
                type="number"
                min={0}
                className="mt-0.5 w-full rounded-md border border-line px-2 py-1.5 text-sm disabled:opacity-40"
                value={pack.classes_per_month ?? ''}
                disabled={!!pack.unlimited}
                onChange={(e) => updatePack(i, { classes_per_month: e.target.value })}
              />
            </label>
            <label className="flex shrink-0 items-center gap-1.5 pb-1.5 text-xs font-medium text-muted">
              <input
                type="checkbox"
                checked={!!pack.unlimited}
                onChange={(e) => updatePack(i, { unlimited: e.target.checked })}
              />
              Ilimitado
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="w-full rounded-xl border border-dashed border-line px-3 py-2.5 text-sm font-medium text-muted hover:border-brand-400 hover:text-brand-400"
        onClick={addPack}
      >
        + Agregar pack
      </button>
    </div>
  )
}
