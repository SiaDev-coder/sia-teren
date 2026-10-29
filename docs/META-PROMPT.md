# META-PROMPT — „SIA Teren”: jurnal de șantier offline, cu AI pe telefon

> **Sursa acestui fișier:** SIA SERVER (Nextcloud) → `99_AI_WORKSPACE/20_SIA-Teren/META-PROMPT-SIA-Teren.md`, citit prin conectorul MCP „SIA SERVER”.
> **Unde rulează:** Claude Code în cloud (claude.ai/code), pe repo-ul GitHub `sia-dynamic-solution/sia-teren`. Merge și local, cu aceleași reguli (vezi 1b).

---

## 0. PARAMETRI (editezi doar aici)

| Parametru | Valoare |
|---|---|
| NUME_APLICATIE | SIA Teren |
| FIRMA_IMPLICITA | SIA Dynamic Solution SRL (doar valoare implicită în Setări, editabilă în aplicație) |
| LIMBA_UI | română, cu diacritice corecte (ș, ț cu virgulă dedesubt, nu cu sedilă) |
| REPO_GITHUB | `sia-dynamic-solution/sia-teren` (privat, atașat sesiunii cloud) |
| FOLDER_SIA_SERVER | `99_AI_WORKSPACE/20_SIA-Teren` |
| DEPLOY | `cloudflare` (Workers Static Assets) · `niciunul` |
| APK_ANDROID | `nu` · `da` = încearcă și un APK Android prin Capacitor, dacă mediul permite |

---

## 1. Rolul tău și regulile sesiunii

Ești echipa completă: arhitect, dezvoltator, designer, tester și verificator. Lucrezi autonom până bifezi toată **Definiția de Gata** (secțiunea 9). Utilizatorul (Ionuț) nu este programator.

1. **Nimic simulat.** Fără mock-uri în aplicație, fără mod demo, fără date fictive preîncărcate, fără butoane care nu fac nimic. Fiecare funcție vizibilă în UI merge cap-coadă. Datele de test există doar în teste.
2. **Nu inventezi.** Înainte să folosești o bibliotecă, verifici versiunea stabilă curentă și licența (`npm view <pachet> version license`) și citești documentația ei oficială curentă. Dacă ceva din acest prompt diferă de documentație, urmezi documentația și notezi în `DECIZII.md`.
3. **Licențe** pentru tot ce ajunge în aplicația livrată: doar permisive (MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0; OFL-1.1 pentru fonturi). Interzise: GPL, LGPL, AGPL, SSPL, BUSL, orice „non-commercial”. Verificare automată la final.
4. **Trei fișiere vii** în rădăcina proiectului: `PROGRES.md` (faze bifate + dovada), `DECIZII.md` (decizie + motiv + sursă), `PROBLEME.md` (ce n-a mers și cum ai rezolvat). Dacă sesiunea își compactează contextul, reiei exact din ele.
5. Folosești lista de sarcini pentru fazele din secțiunea 6; **commit git la finalul fiecărei faze**, mesaje în română.
6. **Nu te opri să ceri aprobare.** Singura excepție: un pas care cere contul lui Ionuț (ex. token Cloudflare lipsă). Termini tot restul, apoi ceri acel pas o singură dată, la final, cu instrucțiuni exacte.
7. Tot ce îi scrii lui Ionuț e în română simplă, fără jargon.

## 1b. Rulare în Claude Code cloud

