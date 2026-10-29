import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { activeProjects, touchProject } from '../db/repo'
import { FINDING_STATUSES, SEVERITIES, CLOSED_STATUSES, type Finding } from '../db/types'
import { Layout } from '../components/Layout'
import { IconChevron, IconPdf, IconPlus, IconDownload } from '../components/icons'
import { SelectField, toast, errorMessage } from '../components/ui'
import { navigate, useQuery } from '../router'
import { isoDate, roCount, roDate } from '../lib/format'
import { isOverdue } from '../lib/findings'
import { shareOrDownload, safeFilename } from '../lib/share'
import { findingsCsv } from '../lib/csv'

const PAGE = 60

/** Tab-ul „Constatări”: deschide constatările ultimului proiect folosit. */
export function FindingsTab() {
  const projects = useLiveQuery(activeProjects, [])
  useEffect(() => {
    if (projects && projects.length) navigate(`/proiect/${projects[0].id}/constatari`, { replace: true })
  }, [projects])
  if (projects && projects.length === 0)
    return (
      <Layout title="Constatări">
        <div className="empty">
          <h2>Niciun proiect activ</h2>
          <p>Constatările se înregistrează pe proiect. Creează întâi un proiect.</p>
          <button className="btn primary big" onClick={() => navigate('/proiect/nou')}>
            <IconPlus /> Proiect nou
          </button>
        </div>
      </Layout>
    )
  return <Layout title="Constatări">{null}</Layout>
}

type StatusFilter = 'toate' | 'neînchise' | (typeof FINDING_STATUSES)[number]

