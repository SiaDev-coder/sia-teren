# DECIZII — SIA Teren

Format: **decizie** — motiv — sursă.

## Faza 0 — mediu și cercetare (2026-10-29)

### Mediu
- Node `v22.22.0`, npm `10.9.4`, git `2.43.0`, OpenJDK 21. Vite 8.3.5 cere Node `^20.19.0 || >=22.12.0` (`npm view vite engines`) → Node 22 e compatibil.
- Repo real atașat sesiunii: `SiaDev-coder/sia-teren` (nu `sia-dynamic-solution/sia-teren` cum scrie în parametri). Lucrez pe repo-ul atașat, ramura `claude/meta-prompt-sia-teren-1hioo5`. Repo-ul era gol (fără ramura `main`).
- Parametri: `DEPLOY = cloudflare` (prima valoare din tabel și cea descrisă în secțiunea 8), `APK_ANDROID = nu` (prima valoare din tabel). APK-ul nu se face în v1.

### Testul de rețea (secțiunea 1b)
| Destinație | Rezultat |
|---|---|
| `huggingface.co` | **BLOCAT** (proxy 403 la CONNECT) |
| `cdn.playwright.dev` | accesibil (307 → `playwright.download.prss.microsoft.com`, 200) |
| `api.cloudflare.com` | **BLOCAT** (403) |
| `*.workers.dev` | **BLOCAT** (403) |
| `registry.npmjs.org`, `raw.githubusercontent.com`, `archive.ubuntu.com` | accesibile |

Consecință: descărcarea modelului Whisper (E2E 6) și deploy-ul Cloudflare nu se pot executa din această sesiune. Codul este complet; pasul rămas îi revine lui Ionuț (mediu „Full” + token Cloudflare).

### Dependențe (versiunea instalată + licența, verificate cu `npm view` / `package.json`)
| Pachet | Versiune | Licență | Rol |
|---|---|---|---|
| `react`, `react-dom` | 19.3.1 | MIT | interfața |
| `dexie` | 4.4.7 | Apache-2.0 | IndexedDB |
| `dexie-react-hooks` | 4.4.0 | Apache-2.0 | `useLiveQuery` |
| `@huggingface/transformers` | 4.3.2 | Apache-2.0 | Whisper pe dispozitiv |
| `onnxruntime-web` | 1.31.0-dev.20260914 (versiunea cerută exact de Transformers.js 4.3.2) | MIT | motorul ONNX (WASM / WebGPU) |
| `pdf-lib` | 1.17.1 | MIT | generare PDF |
| `@pdf-lib/fontkit` | 1.1.1 | MIT | font TTF încorporat |
| `fflate` | 0.8.3 | MIT | ZIP backup |
| `workbox-window` | 7.4.1 | MIT | înregistrare service worker |
| Noto Sans Regular + Bold (TTF) | 2022, notofonts | OFL-1.1 (fără Reserved Font Name) | font PDF cu ș/ț |
| `vite` | 8.3.5 | MIT | build (dezvoltare) |
| `@vitejs/plugin-react` | 6.1.2 | MIT | dezvoltare |
| `vite-plugin-pwa` / `workbox-build` | 2.0.0 / 7.4.1 | MIT | service worker + manifest |
| `typescript` | 6.0.3 | Apache-2.0 | dezvoltare |
| `vitest` | 5.0.5 | MIT | teste unitare |
| `@playwright/test` | 1.63.0 | Apache-2.0 | E2E |
| `eslint` / `typescript-eslint` | 10.13.0 / 8.72.1 | MIT | lint |
| `fake-indexeddb` | 6.2.6 | Apache-2.0 | teste unitare (IndexedDB în Node) |
| `pdfjs-dist` | 6.4.299 | Apache-2.0 | teste: extragere text din PDF |
| `license-checker-rseidelsohn` | 4.4.2 | BSD-3-Clause | verificare licențe |
| `wrangler` | 4.156.0 | MIT OR Apache-2.0 | deploy Cloudflare (dezvoltare) |

