import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { DailyReport, Finding, Project } from '../../db/types'
import { roDate, roDateTime, roLongDate, roNumber, formatCoords } from '../format'
import { isOverdue } from '../findings'

export { isOverdue }

export interface PdfAssets {
  regular: Uint8Array
  bold: Uint8Array
  /** logo PNG (opțional) */
  logo?: Uint8Array | null
}

export interface PdfHeader {
  companyName: string
  userName: string
  project: Project
}

export interface PreparedPhoto {
  /** JPEG cu adnotări și banda de text deja arse în imagine */
  bytes: Uint8Array
  width: number
  height: number
  caption: string
}

const A4: [number, number] = [595.28, 841.89]
const M = 40 // margine
const INK = rgb(0.1, 0.12, 0.15)
const MUTED = rgb(0.38, 0.42, 0.47)
const LINE = rgb(0.75, 0.78, 0.82)
const FILL = rgb(0.93, 0.95, 0.97)

/** Înlocuitori pentru caractere pe care Noto Sans (subset Latin) nu le conține. */
const FALLBACK: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '⇒': '=>',
  '✓': 'v',
  '✔': 'v',
  '✗': 'x',
  '•': '·',
  '\u00a0': ' ',
}

class Writer {
  doc: PDFDocument
  regular!: PDFFont
  bold!: PDFFont
  logo: PDFImage | null = null
  page!: PDFPage
  y = 0
  title = ''
  header: PdfHeader
  private charset = new Set<number>()

  constructor(doc: PDFDocument, header: PdfHeader) {
    this.doc = doc
    this.header = header
  }

  async init(assets: PdfAssets, title: string) {
    this.doc.registerFontkit(fontkit)
    this.regular = await this.doc.embedFont(assets.regular, { subset: true })
    this.bold = await this.doc.embedFont(assets.bold, { subset: true })
    for (const c of this.regular.getCharacterSet()) this.charset.add(c)
    if (assets.logo && assets.logo.length) {
      try {
        this.logo = await this.doc.embedPng(assets.logo)
      } catch {
        this.logo = null
      }
    }
    this.title = title
    this.doc.setTitle(title)
    this.doc.setAuthor(this.header.userName || this.header.companyName)
    this.doc.setCreator('SIA Teren')
    this.doc.setProducer('SIA Teren (pdf-lib)')
    this.doc.setLanguage('ro-RO')
    this.newPage()
  }

  /** Înlocuiește caracterele pe care fontul nu le are (săgeți, emoji) ca să nu apară pătrățele. */
  clean(s: string): string {
    let out = ''
    for (const ch of s.replace(/\t/g, '    ')) {
      const cp = ch.codePointAt(0)!
      if (cp === 10 || this.charset.has(cp)) out += ch
      else if (FALLBACK[ch] !== undefined) out += [...FALLBACK[ch]].every((c) => this.charset.has(c.codePointAt(0)!)) ? FALLBACK[ch] : '?'
      else if (cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200d) out += '' // emoji
      else out += '?'
    }
    return out
  }

  get width() {
    return A4[0] - 2 * M
  }

