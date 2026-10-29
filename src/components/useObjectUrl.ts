import { useEffect, useState } from 'react'

/** URL temporar pentru un Blob (fotografie, audio), eliberat automat când nu mai e folosit. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = blob ? URL.createObjectURL(blob) : null
    // sincronizare cu o resursă externă (URL-ul obiectului), nu stare derivată
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u)
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [blob])
  return url
}
