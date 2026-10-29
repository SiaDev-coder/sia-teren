# Raport de re-verificare — SIA Teren (commit `f9d6f45`)

Data: 30.10.2026 · Verificator independent · Repo-ul nu a fost modificat (`git status` curat). Scripturi: `/tmp/claude-0/verificator/s1.mjs`–`s10.mjs` (s1 și s8 adaptate la noul flux, în care vizualizarea unei zile nu mai creează raportul; s9 și s10 sunt noi, pentru regresii).

## Rezumat

Din constatările de la prima verificare, **cele 2 critice și 5 din cele 6 majore sunt rezolvate**, confirmat pe Chromium și WebKit. V-09 (transcriere Whisper reală) rămâne nedovedită din cauza rețelei. V-11 e rezolvată doar parțial: „1.000” într-un câmp de cantitate devine tot 1.

Reparațiile au introdus **2 probleme noi**, ambele când același raport e deschis în **două ferestre** (scenariu rar):
- **R-01, majoră:** recuperarea după `ReportExistsError` nu funcționează. A doua fereastră nu mai salvează nimic, iar mesajul afișat e fals.
- **R-02, minoră:** salvarea întregului raport la fiecare tastare face ca o fereastră veche să suprascrie câmpurile scrise în cealaltă.

Restul fluxului nou merge: raportul se creează la prima completare, iar fotografia, nota vocală, PDF-ul, finalizarea și copierea funcționează pe o zi încă necompletată. Merg și restaurarea normalizată, ErrorBoundary și exportul „Fotografii .zip” cu banda arsă în imagine.

## Starea constatărilor anterioare

| ID | Severitate inițială | Stare | Dovadă (re-test) |
|---|---|---|---|
| V-01 reîncărcare la <250 ms → text pierdut | critică | **Rezolvată** | s2.mjs, Chromium și WebKit: reîncărcare la 0/50/150/300/500 ms → text salvat de fiecare dată; rând de personal + reîncărcare imediată → salvat. s1 [E, E2] OK. s9 [N5]: tastare rapidă (63 de caractere) + navigare imediată → text complet și în ordine. |
| V-02 „Copiază” dintr-un raport-fantomă gol șterge personalul de azi | critică | **Rezolvată** | s8 [B2]: personalul de joi = „Sudori 4” (copiat de luni); nu mai apare un raport pentru miercuri. `previousReport` sare acum peste rapoartele goale. |
| V-03 navigarea pe zile creează rapoarte goale | majoră | **Rezolvată** | s1 [B]: 0 rapoarte după 3 × „Ziua precedentă”; s9 [N5b] OK. |
| V-04 „Transaction committed too early” după restaurare | majoră | **Rezolvată** | s3b [T], s5 [T2], Chromium și WebKit: raportul de azi se deschide normal. `markChanged` nu mai e apelat în tranzacție. |
| V-05 manifest cu `createdAt` invalid → ecran alb | majoră | **Rezolvată** | s3/s3b [R1]: mesaj „Copia de siguranță este deteriorată (data copiei lipsește sau e invalidă)…”, fără erori de pagină. |
| V-06 restaurare de date incomplete → ecrane albe permanente | majoră | **Rezolvată** | s3b [R2], Chromium și WebKit: copia e acceptată, dar normalizată; ecranul proiectului, raportul și lista de constatări se afișează corect. ErrorBoundary prinde orice altă eroare de afișare (s10 [EB1, EB2]). |
| V-07 partajare anulată → „Ultima copie: acum” | majoră | **Rezolvată** | s3 [M1]: „Ultima copie: niciodată” după anulare. |
| V-08 transcriere „pending” blocată pentru totdeauna | majoră | **Rezolvată** | s3b [V1], Chromium și WebKit: „Transcrierea a fost întreruptă… Poți încerca din nou.” + butonul „Transcrie în text”. |
| V-09 E2E 6 nedovedit | majoră (nedovedită) | **Încă nedovedită** | huggingface.co e tot blocat; E2E 6 e sărit pe ambele browsere. |
| V-10 raport finalizat modificabil | minoră | **Rezolvată** | s3 [K1]: „Recuperează” e refuzat; [K2]: butonul de ștergere e ascuns; [K4]: o fotografie din fereastra veche e refuzată; [K3]: textul e refuzat („Eroare la salvare”). |
| V-11 numere („1.000” → 1 etc.) | minoră | **Parțial rezolvată** | Câmpurile întregi acceptă acum doar cifre, iar limita de 1.000.000 funcționează. Dar: s9 [N12] Cantitate „1.000” → salvat **1** (punctul e încă citit ca virgulă zecimală). În câmpurile întregi, „2,5” devine **25** (virgula e respinsă în tăcere, cifrele se lipesc; s5). Un număr peste limită e ignorat fără niciun mesaj. |
| V-12 date imposibile în URL | minoră | **Rezolvată** | s1 [A]: 2026-02-31, 0000-01-01, 9999-12-31 → „Data din adresă nu este validă.”, 0 rapoarte. |
| V-13 „Proiect salvat” pentru proiect inexistent | minoră | **Rezolvată** | s1 [C]: „Proiectul nu există…”. |
| V-14 titlu golit salvat gol | minoră | **Rezolvată** | s1 [G]: titlul vechi e păstrat în DB, iar în formular apare un indiciu. |
| V-15 ștergere rând fără confirmare | minoră | **Rezolvată** | s8 [RW]: apare dialogul de confirmare (doar pentru rândurile completate). |
| V-16 constatare a unui proiect din Coș editabilă | minoră | **Rezolvată** | s3 [L1]: „Constatarea nu există… (sau proiectul ei este în Coș)”. `restore` refuză acum elementele al căror părinte e în Coș. |
| V-17 formularele noi pierd datele la reîncărcare | minoră | **Rezolvată** | s9 [N11]: ciorna constatării rămâne după reîncărcare și se golește după salvare. Proiectul nou folosește același mecanism (`useDraft`). |
| V-18 `?stare=xyz` | minoră | **Rezolvată** | s1 [F]: „1 din 1”. |
| V-19 export ZIP de fotografii cu bandă | observație | **Rezolvată** | s9 [N10]: ZIP cu `rapoarte/2026-05-01_01.jpg`, 2048×1451, cu bandă arsă „30.10.2026 00:16 · fără GPS · Regresii Brăila” (verificat vizual). Interval fără fotografii → mesaj clar. |
| V-20 licența Zlib, ORT dev | observație | **Neschimbată** | e o decizie de luat de Ionuț |
| V-21 ArrayBuffer în loc de Blob | observație | Neschimbată (justificată) | — |
| V-22 inserarea transcrierii doar în unele câmpuri | observație | **Rezolvată** | `Report.tsx`: ținte pentru toate câmpurile text și pentru rânduri; în constatare s-a adăugat „Responsabil”. |
| V-23 dată în format american în captură | observație | **Neschimbată** | capturile nu au fost regenerate |

