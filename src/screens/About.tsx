import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'

export function AboutScreen() {
  const [lic, setLic] = useState<string | null>(null)
  useEffect(() => {
    void import('../../THIRD-PARTY-LICENSES.md?raw').then((m) => setLic(m.default))
  }, [])
  return (
    <Layout title="Despre" backTo="/mai-mult">
      <div className="card stack">
        <h2 style={{ fontSize: 20 }}>SIA Teren</h2>
        <p>
          Versiunea <strong data-testid="app-version">{__APP_VERSION__}</strong>
        </p>
        <p className="small">
          Jurnal de șantier offline pentru lucrări de apă-canal: rapoarte zilnice (evidența personalului și utilajelor, FIDIC Sub-Clauza 6.10), constatări, fotografii cu adnotări, note vocale transcrise pe telefon și rapoarte PDF.
        </p>
        <p className="small">
          <strong>Confidențialitate:</strong> toate datele rămân pe acest telefon. Aplicația nu are conturi, server, statistici sau trackere. Singura descărcare de pe internet după instalare este modelul vocal, doar când apeși „Descarcă”.
        </p>
      </div>
      <div className="card">
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>Licențele componentelor folosite</h2>
        {lic === null ? <p className="muted">Se încarcă…</p> : <pre className="licenses" data-testid="licenses">{lic}</pre>}
      </div>
    </Layout>
  )
}