export function FindingsList({ projectId }: { projectId: string }) {
  const q = useQuery()
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const projects = useLiveQuery(activeProjects, [])
  const findings = useLiveQuery(
    async () => (await db.findings.where('projectId').equals(projectId).toArray()).filter((f) => f.deletedAt === null),
    [projectId],
  )
  const [status, setStatus] = useState<StatusFilter>(() => {
    const st = q.get('stare')
    return st && (['toate', 'neînchise', ...FINDING_STATUSES] as string[]).includes(st) ? (st as StatusFilter) : 'neînchise'
  })
  const [severity, setSeverity] = useState<string>('toate')
  const [responsible, setResponsible] = useState<string>('toți')
  const [overdueOnly, setOverdueOnly] = useState(q.get('depasite') === '1')
  const [limit, setLimit] = useState(PAGE)
  const [busy, setBusy] = useState(false)
  const today = isoDate()

  useEffect(() => {
    void touchProject(projectId)
  }, [projectId])

  const responsibles = useMemo(() => [...new Set((findings ?? []).map((f) => f.responsible.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')), [findings])

  const filtered = useMemo(() => {
    const sevRank = { critică: 0, majoră: 1, minoră: 2 } as const
    return (findings ?? [])
      .filter((f) => (status === 'toate' ? true : status === 'neînchise' ? !CLOSED_STATUSES.includes(f.status) : f.status === status))
      .filter((f) => severity === 'toate' || f.severity === severity)
      .filter((f) => responsible === 'toți' || f.responsible.trim() === responsible)
      .filter((f) => !overdueOnly || isOverdue(f, today))
      .sort((a, b) => {
        const oa = isOverdue(a, today) ? 0 : 1
        const ob = isOverdue(b, today) ? 0 : 1
        if (oa !== ob) return oa - ob
        if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity]
        return b.createdAt - a.createdAt
      })
  }, [findings, status, severity, responsible, overdueOnly, today])

  const filterDesc = [
    `stare: ${status}`,
    severity !== 'toate' && `gravitate: ${severity}`,
    responsible !== 'toți' && `responsabil: ${responsible}`,
    overdueOnly && 'doar depășite',
  ]
    .filter(Boolean)
    .join(', ')

  if (project === undefined) return <Layout title="Constatări">{null}</Layout>
  if (!project || project.deletedAt !== null)
    return (
      <Layout title="Constatări" backTo="/">
        <div className="empty">
          <h2>Proiectul nu există</h2>
        </div>
      </Layout>
    )

  const overdueCount = (findings ?? []).filter((f) => isOverdue(f, today)).length

  return (
    <Layout
      title="Constatări"
      backTo={`/proiect/${projectId}`}
      fab={
        <button className="fab" onClick={() => navigate(`/proiect/${projectId}/constatare/noua`)} aria-label="Constatare nouă">
          <IconPlus /> Constatare
        </button>
      }
    >
      {projects && projects.length > 1 && (
        <SelectField
          label="Proiect"
          value={projectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(v) => navigate(`/proiect/${v}/constatari`, { replace: true })}
        />
      )}
      {projects && projects.length <= 1 && <p className="muted" style={{ marginTop: 0 }}>{project.name}</p>}
      {overdueCount > 0 && (
        <div className="banner danger" role="alert">
          <span className="grow">
            <strong>{roCount(overdueCount, 'constatare', 'constatări')}</strong> {overdueCount === 1 ? 'are' : 'au'} termenul depășit.
          </span>
          {!overdueOnly && (
            <button className="btn danger" onClick={() => setOverdueOnly(true)}>
              Arată-le
            </button>
          )}
        </div>
      )}
      <details className="section">
        <summary>
          Filtre <span className="count">{filterDesc}</span>
        </summary>
        <div className="body">
          <SelectField<StatusFilter> label="Stare" name="f-stare" value={status} options={['neînchise', 'toate', ...FINDING_STATUSES]} onChange={setStatus} />
          <SelectField label="Gravitate" name="f-gravitate" value={severity} options={['toate', ...SEVERITIES]} onChange={setSeverity} />
          <SelectField label="Responsabil" name="f-responsabil" value={responsible} options={['toți', ...responsibles]} onChange={setResponsible} />
          <label className="chip">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            <span>Doar depășite (termen trecut, neînchise)</span>
          </label>
        </div>
      </details>

      {findings && findings.length === 0 ? (
        <div className="empty">
          <h2>Nicio constatare</h2>
          <p>Înregistrează neconformitățile găsite pe șantier, cu fotografii „înainte” și „după”, responsabil și termen.</p>
          <button className="btn primary big" onClick={() => navigate(`/proiect/${projectId}/constatare/noua`)}>
            <IconPlus /> Prima constatare
          </button>
        </div>
      ) : (
        <>
          <p className="muted small" aria-live="polite">
            {filtered.length} din {findings?.length ?? 0} constatări
          </p>
          <ul className="list" aria-label="Constatări">
            {filtered.slice(0, limit).map((f) => (
              <FindingItem key={f.id} f={f} overdue={isOverdue(f, today)} />
            ))}
          </ul>
          {filtered.length > limit && (
            <button className="btn block more-btn" onClick={() => setLimit((l) => l + PAGE)}>
              Arată mai multe ({filtered.length - limit} rămase)
            </button>
          )}
          <div className="grid2" style={{ marginTop: 16 }}>
            <button
              className="btn dark"
              disabled={busy || !filtered.length}
              onClick={async () => {
                setBusy(true)
                try {
                  const { findingsPdf } = await import('../lib/pdf')
                  const { blob, filename } = await findingsPdf(project, filtered, filterDesc)
                  const r = await shareOrDownload(blob, filename, `Constatări ${project.name}`)
                  if (r === 'downloaded') toast('PDF-ul a fost descărcat.', 'ok')
                } catch (e) {
                  toast(errorMessage(e), 'error')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <IconPdf /> {busy ? 'Se generează…' : 'PDF listă'}
            </button>
            <button
              className="btn"
              disabled={!filtered.length}
              onClick={async () => {
                const csv = findingsCsv(project, filtered)
                const r = await shareOrDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `Constatari_${safeFilename(project.name)}_${roDate(today)}.csv`, 'Constatări CSV')
                if (r === 'downloaded') toast('CSV descărcat.', 'ok')
              }}
            >
              <IconDownload /> CSV
            </button>
          </div>
        </>
      )}
    </Layout>
  )
}

function FindingItem({ f, overdue }: { f: Finding; overdue: boolean }) {
  const sevClass = f.severity === 'critică' ? 'danger' : f.severity === 'majoră' ? 'warn' : ''
  return (
    <li>
      <a className={`list-item ${overdue ? 'overdue' : ''}`} href={`#/constatare/${f.id}`}>
        <div className="main">
          <div className="title">{f.title || '(fără titlu)'}</div>
          <div className="meta">
            {f.status}
            {f.responsible && ` · ${f.responsible}`}
            {f.dueDate && ` · termen ${roDate(f.dueDate)}`}
          </div>
          <div className="row" style={{ marginTop: 4, gap: 6 }}>
            <span className={`badge ${sevClass}`}>{f.severity}</span>
            <span className="badge">{f.category}</span>
            {overdue && <span className="badge danger">Depășit</span>}
          </div>
        </div>
        <IconChevron className="chev" width={22} />
      </a>
    </li>
  )
}
