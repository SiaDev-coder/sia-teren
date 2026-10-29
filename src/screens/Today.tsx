import { useEffect, useState } from 'react'
import { lastUsedProject } from '../db/repo'
import { Layout } from '../components/Layout'
import { IconPlus } from '../components/icons'
import { navigate } from '../router'
import { isoDate } from '../lib/format'

/** „Azi” = raportul de azi al ultimului proiect folosit (se deschide cel existent sau se creează). */
export function TodayScreen() {
  const [none, setNone] = useState(false)
  useEffect(() => {
    void lastUsedProject().then((p) => {
      if (p) navigate(`/proiect/${p.id}/raport/${isoDate()}`, { replace: true })
      else setNone(true)
    })
  }, [])
  return (
    <Layout title="Azi">
      {none && (
        <div className="empty">
          <h2>Niciun proiect activ</h2>
          <p>Raportul zilnic se completează pe un proiect. Creează întâi proiectul (șantierul).</p>
          <button className="btn primary big" onClick={() => navigate('/proiect/nou')}>
            <IconPlus /> Proiect nou
          </button>
        </div>
      )}
    </Layout>
  )
}
