import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { setProjectArchived, softDelete, touchProject } from '../db/repo'
import { Layout } from '../components/Layout'
import { IconAlert, IconChevron, IconEdit, IconPdf, IconToday, IconTrash } from '../components/icons'
import { confirmDialog, toast } from '../components/ui'
import { navigate } from '../router'
import { isoDate, roDate, roLongDate } from '../lib/format'
import { isOverdue } from '../lib/findings'
import { CLOSED_STATUSES } from '../db/types'

const PAGE = 60

export function ProjectDetail({ id }: { id: string }) {
  const project = useLiveQuery(() => db.projects.get(id), [id])
  const reports = useLiveQuery(
    async () => (await db.reports.where('projectId').equals(id).toArray()).filter((r) => r.deletedAt === null).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [id],
  )
  const findings = useLiveQuery(async () => (await db.findings.where('projectId').equals(id).toArray()).filter((f) => f.deletedAt === null), [id])
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    void touchProject(id)
  }, [id])

  if (project === undefined) return <Layout title="Proiect" backTo="/">{null}</Layout>
  if (!project || project.deletedAt !== null)
    return (
      <Layout title="Proiect" backTo="/">
        <div className="empty">
          <h2>Proiectul nu există</h2>
          <p>Poate a fost șters. Verifică în Coș.</p>
        </div>
      </Layout>
    )

  const today = isoDate()
  const open = (findings ?? []).filter((f) => !CLOSED_STATUSES.includes(f.status)).length
  const overdue = (findings ?? []).filter((f) => isOverdue(f, today)).length

  return (
    <Layout title={project.name} backTo={project.archived ? '/arhiva' : '/'}>
      {project.archived === 1 && (
        <div className="banner warn">
          <span className="grow">Proiect arhivat.</span>
          <button className="btn dark" onClick={() => setProjectArchived(id, false)}>
            Scoate din arhivă
          </button>
        </div>
      )}
      <div className="quick">
        <a className="btn primary big" href={`#/proiect/${id}/raport/${today}`}>
          <IconToday /> Raportul de azi
        </a>
        <a className="btn big" href={`#/proiect/${id}/constatari`}>
          <IconAlert /> Constatări {open > 0 && <span className={`badge ${overdue ? 'danger' : ''}`}>{open}</span>}
        </a>
      </div>
      <div className="card">
        <dl className="kv">
          <dt>Beneficiar</dt>
          <dd>{project.beneficiary || '—'}</dd>
          <dt>Contract</dt>
          <dd>{project.contractNo || '—'}</dd>
          <dt>Lot (CL)</dt>
          <dd>{project.lot || '—'}</dd>
          <dt>Localitate</dt>
          <dd>{[project.locality, project.county && `jud. ${project.county}`].filter(Boolean).join(', ') || '—'}</dd>
          <dt>Antreprenor</dt>
          <dd>{project.contractor || '—'}</dd>
          <dt>Supervizor</dt>
          <dd>{project.supervisor || '—'}</dd>
          <dt>Început</dt>
          <dd>{project.startDate ? roDate(project.startDate) : '—'}</dd>
        </dl>
        <div className="row" style={{ marginTop: 12 }}>
          <a className="btn grow" href={`#/proiect/${id}/editare`}>
            <IconEdit /> Editează
          </a>
          <a className="btn grow" href={`#/proiect/${id}/export`}>
            <IconPdf /> PDF / CSV
          </a>
        </div>
      </div>

      <h2 style={{ fontSize: 19, margin: '18px 0 8px' }}>Rapoarte zilnice {reports && <span className="count">({reports.length})</span>}</h2>
      {reports && reports.length === 0 && (
        <div className="empty">
          <p>Niciun raport încă. Apasă „Raportul de azi” ca să începi.</p>
        </div>
      )}
      <ul className="list" aria-label="Rapoarte zilnice">
        {(reports ?? []).slice(0, limit).map((r) => (
          <li key={r.id}>
            <a className="list-item" href={`#/proiect/${id}/raport/${r.date}`}>
              <div className="main">
                <div className="title">{roLongDate(r.date)}</div>
                <div className="meta">
                  {r.personnel.reduce((s, p) => s + (p.count ?? 0), 0)} persoane · {r.activities.length} activități
                </div>
              </div>
              <span className={`badge ${r.status === 'final' ? 'ok' : 'warn'}`}>{r.status === 'final' ? 'Finalizat' : 'Ciornă'}</span>
              <IconChevron className="chev" width={22} />
            </a>
          </li>
        ))}
      </ul>
      {reports && reports.length > limit && (
        <button className="btn block more-btn" onClick={() => setLimit((l) => l + PAGE)}>
          Arată mai multe ({reports.length - limit} rămase)
        </button>
      )}

      <div className="row" style={{ marginTop: 24 }}>
        <button
          className="btn grow"
          onClick={async () => {
            const arch = project.archived === 0
            if (arch && !(await confirmDialog({ title: 'Arhivezi proiectul?', message: 'Proiectul dispare din lista principală; îl găsești la Mai mult → Proiecte arhivate.', confirmLabel: 'Arhivează' })))
              return
            await setProjectArchived(id, arch)
            toast(arch ? 'Proiect arhivat.' : 'Proiect scos din arhivă.', 'ok')
            if (arch) navigate('/')
          }}
        >
          {project.archived === 0 ? 'Arhivează' : 'Scoate din arhivă'}
        </button>
        <button
          className="btn danger grow"
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Ștergi proiectul?',
              message: 'Proiectul, cu rapoartele, constatările și fotografiile lui, ajunge în Coș. Poate fi recuperat 30 de zile.',
              confirmLabel: 'Șterge proiectul',
              danger: true,
            })
            if (!ok) return
            await softDelete('projects', id)
            toast('Proiectul a fost mutat în Coș.')
            navigate('/')
          }}
        >
          <IconTrash /> Șterge
        </button>
      </div>
    </Layout>
  )
}
