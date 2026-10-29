import type { GpsFix } from '../db/types'

export type GpsResult = { ok: true; fix: GpsFix } | { ok: false; reason: string }

/** Poziția curentă (merge fără internet, poate dura). Timeout 20 s. */
export function getPosition(timeoutMs = 20000): Promise<GpsResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ok: false, reason: 'Telefonul nu oferă localizare GPS în acest browser.' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          fix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            at: pos.timestamp || Date.now(),
          },
        }),
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? 'Accesul la locație este refuzat. Poți salva fără GPS sau poți permite locația din setările telefonului.'
            : err.code === err.TIMEOUT
              ? 'Nu s-a obținut poziția GPS în 20 de secunde. Încearcă în aer liber sau salvează fără GPS.'
              : 'Poziția GPS nu este disponibilă acum. Poți salva fără GPS.'
        resolve({ ok: false, reason })
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    )
  })
}
