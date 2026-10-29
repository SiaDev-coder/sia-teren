import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import { Layout } from '../components/Layout'
import { IconChevron, IconPlus } from '../components/icons'
import { navigate } from '../router'
import { roDateFromTs } from '../lib/format'
import { InstallBanner } from './Install'
import { backupReminderDue } from '../lib/reminder'

const PAGE = 60

export function ProjectsScreen({ archived = false }: { archived?: boolean }) {
  const projects = useLiveQuery(async () => {
    const all = await db.projects.toArray()
    return all.filter((p) => p.deletedAt === null && p.archived === (archived ? 1 : 0)).sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  }, [archived])
  const settings = useSettings()
  const [limit, setLimit] = useState(PAGE)
  const firstDataAt = useLiveQuery(async () => {
    const all = await db.projects.toArray()
    return all.length ? Math.min(...all.map((p) => p.createdAt)) : null
  }, [])
  const needBackup =
    !archived && !!settings && backupReminderDue(settings.lastBackupAt, settings.lastDataChangeAt, firstDataAt ?? null)

  return (
    <Layout
      title={archived ? 'Proiecte arhivate' : 'Proiecte'}
      backTo={archived ? '/mai-mult' : undefined}
      fab={
        !archived && (
          <button className="fab" onClick={() => navigate('/proiect/nou')} aria-label="Proiect nou">
            <IconPlus /> Proiect
          </button>
        )
      }
    >
      {!archived && <InstallBanner />}
      {needBackup && (
        <div className="banner warn" role="alert">
          <span className="grow">
            {settings?.lastBackupAt ? `Ultima copie de siguranță: ${roDateFromTs(settings.lastBackupAt)}.` : 'Nu ai făcut încă nicio copie de siguranță.'} Datele stau doar pe acest telefon.
          </span>
          <a className="btn dark" href="#/backup">
            Fă o copie acum
          </a>
        </div>
      )}
      {projects === undefined ? null : projects.length === 0 ? (
        <div className="empty">
          <h2>{archived ? 'Niciun proiect arhivat' : 'Niciun proiect încă'}</h2>
          {!archived && (
            <>
              <p>Începe prin a crea proiectul (șantierul) pe care lucrezi. Apoi completezi raportul zilnic, constatările și fotografiile.</p>
              <button className="btn primary big" onClick={() => navigate('/proiect/nou')}>
                <IconPlus /> Creează primul proiect
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="list" aria-label="Proiecte">
            {projects.slice(0, limit).map((p) => (
              <li key={p.id}>
                <a className="list-item" href={`#/proiect/${p.id}`}>
                  <div className="main">
                    <div className="title">{p.name}</div>
                    <div className="meta">
                      {[p.contractNo && `Contract ${p.contractNo}`, p.lot && `Lot ${p.lot}`, p.locality].filter(Boolean).join(' · ') || 'Fără detalii'}
                    </div>
                  </div>
                  <IconChevron className="chev" width={22} />
                </a>
              </li>
            ))}
          </ul>
          {projects.length > limit && (
            <button className="btn block more-btn" onClick={() => setLimit((l) => l + PAGE)}>
              Arată mai multe ({projects.length - limit} rămase)
            </button>
          )}
        </>
      )}
    </Layout>
  )
}

