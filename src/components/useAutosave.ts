import { useCallback, useRef, useState } from 'react'
import { toast, errorMessage } from './ui'

export type SaveState = 'saved' | 'saving' | 'error'

/**
 * Salvare automată imediată: la fiecare modificare se scriu în IndexedDB câmpurile schimbate,
 * în același moment (fără așteptare), ca nimic să nu se piardă la închidere, apel sau reîncărcare.
 * IndexedDB păstrează ordinea scrierilor pe același tabel. Dacă salvarea întoarce o înregistrare
 * (ex. raportul zilei creat între timp în altă fereastră, în care s-a combinat modificarea),
 * editorul continuă cu aceea.
 */
export function useAutosave<T extends object>(initial: T, save: (patch: Partial<T>, full: T) => Promise<T | void>) {
  const [value, setValueState] = useState<T>(initial)
  const [state, setState] = useState<SaveState>('saved')
  const ref = useRef<T>(initial)
  const inFlight = useRef(0)
  const last = useRef<Promise<void>>(Promise.resolve())

  const write = useCallback(
    (patch: Partial<T>, full: T) => {
      inFlight.current++
      setState('saving')
      const p = save(patch, full).then(
        (adopted) => {
          if (adopted) {
            ref.current = { ...ref.current, ...adopted }
            setValueState(ref.current)
          }
          inFlight.current--
          if (inFlight.current === 0) setState('saved')
        },
        (e) => {
          inFlight.current--
          setState('error')
          toast(errorMessage(e), 'error')
        },
      )
      last.current = p
      return p
    },
    [save],
  )

  const update = useCallback(
    (patch: Partial<T>) => {
      ref.current = { ...ref.current, ...patch }
      setValueState(ref.current)
      void write(patch, ref.current)
    },
    [write],
  )

  /** Înlocuiește valoarea locală fără a o scrie (ex. după o modificare făcută direct în baza de date). */
  const setValue = useCallback((v: T) => {
    ref.current = v
    setValueState(v)
  }, [])

  /** Așteaptă terminarea tuturor scrierilor pornite. */
  const flush = useCallback(async () => {
    await last.current
  }, [])

  /** Scrie valoarea curentă chiar dacă nu s-a modificat nimic (ex. ca raportul să existe înainte de o fotografie). */
  const saveNow = useCallback(() => write({}, ref.current), [write])

  return { value, setValue, update, flush, saveNow, state, current: ref }
}
