// Copiază fișierele ONNX Runtime Web necesare transcrierii în public/ort/,
// binarele .wasm comprimate gzip (limita de 25 MiB pe fișier la Cloudflare).
import { createReadStream, createWriteStream, mkdirSync, copyFileSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const root = resolve(import.meta.dirname, '..')
// Versiunea ONNX Runtime folosită de Transformers.js (aceeași cu cea din bundle).
const ortDir = resolve(root, 'node_modules', 'onnxruntime-web')
const ortVersion = JSON.parse(readFileSync(resolve(ortDir, 'package.json'), 'utf8')).version
// Fișierele stau într-un dosar cu versiunea, ca o actualizare a aplicației să nu amestece
// codul JS nou cu binare vechi rămase în cache.
const outRoot = resolve(root, 'public', 'ort')
rmSync(outRoot, { recursive: true, force: true })
const out = resolve(outRoot, ortVersion)
mkdirSync(out, { recursive: true })

const variants = ['ort-wasm-simd-threaded', 'ort-wasm-simd-threaded.asyncify']
const manifest = { version: ortVersion, files: {} }
for (const v of variants) {
  const src = resolve(ortDir, 'dist', `${v}.wasm`)
  const gz = resolve(out, `${v}.wasm.gzdata`)
  await pipeline(createReadStream(src), createGzip({ level: 9 }), createWriteStream(gz))
  copyFileSync(resolve(ortDir, 'dist', `${v}.mjs`), resolve(out, `${v}.mjs`))
  manifest.files[v] = {
    wasmGz: `${ortVersion}/${v}.wasm.gzdata`,
    mjs: `${ortVersion}/${v}.mjs`,
    wasmGzBytes: statSync(gz).size,
    mjsBytes: statSync(resolve(out, `${v}.mjs`)).size,
  }
}
// lista fișierelor intră direct în codul worker-ului (aceeași versiune cu JS-ul livrat)
writeFileSync(resolve(root, 'src', 'workers', 'ort-files.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`ONNX Runtime ${ortVersion} pregătit în public/ort/`)
for (const [k, f] of Object.entries(manifest.files)) console.log(` ${k}: ${(f.wasmGzBytes / 1048576).toFixed(1)} MB gzip`)
