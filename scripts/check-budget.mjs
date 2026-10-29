// Bugetul de încărcare inițială: JS-ul cerut de index.html (script + modulepreload), comprimat gzip, ≤ 400 KB.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const dist = resolve(import.meta.dirname, '..', 'dist')
const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
const files = new Set()
for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) files.add(m[1])
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)) files.add(m[1])
let total = 0
for (const f of files) {
  const gz = gzipSync(readFileSync(resolve(dist, f.replace(/^\.?\//, '')))).length
  total += gz
  console.log(`  ${f}: ${(gz / 1024).toFixed(1)} KB gzip`)
}
const LIMIT = 400 * 1024
console.log(`JS inițial: ${(total / 1024).toFixed(1)} KB gzip (limită 400 KB)`)
if (total > LIMIT) {
  console.error('DEPĂȘIT bugetul de 400 KB!')
  process.exit(1)
}
