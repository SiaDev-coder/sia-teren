# SIA Teren — jurnal de șantier pe telefon, fără internet

**SIA Teren** este o aplicație pentru telefon (Android și iPhone) în care ții evidența zilnică a șantierului: raportul zilnic, constatările (neconformitățile), fotografiile și notele vocale. Merge **complet fără semnal**, după prima deschidere. La final scoți rapoarte PDF gata de semnat sau exporturi pentru Excel.

## Ce face

- **Proiecte** — câte unul pentru fiecare șantier (beneficiar, contract, lot, localitate, antreprenor, diriginte).
- **Raport zilnic** — vreme și temperaturi, personal pe categorii, utilaje cu ore (evidența cerută de FIDIC, Sub-Clauza 6.10), activități executate cu cantități, materiale recepționate, probleme, instrucțiuni, vizite, evenimente SSM, observații, fotografii. Se salvează singur la fiecare modificare. Butonul „Copiază din ziua precedentă” preia personalul și utilajele. Când e gata, îl **finalizezi** (se blochează); îl poți **redeschide** oricând.
- **Constatări** — titlu, categorie, gravitate, locație și GPS, responsabil, termen, fotografii **„înainte”** și **„după”**, stări (Deschisă → În lucru → Rezolvată → Verificată sau Anulată) cu istoric. Cele cu termenul depășit apar cu roșu.
- **Fotografii** — direct din cameră sau din galerie; poți desena pe ele (săgeată, cerc, dreptunghi, linie, text). Originalul rămâne neatins. În PDF, fiecare fotografie primește jos o bandă cu data, ora, coordonatele GPS și proiectul.
- **Note vocale** — înregistrezi sau atașezi un mesaj vocal; după ce descarci o dată „modelul vocal”, telefonul le **transformă în text în română, fără internet**. Textul îl pui cu o atingere în orice câmp.
- **PDF** — raport zilnic, raport pe perioadă și listă de constatări, cu logo-ul și datele firmei, fotografii și căsuțe goale pentru semnătură și ștampilă (Întocmit / Verificat / Supervizor – Diriginte). Le trimiți pe WhatsApp, e-mail sau Drive.
- **Excel (CSV)** — rapoarte și constatări, cu diacritice corecte, deschise direct în Excel cu setări românești. Plus **fotografii .zip** cu data, GPS-ul și proiectul scrise pe imagine.

## Instalare pe telefon

Aplicația se deschide dintr-o adresă de internet (link) și apoi se „instalează” pe ecranul principal. După instalare pornește din iconiță, ca orice aplicație.

**Android (Chrome)**
1. Deschide linkul aplicației în **Chrome**.
2. Apasă **„Instalează”** (în aplicație, sus) sau meniul ⋮ → **„Instalează aplicația”**.
3. Pornește de acum din iconița **SIA Teren**.

**iPhone (Safari)**
1. Deschide linkul aplicației în **Safari** (nu în alt browser).
2. Apasă butonul **Partajare** (pătratul cu săgeată în sus) → **„Adaugă pe ecranul principal”** → **„Adaugă”**.
3. Pornește de acum din iconița **SIA Teren**.

> Pe iPhone e important să o adaugi pe ecranul principal: altfel Safari poate șterge datele site-urilor nefolosite 7 zile.

## Folosire fără internet

După prima deschidere (cu internet), aplicația merge și în **modul avion**: pornește, salvează, face fotografii, generează PDF-uri și copii de siguranță. Singurul lucru care cere internet, **o singură dată**, este descărcarea modelului vocal (Mai mult → Setări → Model vocal) — fă-o pe Wi-Fi.

## Unde stau datele

**Toate datele stau doar pe telefonul tău.** Nu există cont, nu există server, nimic nu se trimite nicăieri. Asta înseamnă și că, dacă pierzi telefonul sau ștergi aplicația, datele se pierd — de aceea există copia de siguranță.

## Copia de siguranță

Mai mult → **Copie de siguranță** → „Creează și trimite copia”. Primești un fișier `.zip` cu tot (proiecte, rapoarte, constatări, fotografii, note vocale). Trimite-l pe Drive sau pe e-mail. Aplicația îți amintește dacă au trecut 7 zile de la ultima copie și ai date noi.

## Când schimbi telefonul

1. Pe telefonul vechi: Mai mult → Copie de siguranță → „Creează și trimite copia” (de ex. pe Drive sau e-mail).
2. Pe telefonul nou: instalează aplicația (pașii de mai sus) și descarcă fișierul copiei.
3. Mai mult → Copie de siguranță → „Alege fișierul copiei…” → **„Înlocuiește tot”**.

Modelul vocal se descarcă din nou pe telefonul nou (nu intră în copie, ca fișierul să fie mic).

## Ghid pas cu pas

Vezi [GHID-UTILIZARE.md](GHID-UTILIZARE.md) — cu imagini din aplicație.

---

### Pentru cine întreține aplicația

- Cerințele complete: [`docs/META-PROMPT.md`](docs/META-PROMPT.md); deciziile: [`DECIZII.md`](DECIZII.md); stadiul: [`PROGRES.md`](PROGRES.md); probleme rezolvate: [`PROBLEME.md`](PROBLEME.md).
- Node 22: `npm ci` · `npm run dev` · `npm test` (unitare) · `npm run build && npx playwright test` (E2E) · `npm run lint`.
- Livrare: `npm run release` (build + verificare licențe + `THIRD-PARTY-LICENSES.md` + buget JS ≤ 400 KB gzip) · `npm run deploy` (Cloudflare, cu `CLOUDFLARE_API_TOKEN` și `CLOUDFLARE_ACCOUNT_ID` în mediu).
- Stack: Vite + React + TypeScript, vite-plugin-pwa (Workbox), Dexie (IndexedDB), pdf-lib + fontkit (Noto Sans OFL), fflate, Transformers.js (Whisper) cu ONNX Runtime Web servit din aplicație.
