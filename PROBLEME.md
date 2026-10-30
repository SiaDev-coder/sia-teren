# PROBLEME — SIA Teren

Format: problemă — cauză — rezolvare.

1. **huggingface.co, api.cloudflare.com, *.workers.dev blocate** — politica de rețea a mediului cloud (proxy 403). — Nu am căutat ocolișuri. Codul pentru model vocal și deploy e complet; pasul de mediu îi revine lui Ionuț (vezi raportul final).
2. **Varianta WASM pentru WebGPU depășește 25 MiB** (limita Cloudflare per fișier). — Livrare gzip + decompresie în worker (vezi DECIZII).
3. **typescript 7 incompatibil cu typescript-eslint** — folosit TypeScript 6.0.3.
4. **WebKit: „Error preparing Blob/File data to be stored in object store”** la salvarea logo-ului/fotografiilor — binarele se stochează ca ArrayBuffer (vezi DECIZII, Fazele 2–3).
5. **Playwright WebKit + `setOffline(true)`**: reîncărcarea eșua („WebKit encountered an internal error”) deși service worker-ul era activ. Verificat manual: cu serverul oprit, WebKit încarcă aplicația din service worker. Testele offline opresc serverul (și pe Chromium folosesc și `setOffline`).
6. **Ecranul Setări interoga huggingface.co la deschidere** (pentru mărimea modelului) — contravine regulii „singura cerere de rețea: descărcarea explicită”. Mutat în fluxul butonului „Descarcă”.
7. **`waitForFunction` cu funcție async** întorcea imediat (Promise = valoare „adevărată”) → testul reîncărca înainte ca service worker-ul să fie activ. Înlocuit cu `navigator.serviceWorker.ready`.
8. **Săgeata „→” apărea ca „?” în PDF** — Noto Sans nu are glifa U+2192. Adăugată tabelă de înlocuitori (→ devine „->”, emoji eliminate) + test unitar.
9. **Chromium (Playwright) nu încărca fișiere din căi cu diacritice** (dosarul de rezultate al testului conținea „fără”) — evenimentul `change` venea cu listă goală. Testele folosesc acum căi ASCII în `/tmp`. Pe telefon numele fișierelor alese de utilizator nu sunt afectate (browserul primește fișierul, nu calea).
10. **Cursă în test**: după „Șterge proiectul” aplicația navighează la Proiecte; testul naviga la Coș înainte → ajungea înapoi pe Proiecte. Testul așteaptă acum confirmarea.
11. **Sesiunea s-a repornit (cod 137) la rularea testelor de voce cu 3 browsere în paralel** — testele de voce rulează cu `--workers=1`.
12. **`Content-Encoding: gzip` adăugat automat de server pentru `*.wasm.gz`** → redenumit `*.wasm.gzdata` + detecție după semnătură.
13. **E2E 6 nu putea rula în prima sesiune**: huggingface.co blocat (403 la proxy). Rezolvat la publicare (rețea „Full”) — vezi mai jos.

## Publicarea pe Cloudflare (30.10.2026)
14. **Rețeaua mediului rămăsese „Limited”** deși variabilele Cloudflare erau puse — api.cloudflare.com și huggingface.co refuzate de proxy (verificat și dintr-o sesiune nouă). După trecerea pe „Full”: `wrangler whoami` OK, `npm run deploy` → https://sia-teren.officesoftgest.workers.dev.
15. **(Reală, ar fi afectat telefoanele) Modelul vocal nu se putea descărca de pe linkul public**: huggingface.co (CloudFront) răspunde **404 oricărei cereri cu antet Referer de pe `*.workers.dev`** (verificat cu curl: același URL → 200 fără Referer sau cu Referer de pe alt domeniu, 404 cu Referer `*.workers.dev`). Browserul vedea asta ca eroare CORS → „Nu se poate afla mărimea modelului”. Local (127.0.0.1) nu apărea. Reparat: `Referrer-Policy: no-referrer` în `public/_headers` (pagina și worker-ul de transcriere) + `<meta name="referrer" content="no-referrer">`. Test nou de regresie în `01-shell-offline.spec.ts` (pică pe versiunea veche, trece pe cea nouă).
16. **E2E 6 avea o greșeală de test** (nu rulase niciodată): `getByLabel('Model', { exact: true })` nu găsea lista, pentru că numele accesibil al listei include și opțiunea aleasă. Înlocuit cu `select[name="voiceModel"]`.
17. **Testul offline pe URL public în WebKit**: `context.setOffline()` din Playwright strică reîncărcarea în WebKit (limitare cunoscută). Pentru URL public, testele trec acum tot traficul browserului printr-un proxy local care, la „fără rețea”, închide conexiunile — rețeaua dispare cu adevărat pentru pagină și service worker, pe ambele browsere (verificat: după tăiere, cererile spre aplicație și spre huggingface.co eșuează).
18. **`fetch` din Node nu folosea proxy-ul mediului** (ENOTFOUND în testele care verifică din Node) — testele pe URL public se rulează cu `NODE_USE_ENV_PROXY=1`.