## Probleme noi găsite (regresii)

| ID | Severitate | Cerință | Constatare | Cum se reproduce | Dovadă |
|---|---|---|---|---|---|
| R-01 | majoră (scenariu rar: două ferestre) | §5 „nimic nu se pierde”, erori explicite | Când o zi necompletată e deschisă în două ferestre și A salvează prima, prima scriere din B dă `ReportExistsError`. Codul încearcă să deschidă raportul salvat navigând la aceeași adresă cu `?r=<timp>`, dar ruta folosește drept cheie doar `id/dată` (fără parametri), deci editorul **nu se reîncarcă**. B rămâne cu un raport nou nesalvabil: fiecare tastare eșuează cu „Raportul acestei zile exista deja; s-a deschis cel salvat.” (mesaj fals), indicatorul arată „Eroare la salvare”, iar tot ce scrie în B se pierde. | Două ferestre pe `#/proiect/<id>/raport/<zi nouă>` → A scrie „Observații” → B scrie „Vizite pe șantier”. `src/screens/Report.tsx:78-89` (navigarea cu `?r=`), `src/App.tsx` (cheia rutei e `${m.id}/${m.date}`), `src/router.ts:12` (parametrii sunt ignorați) | s9 [N6], Chromium și WebKit: DB visits=`""`; toast repetat; „Eroare la salvare” și după a doua încercare |
| R-02 | minoră (regresie, două ferestre) | §5 | Salvarea automată scrie acum **întreaga înregistrare** la fiecare modificare, nu doar câmpul schimbat. O fereastră deschisă mai devreme pe același raport (sau pe aceeași constatare) suprascrie la prima tastare câmpurile modificate între timp în cealaltă fereastră. Înainte, modificările pe câmpuri diferite se combinau. | Două ferestre pe un raport existent → A scrie „Observații” → B scrie „Evenimente SSM”. `src/db/repo.ts` (`saveReport` / `saveFinding` cu `put` pe tot obiectul) | s9 [N7], Chromium și WebKit: notes=`"initial"` (textul lui A pierdut), safety=`"B a scris SSM"` |
| R-03 | minoră | §5 română corectă | După exportul unei singure fotografii, mesajul spune „1 fotografii descărcate (.zip).”. | `src/screens/Export.tsx` (`${n} fotografii`) | s9 [N10b] |