  newPage() {
    this.page = this.doc.addPage(A4)
    let y = A4[1] - M
    let x = M
    if (this.logo) {
      const h = 36
      const w = Math.min(120, (this.logo.width / this.logo.height) * h)
      const hh = (w / this.logo.width) * this.logo.height
      this.page.drawImage(this.logo, { x: M, y: y - hh, width: w, height: hh })
      x = M + w + 12
    }
    const p = this.header.project
    this.page.drawText(this.clean(this.header.companyName || ''), { x, y: y - 11, size: 11, font: this.bold, color: INK })
    const sub = [p.name, p.contractNo && `Contract ${p.contractNo}`, p.lot && `Lot ${p.lot}`].filter(Boolean).join(' · ')
    this.page.drawText(this.clean(this.fit(sub, this.regular, 8.5, A4[0] - M - x)), { x, y: y - 24, size: 8.5, font: this.regular, color: MUTED })
    const titleW = this.bold.widthOfTextAtSize(this.clean(this.title), 9)
    if (x + 260 < A4[0] - M - titleW) {
      this.page.drawText(this.clean(this.title), { x: A4[0] - M - titleW, y: y - 11, size: 9, font: this.bold, color: MUTED })
    }
    y -= 44
    this.page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.8, color: LINE })
    this.y = y - 16
  }

  ensure(h: number) {
    if (this.y - h < M + 24) this.newPage()
  }

  fit(s: string, font: PDFFont, size: number, maxW: number): string {
    if (font.widthOfTextAtSize(s, size) <= maxW) return s
    let t = s
    while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const lines: string[] = []
    for (const para of this.clean(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean)
      if (words.length === 0) {
        lines.push('')
        continue
      }
      let cur = ''
      for (let w of words) {
        // cuvinte mai lungi decât rândul: le rupem
        while (font.widthOfTextAtSize(w, size) > maxW) {
          let i = w.length
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxW) i--
          if (cur) {
            lines.push(cur)
            cur = ''
          }
          lines.push(w.slice(0, i))
          w = w.slice(i)
        }
        const cand = cur ? `${cur} ${w}` : w
        if (font.widthOfTextAtSize(cand, size) <= maxW) cur = cand
        else {
          if (cur) lines.push(cur)
          cur = w
        }
      }
      if (cur) lines.push(cur)
    }
    return lines
  }

  heading(text: string, size = 15) {
    this.ensure(size + 14)
    this.page.drawText(this.clean(text), { x: M, y: this.y - size, size, font: this.bold, color: INK })
    this.y -= size + 10
  }

  section(text: string) {
    this.ensure(40)
    this.y -= 4
    this.page.drawRectangle({ x: M, y: this.y - 17, width: this.width, height: 18, color: FILL })
    this.page.drawText(this.clean(text), { x: M + 6, y: this.y - 12.5, size: 10.5, font: this.bold, color: INK })
    this.y -= 26
  }

  paragraph(text: string, size = 10, font: PDFFont = this.regular, color = INK) {
    const lh = size * 1.35
    for (const line of this.wrap(text, font, size, this.width)) {
      this.ensure(lh)
      this.page.drawText(line, { x: M, y: this.y - size, size, font, color })
      this.y -= lh
    }
    this.y -= 4
  }

  /** Perechi etichetă: valoare pe două coloane. */
  keyValues(pairs: [string, string][]) {
    const size = 9.5
    const lh = size * 1.35
    const colW = this.width / 2 - 8
    for (let i = 0; i < pairs.length; i += 2) {
      const cells = pairs.slice(i, i + 2).map(([k, v]) => this.wrap(`${k}: ${v || '—'}`, this.regular, size, colW))
      const rows = Math.max(...cells.map((c) => c.length))
      this.ensure(rows * lh)
      cells.forEach((lines, ci) => {
        lines.forEach((line, li) => {
          const x = M + ci * (colW + 16)
          const idx = line.indexOf(':')
          if (li === 0 && idx > 0) {
            const label = line.slice(0, idx + 1)
            this.page.drawText(label, { x, y: this.y - size - li * lh, size, font: this.bold, color: MUTED })
            this.page.drawText(line.slice(idx + 1), {
              x: x + this.bold.widthOfTextAtSize(label, size),
              y: this.y - size - li * lh,
              size,
              font: this.regular,
              color: INK,
            })
          } else this.page.drawText(line, { x, y: this.y - size - li * lh, size, font: this.regular, color: INK })
        })
      })
      this.y -= rows * lh + 2
    }
    this.y -= 4
  }

  /** Tabel cu antet; widths = fracții din lățime. */
  table(head: string[], rows: string[][], widths: number[]) {
    const size = 9
    const lh = size * 1.3
    const pad = 4
    const ws = widths.map((w) => w * this.width)
    const drawRow = (cells: string[], bold: boolean) => {
      const font = bold ? this.bold : this.regular
      const wrapped = cells.map((c, i) => this.wrap(c || '', font, size, ws[i] - 2 * pad))
      const h = Math.max(1, ...wrapped.map((w) => w.length)) * lh + 2 * pad
      if (this.y - h < M + 24) {
        this.newPage()
        if (!bold) drawRow(head, true)
      }
      let x = M
      if (bold) this.page.drawRectangle({ x: M, y: this.y - h, width: this.width, height: h, color: FILL })
      wrapped.forEach((lines, i) => {
        lines.forEach((line, li) => this.page.drawText(line, { x: x + pad, y: this.y - pad - size - li * lh + 1, size, font, color: INK }))
        x += ws[i]
      })
      this.page.drawLine({ start: { x: M, y: this.y - h }, end: { x: M + this.width, y: this.y - h }, thickness: 0.5, color: LINE })
      this.y -= h
    }
    this.ensure(lh * 3)
    drawRow(head, true)
    for (const r of rows) drawRow(r, false)
    this.y -= 8
  }

  async photos(list: PreparedPhoto[]) {
    const gap = 12
    const colW = (this.width - gap) / 2
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2)
      const imgs = await Promise.all(pair.map((p) => this.doc.embedJpg(p.bytes)))
      const heights = pair.map((p) => Math.min(300, (colW / p.width) * p.height))
      const capLines = pair.map((p) => this.wrap(p.caption, this.regular, 8, colW))
      const h = Math.max(...heights) + Math.max(...capLines.map((c) => c.length)) * 10.5 + 8
      this.ensure(h)
      pair.forEach((p, k) => {
        const ih = heights[k]
        const iw = (ih / p.height) * p.width
        const x = M + k * (colW + gap)
        this.page.drawImage(imgs[k], { x, y: this.y - ih, width: iw, height: ih })
        capLines[k].forEach((line, li) =>
          this.page.drawText(line, { x, y: this.y - ih - 10 - li * 10.5, size: 8, font: this.regular, color: MUTED }),
        )
      })
      this.y -= h
    }
  }

  /** Blocuri goale pentru semnătură olografă și ștampilă. */
  signatures(preparedBy: string) {
    const h = 110
    this.ensure(h + 10)
    this.y -= 10
    const labels = ['Întocmit', 'Verificat', 'Supervizor – Diriginte']
    const gap = 12
    const w = (this.width - 2 * gap) / 3
    labels.forEach((label, i) => {
      const x = M + i * (w + gap)
      this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, borderColor: LINE, borderWidth: 0.8 })
      this.page.drawText(label, { x: x + 6, y: this.y - 14, size: 9.5, font: this.bold, color: INK })
      const name = i === 0 && preparedBy ? this.fit(this.clean(preparedBy), this.regular, 8.5, w - 12) : ''
      this.page.drawText(`Nume: ${name}`, { x: x + 6, y: this.y - 32, size: 8.5, font: this.regular, color: MUTED })
      this.page.drawText('Semnătura și ștampila:', { x: x + 6, y: this.y - 48, size: 8.5, font: this.regular, color: MUTED })
      this.page.drawText('Data:', { x: x + 6, y: this.y - h + 8, size: 8.5, font: this.regular, color: MUTED })
    })
    this.y -= h + 10
  }

  footers() {
    const pages = this.doc.getPages()
    const gen = `Generat cu SIA Teren la ${roDateTime(Date.now())}`
    pages.forEach((p, i) => {
      const t = `Pagina ${i + 1} din ${pages.length}`
      p.drawText(gen, { x: M, y: M - 16, size: 7.5, font: this.regular, color: MUTED })
      p.drawText(t, { x: A4[0] - M - this.regular.widthOfTextAtSize(t, 7.5), y: M - 16, size: 7.5, font: this.regular, color: MUTED })
    })
  }
}

