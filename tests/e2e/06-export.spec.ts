import { test, expect } from './fixtures'
import { readFileSync } from 'node:fs'
import { createProject, expectSaved, section } from './helpers'
import { inspectPdf } from './pdf-utils'

test('raport pe perioadă (PDF) și CSV rapoarte zilnice', async ({ page }, testInfo) => {
  const pid = await createProject(page, 'Extindere SEAU Polovragi', { 'Lot (CL)': 'CL1' })
  for (const [d, n] of [['2026-10-20', '5'], ['2026-10-21', '7'], ['2026-10-25', '3']] as const) {
    await page.goto(`./#/proiect/${pid}/raport/${d}`)
    await section(page, 'Personal').getByRole('button', { name: 'Adaugă categorie' }).click()
    await section(page, 'Personal').getByLabel('Categorie').fill('Muncitori calificați')
    await section(page, 'Personal').getByLabel('Număr').fill(n)
    await page.getByLabel('Temp. prânz (°C)').fill('12,5')
    await expectSaved(page)
  }
  await page.goto(`./#/proiect/${pid}/export`)
  await page.getByLabel('De la').fill('2026-10-19')
  await page.getByLabel('Până la').fill('2026-10-22')
  await expect(page.getByText('2 rapoarte zilnice în interval.')).toBeVisible()

  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF raport pe perioadă' }).click()
  const p = testInfo.outputPath('perioada.pdf')
  await (await dl).saveAs(p)
  const pdf = await inspectPdf(p)
  expect(pdf.header).toBe('%PDF-')
  expect(pdf.text).toContain('Raport de șantier pe perioadă')
  expect(pdf.text).toContain('Perioada: 19.10.2026 – 22.10.2026 · 2 rapoarte zilnice')
  expect(pdf.text).toContain('20.10.2026')
  expect(pdf.text).toContain('21.10.2026')
  expect(pdf.text).not.toContain('25.10.2026')
  expect(pdf.text).toContain('Supervizor – Diriginte')

  const dl2 = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV rapoarte zilnice (Excel)' }).click()
  const c = testInfo.outputPath('r.csv')
  await (await dl2).saveAs(c)
  const buf = readFileSync(c)
  expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const lines = buf.toString('utf8').slice(1).trim().split('\r\n')
  expect(lines).toHaveLength(3)
  expect(lines[0].split(';').slice(0, 3)).toEqual(['Proiect', 'Data', 'Stare'])
  expect(lines[1]).toContain('Extindere SEAU Polovragi;20.10.2026;Ciornă')
  expect(lines[1]).toContain(';12,5;5;')
})