### Decizii tehnice
- **TypeScript 6.0.x, nu 7.0.2** (ultima). Motiv: `typescript-eslint` 8.72.1 are `peerDependencies.typescript: ">=4.8.4 <6.1.0"`. Sursă: `npm view typescript-eslint peerDependencies`.
- **`@playwright/test` fixat la 1.63.0**. Motiv: mediul are Chromium 1243 preinstalat pentru Playwright 1.63; o altă versiune nu-l găsește. WebKit instalat cu `npx playwright install --with-deps webkit` (CDN Playwright accesibil).
- **Bibliotecă PDF: `pdf-lib` + `@pdf-lib/fontkit`** (nu jsPDF). Motiv: API de nivel jos clar pentru încorporare JPEG/PNG și fonturi TTF cu subset, generează `ToUnicode` CMap (textul se poate extrage corect → testul diacriticelor). Sursă: https://pdf-lib.js.org/ (secțiunea „Embed Font and Measure Text”, `registerFontkit`).
- **Font: Noto Sans Regular + Bold**, descărcat de la `notofonts/notofonts.github.io` (TTF hinted), redus cu `pyftsubset` (fonttools) la Latin + Latin Extended (inclusiv U+0218–U+021B: Ș ș Ț ț) — 80 KB / fișier în loc de 620 KB. OFL permite modificarea; fontul nu are „Reserved Font Name”. Inclus în aplicație (`src/assets/fonts`), nu descărcat la rulare.
- **Rutare: hash routing** (`#/proiect/…`), router propriu minimal. Motiv: merge la deschiderea directă a oricărui link pe orice găzduire și offline fără reguli de fallback pe server; service worker-ul servește mereu `index.html` pentru navigări (precache). Nu mai e nevoie de `not_found_handling` la Cloudflare.
- **Stiluri: CSS propriu** cu variabile (temă luminoasă/întunecată), fără Tailwind — mai puține dependențe, control total pe contrast și ținte de 48 px.
- **Model vocal: `onnx-community/whisper-base` și `onnx-community/whisper-small`.** Nu am putut confirma ID-urile prin `https://huggingface.co/api/models/...` (huggingface.co blocat în sesiune). Aplicația verifică la rulare existența fișierelor (ModelRegistry din Transformers.js 4: `get_pipeline_files` + `get_file_metadata`) înainte de descărcare și afișează mărimea reală; dacă un ID nu există, afișează eroare clară.
- **dtype Whisper:** WASM → `encoder_model: q8`, `decoder_model_merged: q8`; WebGPU → `encoder_model: fp32`, `decoder_model_merged: q4` (setările din demo-urile oficiale Transformers.js pentru Whisper WebGPU).
- **Fișierele WASM ONNX Runtime** — Transformers.js 4 le ia implicit de pe `cdn.jsdelivr.net` (`src/backends/onnx.js`: `wasmPathPrefix = https://cdn.jsdelivr.net/npm/onnxruntime-web@…`). Le servesc din aplicație (`/ort/`). Varianta `asyncify` (necesară WebGPU) are 26,9 MB, peste limita de **25 MiB pe fișier** la Cloudflare Workers Static Assets → le livrez **comprimate gzip** (`*.wasm.gz`) și le decomprim în worker cu `DecompressionStream('gzip')`, apoi le dau la ONNX Runtime prin `env.backends.onnx.wasm.wasmBinary`. La „Descarcă modelul” fișierele (`.wasm.gz` + factory `.mjs`) se pun în cache-ul `sia-ort` (Cache API); offline se citesc doar de acolo. WebGPU → `ort-wasm-simd-threaded.asyncify`; WASM → `ort-wasm-simd-threaded` (simplu, 14 MB) — aceeași logică de alegere ca în Transformers.js pentru Safari fără WebGPU.
- **Verificarea licențelor pe ce se livrează efectiv**: un plugin Vite colectează pachetele din `node_modules` care ajung în bundle (`dist/.bundled-packages.json`), iar scriptul `scripts/licenses.mjs` verifică licența fiecăruia cu lista permisă + `license-checker-rseidelsohn` pe arborele de producție. `@huggingface/transformers` depinde și de `sharp`/`@img/sharp-libvips-*` (LGPL-3.0) și `onnxruntime-node` — pachete **doar pentru Node.js**, care nu intră în aplicația web (build-ul web folosește `transformers.web.js`); raportul le listează separat ca „neincluse în aplicație”.

## Faza 1 — schelet
- **Service worker**: `vite-plugin-pwa` `generateSW`, `registerType: 'prompt'`, `injectRegister: false` + `useRegisterSW` (banner „Versiune nouă — Actualizează”, fără reîncărcare automată). `navigateFallback: index.html`, precache pentru tot shell-ul (JS, CSS, HTML, iconițe, fonturi). Limita Workbox de 2 MiB ridicată conștient la 4 MiB pentru fragmentul PDF (pdf-lib + fontkit, 1,1 MB) și cel Transformers.js (0,5 MB); binarele ONNX (`/ort/**`) sunt excluse din precache.
- **onnxruntime-web fără `.wasm` în bundle**: `resolve.conditions` include `onnxruntime-web-use-extern-wasm` (condiție oficială din `package.json` al onnxruntime-web) → se folosește `ort.webgpu.min.mjs`, care încarcă binarul din calea dată de noi.
- **Fișierele ONNX Runtime sunt versionate** (`/ort/<versiune>/…`), iar lista lor (`src/workers/ort-files.json`) e generată la build și inclusă în codul worker-ului — după o actualizare a aplicației nu se poate amesteca JS nou cu binare vechi din cache; versiunile vechi se șterg din cache la următoarea pregătire a motorului.
- **Teste E2E offline pe WebKit**: `context.setOffline(true)` din Playwright face ca în WebKit și navigările servite de service worker să eșueze („WebKit encountered an internal error”) — limitare a Playwright, nu a aplicației. Am verificat separat că, oprind serverul, WebKit reîncarcă aplicația din service worker. De aceea fiecare test pornește propriul `vite preview` (build de producție, port liber, origine separată), iar „fără rețea” = server oprit (toate browserele) + `setOffline(true)` (Chromium).
- **Profiluri E2E**: `Pixel 7` (Chromium, Android) și `iPhone 15` (WebKit 26.6).
