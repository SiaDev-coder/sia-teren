import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { activeProjects } from '../db/repo'
import { Layout } from '../components/Layout'
import { SelectField, TextField, toast, errorMessage } from '../components/ui'
import { IconDownload, IconPdf } from '../components/icons'
import { addDays, isoDate, roCount, roDate } from '../lib/format'
import { reportsCsv } from '../lib/csv'
import { shareOrDownload, safeFilename } from '../lib/share'
import { navigate } from '../router'

export function ExportScreen({ projectId }: { projectId?: string }) {
  const projects = useLiveQuery(activeProjects, [])
  const [chosen, setChosen] = useState<string | null>(projectId ?? null)
  const pid = chosen ?? projects?.[0]?.id ?? ''
  const project = useLiveQuery(() => (pid ? db.projects.get(pid) : undefined), [pid])
  const [from, setFrom] = useState(addDays(isoDate(), -6))
  const [to, setTo] = useState(isoDate())
  const [busy, setBusy] = useState(false)
  const count = useLiveQuery(
    async () => (pid ? (await db.reports.where('projectId').equals(pid).toArray()).filter((r) => r.deletedAt === null && r.date >= from && r.date <= to).length : 0),
    [pid, from, to],
  )

  if (projects && projects.length === 0 && !projectId)
    return (
      <Layout title="Rapoarte PDF și CSV" backTo="/mai-mult">
        <div className="empty">
          <h2>Niciun proiect activ</h2>
          <p>Creează un proiect și completează rapoarte zilnice ca să poți exporta.</p>
        </div>
      </Layout>
    )

  const validRange = from && to && from <= to
  return (
    <Layout title="Rapoarte PDF și CSV" backTo={projectId ? `/proiect/${projectId}` : '/mai-mult'}>
      <div className="card">
        {!projectId && projects && (
          <SelectField label="Proiect" value={pid} options={projects.map((p) => ({ value: p.id, label: p.name }))} onChange={setChosen} />
        )}
        {project && projectId && <p style={{ marginTop: 0 }}><strong>{project.name}</strong></p>}
        <div className="grid2">
          <TextField label="De la" type="date" name="from" value={from} onChange={setFrom} />
          <TextField label="Până la" type="date" name="to" value={to} onChange={setTo} />
        </div>
        <p className="muted small" aria-live="polite">
          {validRange ? `${count ?? 0} rapoarte zilnice în interval.` : 'Intervalul nu este valid.'}
        </p>
        <div className="stack">
          <button
            className="btn dark big block"
            disabled={busy || !validRange || !count}
            onClick={async () => {
              setBusy(true)
              try {
                const { periodReportPdf } = await import('../lib/pdf')
                const { blob, filename } = await periodReportPdf(pid, from, to)
                const r = await shareOrDownload(blob, filename, 'Raport pe perioadă')
                if (r === 'downloaded') toast('PDF-ul a fost descărcat.', 'ok')
              } catch (e) {
                toast(errorMessage(e), 'error')
              } finally {
                setBusy(false)
              }
            }}
          >
            <IconPdf /> {busy ? 'Se generează PDF-ul…' : 'PDF raport pe perioadă'}
          </button>
          <button
            className="btn block"
            disabled={!validRange || !count || !project}
            onClick={async () => {
              if (!project) return
              const reports = (await db.reports.where('projectId').equals(pid).toArray()).filter((r) => r.deletedAt === null && r.date >= from && r.date <= to)
              const csv = reportsCsv(project, reports)
              const r = await shareOrDownload(
                new Blob([csv], { type: 'text/csv;charset=utf-8' }),
                `Rapoarte_${safeFilename(project.name)}_${roDate(from)}-${roDate(to)}.csv`,
                'Rapoarte zilnice CSV',
              )
              if (r === 'downloaded') toast('CSV descărcat.', 'ok')
            }}
          >
            <IconDownload /> CSV rapoarte zilnice (Excel)
          </button>
          <button
            className="btn block"
            disabled={busy || !validRange || !pid}
            onClick={async () => {
              setBusy(true)
              try {
                const { photosZip } = await import('../lib/photoZip')
                const { blob, filename, count: n } = await photosZip(pid, from, to)
                const r = await shareOrDownload(blob, filename, 'Fotografii șantier')
                if (r === 'downloaded') toast(`${roCount(n, 'fotografie descărcată', 'fotografii descărcate')} (.zip).`, 'ok')
              } catch (e) {
                toast(errorMessage(e), 'error')
              } finally {
                setBusy(false)
              }
            }}
          >
            <IconDownload /> Fotografii .zip (cu dată, GPS și proiect pe imagine)
          </button>
          <button className="btn block" disabled={!pid} onClick={() => navigate(`/proiect/${pid}/constatari`)}>
            Listă constatări (PDF / CSV, cu filtre)
          </button>
        </div>
      </div>
      <p className="muted small">Raportul zilnic pentru o singură zi se generează din ecranul raportului (butonul „PDF raport zilnic”).</p>
    </Layout>
  )
}
