import { test, expect } from './fixtures'
import { waitForServiceWorker } from './helpers'

test('shell-ul pornește offline (service worker + reîncărcare în modul avion)', async ({ page, goOffline }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  await goOffline()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Niciun proiect încă' })).toBeVisible()
  // deschiderea directă a unui link adânc, tot offline
  await page.goto('./#/mai-mult')
  await expect(page.getByRole('heading', { level: 1, name: 'Mai mult' })).toBeVisible()
  await page.goto('./#/despre')
  await expect(page.getByTestId('app-version')).toHaveText('1.0.0')
})

test('manifest PWA complet și instalabil', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const res = await request.get(new URL(href!, page.url()).href)
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m.name).toContain('SIA Teren')
  expect(m.short_name).toBe('SIA Teren')
  expect(m.lang).toBe('ro')
  expect(m.display).toBe('standalone')
  expect(m.orientation).toBe('portrait')
  expect(m.start_url).toBeTruthy()
  expect(m.scope).toBeTruthy()
  expect(m.theme_color).toBeTruthy()
  expect(m.background_color).toBeTruthy()
  const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, new URL(href!, page.url())).href)
    expect(r.ok()).toBe(true)
    expect(r.headers()['content-type']).toContain('image/png')
  }
})
