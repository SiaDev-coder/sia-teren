import { test, expect } from './fixtures'
import { createProject, fixture, section } from './helpers'

async function checkTargets(page: import('@playwright/test').Page, where: string) {
  const bad = await page.evaluate(() => {
    const out: string[] = []
    const els = document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=hidden]):not([type=file]), select, textarea, summary, .chip span')
    for (const el of els) {
      if (el.closest('[hidden]') || el.classList.contains('sr-only')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (el.matches('input[type=checkbox]') && el.closest('.chip')) continue // ținta e eticheta .chip
      if (r.height < 47.5 || r.width < 47.5) out.push(`${el.tagName.toLowerCase()} „${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}” ${Math.round(r.width)}×${Math.round(r.height)}`)
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs < 14) out.push(`${el.tagName.toLowerCase()} font ${fs}px`)
    }
    for (const el of document.querySelectorAll<HTMLElement>('main p, main label > span, main input, main textarea')) {
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs < 16 && !el.closest('.small, .hint, .count, .meta, .badge, .muted, small')) out.push(`text ${el.tagName.toLowerCase()} ${fs}px`)
    }
    return out
  })
  expect(bad, `ținte/text prea mici în ${where}`).toEqual([])
}

test('UX șantier: ținte ≥ 48 px, text ≥ 16 px; 2 atingeri până la fotografia de azi; ghid iPhone', async ({ page }) => {
  await page.goto('./')
  await checkTargets(page, 'Proiecte (gol)')
  const pid = await createProject(page, 'Proiect UX')
  await checkTargets(page, 'Detalii proiect')

  // de la ecranul principal: 1) „Azi” 2) „Fotografie” → se deschide camera
  await page.goto('./')
  await page.getByRole('navigation').getByRole('link', { name: 'Azi' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Fotografie', exact: true }).click()
  const fc = await chooser
  expect(await fc.element().getAttribute('capture')).toBe('environment')
  expect(await fc.element().getAttribute('accept')).toBe('image/*')
  await fc.setFiles(fixture('santier.jpg'))
  await expect(section(page, 'Fotografii').locator('.thumb')).toHaveCount(1)
  await checkTargets(page, 'Raport zilnic')

  await page.goto(`./#/proiect/${pid}/constatare/noua`)
  await checkTargets(page, 'Constatare nouă')
  for (const p of ['/mai-mult', '/setari', '/backup', '/cos', '/despre', '/instalare', '/export']) {
    await page.goto(`./#${p}`)
    await expect(page.locator('main')).toBeVisible()
    await checkTargets(page, p)
  }
  await page.goto('./#/instalare')
  await expect(page.getByText('Adaugă pe ecranul principal')).toBeVisible()
})

test('temă întunecată din Setări', async ({ page }) => {
  await page.goto('./#/setari')
  await page.getByLabel('Temă').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(14, 20, 26)')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