- Mediul e o mașină Ubuntu 24.04 nouă (aprox. 4 vCPU, 16 GB RAM, 30 GB disc), cu Node 20/21/22 prin nvm și OpenJDK 21. Verifici cu `check-tools`; folosești Node 22 (`nvm use 22`).
- **Primul pas:** citești acest fișier de pe SIA SERVER prin MCP (`nc_webdav_read_file` pe `FOLDER_SIA_SERVER/META-PROMPT-SIA-Teren.md`) și îl copiezi în rădăcina repo-ului ca `docs/META-PROMPT.md`. De acolo lucrezi; dacă se compactează contextul, îl recitești din repo.
- **Rețea:** testezi întâi accesul la `huggingface.co`, `cdn.playwright.dev`, `api.cloudflare.com` și `*.workers.dev`. Dacă vreunul e blocat (eroare 403 / `host_not_allowed`), nu cauți ocolișuri: continui tot ce nu depinde de el și îi spui lui Ionuț, la final, să seteze mediul cloud pe **Full** (sau **Custom** cu `huggingface.co`, `*.huggingface.co`, `*.hf.co`, `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`, `api.cloudflare.com`, `*.workers.dev` + lista implicită bifată) și să reia sesiunea.
- Playwright: `npx playwright install --with-deps chromium webkit`.
- **Git:** în cloud poți împinge doar pe ramura de lucru a sesiunii. Commit pe fază, push pe acea ramură, iar la final deschizi un **Pull Request către `main`** cu descrierea în română (ce conține, ce s-a testat).
- **Credențiale:** nu există seif de secrete; nu scrii niciun token în cod, în commit-uri sau pe SIA SERVER. Deploy-ul Cloudflare folosește doar variabilele de mediu `CLOUDFLARE_API_TOKEN` și `CLOUDFLARE_ACCOUNT_ID`, dacă există.
- **SIA SERVER:** doar citești și creezi fișiere noi în `FOLDER_SIA_SERVER`. Nu ștergi, nu muți și nu suprascrii nimic altceva pe server.

---

## 2. Ce construiești

O **aplicație web progresivă (PWA)** instalabilă pe Android și iPhone, care funcționează **100% fără internet** după prima deschidere. Utilizatori: ingineri, șefi de punct de lucru, responsabili tehnici și diriginți pe șantiere de apă-canal (SPAU, SEAU, rețele), adesea fără semnal. **Toate datele rămân pe telefon (local-first)**; nimic nu pleacă pe vreun server.

Toate modulele de mai jos sunt obligatorii.

### 2.1 Proiecte
- Creare / editare / arhivare: denumire, beneficiar, număr contract, lot (CL), localitate și județ, antreprenor, supervizor / diriginte de șantier, dată început.
- Ecranul principal = proiectele active, ultimul folosit primul.

### 2.2 Raport zilnic de șantier
Acoperă evidența zilnică a personalului și utilajelor cerută în contractele FIDIC (Sub-Clauza 6.10, Cartea Roșie 1999).
- Câmpuri: dată (unică per proiect — dacă există deja, se deschide cel existent); vreme (senin / noros / ploaie / ninsoare / ceață / vânt puternic — selecție multiplă); temperatură dimineață și prânz (°C, introdusă manual); **personal pe categorii** (categorie + număr, listă editabilă); **utilaje** (denumire + număr + ore); **activități executate** (descriere + cantitate + UM + locație / tronson); **materiale recepționate** (denumire + cantitate + UM + aviz / factură); probleme, întârzieri și cauze; instrucțiuni primite (de la cine); vizite pe șantier; evenimente SSM; observații; fotografii atașate.
- **Salvare automată** la fiecare modificare, cu indicator „Salvat”.
- **„Copiază din ziua precedentă”** pentru personal și utilaje.
- Stare: Ciornă → Finalizat. Finalizat = blocat la editare, cu acțiunea explicită „Redeschide”.

### 2.3 Constatări / neconformități (punch list)
- Câmpuri: titlu, descriere, categorie (calitate, SSM, mediu, documentație, altele), gravitate (minoră / majoră / critică), locație text + GPS, responsabil, termen, stare (Deschisă → În lucru → Rezolvată → Verificată, plus Anulată), fotografii **„înainte”** și **„după”**.
- Istoricul schimbărilor de stare cu data și ora.
- Filtre: stare, gravitate, responsabil, **depășite** (termen trecut, neînchise) — evidențiate vizual.

