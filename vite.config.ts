import { defineConfig, defaultClientConditions, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

/**
 * Colectează pachetele din node_modules care ajung efectiv în aplicația livrată.
 * Lista e folosită de scripts/licenses.mjs pentru verificarea licențelor.
 */
const bundled = new Set<string>()
function bundledPackages(write: boolean): Plugin {
  return {
    name: 'sia-bundled-packages',
    apply: 'build',
    moduleParsed(info) {
      const m = /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(info.id)
      if (m) bundled.add(m[1].replace(/\\/g, '/'))
    },
    closeBundle() {
      if (!write) return
      mkdirSync(resolve(import.meta.dirname, 'dist'), { recursive: true })
      writeFileSync(resolve(import.meta.dirname, 'dist/.bundled-packages.json'), JSON.stringify([...bundled].sort(), null, 2))
    },
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    // onnxruntime-web: folosim varianta care NU include fișierul .wasm în bundle;
    // binarul vine din /ort/ (vezi src/workers/asr.worker.ts și DECIZII.md).
    conditions: [...defaultClientConditions, 'onnxruntime-web-use-extern-wasm'],
  },
  worker: {
    format: 'es',
    plugins: () => [bundledPackages(false)],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    reportCompressedSize: true,
  },
  plugins: [
    react(),
    bundledPackages(true),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'SIA Teren — jurnal de șantier',
        short_name: 'SIA Teren',
        description: 'Jurnal de șantier offline: rapoarte zilnice, constatări, fotografii, note vocale și PDF, totul pe telefon.',
        lang: 'ro',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1b2733',
        background_color: '#1b2733',
        categories: ['productivity', 'business'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ttf,webmanifest}'],
        globIgnores: ['ort/**'],
        // Fragmentul Transformers.js + ONNX Runtime (JS) depășește 2 MiB; îl precache-uim
        // conștient ca transcrierea să meargă offline. Binarele .wasm NU sunt în precache.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
})