### Verificări de regresie trecute (fără probleme)
- **Zi necompletată (s9, Chromium și WebKit):** prima acțiune = fotografie → raportul e creat și fotografia e legată și afișată [N1]. Prima acțiune = notă vocală [N2], PDF [N3], finalizare (rămâne „Finalizat” după reîncărcare) [N4], „Copiază din ziua precedentă” [N8, N8b] → toate corecte.
- **Ordinea scrierilor:** tastare + finalizare imediată → ultimul text e salvat înainte de finalizare [N9b]. Redeschide + editare [N9] OK.
- **Restaurare normalizată:** E2E 5 (backup → ștergere → restaurare → date identice, cu adnotări) trece pe ambele browsere. Fișierele trunchiate, goale sau străine sunt respinse în continuare cu mesaj clar.
- **ErrorBoundary:** o înregistrare stricată pusă direct în DB → „Ecranul nu a putut fi afișat” în română, navigarea de jos rămâne vizibilă, iar trecerea la alt ecran șterge eroarea (s10).
- **Offline, cu serverul oprit (s6), Chromium și WebKit:** link direct la un raport nou, fotografie, PDF, licențe, Setări, copie de siguranță → OK.
- **PDF și CSV cu diacritice (s4):** neschimbate, OK.
- **Volum (s7):** ecran proiect 175 ms, CSV 181 ms, PDF pe 90 de zile 1,85 s, copie de siguranță 172 ms, tastare 25 de caractere 128 ms. Scrierea întregului raport la fiecare tastare nu încetinește aplicația.
- **Buget JS:** `index-*.js` 142,6 KB gzip, sub 400 KB; `photoZip` se încarcă leneș (0,7 KB).

## Rezultatele exacte ale comenzilor

| Comandă | Rezultat |
|---|---|
| `npm run build` | exit 0, fără erori sau avertismente TypeScript; PWA precache generat |
| `npm run lint` | exit 0, ESLint curat |
| `npx vitest run` | 5 fișiere, **33 de teste trecute**, 0 picate |
| `npx playwright test --workers=2` | **36 trecute, 0 picate, 6 sărite** (1,2 min). Sărite: E2E 6 pe ambele browsere (huggingface.co blocat); pe WebKit, „înregistrare cu microfonul”, „microfon refuzat”, „fără acces la huggingface.co” și noul „regresie V-08” (marcate doar pentru Chromium). |

Testele de voce nu le-am mai rulat separat cu `--workers=1`: au rulat în suita completă de mai sus, cu același rezultat (doar testele de mai sus sărite).

## Ce nu am putut verifica (neschimbat)

1. **Transcrierea Whisper reală (E2E 6) și descărcarea modelului:** huggingface.co e blocat.
2. **Deploy HTTPS și testul offline pe URL-ul public:** api.cloudflare.com e blocat și nu există token-uri.
3. **Instalarea reală** pe Android și iOS, **WebGPU** și **camera reală**.
4. **Bannerul de actualizare** cu o versiune nouă publicată efectiv.
5. **`npm run licenses`:** nu l-am rulat, pentru că rescrie un fișier din repo.

## Concluzie

Rămân **0 constatări critice** și **1 majoră dovedită**: R-01, scenariu rar cu două ferestre. Se adaugă V-09, care nu poate fi dovedită în acest mediu. Pentru R-01 trebuie ca editorul să se reîncarce cu adevărat după `ReportExistsError` (de exemplu, cheia rutei sau reîncărcarea `initial` să țină cont de parametrul `r`, ori raportul existent să fie citit direct și pus cu `setValue`). R-02 și V-11 (cantitate „1.000”) ar fi bine de reparat odată cu el.