### 2.4 Foto-dovadă
- Fotografiere direct din aplicație (`<input type="file" accept="image/*" capture="environment">`) sau din galerie, mai multe deodată.
- La salvare: redimensionare la max. 2048 px pe latura mare, JPEG ~0,85, orientare corectă; metadate proprii: data / ora, GPS (dacă e permis), proiectul.
- **Adnotare pe fotografie**: săgeată, cerc / dreptunghi, linie liberă, text; 3–4 culori; anulare pas. Originalul se păstrează; adnotarea e un strat separat, editabil ulterior.
- La export (PDF / ZIP), fotografiile primesc o **bandă de text arsă în imagine**: data / ora, coordonatele, proiectul.

### 2.5 Note vocale cu transcriere offline (AI pe telefon)
- Înregistrare cu `MediaRecorder`; alegi primul tip suportat din: `audio/webm;codecs=opus`, `audio/mp4`, `audio/ogg` (iPhone folosește `audio/mp4`).
- **Transcriere în română 100% pe dispozitiv** cu Whisper prin `@huggingface/transformers` (Transformers.js), într-un **Web Worker** (interfața nu se blochează):
  - audio decodat cu Web Audio și **reeșantionat la 16 kHz mono `Float32Array`** (prin `OfflineAudioContext`) — formatul cerut de Whisper;
  - `device: "webgpu"` **doar** dacă `navigator.gpu?.requestAdapter()` întoarce un adaptor non-null, altfel `"wasm"`;
  - limba română, sarcina „transcribe”, procesare pe bucăți de 30 s.
- Modelul **nu** e inclus în aplicație. În Setări → „Model vocal”: buton „Descarcă pentru folosire offline”, mărimea afișată înainte, bară de progres, buton de ștergere. Variante: `whisper-base` (rapid) și `whisper-small` (recomandat pentru română). Verifici întâi că ID-urile există (ex. `https://huggingface.co/api/models/onnx-community/whisper-small`); dacă nu, alegi echivalentul oficial existent și notezi în `DECIZII.md`. Selecție implicită: `small` pe dispozitive cu WebGPU, `base` în rest; utilizatorul poate schimba.
- **Capcană critică offline:** fișierele WASM ale ONNX Runtime se încarcă implicit de pe un CDN. Le servești din aplicație (configurezi căile WASM în Transformers.js) și le pui în cache **la descărcarea modelului**, altfel transcrierea pică fără internet. Testul E2E nr. 6 trebuie s-o dovedească.
- Textul transcris se inserează cu un tap în orice câmp text din raport sau constatare; audio-ul original rămâne atașat.
- Dacă dispozitivul nu poate rula modelul (memorie insuficientă / eroare): mesaj clar în română, iar nota rămâne salvată ca audio.

### 2.6 Rapoarte PDF generate offline
- **Raport zilnic** (o zi), **Raport pe perioadă** (interval de date, un proiect), **Listă constatări** (cu filtrele aplicate) — cu fotografiile incluse.
- Antet din Setări: logo (încărcat de utilizator), denumirea firmei, date proiect / contract / lot.
- La final, **blocuri de semnătură goale** pentru semnătură olografă și ștampilă: Întocmit / Verificat / Supervizor – Diriginte (documentele se semnează fizic).
- **Diacritice:** fonturile standard PDF NU conțin ș / ț (U+0219, U+021B). Încorporezi un font TTF cu licență OFL (ex. Noto Sans sau Inter, regular + bold), **inclus în aplicație**, nu descărcat la rulare. Test automat: textul „ȘȚĂÎÂ șțăîâ” extras din PDF-ul generat este identic.
- Bibliotecă: `pdf-lib` + `@pdf-lib/fontkit` (MIT) sau `jsPDF` (MIT) — alegi după verificare și notezi.
- Partajare cu Web Share API (`navigator.canShare({ files })`) → WhatsApp / e-mail / Drive; dacă nu e suportat: descărcare.

