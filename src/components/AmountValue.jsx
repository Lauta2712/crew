import { useAmountVisibility } from '../hooks/useAmountVisibility'

/** Envuelve un monto ya formateado ($1.234) — lo reemplaza por puntos cuando el ojo está tildado. */
export function AmountValue({ children, mask = '••••••' }) {
  const { amountsHidden } = useAmountVisibility()
  if (amountsHidden) {
    return <span aria-hidden="true">{mask}</span>
  }
  return children
}
