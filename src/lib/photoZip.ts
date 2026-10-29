// Export ZIP al fotografiilor, cu adnotările și banda de text (data/ora, GPS, proiect) arse în imagine.
import { zipSync } from 'fflate'
import { db } from '../db/db'
import { photosFor } from '../db/repo'
import { composeForExport } from './photo'
import { isoDate, roDate } from './format'
import { safeFilename } from './share'

const ROLE = { general: '', before: '_inainte', after: '_dupa' } as const

export async function photosZip(projectId: string, from: string, to: string): Promise<{ blob: Blob; filename: string; count: number }> {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Proiectul nu mai există.')
  const files: Record<string, [Uint8Array, { level: 0 }]> = {}
  const add = async (prefix: string, list: Awaited<ReturnType<typeof photosFor>>) => {
    for (const [i, p] of list.entries()) {
      const img = await composeForExport(p.blob, p.annotations, { takenAt: p.takenAt, gps: p.gps, projectName: project.name }, 2048)
      files[`${prefix}${ROLE[p.role]}_${String(i + 1).padStart(2, '0')}.jpg`] = [img.bytes, { level: 0 }]
    }
  }
  const reports = (await db.reports.where('projectId').equals(projectId).toArray())
    .filter((r) => r.deletedAt === null && r.date >= from && r.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const r of reports) await add(`rapoarte/${r.date}`, await photosFor('report', r.id))
  const findings = (await db.findings.where('projectId').equals(projectId).toArray()).filter((f) => {
    if (f.deletedAt !== null) return false
    const d = isoDate(new Date(f.createdAt))
    return d >= from && d <= to
  })
  for (const f of findings) await add(`constatari/${safeFilename(f.title) || 'constatare'}_${f.id.slice(0, 8)}`, await photosFor('finding', f.id))
  const count = Object.keys(files).length
  if (!count) throw new Error('Nu există fotografii în intervalul ales.')
  const zipped = zipSync(files)
  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    filename: `Fotografii_${safeFilename(project.name)}_${roDate(from)}-${roDate(to)}.zip`,
    count,
  }
}