### 2.7 Export, copie de siguranță, restaurare
- **CSV** pentru rapoarte și constatări: UTF-8 **cu BOM**, separator **„;”** (Excel cu setări românești), date `ZZ.LL.AAAA`, virgulă zecimală.
- **Copie de siguranță completă `.zip`** (`fflate`, MIT): `manifest.json` (versiunea schemei, data, aplicația), `date.json`, `foto/`, `audio/`.
- **Restaurare** cu validare, două moduri: „Înlocuiește tot” și „Adaugă / actualizează” (după `id` și `updatedAt`). Un fișier corupt sau străin nu strică nimic și primește mesaj clar.
- Amintire de backup dacă au trecut 7 zile de la ultima copie și există date noi.

### 2.8 Setări
Date firmă + logo · numele utilizatorului (apare la „Întocmit”) · temă luminoasă / întunecată / automat · model vocal · spațiu folosit (`navigator.storage.estimate()`) și starea stocării persistente · „Despre”: versiune + licențele terților generate automat.

---

## 3. Stack (verifici versiunile curente, nu le ghicești)

- **Vite + React + TypeScript** (`strict: true`).
- **vite-plugin-pwa** (Workbox): precache pentru tot shell-ul aplicației; `registerType: 'prompt'` cu banner „Versiune nouă — Actualizează” (nu reîncarci singur peste un formular deschis). Atenție: Workbox are implicit o limită de 2 MiB pe fișier la precache — tratezi conștient fișierele mari (font, bibliotecă PDF).
- **Dexie.js** (Apache-2.0) peste IndexedDB; fotografii și audio ca `Blob`; schemă versionată, cu migrări.
- Rutare care merge offline **și** la deschiderea directă a unui link (hash routing, sau history + `navigateFallback` în service worker + fallback SPA la găzduire) — alegi și justifici.
- Stiluri: Tailwind CSS (MIT) sau CSS propriu; componente proprii accesibile (Radix primitives doar dacă e nevoie). Fără aspect de „template generic”.
- ID-uri cu `crypto.randomUUID()`; fiecare înregistrare are `createdAt`, `updatedAt`, `deletedAt` (ștergere logică, Coș golit după 30 de zile) — pregătește o sincronizare viitoare fără s-o implementezi acum.
- Biblioteci grele (PDF, font, Transformers.js) încărcate leneș (`import()` dinamic), dar disponibile offline.
- Teste: **Vitest** (unitar), **Playwright** (E2E), **ESLint**.
- **Fără** backend, conturi, analytics, trackere. Singura cerere de rețea permisă după instalare: descărcarea explicită a modelului vocal.

---

## 4. Offline și stocare — obligatoriu

- După prima încărcare, aplicația pornește și merge complet **în modul avion**: inclusiv reîncărcare de pagină și pornire din iconița de pe ecranul principal.
- `navigator.storage.persist()` cerut după prima salvare de date; rezultatul afișat în Setări.
- **iPhone:** Safari șterge datele site-urilor nevizitate 7 zile, dar nu pe cele ale aplicațiilor adăugate pe ecranul principal. Detectezi iOS neinstalat (`navigator.standalone !== true`) și afișezi un ghid ilustrat: Partajare → „Adaugă pe ecranul principal”. **Android / Chrome:** buton „Instalează” prin `beforeinstallprompt`.
- Manifest complet: `name`, `short_name`, iconițe 192 / 512 + `maskable`, `theme_color`, `background_color`, `display: standalone`, orientare portrait, `lang: "ro"`, `start_url` și `scope` corecte. Iconiță originală desenată de tine (SVG → PNG), nu imagini de pe internet.
- Lighthouse nu mai are categorie PWA: verifici instalabilitatea prin criteriile manifestului + test Playwright pe service worker.
- **GPS** merge fără internet, dar poate dura: timeout 20 s, afișezi precizia în metri, permiți salvarea fără GPS. Permisiuni refuzate (cameră, microfon, locație) = mesaj clar, aplicația continuă.

---

## 5. UX pentru șantier

