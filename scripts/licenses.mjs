// Verifică licențele pentru tot ce ajunge în aplicația livrată și generează THIRD-PARTY-LICENSES.md.
// Sursa listei: dist/.bundled-packages.json (scris de build) + dependențele incluse în bundle-ul
// precompilat al @huggingface/transformers. Orice licență în afara listei permise oprește livrarea.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const ALLOWED = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'OFL-1.1', 'Zlib'])
// Zlib: licență permisivă aprobată OSI (folosită de pako, dependența pdf-lib) — vezi DECIZII.md
const FORBIDDEN = /GPL|SSPL|BUSL|non-?commercial|CC-BY-NC/i
// pachete folosite de Transformers.js doar în Node.js (nu intră în build-ul web: transformers.web.js)
const NODE_ONLY = new Set(['sharp', 'onnxruntime-node'])

const listFile = resolve(root, 'dist/.bundled-packages.json')
if (!existsSync(listFile)) {
  console.error('Rulează întâi „npm run build” (lipsește dist/.bundled-packages.json).')
  process.exit(1)
}
const bundled = new Set(JSON.parse(readFileSync(listFile, 'utf8')))
// transformers.web.js e precompilat și include în el @huggingface/jinja și @huggingface/tokenizers
if (bundled.has('@huggingface/transformers')) {
  const pj = JSON.parse(readFileSync(resolve(root, 'node_modules/@huggingface/transformers/package.json'), 'utf8'))
  for (const d of Object.keys(pj.dependencies ?? {})) if (!NODE_ONLY.has(d) && !d.startsWith('onnxruntime-')) bundled.add(d)
}

// service worker-ul generat de workbox-build (dist/sw.js + workbox-*.js) conține runtime-ul Workbox
if (existsSync(resolve(root, 'dist/sw.js'))) for (const w of ['workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-strategies']) bundled.add(w)

function licenseText(dir) {
  const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.|$)/i.test(n))
  return f ? readFileSync(join(dir, f), 'utf8').trim() : ''
}

function normalize(l) {
  if (!l) return ''
  if (typeof l === 'object') return l.type ?? ''
  return String(l).replace(/^\(|\)$/g, '')
}

function okExpr(expr) {
  // „A OR B”: e suficientă o variantă permisă; „A AND B”: toate trebuie permise
  if (/ OR /.test(expr)) return expr.split(/ OR /).some((x) => okExpr(x.trim()))
  if (/ AND /.test(expr)) return expr.split(/ AND /).every((x) => okExpr(x.trim()))
  return ALLOWED.has(expr.trim())
}

const rows = []
const problems = []
for (const name of [...bundled].sort()) {
  const dir = resolve(root, 'node_modules', name)
  if (!existsSync(join(dir, 'package.json'))) {
    problems.push(`${name}: pachet negăsit în node_modules`)
    continue
  }
  const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const lic = normalize(pj.license ?? pj.licenses?.[0])
  if (!lic || FORBIDDEN.test(lic) || !okExpr(lic)) problems.push(`${name}@${pj.version}: licență nepermisă sau lipsă („${lic}”)`)
  rows.push({ name, version: pj.version, license: lic, repo: typeof pj.repository === 'string' ? pj.repository : pj.repository?.url ?? '', text: licenseText(dir), author: typeof pj.author === 'string' ? pj.author : pj.author?.name ?? '' })
}

// verificare suplimentară pe tot arborele de producție, cu license-checker-rseidelsohn
const checker = require('license-checker-rseidelsohn')
const all = await new Promise((res, rej) => checker.init({ start: root, production: true, excludePrivatePackages: true }, (err, data) => (err ? rej(err) : res(data))))
const nodeOnly = []
for (const [id, info] of Object.entries(all)) {
  const name = id.slice(0, id.lastIndexOf('@'))
  const lic = Array.isArray(info.licenses) ? info.licenses.join(' OR ') : String(info.licenses ?? '')
  if (bundled.has(name)) continue
  if (FORBIDDEN.test(lic) || !okExpr(lic.replace(/\*$/, '').replace(/^\(|\)$/g, ''))) nodeOnly.push(`${id} (${lic})`)
}

const font = readFileSync(resolve(root, 'src/assets/fonts/OFL.txt'), 'utf8').trim()
let md = `# Licențe terțe — SIA Teren\n\nGenerat automat de \`scripts/licenses.mjs\` din pachetele incluse efectiv în aplicația livrată.\nLicențe permise: ${[...ALLOWED].join(', ')}.\n\n`
md += `| Componentă | Versiune | Licență |\n|---|---|---|\n`
for (const r of rows) md += `| ${r.name} | ${r.version} | ${r.license} |\n`
md += `| Noto Sans (font, subset Latin) | 2022 | OFL-1.1 |\n\n`
for (const r of rows) md += `---\n\n## ${r.name} ${r.version} — ${r.license}\n${r.author ? `\nAutor: ${r.author}\n` : ''}${r.repo ? `\nSursă: ${r.repo}\n` : ''}\n${r.text ? '```\n' + r.text + '\n```\n' : '(textul licenței nu este inclus în pachet; licența declarată: ' + r.license + ')\n'}\n`
md += `---\n\n## Noto Sans — OFL-1.1\n\n\`\`\`\n${font}\n\`\`\`\n`
writeFileSync(resolve(root, 'THIRD-PARTY-LICENSES.md'), md)

console.log(`Pachete incluse în aplicație: ${rows.length} (+ fontul Noto Sans) — toate verificate.`)
if (nodeOnly.length) console.log(`Pachete de producție NEincluse în aplicația web (doar Node.js, dependențe ale Transformers.js):\n  ${nodeOnly.join('\n  ')}`)
if (problems.length) {
  console.error('LICENȚE NEPERMISE — livrarea se oprește:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('THIRD-PARTY-LICENSES.md generat. Licențe OK.')