function projectPairs(p: Project): [string, string][] {
  return [
    ['Proiect', p.name],
    ['Beneficiar', p.beneficiary],
    ['Contract nr.', p.contractNo],
    ['Lot (CL)', p.lot],
    ['Localitate', [p.locality, p.county && `jud. ${p.county}`].filter(Boolean).join(', ')],
    ['Antreprenor', p.contractor],
    ['Supervizor / diriginte', p.supervisor],
    ['Data începerii', roDate(p.startDate)],
  ]
}

function num(n: number | null, unit = ''): string {
  return n === null ? '' : `${roNumber(n)}${unit}`
}

function reportBody(w: Writer, r: DailyReport) {
  w.keyValues([
    ['Vreme', r.weather.join(', ')],
    ['Temperatură', [r.tempMorning !== null && `dimineața ${num(r.tempMorning, ' °C')}`, r.tempNoon !== null && `la prânz ${num(r.tempNoon, ' °C')}`].filter(Boolean).join(', ')],
    ['Stare', r.status === 'final' ? `Finalizat${r.finalizedAt ? ` (${roDateTime(r.finalizedAt)})` : ''}` : 'Ciornă'],
    ['Total personal', String(r.personnel.reduce((s, p) => s + (p.count ?? 0), 0))],
  ])
  w.section('Personal pe categorii (FIDIC 6.10)')
  if (r.personnel.length) w.table(['Categorie', 'Număr'], r.personnel.map((p) => [p.category, num(p.count)]), [0.75, 0.25])
  else w.paragraph('—')
  w.section('Utilaje (FIDIC 6.10)')
  if (r.equipment.length) w.table(['Utilaj', 'Număr', 'Ore'], r.equipment.map((e) => [e.name, num(e.count), num(e.hours)]), [0.6, 0.2, 0.2])
  else w.paragraph('—')
  w.section('Activități executate')
  if (r.activities.length)
    w.table(
      ['Descriere', 'Cantitate', 'UM', 'Locație / tronson'],
      r.activities.map((a) => [a.description, num(a.quantity), a.unit, a.location]),
      [0.45, 0.15, 0.1, 0.3],
    )
  else w.paragraph('—')
  w.section('Materiale recepționate')
  if (r.materials.length)
    w.table(
      ['Material', 'Cantitate', 'UM', 'Aviz / factură'],
      r.materials.map((m) => [m.name, num(m.quantity), m.unit, m.document]),
      [0.45, 0.15, 0.1, 0.3],
    )
  else w.paragraph('—')
  const texts: [string, string][] = [
    ['Probleme, întârzieri și cauze', r.problems],
    ['Instrucțiuni primite' + (r.instructionsFrom ? ` (de la: ${r.instructionsFrom})` : ''), r.instructions],
    ['Vizite pe șantier', r.visits],
    ['Evenimente SSM', r.safety],
    ['Observații', r.notes],
  ]
  for (const [t, v] of texts) {
    w.section(t)
    w.paragraph(v.trim() || '—')
  }
}

