import { useCallback, useState } from 'react'

/**
 * Ciornă pentru formularele de creare (proiect nou, constatare nouă): ce ai scris rămâne
 * dacă aplicația se închide înainte de „Salvează”. Se șterge după salvare.
 */
export function useDraft<T>(key: string | null, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...initial, ...(JSON.parse(raw) as T) } : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        if (key)
          try {
            localStorage.setItem(key, JSON.stringify(v))
          } catch {
            /* stocare indisponibilă: formularul merge oricum */
          }
        return v
      })
    },
    [key],
  )
  const clear = useCallback(() => {
    if (key)
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignorăm */
      }
  }, [key])
  return [value, set, clear] as const
}