## Verificarea independentă — runda 1 (23 de constatări) și reparații
- **V-01 (critică) pierdere la reîncărcare sub 250 ms** — salvarea automată scrie acum imediat întreaga înregistrare la fiecare modificare (`useAutosave` + `saveReport`/`saveFinding`, o singură tranzacție). Test: reîncărcare imediată după tastare și după rând nou (`02-flux-complet.spec.ts`).
- **V-02 (critică) „Copiază din ziua precedentă” ștergea personalul** — vizualizarea unei zile nu mai creează raport (se creează la prima completare); copierea ia ultimul raport cu personal/utilaje și nu schimbă nimic dacă nu găsește. Teste unitare + E2E.
- **V-03 rapoarte goale la răsfoire** — rezolvat de aceeași schimbare (test E2E: 3 zile răsfoite → tot 2 rapoarte).
- **V-04 „Transaction committed too early”** — `navigator.storage.persist()` era apelat din interiorul unei tranzacții Dexie; marcarea modificărilor rulează acum separat, niciodată în tranzacții. Test E2E după restaurare.
- **V-05 / V-06 ecran alb după restaurarea unei copii modificate** — `createdAt` din manifest validat; toate înregistrările sunt normalizate (câmpuri lipsă → valori sigure, enumerări validate, date invalide respinse); plus `ErrorBoundary` cu mesaj în română pe fiecare ecran.
- **V-07 data ultimei copii la partajare anulată** — se scrie doar după trimitere/descărcare reușită.
- **V-08 transcriere blocată în „pending”** — afișată ca „întreruptă”, cu buton de reluare.
- **V-10..V-18 (minore)** — raport finalizat: fără fotografii/note noi, fără suprascriere din tab vechi, fără ștergere directă, fără recuperări în el; numere întregi doar cu cifre, limită 1.000.000; date din adresă validate (2000–2100, zile reale); proiect inexistent la editare; titlul constatării nu se mai salvează gol; confirmare la ștergerea rândurilor completate; constatările/elementele unui proiect din Coș nu se editează/recuperează separat; ciorne locale pentru „Proiect nou” și „Constatare nouă”; filtru de stare invalid în adresă ignorat.
- **V-19** — export „Fotografii .zip” cu adnotări + banda de text arse în imagine (Rapoarte PDF și CSV).
- **V-22** — textul transcris se poate insera în toate câmpurile text ale raportului (inclusiv rândurile de activități, materiale, utilaje, personal) și ale constatării.
- **V-09 (E2E 6), V-20 (Zlib, ORT dev), V-21 (ArrayBuffer), V-23 (format dată în Chromium headless)** — explicate în DECIZII / raportul final; V-09 depinde de accesul la huggingface.co.

## Verificarea independentă — runda 2
- **R-01 (majoră) două ferestre pe aceeași zi necompletată** — a doua fereastră nu mai putea salva. Salvarea automată scrie acum doar câmpurile modificate peste versiunea din baza de date; dacă ziua a fost creată între timp, modificarea se combină în raportul existent, iar editorul continuă cu acela. Test E2E + unitar.
- **R-02 (minoră) suprascriere între ferestre** — rezolvat de aceeași schimbare (scriere pe câmpuri). Test unitar.
- **R-03 acord numeral** — „1 fotografie”, „20 de fotografii” (funcția `roCount`), aplicat și la Coș și la constatările depășite.
- **V-11 (rest)** — în câmpurile zecimale punctul tastat devine virgulă (se vede imediat că e zecimal); în câmpurile întregi și la depășirea limitei apare un mesaj explicit. Test E2E.

## Verificarea independentă — runda 3
- **R-04 (majoră) fotografie/notă orfană în a doua fereastră** — acțiunile (fotografie, notă vocală, PDF, finalizare, copiere) folosesc id-ul efectiv al raportului întors după salvare; adăugarea refuză un raport/constatare inexistentă. Test E2E cu două ferestre.
- **R-05 (minoră) prima apăsare eșua în a doua fereastră** — rezolvat de aceeași schimbare.
- **R-06 (minoră, rămasă)** — listele de rânduri (personal, utilaje…) editate simultan în două ferestre: rămâne lista ultimei ferestre. Scenariu rar (aceeași zi deschisă în două ferestre în același timp); documentat ca limitare.
