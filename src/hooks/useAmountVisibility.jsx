import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'crew_amounts_hidden'

const AmountVisibilityContext = createContext(null)

function readInitialValue() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function AmountVisibilityProvider({ children }) {
  const [amountsHidden, setAmountsHidden] = useState(readInitialValue)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, amountsHidden ? '1' : '0')
    } catch {
      // localStorage no disponible (modo privado, etc.) — el toggle sigue funcionando en memoria.
    }
  }, [amountsHidden])

  const toggleAmountsHidden = () => setAmountsHidden((v) => !v)

  return (
    <AmountVisibilityContext.Provider value={{ amountsHidden, toggleAmountsHidden }}>
      {children}
    </AmountVisibilityContext.Provider>
  )
}

export function useAmountVisibility() {
  const ctx = useContext(AmountVisibilityContext)
  if (!ctx) {
    throw new Error('useAmountVisibility debe usarse dentro de AmountVisibilityProvider')
  }
  return ctx
}