async function finish(w: Writer): Promise<Uint8Array> {
  w.footers()
  return w.doc.save()
}

export async function buildDailyReportPdf(
  assets: PdfAssets,
  header: PdfHeader,
  report: DailyReport,
  photos: PreparedPhoto[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const w = new Writer(doc, header)
  await w.init(assets, `Raport zilnic de șantier – ${roDate(report.date)}`)
  w.heading('Raport zilnic de șantier')
  w.paragraph(roLongDate(report.date), 11, w.bold, MUTED)
  w.keyValues(projectPairs(header.project))
  reportBody(w, report)
  if (photos.length) {
    w.section(`Fotografii (${photos.length})`)
    await w.photos(photos)
  }
  w.signatures(header.userName)
  return finish(w)
}

export async function buildPeriodReportPdf(
  assets: PdfAssets,
  header: PdfHeader,
  from: string,
  to: string,
  reports: DailyReport[],
  photosByReport: Map<string, PreparedPhoto[]>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const w = new Writer(doc, header)
  await w.init(assets, `Raport pe perioadă ${roDate(from)} – ${roDate(to)}`)
  w.heading('Raport de șantier pe perioadă')
  w.paragraph(`Perioada: ${roDate(from)} – ${roDate(to)} · ${reports.length} rapoarte zilnice`, 11, w.bold, MUTED)
  w.keyValues(projectPairs(header.project))
  const sorted = [...reports].sort((a, b) => (a.date < b.date ? -1 : 1))
  w.section('Sinteză')
  w.table(
    ['Data', 'Stare', 'Vreme', 'Personal', 'Utilaje (buc.)', 'Activități'],
    sorted.map((r) => [
      roDate(r.date),
      r.status === 'final' ? 'Finalizat' : 'Ciornă',
      r.weather.join(', '),
      String(r.personnel.reduce((s, p) => s + (p.count ?? 0), 0)),
      String(r.equipment.reduce((s, e) => s + (e.count ?? 0), 0)),
      String(r.activities.length),
    ]),
    [0.15, 0.13, 0.25, 0.13, 0.17, 0.17],
  )
  for (const r of sorted) {
    w.newPage()
    w.heading(`Raport zilnic – ${roLongDate(r.date)}`, 13)
    reportBody(w, r)
    const ph = photosByReport.get(r.id) ?? []
    if (ph.length) {
      w.section(`Fotografii (${ph.length})`)
      await w.photos(ph)
    }
  }
  w.signatures(header.userName)
  return finish(w)
}

export async function buildFindingsPdf(
  assets: PdfAssets,
  header: PdfHeader,
  findings: Finding[],
  photosByFinding: Map<string, { before: PreparedPhoto[]; after: PreparedPhoto[] }>,
  filterDescription: string,
  today: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const w = new Writer(doc, header)
  await w.init(assets, 'Listă constatări / neconformități')
  w.heading('Listă constatări / neconformități')
  w.paragraph(`${findings.length} constatări · Filtre: ${filterDescription || 'toate'}`, 10.5, w.bold, MUTED)
  w.keyValues(projectPairs(header.project))
  w.section('Sinteză')
  w.table(
    ['#', 'Titlu', 'Gravitate', 'Stare', 'Responsabil', 'Termen'],
    findings.map((f, i) => [
      String(i + 1),
      f.title,
      f.severity,
      f.status,
      f.responsible,
      f.dueDate ? roDate(f.dueDate) + (isOverdue(f, today) ? ' (DEPĂȘIT)' : '') : '',
    ]),
    [0.06, 0.34, 0.13, 0.14, 0.18, 0.15],
  )
  for (const [i, f] of findings.entries()) {
    w.ensure(120)
    w.section(`${i + 1}. ${f.title}`)
    w.keyValues([
      ['Categorie', f.category],
      ['Gravitate', f.severity],
      ['Stare', f.status],
      ['Responsabil', f.responsible],
      ['Termen', f.dueDate ? roDate(f.dueDate) + (isOverdue(f, today) ? ' – DEPĂȘIT' : '') : ''],
      ['Locație', f.location],
      ['GPS', f.gps ? `${formatCoords(f.gps.lat, f.gps.lng)} (±${f.gps.accuracy} m)` : ''],
      ['Creată la', roDateTime(f.createdAt)],
    ])
    if (f.description.trim()) w.paragraph(f.description)
    w.paragraph(
      'Istoric: ' + f.history.map((h) => `${roDateTime(h.at)} ${h.from ? `${h.from} → ` : ''}${h.to}`).join('; '),
      8.5,
      w.regular,
      MUTED,
    )
    const ph = photosByFinding.get(f.id)
    if (ph?.before.length) {
      w.paragraph('Fotografii „înainte”', 9.5, w.bold)
      await w.photos(ph.before)
    }
    if (ph?.after.length) {
      w.paragraph('Fotografii „după”', 9.5, w.bold)
      await w.photos(ph.after)
    }
  }
  w.signatures(header.userName)
  return finish(w)
}


/** Document minim pentru testul automat de diacritice. */
export async function buildTextPdf(assets: PdfAssets, text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(assets.regular, { subset: true })
  const bold = await doc.embedFont(assets.bold, { subset: true })
  const page = doc.addPage(A4)
  page.drawText(text, { x: M, y: A4[1] - M - 20, size: 16, font })
  page.drawText(text, { x: M, y: A4[1] - M - 50, size: 16, font: bold })
  return doc.save()
}
