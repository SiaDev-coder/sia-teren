# Raport de re-verificare 3 — SIA Teren (commit `7851368`)

Data: 30.10.2026 · Verificator independent · Repo-ul nu a fost modificat (`git status` curat). Scripturi noi: `s11.mjs` (două ferestre), `s12.mjs`, `s13.mjs`, `s14.mjs` (câmpuri numerice), toate în `/tmp/claude-0/verificator/`.

## Răspuns direct

**Da, mai există o constatare majoră dovedită**, în afara lui V-09: **R-04**. Când aceeași zi necompletată e deschisă în **două ferestre** și o fereastră creează raportul, iar în cealaltă **prima acțiune este o fotografie sau o notă vocală**, acestea se salvează legate de un raport care nu există. Rămân invizibile (nu apar nici în raport, nici în PDF, nici în ZIP), deși aplicația spune „Fotografie salvată.”. E un scenariu rar (două ferestre pe aceeași zi nouă), dar pierderea de date e reală și reproductibilă pe Chromium și WebKit.

**Constatări critice dovedite: 0.**

R-01, R-02, R-03 și restul V-11 sunt rezolvate. Salvarea pe câmpuri combină corect modificările din două ferestre, atât la rapoarte, cât și la constatări.

## Starea constatărilor din runda anterioară

| ID | Severitate | Stare | Dovadă |
|---|---|---|---|
| R-01 a doua fereastră nu mai salva nimic după `ReportExistsError` | majoră | **Rezolvată** | s9 [N6], s11 [W4], Chromium și WebKit: un singur raport, notes=„din A”, visits=„din B 2”, indicatorul B=„Salvat”; B afișează și textul lui A după combinare. |
| R-02 o fereastră veche suprascria câmpurile scrise în cealaltă | minoră | **Rezolvată** pentru câmpuri simple | s9 [N7]: notes=„A a scris observații”, safety=„B a scris SSM”; s11 [W8] la constatare: descrierea din A, responsabilul din B, starea „În lucru” și istoricul păstrate. Listele de rânduri: vezi R-06. |
| R-03 „1 fotografii” | minoră | **Rezolvată** | s9 [N10b]: „1 fotografie descărcată (.zip).”; acordul numeral (`roCount`) e aplicat și la Coș, restaurare și constatări depășite. |
| V-11 numere | minoră | **Rezolvată, cu o observație** | s14: „2,5” în câmpul „Număr” → avertisment „Doar numere întregi (fără virgulă sau punct).” (rămâne „25”, dar utilizatorul e avertizat); „2000000” → „Valoarea maximă este 1.000.000.”. „1.000” în Cantitate se transformă vizibil în „1,000” chiar în timpul tastării și se salvează **1**. Conversia e afișată, deci nu mai e o eroare tăcută, dar cine vrea să scrie „o mie” cu punct obține 1 (vezi O-01). |
| V-01 … V-08, V-10, V-12 … V-19, V-22 | — | **Rămân rezolvate** | re-rulare s1, s2 (Chromium și WebKit), s3, s3b, s8, s9: toate OK (detalii mai jos) |
| V-09 E2E 6 | majoră | **Nedovedită** | huggingface.co e blocat |
| V-20, V-21, V-23 | observații | neschimbate | — |

## Probleme noi găsite (regresii ale salvării pe câmpuri / combinării)

Toate apar doar dacă aceeași zi necompletată e deschisă simultan în două ferestre (de ex. aplicația instalată + un tab Safari/Chrome). Cauza e comună. Când B salvează prima dată și descoperă că A a creat între timp raportul, `useAutosave` adoptă raportul lui A (alt `id`). Dar acțiunile pornite din B folosesc `id`-ul vechi, capturat înainte de adopție: `PhotoSection`/`VoiceNotes` folosesc `ownerId` din props, iar `makePdf`, „Finalizează” și „Copiază” folosesc `r.id` din closure (`src/screens/Report.tsx`: `ensureSaved` → `saveNow` adoptă alt id; `src/components/Photos.tsx:50-63`; `src/components/VoiceNotes.tsx`).