- Folosire cu o mână și cu mănuși: ținte de atingere ≥ 48 px; navigare jos (Proiecte / Azi / Constatări / Mai mult); buton mare „+” contextual.
- Lizibil în soare: contrast cel puțin WCAG AA, text ≥ 16 px; mod întunecat.
- Maxim **2 atingeri** de la ecranul principal la „fotografie nouă în raportul de azi”.
- Formulare lungi pe secțiuni pliabile; nimic nu se pierde la închiderea aplicației, la un apel sau la baterie descărcată (scrieri imediate în IndexedDB).
- Română corectă peste tot; formate românești pentru dată, oră și numere.
- Stări goale utile (ce faci întâi), erori explicite, confirmare la ștergere, Coș pentru recuperare.
- Design sobru, profesional, de instrument industrial.

---

## 6. Faze de execuție

| Fază | Conținut | Dovada în `PROGRES.md` |
|---|---|---|
| 0 | **Mediu și cercetare** (fără cod de aplicație): `node -v`, `npm -v`, `git --version`; verifici cerința de Node a versiunii curente de Vite (în cloud: `nvm use 22`); testul de rețea din 1b; tabel cu toate dependențele: versiune + licență; documentația oficială curentă pentru vite-plugin-pwa, Transformers.js (pipeline ASR, căi WASM, cache), Dexie, biblioteca PDF, Playwright offline (`context.setOffline`); ID-urile modelelor Whisper. | tabel în `DECIZII.md` |
| 1 | Schelet: proiect, PWA, Dexie, rutare, layout, Setări de bază | test: shell-ul pornește offline |
| 2 | Proiecte + Raport zilnic | teste unitare + E2E 1 parțial |
| 3 | Foto + adnotare + GPS | E2E cu fotografie adnotată |
| 4 | Constatări | E2E 2 |
| 5 | PDF + CSV + partajare | test diacritice PDF, test CSV |
| 6 | Copie de siguranță / restaurare | E2E 5 |
| 7 | Note vocale + Whisper | E2E 6 |
| 8 | Șlefuire: UX, accesibilitate, performanță, ghid de instalare | capturi Playwright |
| 9 | Verificare independentă (secțiunea 7) | raportul verificatorului |
| 10 | Livrare (secțiunea 8) | URL + raport final |

---

## 7. Calitate și verificare

- `npm run build` fără erori și fără avertismente TypeScript; ESLint curat.
- **Teste unitare:** migrări de schemă, ștergere logică, backup → restaurare dus-întors identic, CSV (BOM, separator, diacritice), reeșantionare audio la 16 kHz, PDF (diacritice extrase corect).
- **E2E Playwright** pe profiluri mobile (Android pe Chromium + iPhone pe WebKit), pe build-ul de producție (`vite preview`):
  1. flux complet: proiect → raport zilnic cu personal, utilaje, activitate, fotografie adnotată → finalizare → PDF descărcat și valid;
  2. constatare cu foto înainte / după și schimbări de stare;
  3. **offline:** încărcare o dată → `setOffline(true)` → reîncărcare → creare date → generare PDF — totul merge;
  4. persistență: închizi contextul, îl redeschizi, datele sunt acolo;
  5. backup → ștergi tot → restaurare → date identice;
  6. model vocal: descărcare online, apoi **offline** transcrie un fișier audio de test în română (sursă cu licență liberă, cu atribuire în `tests/fixtures/ATRIBUIRE.md`) → text nevid.
- **Volum:** 1.000 de rapoarte și 300 de constatări generate în test → listele rămân fluide.
- **Buget:** încărcarea inițială ≤ 400 KB JavaScript comprimat (gzip), fără modelul vocal.
- **Licențe:** verificator automat pe dependențele de producție (ex. `license-checker-rseidelsohn`) cu lista permisă din secțiunea 1; orice licență interzisă oprește livrarea. Generezi `THIRD-PARTY-LICENSES.md`, afișat în „Despre”.
- **Verificare independentă:** lansezi un subagent nou, cu context curat, căruia **nu** îi dai rezumatul tău. Sarcina lui: citește acest META-PROMPT și codul, rulează build-ul și testele, încearcă să strice aplicația (offline, volum mare, diacritice, ștergeri, restaurare din fișier corupt, permisiuni refuzate, reîncărcare în mijlocul unui formular), compară fiecare cerință cu ce există și listează constatările cu severitate. Tu repari, el re-verifică. Repeți până la **zero constatări majore sau critice**.

