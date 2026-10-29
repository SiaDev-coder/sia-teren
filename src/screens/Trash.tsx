import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { emptyTrash, hardDelete, restore, TRASH_DAYS, type TableName } from '../db/repo'
import { Layout } from '../components/Layout'
import { confirmDialog, toast, errorMessage } from '../components/ui'
import { roCount, roDate, roDateTime } from '../lib/format'

interface Item {
  table: TableName
  id: string
  title: string
  kind: string
  deletedAt: number
}

export function TrashScreen() {
  const items = useLiveQuery(async () => {
    const [projects, reports, findings, photos, audio] = await Promise.all([
      db.projects.where('deletedAt').above(0).toArray(),
      db.reports.where('deletedAt').above(0).toArray(),
      db.findings.where('deletedAt').above(0).toArray(),
      db.photos.where('deletedAt').above(0).toArray(),
      db.audio.where('deletedAt').above(0).toArray(),
    ])
    const names = new Map((await db.projects.toArray()).map((p) => [p.id, p.name]))
    const out: Item[] = [
      ...projects.map((p) => ({ table: 'projects' as const, id: p.id, title: p.name, kind: 'Proiect', deletedAt: p.deletedAt! })),
      ...reports.map((r) => ({ table: 'reports' as const, id: r.id, title: `Raport ${roDate(r.date)} · ${names.get(r.projectId) ?? ''}`, kind: 'Raport zilnic', deletedAt: r.deletedAt! })),
      ...findings.map((f) => ({ table: 'findings' as const, id: f.id, title: `${f.title} · ${names.get(f.projectId) ?? ''}`, kind: 'Constatare', deletedAt: f.deletedAt! })),
      ...photos.map((p) => ({ table: 'photos' as const, id: p.id, title: `Fotografie din ${roDateTime(p.takenAt)}`, kind: 'Fotografie', deletedAt: p.deletedAt! })),
      ...audio.map((a) => ({ table: 'audio' as const, id: a.id, title: `Notă vocală din ${roDateTime(a.createdAt)}`, kind: 'Notă vocală', deletedAt: a.deletedAt! })),
    ]
    return out.sort((a, b) => b.deletedAt - a.deletedAt)
  }, [])

  return (
    <Layout title="Coș" backTo="/mai-mult">
      <p className="muted small">Elementele șterse stau aici {TRASH_DAYS} de zile, apoi se șterg definitiv.</p>
      {items && items.length === 0 && (
        <div className="empty">
          <h2>Coșul este gol</h2>
        </div>
      )}
      <ul className="list">
        {(items ?? []).map((it) => (
          <li key={`${it.table}-${it.id}`} className="list-item">
            <div className="main">
              <div className="title">{it.title}</div>
              <div className="meta">
                {it.kind} · șters la {roDateTime(it.deletedAt)}
              </div>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await restore(it.table, it.id)
                    toast('Element restaurat.', 'ok')
                  } catch (e) {
                    toast(errorMessage(e), 'error')
                  }
                }}
              >
                Recuperează
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  if (await confirmDialog({ title: 'Ștergi definitiv?', message: 'Elementul nu mai poate fi recuperat.', confirmLabel: 'Șterge definitiv', danger: true })) {
                    await hardDelete(it.table, it.id)
                    toast('Șters definitiv.')
                  }
                }}
              >
                Șterge
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items && items.length > 0 && (
        <button
          className="btn danger block"
          style={{ marginTop: 16 }}
          onClick={async () => {
            if (await confirmDialog({ title: 'Golești coșul?', message: 'Toate elementele din Coș vor fi șterse definitiv.', confirmLabel: 'Golește coșul', danger: true })) {
              const n = await emptyTrash()
              toast(`${roCount(n, 'element șters', 'elemente șterse')} definitiv.`)
            }
          }}
        >
          Golește coșul
        </button>
      )}
    </Layout>
  )
}
