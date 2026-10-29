// Generează iconițele PNG ale aplicației din scripts/icon.svg (desen propriu), cu Chromium (Playwright).
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const svg = readFileSync(resolve(root, 'scripts/icon.svg'), 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()

async function render(size, file, { maskable = false } = {}) {
  // maskable: desenul încape în zona sigură (80% din diametru), fundal plin până la margini
  const inner = maskable ? Math.round(size * 0.72) : size
  const html = `<html><body style="margin:0;background:${maskable ? '#1b2733' : 'transparent'};width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(html)
  writeFileSync(resolve(root, 'public', file), await page.screenshot({ omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } }))
}
await render(192, 'pwa-192.png')
await render(512, 'pwa-512.png')
await render(512, 'pwa-maskable-512.png', { maskable: true })
await render(180, 'apple-touch-icon.png', { maskable: true })
await browser.close()
copyFileSync(resolve(root, 'scripts/icon.svg'), resolve(root, 'public/favicon.svg'))
console.log('Iconițe generate în public/')