---

## 8. Livrare

- `README.md` în română, pentru Ionuț (nu pentru programatori): ce face aplicația, instalare pe Android și pe iPhone, folosire offline, copia de siguranță, ce date stau doar pe telefon, ce face la schimbarea telefonului.
- `GHID-UTILIZARE.md` pas cu pas, cu capturi de ecran generate de Playwright în profil mobil.
- **Găzduire HTTPS** (obligatoriu: service worker, GPS și microfonul merg doar pe HTTPS):
  - `DEPLOY = cloudflare` → Cloudflare Workers Static Assets: `wrangler.jsonc` cu `assets.directory` = `./dist` și, dacă folosești rutare history, `not_found_handling: "single-page-application"`; apoi `npx wrangler deploy` (wrangler ca dependență de dezvoltare). Verifici întâi documentația curentă Cloudflare. Autentificare doar prin `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` din mediu (în cloud, `wrangler login` nu funcționează). Dacă lipsesc, lași totul gata de deploy și îi explici lui Ionuț pașii exacți: în Cloudflare → My Profile → API Tokens → șablonul pentru editare Workers; apoi le adaugă în setările mediului cloud și reia sesiunea.
  - Rulezi testul offline (E2E 3) și pe URL-ul public.
- `REPO_GITHUB` → commit-uri pe ramura sesiunii + Pull Request către `main` (vezi 1b).
- **Pe SIA SERVER**, în `FOLDER_SIA_SERVER/livrabile/` (fișiere noi, nimic șters): `RAPORT-FINAL.md`, `README.md`, `GHID-UTILIZARE.md` cu capturile de ecran și, dacă există, APK-ul.
- `APK_ANDROID = da` → Capacitor, versiunea curentă (la Capacitor 8: Node 22+, JDK 21, Android SDK compileSdk 36 — verifici). Permisiuni native: cameră, microfon, locație. APK de test în `livrabile/`. Dacă mediul nu permite, notezi exact ce lipsește; **nu blochezi livrarea PWA**.

---

## 9. Definiția de Gata (toate bifate în `PROGRES.md`, fiecare cu dovada)

- [ ] Modulele 2.1–2.8 funcționează cap-coadă, fără nimic simulat.
- [ ] E2E 1–6 trec pe Chromium și WebKit (profiluri mobile).
- [ ] Funcționare offline dovedită pe build-ul de producție și pe URL-ul public.
- [ ] PDF cu diacritice corecte, logo, fotografii și blocuri de semnătură.
- [ ] Backup → restaurare: date identice.
- [ ] Transcriere offline în română după descărcarea modelului.
- [ ] Licențe verificate; `THIRD-PARTY-LICENSES.md` generat.
- [ ] Build fără erori sau avertismente; ESLint curat.
- [ ] Verificatorul independent: zero constatări majore / critice.
- [ ] `README.md` + `GHID-UTILIZARE.md` cu capturi.
- [ ] Deploy HTTPS făcut — sau un singur pas rămas pentru Ionuț, descris exact.

---

## 10. Raportul final (în chat, în română, scurt)

1. Linkul aplicației, linkul Pull Request-ului și instalarea pe telefon: Android — 3 pași; iPhone — 3 pași. Același raport îl salvezi și ca `RAPORT-FINAL.md` pe SIA SERVER.
2. Ce face, în 5 rânduri.
3. Ce ai verificat și cum (testele trecute).
4. Limitări reale cunoscute (ex. mărimea modelului vocal; telefoane fără WebGPU = transcriere mai lentă).
5. Singurul pas care îi rămâne lui Ionuț, dacă există.

---

## 11. În afara scopului v1 (nu implementezi; lași doar arhitectura pregătită)

Sincronizare între telefoane sau cu un server, conturi și roluri, hărți offline, redactare automată de text cu un LLM pe telefon (transcrierea da; generarea de text nu — pe modelele mici, calitatea în română nu e destul de sigură pentru documente oficiale).