| ID | Severitate | Cerință | Constatare | Cum se reproduce | Dovadă |
|---|---|---|---|---|---|
| R-04 | **majoră** (scenariu rar: două ferestre) | §5 „nimic nu se pierde”; §2.4 / §2.5 | Fotografia sau nota vocală adăugată ca **primă acțiune** în fereastra B, pe o zi pe care A a creat-o între timp, e salvată cu `ownerId` = id-ul raportului nesalvat din B. Rezultatul e o înregistrare orfană, invizibilă permanent (și după reîncărcare), care lipsește din PDF și din ZIP-ul de fotografii. Mesajul afișat e „Fotografie salvată.” / „Fișierul audio a fost atașat.”. `assertOwnerEditable` nu verifică existența raportului. | Două ferestre pe `#/proiect/<id>/raport/<zi nouă>` → A scrie în „Observații” → B: „Din galerie” (sau „Atașează fișier audio”). | s11 [W1], Chromium și WebKit: foto total=1, legate de raport=0, miniaturi în B=0, toast „Fotografie salvată.”; [W2]: notă total=1, legate=0, afișate=0 |
| R-05 | minoră (același scenariu) | §5 erori explicite | În același scenariu, prima apăsare din B eșuează: **PDF** → „Raportul nu mai există.”; **Finalizează** → nu se întâmplă nimic, fără niciun mesaj (raportul rămâne „Ciornă”); **Copiază din ziua precedentă** → „Nu există un raport anterior în acest proiect.” (fals). A doua apăsare merge, pentru că între timp editorul a adoptat id-ul corect. | La fel ca R-04, apoi B: „PDF raport zilnic” / „Finalizează raportul” / „Copiază…”. | s12 [W3a] mesaj „Raportul nu mai există.”, la al doilea clic PDF-ul se descarcă; s13 [W10] DB=„draft”, mesaje=[]; [W11] „Nu există un raport anterior…”, personal=0 |
| R-06 | minoră (două ferestre) | §5 | Listele de rânduri (personal, utilaje, activități, materiale) se salvează ca listă întreagă. Dacă ambele ferestre adaugă rânduri în același raport, câștigă ultima și rândurile celeilalte se pierd. Câmpurile text simple se combină corect. | Raport existent deschis în A și B → A adaugă „Maistru” → B (deschis înainte) adaugă „Topograf”. | s11 [W5], Chromium și WebKit: `["Sudori","Topograf"]` („Maistru” pierdut) |
| O-01 | observație | §5 formate românești | „1.000” tastat într-o cantitate devine „1,000”, adică 1. Conversia e afișată imediat, deci nu mai e o eroare tăcută. Ar ajuta un avertisment explicit, de tipul „Pentru mii scrie fără punct (ex. 1000)”. | s14 [NUM2] | „1,000” în timpul tastării, „1” după ieșire |

### Verificări de regresie trecute (fără probleme)
- **Combinare în raport existent:** s9 [N7], s11 [W4, W4b, W8] OK.
- **Raport finalizat între timp în altă fereastră:** s11 [W6]: B primește „Eroare la salvare” și raportul rămâne nemodificat. [W7] (zi nouă creată și finalizată în A, B scrie): un singur raport, nemodificat, mesaj clar „Raportul acestei zile a fost finalizat între timp…”. s3 [K3, K4] OK.
- **Un singur tab:** rescriere rapidă [W9], tastare + finalizare imediată [N9b], zi necompletată → fotografie, notă vocală, PDF, finalizare, copiere [N1–N4, N8] — toate OK.
- **Reîncărcare imediată** (V-01): s2 pe Chromium și WebKit, 0–500 ms → text salvat.
- **Restaurare, ErrorBoundary, Coș, filtre, ciorne:** s1, s3, s3b OK.
- **Buget JS:** `index-*.js` 142,9 KB gzip.

## Rezultatele exacte ale comenzilor

| Comandă | Rezultat |
|---|---|
| `npm run build` | exit 0, fără erori sau avertismente TypeScript |
| `npm run lint` | exit 0, ESLint curat |
| `npx vitest run` | 5 fișiere, **34 de teste trecute**, 0 picate |
| `npx playwright test --workers=2` | **40 trecute, 0 picate, 6 sărite** (1,3 min). Sărite: E2E 6 pe ambele browsere (huggingface.co blocat); pe WebKit, cele 4 teste marcate doar pentru Chromium (microfon simulat, microfon refuzat, fără acces la huggingface.co, regresie V-08). |

## Ce nu am putut verifica (neschimbat)

E2E 6 / transcrierea Whisper reală (huggingface.co blocat); deploy HTTPS și testul pe URL-ul public (api.cloudflare.com blocat, fără token-uri); instalarea reală pe telefon, WebGPU, camera reală; bannerul de actualizare cu o versiune nouă publicată; `npm run licenses` (rescrie un fișier din repo).

## Sugestie pentru R-04 / R-05

După adopție, acțiunile trebuie să folosească id-ul curent. Variante:
- `ensureSaved` întoarce id-ul efectiv (`current.current.id`), iar `PhotoSection`/`VoiceNotes`, PDF-ul, „Finalizează” și „Copiază” îl folosesc pe acela în locul celui din props sau closure;
- în plus, `assertOwnerEditable` refuză un `ownerId` de raport care nu există în baza de date.
