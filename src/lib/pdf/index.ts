// Încărcat leneș (import dinamic) doar la generarea unui PDF.
import regularUrl from '../../assets/fonts/NotoSans-Regular.ttf?url'
import boldUrl from '../../assets/fonts/NotoSans-Bold.ttf?url'
import { db } from '../../db/db'
import { getSettings } from '../../db/settings'
import type { Finding, Photo, Project } from '../../db/types'
import { composeForExport } from '../photo'
import { isoDate, roDate } from '../format'
import { buildDailyReportPdf, buildFindingsPdf, buildPeriodReportPdf, type PdfAssets, type PreparedPhoto, type PdfHeader } from './core'
import { photosFor } from '../../db/repo'

let fontCache: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null

async function loadFonts() {
  if (!fontCache) {
    fontCache = (async () => {
      const [r, b] = await Promise.all([fetch(regularUrl), fetch(boldUrl)])
      if (!r.ok || !b.ok) throw new Error('Fontul pentru PDF nu a putut fi încărcat.')
      return { regular: new Uint8Array(await r.arrayBuffer()), bold: new Uint8Array(await b.arrayBuffer()) }
    })().catch((e) => {
      fontCache = null
      throw e
    })
  }
  return fontCache
}

async function context(project: Project): Promise<{ assets: PdfAssets; header: PdfHeader }> {
  const [fonts, s] = await Promise.all([loadFonts(), getSettings()])
  const logo = s.logo ? new Uint8Array(await s.logo.arrayBuffer()) : null
  return { assets: { ...fonts, logo }, header: { companyName: s.companyName, userName: s.userName, project } }
}

const ROLE_RO = { general: '', before: 'înainte', after: 'după' } as const

async function prepare(photos: Photo[], project: Project): Promise<PreparedPhoto[]> {
  const out: PreparedPhoto[] = []
  for (const [i, p] of photos.entries()) {
    const img = await composeForExport(p.blob, p.annotations, { takenAt: p.takenAt, gps: p.gps, projectName: project.name })
    const role = ROLE_RO[p.role]
    out.push({ ...img, caption: [`Foto ${i + 1}${role ? ` (${role})` : ''}`, p.caption].filter(Boolean).join(' – ') })
  }
  return out
}

function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

export async function dailyReportPdf(reportId: string): Promise<{ blob: Blob; filename: string }> {
  const report = await db.reports.get(reportId)
  if (!report) throw new Error('Raportul nu mai există.')
  const project = await db.projects.get(report.projectId)
  if (!project) throw new Error('Proiectul nu mai există.')
  const { assets, header } = await context(project)
  const photos = await prepare(await photosFor('report', report.id), project)
  const bytes = await buildDailyReportPdf(assets, header, report, photos)
  return { blob: pdfBlob(bytes), filename: `Raport_zilnic_${roDate(report.date)}.pdf` }
}

export async function periodReportPdf(projectId: string, from: string, to: string): Promise<{ blob: Blob; filename: string }> {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Proiectul nu mai există.')
  const reports = (await db.reports.where('projectId').equals(projectId).toArray()).filter(
    (r) => r.deletedAt === null && r.date >= from && r.date <= to,
  )
  if (!reports.length) throw new Error('Nu există rapoarte zilnice în intervalul ales.')
  const { assets, header } = await context(project)
  const byReport = new Map<string, PreparedPhoto[]>()
  for (const r of reports) byReport.set(r.id, await prepare(await photosFor('report', r.id), project))
  const bytes = await buildPeriodReportPdf(assets, header, from, to, reports, byReport)
  return { blob: pdfBlob(bytes), filename: `Raport_perioada_${roDate(from)}-${roDate(to)}.pdf` }
}

export async function findingsPdf(project: Project, findings: Finding[], filterDescription: string): Promise<{ blob: Blob; filename: string }> {
  if (!findings.length) throw new Error('Nu există constatări pentru filtrele alese.')
  const { assets, header } = await context(project)
  const map = new Map<string, { before: PreparedPhoto[]; after: PreparedPhoto[] }>()
  for (const f of findings) {
    const ph = await photosFor('finding', f.id)
    map.set(f.id, {
      before: await prepare(ph.filter((p) => p.role !== 'after'), project),
      after: await prepare(ph.filter((p) => p.role === 'after'), project),
    })
  }
  const bytes = await buildFindingsPdf(assets, header, findings, map, filterDescription, isoDate())
  return { blob: pdfBlob(bytes), filename: `Constatari_${roDate(isoDate())}.pdf` }
}
