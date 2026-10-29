import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildTextPdf, buildDailyReportPdf, isOverdue } from '../../src/lib/pdf/core'
import { emptyReport } from '../../src/db/repo'
import type { Project } from '../../src/db/types'

const fonts = {
  regular: new Uint8Array(readFileSync(resolve(__dirname, '../../src/assets/fonts/NotoSans-Regular.ttf'))),
  bold: new Uint8Array(readFileSync(resolve(__dirname, '../../src/assets/fonts/NotoSans-Bold.ttf'))),
}

async function extractText(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false }).promise
  const out: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    out.push(tc.items.map((it) => ('str' in it ? it.str : '')).join('\n'))
  }
  return out
}

const project: Project = {
  id: 'p1',
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  name: 'Extindere rețea apă Știubei',
  beneficiary: 'Primăria Țânțăreni',
  contractNo: '12/2026',
  lot: 'CL3',
  locality: 'Țânțăreni',
  county: 'Gorj',
  contractor: 'SIA Dynamic Solution SRL',
  supervisor: 'Ing. Mălina Ștefănescu',
  startDate: '2026-03-01',
  archived: 0,
  lastUsedAt: 0,
}

describe('PDF – diacritice', () => {
  it('textul „ȘȚĂÎÂ șțăîâ” extras din PDF este identic', async () => {
    const bytes = await buildTextPdf(fonts, 'ȘȚĂÎÂ șțăîâ')
    const [text] = await extractText(bytes)
    const lines = text.split('\n').filter(Boolean)
    expect(lines).toContain('ȘȚĂÎÂ șțăîâ')
    expect(lines.filter((l) => l === 'ȘȚĂÎÂ șțăîâ')).toHaveLength(2) // regular + bold
    // virgulă dedesubt (U+0218..U+021B), nu sedilă
    expect(text).toContain('Ș')
    expect(text).toContain('ț')
  })

  it('raportul zilnic conține antetul, secțiunile și blocurile de semnătură', async () => {
    const r = emptyReport('p1', '2026-10-29')
    r.weather = ['senin', 'vânt puternic']
    r.personnel = [{ id: 'a', category: 'Muncitori necalificați', count: 6 }]
    r.equipment = [{ id: 'b', name: 'Excavator șenilat', count: 1, hours: 7.5 }]
    r.activities = [{ id: 'c', description: 'Săpătură mecanizată tranșee', quantity: 42.5, unit: 'm', location: 'Tronson Ț3' }]
    r.problems = 'Întârziere livrare țeavă PEHD; ploaie.'
    const bytes = await buildDailyReportPdf(fonts, { companyName: 'SIA Dynamic Solution SRL', userName: 'Ionuț Popescu', project }, r, [])
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const text = (await extractText(bytes)).join('\n')
    for (const s of ['Raport zilnic de șantier', 'Excavator șenilat', 'Săpătură mecanizată tranșee', 'Întocmit', 'Verificat', 'Supervizor – Diriginte', 'Ionuț Popescu', '42,5', '7,5']) {
      expect(text).toContain(s)
    }
  })

  it('caracterele lipsă din font (săgeți, emoji) nu apar ca „?”', async () => {
    const bytes = await buildDailyReportPdf(fonts, { companyName: 'Firma', userName: '', project }, { ...emptyReport('p1', '2026-10-29'), notes: 'Deschisă → În lucru ✓ 👷 gata' }, [])
    const text = (await extractText(bytes)).join('\n')
    expect(text).toContain('Deschisă -> În lucru v gata')
    expect(text).not.toContain('?')
  })

  it('constatare depășită: termen trecut și neînchisă', () => {
    expect(isOverdue({ dueDate: '2026-10-01', status: 'Deschisă' }, '2026-10-29')).toBe(true)
    expect(isOverdue({ dueDate: '2026-10-01', status: 'Verificată' }, '2026-10-29')).toBe(false)
    expect(isOverdue({ dueDate: '2026-11-01', status: 'În lucru' }, '2026-10-29')).toBe(false)
    expect(isOverdue({ dueDate: '', status: 'Deschisă' }, '2026-10-29')).toBe(false)
  })
})
