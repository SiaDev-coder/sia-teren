import { test, expect } from './fixtures'

test('aplicația pornește, fără erori în consolă', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Niciun proiect încă' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigare principală' })).toBeVisible()
  expect(errors).toEqual([])
})
