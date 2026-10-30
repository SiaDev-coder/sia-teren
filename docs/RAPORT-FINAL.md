# Raport final — SIA Teren v1 (publicat)

## 1. Linkuri și instalare

- **Aplicația: https://sia-teren.officesoftgest.workers.dev** (Cloudflare Workers, HTTPS, publicată pe 30.10.2026 cu `npm run deploy`).
- Cod: https://github.com/SiaDev-coder/sia-teren — PR #1 îmbinat în `main`; reparațiile de la publicare sunt în PR-ul nou de pe ramura `claude/meta-prompt-sia-teren-1hioo5`.

**Android (Chrome)** — 1) deschizi linkul în Chrome; 2) apeși „Instalează” (sau meniul ⋮ → „Instalează aplicația”); 3) pornești din iconița SIA Teren.

**iPhone (Safari)** — 1) deschizi linkul în Safari; 2) Partajare (pătratul cu săgeată) → „Adaugă pe ecranul principal” → „Adaugă”; 3) pornești din iconița SIA Teren (așa Safari nu șterge datele).

**Pentru notele vocale**, o singură dată, pe Wi-Fi: Mai mult → Setări → Model vocal → „Descarcă pentru folosire offline”.

## 2. Ce face (pe scurt)

1. Jurnal de șantier pe telefon: proiecte, raport zilnic (vreme, personal, utilaje cu ore, activități, materiale, probleme, SSM), salvat automat.
2. Constatări cu GPS, poze „înainte/după”, responsabil, termen, stări cu istoric și alertă pentru termene depășite.
3. Fotografii cu desen pe ele (săgeți, cercuri, text); în PDF primesc data, ora, GPS-ul și proiectul.
4. PDF-uri gata de semnat (zilnic, pe perioadă, constatări) cu logo, CSV pentru Excel, ZIP cu poze, copie de siguranță.
5. Merge fără internet; notele vocale se transformă în text în română direct pe telefon, după o descărcare unică a modelului.

## 3. Ce am verificat și cum

- Build fără erori, ESLint curat, TypeScript strict; JS inițial 138,3 KB gzip (limită 400 KB).
- **34 de teste unitare** — toate trec.
- **Toată suita E2E rulată pe linkul public**, profil Android (Chromium, Pixel 7) și iPhone (WebKit, iPhone 15): **45 trecute, 0 picate, 5 sărite intenționat** (2 teste „fără acces la huggingface.co” — acum accesul există; 3 teste doar-Chromium: microfon simulat, microfon refuzat, regresia V-08). Aceeași suită local (`vite preview`): toate trec, aceleași 5 sărite.
- **E2E 3 (offline) pe linkul public**: aplicația se încarcă o dată, rețeaua se taie de tot (proxy local închis — verificat că și cererile spre aplicație și spre internet eșuează), reîncărcare, proiect + raport + PDF fără rețea — trece pe Chromium și WebKit.
- **E2E 6 (voce) pe linkul public**: modelul „base” descărcat real de pe huggingface.co, rețeaua tăiată, fișier audio în română transcris pe telefon și inserat cu o atingere în „Observații” — trece pe Chromium și WebKit. Text de referință (voce sintetică eSpeak): „Astăzi am turnat betonul la căminul doisprezece. Lucrările de săpătură continuă mâine pe strada Școlii.”
  - „base”, Chromium: „Asta zi-am tu la pe toal la caminul de ois prene ce. Lui care vile de săr-a paturat continuă mine pe strata școlii.”
  - „small”, Chromium: „Asta-zi am tu n-at pe tonul la caminul dois prezece. Lucrările de Săpatura continuăm în epe strada școlii.”
- **Problemă reală găsită și reparată la publicare**: huggingface.co răspunde 404 cererilor care vin cu Referer de pe `*.workers.dev` — pe telefoane, descărcarea modelului vocal ar fi eșuat cu „Nu se poate afla mărimea modelului”. Aplicația nu mai trimite Referer (`Referrer-Policy: no-referrer`); test de regresie nou. Detalii: `PROBLEME.md` 14–18.
- Verificatorul independent (4 runde, prima sesiune): ultima rundă **0 critice, 0 majore** (`docs/verificare/`).
- Licențe: toate permisive; lista în aplicație la „Despre” și în `THIRD-PARTY-LICENSES.md`.

## 4. Limitări reale

- **Calitatea transcrierii**: pe vocea sintetică de test, „base” prinde ideea aproximativ, „small” e vizibil mai bun. Pe voce reală e de așteptat mai bine, dar textul trebuie recitit; pentru română alege „small” dacă telefonul are loc și Wi-Fi.
- Modelul vocal are zeci–sute de MB (mărimea exactă e arătată înainte de descărcare). Telefoanele fără WebGPU transcriu mai lent (pe procesor).
- Testele de telefon sunt făcute pe profile mobile simulate (Pixel 7 / iPhone 15 în Chromium și WebKit), nu pe telefoane fizice.
- Datele stau doar pe telefon: fără copie de siguranță, pierderea telefonului înseamnă pierderea datelor.
- Aceeași zi deschisă simultan în două ferestre, cu rânduri de personal/utilaje adăugate în ambele: rămâne lista ultimei ferestre (caz rar, R-06).
- Licența Zlib (biblioteca PDF) acceptată ca permisivă — `DECIZII.md`.
- Adresa e pe subdomeniul gratuit `workers.dev`; un domeniu propriu se poate adăuga oricând din Cloudflare, fără schimbări în aplicație.

## 5. Ce îți rămâne

Nimic obligatoriu. Opțional: după ce ești mulțumit, poți face „Roll” la tokenul Cloudflare (apare în istoricul unei conversații) și pui valoarea nouă în variabila de mediu.
